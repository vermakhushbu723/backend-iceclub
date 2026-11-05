import { define, latLng } from './base.js';

export const Attendance = define('Attendance', { riderId: String, day: String, checkIn: Date, checkOut: { type: Date, default: null }, location: { type: latLng, default: null }, checkOutLocation: { type: latLng, default: null } }, {}, [[{ riderId: 1, day: 1 }, { unique: true }]]);
