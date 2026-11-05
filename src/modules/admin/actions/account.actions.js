import { Dealer, PaymentClaim } from '../../../models/index.js';
import { findDealer } from '../admin.helpers.js';
import { ACCOUNTS } from '../admin.roles.js';
import { addLedger } from '../../../services/ledger.service.js';
import { logActivity, notify } from '../../../services/notification.service.js';
import { amount, doc, need, notFound, str } from '../../../utils/http.js';

export const accountActions = {
  addLedgerEntry: [ACCOUNTS, async (req, input) => {
    const dealer = await findDealer(input?.dealerId);
    const type = str(input.type, 20);
    need(['payment', 'creditNote', 'debit'].includes(type), 'Select the entry type');
    const money = amount(input.amount);
    const ref = str(input.ref, 80);
    need(ref, 'Enter a reference number');
    await addLedger(dealer._id, type, money, ref, str(input.note, 200));
    await logActivity(`${type === 'payment' ? 'Payment received' : 'Ledger entry'} for ${dealer.businessName}`, 'green');
    if (type === 'payment') await notify('dealer', dealer, 'payment', 'Payment received', `₹${money} (ref. ${ref}) has been received.`, { route: '/payments' });
    return {};
  }],

  decidePaymentClaim: [ACCOUNTS, async (req, id, approve, remark) => {
    const claim = await PaymentClaim.findById(str(id, 60));
    if (!claim) throw notFound('Payment');
    need(claim.status === 'pending', 'This payment has already been decided');
    const note = str(remark, 300);
    if (!approve) need(note, 'Say why the payment is rejected');
    claim.status = approve ? 'verified' : 'rejected';
    claim.remark = note;
    claim.decidedAt = new Date();
    claim.decidedBy = req.user.name;
    await claim.save();
    const dealer = await Dealer.findById(claim.dealerId).lean();
    if (approve) await addLedger(claim.dealerId, 'payment', claim.amount, claim.reference, claim.mode);
    await notify('dealer', dealer, 'payment', approve ? 'Payment verified' : 'Payment rejected', approve ? `₹${claim.amount} (ref. ${claim.reference}) was added to your account.` : `₹${claim.amount} (ref. ${claim.reference}): ${note}`, { route: '/payments' });
    await logActivity(`Payment of ₹${claim.amount} ${approve ? 'verified' : 'rejected'}: ${dealer?.businessName}`, approve ? 'green' : 'red');
    return { paymentClaims: [doc(claim.toObject())] };
  }],
};
