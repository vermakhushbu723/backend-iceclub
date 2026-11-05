import { define } from './base.js';

export const Ledger = define('Ledger', { dealerId: String, type: { type: String, enum: ['invoice', 'debit', 'payment', 'creditNote'] }, amount: Number, at: Date, ref: String, note: { type: String, default: '' } }, {}, [{ dealerId: 1, at: 1 }]);
