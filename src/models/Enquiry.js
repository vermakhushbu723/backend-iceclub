import { define } from './base.js';

export const Enquiry = define('Enquiry', { customerId: String, customerName: String, phone: String, eventType: String, date: Date, quantityKg: Number, location: String, notes: { type: String, default: '' }, at: Date, status: { type: String, enum: ['received', 'quoted'], default: 'received' }, quote: { type: String, default: '' } }, {}, [{ customerId: 1 }]);
