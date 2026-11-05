import { Router } from 'express';
import { config } from '../../../config/index.js';
import { Ledger, PaymentClaim } from '../../../models/index.js';
import { remindOverdue } from '../../../services/jobs.service.js';
import { addLedger, creditSummary } from '../../../services/ledger.service.js';
import { notify, notifyAdmin } from '../../../services/notification.service.js';
import { amount, need, newId, read, str, write } from '../../../utils/http.js';

const router = Router();

const ledgerView = (e) => ({ id: e._id, type: e.type === 'debit' ? 'invoice' : e.type, amount: e.amount, date: e.at, reference: e.ref, description: e.note ?? '' });

router.get('/credit-summary', read((req) => creditSummary(req.user)));

router.get('/ledger', read(async (req) => (await Ledger.find({ dealerId: req.user._id }).sort({ at: -1 }).lean()).map(ledgerView)));

/**
 * A dealer telling us they paid doesn't reduce what they owe: otherwise anyone could free up their own credit.
 * The accounts team checks it first. Only a demo online payment counts straight away.
 */
router.post('/payments', write(async (req) => {
  const value = amount(req.body.amount);
  const mode = str(req.body.mode, 20);
  need(['online', 'upi', 'bankTransfer', 'cheque', 'cash'].includes(mode), 'Select how you paid');
  const reference = str(req.body.reference, 80);
  need(reference, 'Enter the payment reference');
  if (mode === 'online' && config.demoPayments) {
    await addLedger(req.user._id, 'payment', value, reference, 'Online');
    await notify('dealer', req.user, 'payment', 'Payment received', `₹${value} online (ref. ${reference}).`, { route: '/payments' });
    return { status: 'verified' };
  }
  need(mode !== 'online', 'Online payment is not available yet. Please use another method.', 503);
  const duplicate = await PaymentClaim.exists({ dealerId: req.user._id, reference, status: { $ne: 'rejected' } });
  need(!duplicate, 'That payment reference has already been submitted');
  await PaymentClaim.create([{ _id: newId('PC'), dealerId: req.user._id, amount: value, mode, reference, at: new Date() }], {});
  await notify('dealer', req.user, 'payment', 'Payment submitted', `₹${value} (ref. ${reference}) is being checked by our accounts team.`, { route: '/payments' });
  await notifyAdmin('payment', 'Payment to verify', `${req.user.businessName} says they paid ₹${value}.`, '/accounts/verify');
  return { status: 'pending' };
}));

router.get('/payment-claims', read(async (req) => (await PaymentClaim.find({ dealerId: req.user._id }).sort({ at: -1 }).lean()).map((c) => ({ id: c._id, amount: c.amount, mode: c.mode, reference: c.reference, at: c.at, status: c.status, remark: c.remark }))));

router.post('/payments/remind', write(async (req) => ({ sent: await remindOverdue(req.user) })));

export default router;
