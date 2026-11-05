import { define, latLng, photoSchema } from './base.js';

export const Complaint = define('Complaint', {
  number: { type: String, unique: true },
  orderId: String,
  orderNumber: String,
  dealerId: { type: String, default: null },
  customerId: { type: String, default: null },
  buyerName: { type: String, default: '' },
  riderId: { type: String, default: null },
  source: { type: String, enum: ['dealer', 'rider', 'customer'] },
  type: String,
  qty: { type: Number, default: 0 },
  description: String,
  photos: { type: [photoSchema], default: [] },
  submittedAt: Date,
  location: { type: latLng, default: null },
  status: { type: String, enum: ['underReview', 'approved', 'rejected'], default: 'underReview' },
  remark: { type: String, default: '' },
  decidedAt: { type: Date, default: null },
  creditAmount: { type: Number, default: 0 },
}, {}, [{ status: 1 }, { dealerId: 1 }, { customerId: 1 }, { riderId: 1 }]);
