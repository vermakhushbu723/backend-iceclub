import dayjs from 'dayjs';
import { Router } from 'express';
import { Factory, FactoryPickup, Product } from '../../../models/index.js';
import { logActivity, notifyAdmin } from '../../../services/notification.service.js';
import { dateOf, need, newId, notFound, positiveInt, read, str, write } from '../../../utils/http.js';

const router = Router();

/** The factories run round the clock, so a pickup can be booked in any of these slots: [label, start hour, end hour]. */
export const PICKUP_SLOTS = [
  ['12 AM - 3 AM', 0, 3], ['3 AM - 6 AM', 3, 6], ['6 AM - 9 AM', 6, 9], ['9 AM - 12 PM', 9, 12],
  ['12 PM - 3 PM', 12, 15], ['3 PM - 6 PM', 15, 18], ['6 PM - 9 PM', 18, 21], ['9 PM - 12 AM', 21, 24],
];

/** Today's slot stays open until an hour before it ends, so a dealer can still come in the middle of it. */
function checkPickup(date, slot) {
  const day = dayjs(date);
  need(day.isValid(), 'Select the pickup date');
  need(!day.isBefore(dayjs().startOf('day')), 'The pickup date has passed');
  need(!day.isAfter(dayjs().add(30, 'day')), 'Pickups can be booked up to 30 days ahead');
  const found = PICKUP_SLOTS.find(([label]) => label === slot);
  need(found, 'Select a pickup time slot');
  const now = dayjs();
  if (day.isSame(now, 'day')) need(found[2] - (now.hour() + now.minute() / 60) >= 1, 'That slot is over for today. Please choose a later one.');
}

const factoryView = (f) => ({ id: f._id, name: f.name, city: f.city, address: f.address ?? '', phone: f.phone ?? '', loadingHours: f.loadingHours ?? '', lat: f.lat ?? null, lng: f.lng ?? null });

const pickupView = (p) => ({
  id: p._id, factoryId: p.factoryId, factoryName: p.factoryName, productId: p.productId, productName: p.productName,
  quantity: p.quantity, date: p.date, slot: p.slot, notes: p.notes ?? '', requestedAt: p.requestedAt, status: p.status, staffNote: p.staffNote ?? '',
});

/** The factories a dealer can collect from. */
router.get('/factories', read(async () => (await Factory.find({ active: true }).sort({ name: 1 }).lean()).map(factoryView)));

router.get('/factory-pickups/slots', read(() => PICKUP_SLOTS.map(([label, start, end]) => ({ label, start, end }))));

router.get('/factory-pickups', read(async (req) => (await FactoryPickup.find({ dealerId: req.user._id }).sort({ date: -1, requestedAt: -1 }).limit(100).lean()).map(pickupView)));

router.post('/factory-pickups', write(async (req) => {
  const factory = await Factory.findOne({ _id: str(req.body.factoryId, 60), active: true }).lean();
  need(factory, 'Select the factory');
  const product = await Product.findOne({ _id: str(req.body.productId, 60), forDealers: true, active: true }).lean();
  need(product, 'Select the product');
  const quantity = positiveInt(req.body.quantity, 'Enter the quantity');
  need(quantity <= 10000, 'That quantity is too large. Please call us for this order.');
  const date = dateOf(req.body.date, 'Select the pickup date');
  const slot = str(req.body.slot, 40);
  checkPickup(date, slot);
  const [saved] = await FactoryPickup.create([{
    _id: newId('FP'), dealerId: req.user._id, dealerName: req.user.businessName ?? '', factoryId: factory._id, factoryName: factory.name,
    productId: product._id, productName: product.name, quantity, date, slot, notes: str(req.body.notes, 500), requestedAt: new Date(),
  }], {});
  await notifyAdmin('order', 'Factory pickup', `${req.user.businessName} will collect ${quantity} × ${product.name} from ${factory.name}.`, '/orders/factory-pickups');
  await logActivity(`Factory pickup booked by ${req.user.businessName}`, 'blue');
  return pickupView(saved.toObject());
}));

/** A dealer can cancel until the ice has been collected. */
router.delete('/factory-pickups/:id', write(async (req) => {
  const pickup = await FactoryPickup.findOne({ _id: str(req.params.id, 60), dealerId: req.user._id });
  if (!pickup) throw notFound('Factory pickup');
  need(['requested', 'confirmed'].includes(pickup.status), 'This pickup can no longer be cancelled');
  pickup.status = 'cancelled';
  await pickup.save();
  await notifyAdmin('order', 'Factory pickup cancelled', `${req.user.businessName} cancelled a pickup at ${pickup.factoryName}.`, '/orders/factory-pickups');
  return pickupView(pickup.toObject());
}));

export default router;
