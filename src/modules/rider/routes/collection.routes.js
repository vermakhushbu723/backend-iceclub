import { Router } from 'express';
import { Collection, Handover, Rider } from '../../../models/index.js';
import { notifyAdmin } from '../../../services/notification.service.js';
import { amount, need, newId, read, round2, str, write } from '../../../utils/http.js';

const router = Router();

const entryView = (c) => ({ orderNumber: c.orderNumber, dealerName: c.buyerName ?? '', amount: c.amount, mode: c.mode, at: c.at, reference: c.ref ?? '' });

const depositView = (h) => ({ amount: h.amount, at: h.at, reference: h.ref, status: h.status });

router.get('/collections', read(async (req) => ({
  entries: (await Collection.find({ riderId: req.user._id }).sort({ at: -1 }).limit(500).lean()).map(entryView),
  // A deposit waiting to be confirmed already counts, so the same cash can't be declared twice.
  deposits: (await Handover.find({ riderId: req.user._id, status: { $ne: 'rejected' } }).sort({ at: -1 }).limit(500).lean()).map(depositView),
})));

router.post('/collections/deposits', write(async (req) => {
  const value = amount(req.body.amount);
  const reference = str(req.body.reference, 80);
  need(reference, 'Enter the receipt or slip number');
  await Rider.updateOne({ _id: req.user._id }, { $inc: { rev: 1 } });
  const cash = (await Collection.find({ riderId: req.user._id, mode: 'cash' }).select('amount').lean()).reduce((sum, c) => sum + c.amount, 0);
  const handed = (await Handover.find({ riderId: req.user._id, status: { $ne: 'rejected' } }).select('amount').lean()).reduce((sum, h) => sum + h.amount, 0);
  const inHand = round2(cash - handed);
  need(value <= inHand, `You only have ₹${inHand} in hand.`);
  await Handover.create([{ _id: newId('H'), riderId: req.user._id, amount: value, at: new Date(), ref: reference, status: 'pending' }], {});
  await notifyAdmin('payment', 'Cash deposit to confirm', `${req.user.name} says they deposited ₹${value}.`, '/riders/collections');
}));

export default router;
