import { ApiError } from '../utils/http.js';

/** Query operators such as $ne must never arrive from a client. */
export function hasOperator(value) {
  if (Array.isArray(value)) return value.some(hasOperator);
  if (value && typeof value === 'object') return Object.entries(value).some(([k, v]) => k.startsWith('$') || k.includes('.') || hasOperator(v));
  return false;
}



export function rejectOperators(req, _res, next) {
  if (hasOperator(req.body)) throw new ApiError(400, 'That request is not valid');
  next();
}
