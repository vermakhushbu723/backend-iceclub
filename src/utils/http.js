import mongoose from 'mongoose';
import { randomBytes } from 'node:crypto';

/** An error whose message is safe to show to the person using the app. */
export class ApiError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

export const need = (condition, message, status = 400) => {
  if (!condition) throw new ApiError(status, message);
};

export const notFound = (what = 'Record') => new ApiError(404, `${what} not found`);

/** Runs the work as one transaction, so a failure part way through changes nothing. */
export const tx = (work) => mongoose.connection.transaction(work);

/** Handlers return their response body. Writes run inside a transaction. */
export const read = (handler) => async (req, res) => res.json(await handler(req, res));
export const write = (handler) => async (req, res) => res.json((await tx(() => handler(req, res))) ?? { ok: true });

export const newId = (prefix) => `${prefix}-${Date.now().toString(36)}${randomBytes(4).toString('hex')}`;

export const round2 = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

/* Input helpers. Everything from a client passes through these, so an object can never reach a query. */

export const str = (value, max = 500) => (typeof value === 'string' || typeof value === 'number' ? String(value).trim().slice(0, max) : '');

export const num = (value) => {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) ? n : NaN;
};

export const bool = (value) => value === true;

export const positiveInt = (value, message) => {
  const n = num(value);
  need(Number.isInteger(n) && n > 0, message);
  return n;
};

export const amount = (value, message = 'Enter a valid amount') => {
  const n = num(value);
  need(n > 0 && n <= 100000000, message);
  return round2(n);
};

export const dateOf = (value, message = 'Enter a valid date') => {
  const d = new Date(typeof value === 'string' || typeof value === 'number' ? value : NaN);
  need(!Number.isNaN(d.getTime()), message);
  return d;
};

export const geo = (value) => {
  if (!value || typeof value !== 'object') return null;
  const lat = num(value.latitude ?? value.lat);
  const lng = num(value.longitude ?? value.lng);
  if (!(lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180)) return null;
  return { lat, lng };
};

export const geoOut = (g) => (g ? { latitude: g.lat, longitude: g.lng, accuracyMetres: null } : null);

export const PHONE = /^[6-9]\d{9}$/;
export const phoneOf = (value) => {
  const phone = str(value, 13).replace(/^\+?91(?=\d{10}$)/, '');
  need(PHONE.test(phone), 'Enter a valid 10-digit mobile number');
  return phone;
};

/** Only photos this server stored, or its sample pictures, may be attached to a record. */
export const photoPath = (value) => {
  const path = str(value, 400).replace(/^https?:\/\/[^/]+/, '');
  return /^\/api\/files\/[\w-]+$/.test(path) || /^\/images\/[\w.-]+$/.test(path) ? path : null;
};

export const doc = (record) => {
  if (!record) return record;
  const { _id, __v, passwordHash, tokenVersion, deletedAt, rev, ...rest } = record;
  return { id: _id, ...rest };
};

export const docs = (records) => records.map(doc);
