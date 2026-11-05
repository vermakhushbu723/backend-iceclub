import { define } from './base.js';

export const RoutePoint = define('RoutePoint', { riderId: String, day: String, lat: Number, lng: Number, at: Date }, {}, [{ riderId: 1, day: 1, at: 1 }]);
