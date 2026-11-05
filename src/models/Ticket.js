import { define } from './base.js';

export const Ticket = define('Ticket', { ownerType: String, ownerId: String, ownerName: { type: String, default: '' }, subject: String, category: String, orderNumber: { type: String, default: null }, messages: [{ _id: false, text: String, fromOwner: Boolean, at: Date, by: String }], status: { type: String, enum: ['open', 'resolved'], default: 'open' } }, {}, [{ ownerType: 1, ownerId: 1 }]);
