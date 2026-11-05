import { define } from './base.js';

export const Notification = define('Notification', { ownerType: String, ownerId: { type: String, default: null }, type: String, title: String, body: String, at: Date, read: { type: Boolean, default: false }, route: { type: String, default: null }, orderId: { type: String, default: null }, offerCode: { type: String, default: null } }, {}, [{ ownerType: 1, ownerId: 1, at: -1 }]);
