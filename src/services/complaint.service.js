import { Dealer } from '../models/index.js';
import { nextSeq } from './counter.service.js';
import { addLedger } from './ledger.service.js';
import { logActivity, notify } from './notification.service.js';
import { addWallet } from './wallet.service.js';
import { need, round2, str } from '../utils/http.js';

export async function nextComplaintNumber() {
  return `CMP-${1000 + (await nextSeq('complaint'))}`;
}

export async function decideComplaint(complaint, approve, remark, creditAmount) {
  need(complaint?.status === 'underReview', 'This complaint has already been decided');
  const note = str(remark, 500);
  need(note || approve, 'Say why the complaint is rejected');
  const credit = approve ? round2(Number(creditAmount) || 0) : 0;
  need(credit >= 0, 'Enter a valid credit amount');
  complaint.status = approve ? 'approved' : 'rejected';
  complaint.remark = note;
  complaint.decidedAt = new Date();
  complaint.creditAmount = credit;
  await complaint.save();
  if (credit > 0 && complaint.dealerId) await addLedger(complaint.dealerId, 'creditNote', credit, complaint.number, 'Complaint approved');
  if (credit > 0 && complaint.customerId) await addWallet(complaint.customerId, credit, `Refund for ${complaint.number}`);
  await logActivity(`Complaint ${complaint.number} ${approve ? 'approved' : 'rejected'}`, approve ? 'green' : 'red');
  const body = `${complaint.number} was ${approve ? 'approved' : 'rejected'}.${note ? ` ${note}` : ''}`;
  if (complaint.dealerId && complaint.source === 'dealer') {
    const dealer = await Dealer.findById(complaint.dealerId).lean();
    if (dealer) await notify('dealer', dealer, 'order', 'Complaint decided', body, { route: `/complaints/${complaint._id}` });
  }
  if (complaint.customerId) await notify('customer', complaint.customerId, 'order', 'Your report was reviewed', body);
  if (complaint.source === 'rider' && complaint.riderId) await notify('rider', complaint.riderId, 'order', 'Report reviewed', body);
  return complaint;
}
