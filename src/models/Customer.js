import { Mixed, account, addressSchema, define } from './base.js';

export const Customer = define('Customer', {
  ...account,
  phone: { type: String, unique: true },
  name: { type: String, default: '' },
  email: { type: String, default: '' },
  referralCode: { type: String, default: '' },
  referredBy: { type: String, default: '' },
  referralPaid: { type: Boolean, default: false },
  joinedOn: Date,
  active: { type: Boolean, default: true },
  addresses: { type: [addressSchema], default: [] },
  favourites: { type: [String], default: [] },
  savedUpi: { type: [String], default: [] },
  notificationPrefs: { type: Mixed, default: {} },
});
