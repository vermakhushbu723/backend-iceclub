import { define } from './base.js';

export const DutySession = define('DutySession', { riderId: String, start: Date, end: { type: Date, default: null } }, {}, [{ riderId: 1, start: -1 }]);
