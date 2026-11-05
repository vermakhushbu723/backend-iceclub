import { define } from './base.js';

export const Review = define('Review', { productId: String, customerId: { type: String, default: null }, author: String, rating: Number, text: String, at: Date }, {}, [{ productId: 1, at: -1 }]);
