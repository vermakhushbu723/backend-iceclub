import { define } from './base.js';

export const DeliveryRequest = define('DeliveryRequest', { dealerId: String, date: Date, slot: String, addressLabel: String, details: String, requestedAt: Date, status: { type: String, enum: ['requested', 'confirmed', 'declined'], default: 'requested' } }, {}, [{ dealerId: 1 }]);
