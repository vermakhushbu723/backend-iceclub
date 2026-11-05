import { define, Mixed } from './base.js';

export const StandingOrder = define('StandingOrder', { dealerId: String, name: String, items: Mixed, weekdays: [Number], slot: String, addressId: String, paymentMethod: String, lastRun: Date, isActive: { type: Boolean, default: true }, skippedDates: { type: [Date], default: [] } }, {}, [{ dealerId: 1 }]);
