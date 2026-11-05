import { Mixed, account, define } from './base.js';

export const Rider = define('Rider', {
  ...account,
  name: String,
  phone: { type: String, unique: true },
  vehicleType: String,
  vehicleNumber: String,
  licence: String,
  zone: String,
  factoryId: String,
  active: { type: Boolean, default: true },
  onDuty: { type: Boolean, default: false },
  salary: { type: Number, default: 18000 },
  joinedOn: Date,
  lastLocation: { lat: Number, lng: Number, at: Date },
  mutedTypes: { type: [String], default: [] },
  documents: { type: Mixed, default: {} },
});
