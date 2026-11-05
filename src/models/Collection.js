import { define } from './base.js';

export const Collection = define('Collection', { riderId: String, orderId: String, orderNumber: String, buyerName: String, dealerId: String, amount: Number, mode: { type: String, enum: ['cash', 'upi'] }, at: Date, ref: { type: String, default: '' } }, {}, [{ riderId: 1, at: -1 }]);
