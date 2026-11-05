import { account, define } from './base.js';

export const Staff = define('Staff', { ...account, name: String, email: { type: String, unique: true }, role: String, active: { type: Boolean, default: true } });
