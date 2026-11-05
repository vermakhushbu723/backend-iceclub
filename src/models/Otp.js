import { define } from './base.js';

export const Otp = define('Otp', { codeHash: String, attempts: { type: Number, default: 0 }, sentAt: Date, expiresAt: { type: Date, expires: 0 } });
