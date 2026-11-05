import { Router } from 'express';
import { config } from '../../../config/index.js';
import { Customer, Order, PointsRedemption, Wallet } from '../../../models/index.js';
import { setting } from '../../../services/settings.service.js';
import { addWallet, walletBalance } from '../../../services/wallet.service.js';
import { amount, need, newId, positiveInt, read, str, write } from '../../../utils/http.js';

const router = Router();

const entryView = (e) => ({ id: e._id, amount: e.amount, title: e.title, at: e.at });

router.get('/wallet', read(async (req) => (await Wallet.find({ customerId: req.user._id }).sort({ at: -1 }).limit(300).lean()).map(entryView)));

router.post('/wallet/add', write(async (req) => {
  need(config.demoPayments, 'Adding money is not available yet.', 503);
  const value = amount(req.body.amount, 'Enter an amount above zero');
  const { maxWalletTopUp } = await setting('customerCharges');
  need(value <= maxWalletTopUp, `You can add up to ₹${maxWalletTopUp} at a time`);
  await addWallet(req.user._id, value, 'Added money');
  return { balance: await walletBalance(req.user._id) };
}));

async function pointsOf(customerId) {
  const { pointsPerRupees } = await setting('customerCharges');
  const delivered = await Order.find({ customerId, status: 'delivered' }).select('total').lean();
  const earned = delivered.reduce((sum, o) => sum + Math.floor(o.total / pointsPerRupees), 0);
  const redeemed = (await PointsRedemption.find({ customerId }).lean()).reduce((sum, r) => sum + r.points, 0);
  return earned - redeemed;
}

router.get('/rewards', read(async (req) => ({
  points: await pointsOf(req.user._id),
  redeemed: (await PointsRedemption.find({ customerId: req.user._id }).sort({ at: -1 }).lean()).map((r) => ({ points: r.points, at: r.at })),
})));

router.post('/rewards/redeem', write(async (req) => {
  const { pointsToRedeem, rupeesPerPoint } = await setting('customerCharges');
  await Customer.updateOne({ _id: req.user._id }, { $inc: { rev: 1 } });
  const points = positiveInt(req.body.points, 'Enter the points to redeem');
  need(points >= pointsToRedeem, `You need at least ${pointsToRedeem} points to redeem`);
  need(points <= (await pointsOf(req.user._id)), 'You do not have that many points');
  await PointsRedemption.create([{ _id: newId('PR'), customerId: req.user._id, points, at: new Date() }], {});
  await addWallet(req.user._id, points * rupeesPerPoint, `Redeemed ${points} reward points`);
}));

router.get('/saved-upi', read((req) => req.user.savedUpi ?? []));

router.post('/saved-upi', write(async (req) => {
  const id = str(req.body.id, 80);
  need(/^[\w.-]+@\w+$/.test(id), 'Enter a valid UPI ID, like name@bank');
  need(!(req.user.savedUpi ?? []).includes(id), 'That UPI ID is already saved');
  await Customer.updateOne({ _id: req.user._id }, { savedUpi: [...(req.user.savedUpi ?? []), id] });
}));

router.delete('/saved-upi/:id', write(async (req) => {
  await Customer.updateOne({ _id: req.user._id }, { savedUpi: (req.user.savedUpi ?? []).filter((x) => x !== req.params.id) });
}));

export default router;
