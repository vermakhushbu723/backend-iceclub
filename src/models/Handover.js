import { define } from './base.js';

export const Handover = define('Handover', { riderId: String, amount: Number, at: Date, ref: String, receivedBy: { type: String, default: '' }, status: { type: String, enum: ['pending', 'confirmed', 'rejected'], default: 'confirmed' } }, {}, [{ riderId: 1 }]);
