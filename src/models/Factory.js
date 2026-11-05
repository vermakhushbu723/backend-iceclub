import { define } from './base.js';

export const Factory = define('Factory', {
  name: String,
  city: String,
  address: { type: String, default: '' },
  manager: String,
  phone: String,
  capacityKg: Number,
  lat: Number,
  lng: Number,
  loadingHours: { type: String, default: '5 AM - 8 PM' },
  instructions: { type: String, default: 'Check the bag count and seal before loading. Keep ice covered during transport.' },
  active: { type: Boolean, default: true },
  rev: { type: Number, default: 0 },
});
