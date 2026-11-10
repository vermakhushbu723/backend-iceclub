import { define } from './base.js';

/** Fuel the company paid for, filled into a rider's vehicle. The rider records a video at the pump; staff approve it. */
export const FuelTopUp = define('FuelTopUp', {
  riderId: String,
  riderName: { type: String, default: '' },
  vehicleNumber: { type: String, default: '' },
  amount: Number,
  litres: Number,
  odometerKm: { type: Number, default: null },
  pump: { type: String, default: '' },
  video: String,
  note: { type: String, default: '' },
  at: Date,
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  remark: { type: String, default: '' },
  decidedBy: { type: String, default: '' },
  decidedAt: { type: Date, default: null },
}, {}, [{ riderId: 1, at: -1 }, { status: 1 }]);
