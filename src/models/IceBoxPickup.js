import { define } from './base.js';

export const IceBoxPickup = define('IceBoxPickup', { dealerId: String, quantity: Number, date: Date, requestedAt: Date, status: { type: String, enum: ['requested', 'completed', 'rejected'], default: 'requested' } }, {}, [{ dealerId: 1 }]);
