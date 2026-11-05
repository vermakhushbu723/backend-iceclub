import { define } from './base.js';

export const Move = define('Move', { at: Date, factoryId: String, productId: String, qty: Number, type: String, ref: String, note: { type: String, default: '' } }, {}, [{ factoryId: 1, productId: 1 }, { at: -1 }]);
