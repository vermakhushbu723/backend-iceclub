import dayjs from 'dayjs';
import { Dealer, Ledger } from '../models/index.js';
import { newId, round2 } from '../utils/http.js';

export const isDebit = (entry) => entry.type === 'invoice' || entry.type === 'debit';

export function creditSummaryOf(entries, dealer, now = new Date()) {
  const outstanding = round2(entries.reduce((sum, e) => sum + (isDebit(e) ? e.amount : -e.amount), 0));
  // Payments settle the oldest invoices first, so what is left beyond the recent invoices is overdue.
  const cutoff = dayjs(now).subtract(dealer.creditDays ?? 0, 'day');
  const notDue = entries.filter((e) => isDebit(e) && dayjs(e.at).isAfter(cutoff)).reduce((sum, e) => sum + e.amount, 0);
  return {
    limit: dealer.creditLimit ?? 0,
    outstanding,
    overdue: Math.max(0, round2(outstanding - notDue)),
    creditDays: dealer.creditDays ?? 0,
    available: Math.max(0, round2((dealer.creditLimit ?? 0) - outstanding)),
  };
}

export async function creditSummary(dealer) {
  return creditSummaryOf(await Ledger.find({ dealerId: dealer._id }).lean(), dealer);
}

export const lockDealer = (dealerId) => Dealer.updateOne({ _id: dealerId }, { $inc: { rev: 1 } });

export const addLedger = (dealerId, type, entryAmount, ref, note = '', at = new Date()) => Ledger.create([{ _id: newId('L'), dealerId, type, amount: round2(entryAmount), ref, note, at }], {});
