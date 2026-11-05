import { define } from './base.js';

export const Subscription = define('Subscription', { customerId: String, productId: String, qty: Number, frequency: String, slot: String, addressId: String, startDate: Date, paused: { type: Boolean, default: false }, skipped: { type: [Date], default: [] }, lastRun: { type: Date, default: null } }, {}, [{ customerId: 1 }]);
