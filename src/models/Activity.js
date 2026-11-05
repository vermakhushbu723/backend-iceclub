import { define } from './base.js';

export const Activity = define('Activity', { at: Date, text: String, color: String }, {}, [{ at: -1 }]);

/** ownerType admin notifications are shared by all staff. */
