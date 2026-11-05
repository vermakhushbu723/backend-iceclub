import { define } from './base.js';

export const Price = define('Price', { scope: { type: String, enum: ['dealer', 'location'] }, key: String, productId: String, price: Number }, {}, [[{ scope: 1, key: 1, productId: 1 }, { unique: true }]]);
