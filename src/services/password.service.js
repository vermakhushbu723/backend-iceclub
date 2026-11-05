import bcrypt from 'bcryptjs';
import { MODELS, signToken } from '../middleware/auth.js';
import { need, str } from '../utils/http.js';

export const hashPassword = (password) => bcrypt.hash(password, 10);

export function checkNewPassword(password) {
  const value = typeof password === 'string' ? password : '';
  need(value.length >= 8, 'Use at least 8 characters');
  need(/[A-Za-z]/.test(value) && /\d/.test(value), 'Use both letters and numbers');
  return value;
}

/** Changing a password signs out every other device, except this request's new token. */
export async function changePassword(role, account, current, next) {
  const fresh = checkNewPassword(next);
  if (account.passwordHash) {
    need(await bcrypt.compare(str(current, 200), account.passwordHash), 'Your current password is incorrect.');
  }
  const tokenVersion = (account.tokenVersion ?? 0) + 1;
  await MODELS[role].updateOne({ _id: account._id }, { passwordHash: await hashPassword(fresh), tokenVersion });
  return { token: signToken(role, { ...account, tokenVersion }) };
}
