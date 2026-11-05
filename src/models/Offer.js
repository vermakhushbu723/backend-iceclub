import { define } from './base.js';

export const Offer = define('Offer', { audience: { type: String, enum: ['dealer', 'customer'] }, kind: { type: String, default: 'current' }, code: { type: String, default: '' }, title: String, description: String, percent: { type: Number, default: 0 }, flatOff: { type: Number, default: 0 }, maxDiscount: { type: Number, default: 0 }, minOrder: { type: Number, default: 0 }, freeDelivery: { type: Boolean, default: false }, tier: { type: String, default: '' }, validTill: Date, active: { type: Boolean, default: true } });
