import { define } from './base.js';

export const IceBoxMovement = define('IceBoxMovement', { dealerId: String, type: { type: String, enum: ['issued', 'returned'] }, quantity: Number, date: Date, reference: String }, {}, [{ dealerId: 1 }]);
