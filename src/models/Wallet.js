import { define } from './base.js';

export const Wallet = define('Wallet', { customerId: String, amount: Number, title: String, at: Date }, {}, [{ customerId: 1, at: -1 }]);
