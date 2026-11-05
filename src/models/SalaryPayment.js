import { define } from './base.js';

export const SalaryPayment = define('SalaryPayment', { riderId: String, month: String, amount: Number, deductions: { type: Number, default: 0 }, bonus: { type: Number, default: 0 }, paidOn: Date }, {}, [[{ riderId: 1, month: 1 }, { unique: true }]]);
