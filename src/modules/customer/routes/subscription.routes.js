import { Router } from 'express';
import { Product, Subscription } from '../../../models/index.js';
import { setting, slotNames } from '../../../services/settings.service.js';
import { bool, dateOf, need, newId, notFound, positiveInt, read, str, write } from '../../../utils/http.js';

const router = Router();

const subscriptionView = (s) => ({ id: s._id, productId: s.productId, qty: s.qty, frequency: s.frequency, slot: s.slot, addressId: s.addressId, startDate: s.startDate, paused: s.paused, skipped: s.skipped });

const ownSubscription = async (req) => {
  const row = await Subscription.findOne({ _id: str(req.params.id, 60), customerId: req.user._id });
  if (!row) throw notFound('Subscription');
  return row;
};

router.get('/subscriptions', read(async (req) => (await Subscription.find({ customerId: req.user._id }).lean()).map(subscriptionView)));

router.post('/subscriptions', write(async (req) => {
  const product = await Product.findById(str(req.body.productId, 60)).lean();
  need(product?.active && product.forCustomers && product.subscribable, 'This product cannot be subscribed to');
  const qty = positiveInt(req.body.qty, 'Enter a valid quantity');
  need(qty <= 50, 'The most you can order is 50');
  need(['daily', 'alternate', 'weekly'].includes(req.body.frequency), 'Select how often');
  need(slotNames(await setting('slots')).includes(req.body.slot), 'Select a delivery slot');
  need((req.user.addresses ?? []).some((a) => a.id === req.body.addressId), 'Select a delivery address');
  const values = { customerId: req.user._id, productId: product._id, qty, frequency: req.body.frequency, slot: req.body.slot, addressId: req.body.addressId, startDate: dateOf(req.body.startDate) };
  const id = str(req.body.id, 60);
  if (id) {
    const existing = await Subscription.findOne({ _id: id, customerId: req.user._id });
    if (!existing) throw notFound('Subscription');
    existing.set(values);
    await existing.save();
    return subscriptionView(existing.toObject());
  }
  const [row] = await Subscription.create([{ _id: newId('SB'), ...values }], {});
  return subscriptionView(row.toObject());
}));

router.post('/subscriptions/:id/pause', write(async (req) => {
  const row = await ownSubscription(req);
  row.paused = bool(req.body.paused);
  await row.save();
  return subscriptionView(row.toObject());
}));

router.post('/subscriptions/:id/skip', write(async (req) => {
  const row = await ownSubscription(req);
  const day = dateOf(req.body.day);
  const key = day.toDateString();
  const isSkipped = row.skipped.some((d) => d.toDateString() === key);
  row.skipped = isSkipped ? row.skipped.filter((d) => d.toDateString() !== key) : [...row.skipped, day];
  await row.save();
  return subscriptionView(row.toObject());
}));

router.delete('/subscriptions/:id', write(async (req) => {
  await (await ownSubscription(req)).deleteOne();
}));

export default router;
