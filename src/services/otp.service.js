import { createHash, randomInt } from 'node:crypto';
import { config } from '../config/index.js';
import { Otp } from '../models/index.js';
import { ApiError } from '../utils/http.js';

const TTL_MINUTES = 10;
const MAX_ATTEMPTS = 5;
const RESEND_SECONDS = 30;

const hash = (key, code) => createHash('sha256').update(`${config.jwtSecret}:${key}:${code}`).digest('hex');

/** Connect an SMS provider here. Until then only the demo code works, and only when it is switched on. */
async function sendSms() {
  throw new ApiError(503, 'SMS login is not available yet. Please sign in with your password.');
}

export async function sendOtp(role, phone) {
  const key = `${role}:${phone}`;
  const existing = await Otp.findById(key).lean();
  if (!config.demoOtp && existing && Date.now() - existing.sentAt.getTime() < RESEND_SECONDS * 1000) {
    throw new ApiError(429, 'Please wait a little before asking for another OTP');
  }
  const code = config.demoOtp ?? String(randomInt(100000, 1000000));
  if (!config.demoOtp) await sendSms(phone, code);
  const now = Date.now();
  await Otp.findByIdAndUpdate(key, { codeHash: hash(key, code), attempts: 0, sentAt: new Date(now), expiresAt: new Date(now + TTL_MINUTES * 60000) }, { upsert: true });
}

/** A code works once, and only a few wrong guesses are allowed. */
export async function verifyOtp(role, phone, code) {
  const key = `${role}:${phone}`;
  const row = await Otp.findById(key).lean();
  if (!row || row.expiresAt < new Date()) throw new ApiError(400, 'That OTP has expired. Please ask for a new one.');
  if (row.attempts >= MAX_ATTEMPTS) throw new ApiError(429, 'Too many wrong tries. Please ask for a new OTP.');
  if (row.codeHash !== hash(key, String(code ?? ''))) {
    await Otp.updateOne({ _id: key }, { $inc: { attempts: 1 } });
    throw new ApiError(400, 'Incorrect OTP. Please try again.');
  }
  await Otp.deleteOne({ _id: key });
}
