import { define } from './base.js';

/** A dealer collecting ice at a factory themselves, on a date and in a time slot. No rider involved. */
export const FactoryPickup = define('FactoryPickup', {
  dealerId: String,
  dealerName: { type: String, default: '' },
  factoryId: String,
  factoryName: { type: String, default: '' },
  productId: String,
  productName: { type: String, default: '' },
  quantity: Number,
  date: Date,
  slot: String,
  notes: { type: String, default: '' },
  requestedAt: Date,
  status: { type: String, enum: ['requested', 'confirmed', 'collected', 'declined', 'cancelled'], default: 'requested' },
  staffNote: { type: String, default: '' },
}, {}, [{ dealerId: 1, date: -1 }, { status: 1 }]);
