import { define } from './base.js';

export const PointsRedemption = define('PointsRedemption', { customerId: String, points: Number, at: Date }, {}, [{ customerId: 1 }]);
