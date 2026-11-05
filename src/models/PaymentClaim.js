import { define } from './base.js';

export const PaymentClaim = define('PaymentClaim', { dealerId: String, amount: Number, mode: String, reference: String, at: Date, status: { type: String, enum: ['pending', 'verified', 'rejected'], default: 'pending' }, remark: { type: String, default: '' }, decidedAt: Date, decidedBy: String }, {}, [{ dealerId: 1 }, { status: 1 }]);
