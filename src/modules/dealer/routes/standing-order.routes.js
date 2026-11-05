import { Router } from 'express';
import { StandingOrder } from '../../../models/index.js';
import { approved } from '../dealer.helpers.js';
import { runStandingOrders } from '../../../services/jobs.service.js';
import { setting, slotNames } from '../../../services/settings.service.js';
import { dateOf, need, newId, positiveInt, read, str, write } from '../../../utils/http.js';

const router = Router();

const standingView = (s) => ({ id: s._id, name: s.name, items: s.items, weekdays: s.weekdays, slot: s.slot, addressId: s.addressId, paymentMethod: s.paymentMethod, lastRun: s.lastRun, isActive: s.isActive, skippedDates: s.skippedDates });

router.get('/standing-orders', read(async (req) => (await StandingOrder.find({ dealerId: req.user._id }).lean()).map(standingView)));

router.post('/standing-orders', write(async (req) => {
  approved(req);
  const name = str(req.body.name, 80);
  need(name, 'Enter a name');
  const items = {};
  for (const [id, qty] of Object.entries(req.body.items && typeof req.body.items === 'object' ? req.body.items : {})) {
    items[str(id, 60).replaceAll('.', '').replaceAll('$', '')] = positiveInt(qty, 'Enter a valid quantity');
  }
  need(Object.keys(items).length, 'Add at least one product');
  const weekdays = (Array.isArray(req.body.weekdays) ? req.body.weekdays : []).map(Number).filter((d) => d >= 1 && d <= 7);
  need(weekdays.length, 'Select at least one day');
  const slots = slotNames(await setting('slots'));
  need(slots.includes(req.body.slot), 'Select a delivery slot');
  need((req.user.addresses ?? []).some((a) => a.id === req.body.addressId), 'Select a delivery address');
  need(['credit', 'cashOnDelivery'].includes(req.body.paymentMethod), 'Standing orders are paid on credit or on delivery');
  const id = str(req.body.id, 60);
  const existing = id ? await StandingOrder.findOne({ _id: id, dealerId: req.user._id }).lean() : null;
  const skippedDates = (Array.isArray(req.body.skippedDates) ? req.body.skippedDates : []).map((d) => dateOf(d));
  const values = { dealerId: req.user._id, name, items, weekdays, slot: req.body.slot, addressId: req.body.addressId, paymentMethod: req.body.paymentMethod, isActive: req.body.isActive !== false, skippedDates, lastRun: existing?.lastRun ?? new Date() };
  const saved = await StandingOrder.findOneAndUpdate({ _id: existing?._id ?? newId('SO') }, values, { upsert: true, new: true }).lean();
  return standingView(saved);
}));

router.delete('/standing-orders/:id', write(async (req) => {
  await StandingOrder.deleteOne({ _id: str(req.params.id, 60), dealerId: req.user._id });
}));

router.post('/standing-orders/run-due', read(async (req) => ({ placed: req.user.kycStatus === 'approved' ? await runStandingOrders(req.user._id) : 0 })));

export default router;
