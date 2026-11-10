import { Router } from 'express';
import { Factory, FactoryPickup, Product } from '../../../models/index.js';
import { checkDelivery } from '../../../services/orders/order.helpers.js';
import { logActivity, notifyAdmin } from '../../../services/notification.service.js';
import { dateOf, need, newId, notFound, positiveInt, read, str, write } from '../../../utils/http.js';

const router = Router();

const factoryView = (f) => ({ id: f._id, name: f.name, city: f.city, address: f.address ?? '', phone: f.phone ?? '', loadingHours: f.loadingHours ?? '', lat: f.lat ?? null, lng: f.lng ?? null });

const pickupView = (p) => ({
  id: p._id, factoryId: p.factoryId, factoryName: p.factoryName, productId: p.productId, productName: p.productName,
  quantity: p.quantity, date: p.date, slot: p.slot, notes: p.notes ?? '', requestedAt: p.requestedAt, status: p.status, staffNote: p.staffNote ?? '',
});

/** The factories a dealer can collect from. */
router.get('/factories', read(async () => (await Factory.find({ active: true }).sort({ name: 1 }).lean()).map(factoryView)));

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
  // Same rules as a delivery: no past dates, and a slot today closes a little before it starts.
  await checkDelivery(date, slot);
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
