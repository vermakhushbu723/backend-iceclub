import { Router } from 'express';
import { Customer, Order, Subscription } from '../../../models/index.js';
import { customerAccount } from '../customer.views.js';
import { fresh } from '../customer.helpers.js';
import { need, read, str, write } from '../../../utils/http.js';

const router = Router();

router.get('/me', read((req) => customerAccount(req.user)));

router.put('/me', write(async (req) => {
  const name = str(req.body.name, 80);
  need(name, 'Enter your name');
  const email = str(req.body.email, 120);
  need(!email || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email), 'Enter a valid email');
  const changes = { name, email };
  const code = str(req.body.referralCode, 30).toUpperCase();
  if (code && !req.user.referredBy) {
    need(code !== req.user.referralCode, 'You cannot use your own referral code');
    need(await Customer.exists({ referralCode: code, deletedAt: null }), 'That referral code is not valid');
    changes.referredBy = code;
  }
  await Customer.updateOne({ _id: req.user._id }, changes);
  return customerAccount(await fresh(req));
}));

router.delete('/me', write(async (req) => {
  const open = await Order.exists({ customerId: req.user._id, status: { $nin: ['delivered', 'cancelled'] } });
  need(!open, 'You have orders in progress. Please wait for them to finish first.');
  await Subscription.deleteMany({ customerId: req.user._id });
  await Customer.updateOne({ _id: req.user._id }, { deletedAt: new Date(), active: false, phone: `deleted-${req.user._id}`, name: 'Deleted customer', email: '', addresses: [], savedUpi: [], favourites: [], tokenVersion: (req.user.tokenVersion ?? 0) + 1 });
}));

export default router;
