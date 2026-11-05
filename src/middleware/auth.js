import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import { Customer, Dealer, Rider, Staff } from '../models/index.js';
import { ApiError } from '../utils/http.js';

export const MODELS = { admin: Staff, dealer: Dealer, rider: Rider, customer: Customer };

export const signToken = (role, account) =>
  jwt.sign({ sub: account._id, role, v: account.tokenVersion ?? 0 }, config.jwtSecret, { expiresIn: `${config.tokenDays[role]}d` });

/** Lets only this kind of account through, and only while the account is active. */
export const requireRole = (role) => async (req, _res, next) => {
  const token = /^Bearer (.+)$/.exec(req.get('authorization') ?? '')?.[1];
  if (!token) throw new ApiError(401, 'Please sign in again');
  let claims;
  try {
    claims = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
  } catch {
    throw new ApiError(401, 'Please sign in again');
  }
  if (claims.role !== role) throw new ApiError(403, 'You do not have access to this');
  const account = await MODELS[role].findById(claims.sub).lean();
  if (!account || account.deletedAt || (account.tokenVersion ?? 0) !== claims.v) throw new ApiError(401, 'Please sign in again');
  if (role !== 'dealer' && account.active === false) throw new ApiError(403, 'This account is not active. Please contact the ICECLUB team.');
  req.user = account;
  req.role = role;
  next();
};
