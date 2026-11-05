import bcrypt from 'bcryptjs';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { config } from '../../config/index.js';
import { MODELS, signToken } from '../../middleware/auth.js';
import { Customer, Dealer, Rider, Staff } from '../../models/index.js';
import { customerAccount } from '../customer/customer.views.js';
import { dealerAccount } from '../dealer/dealer.views.js';
import { riderAccount } from '../rider/rider.views.js';
import { logActivity } from '../../services/notification.service.js';
import { sendOtp, verifyOtp } from '../../services/otp.service.js';
import { addWallet } from '../../services/wallet.service.js';
import { ApiError, need, newId, phoneOf, str, tx } from '../../utils/http.js';

export const auth = Router();

// Slows down password and OTP guessing from one address. The test run comes from one address too.
auth.use(rateLimit({ windowMs: 60 * 1000, limit: config.isTest ? 5000 : 30, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many tries. Please wait a minute.' } }));

const VIEW = { dealer: dealerAccount, rider: riderAccount, customer: customerAccount };

const roleOf = (req) => {
  const role = req.params.role;
  need(role === 'dealer' || role === 'rider' || role === 'customer', 'Unknown app', 404);
  return role;
};

const findByPhone = (role, phone) => MODELS[role].findOne({ phone, deletedAt: null }).lean();

const signedIn = (role, account) => ({ token: signToken(role, account), user: VIEW[role](account) });

function referralCodeFor(phone) {
  return `ICE${phone.slice(6)}${newId('').slice(-3).toUpperCase()}`;
}

/** The first OTP from a new number opens an account. Riders are added only by the admin. */
async function createAccount(role, phone, body) {
  if (role === 'dealer') {
    const [dealer] = await Dealer.create([{ _id: newId('D'), phone, joinedOn: new Date() }], {});
    return dealer.toObject();
  }
  const [customer] = await Customer.create([{ _id: newId('CU'), phone, referralCode: referralCodeFor(phone), joinedOn: new Date() }], {});
  const code = str(body.referralCode, 30).toUpperCase();
  if (code) await Customer.updateOne({ _id: customer._id }, { referredBy: code });
  await addWallet(customer._id, 100, 'Welcome bonus');
  await logActivity(`New customer signed up: ${phone}`);
  return customer.toObject();
}

auth.post('/admin/login', async (req, res) => {
  const email = str(req.body.email, 200).toLowerCase();
  const person = await Staff.findOne({ email, active: true, deletedAt: null }).lean();
  const matches = person?.passwordHash && (await bcrypt.compare(str(req.body.password, 200), person.passwordHash));
  need(matches, 'Incorrect email or password', 401);
  res.json({ token: signToken('admin', person), user: { id: person._id, name: person.name, email: person.email, role: person.role } });
});

auth.post('/:role/otp/send', async (req, res) => {
  const role = roleOf(req);
  const phone = phoneOf(req.body.phone);
  if (role === 'rider') {
    const rider = await Rider.findOne({ phone, deletedAt: null, active: true }).lean();
    need(rider, 'This number is not registered. Please contact your admin.', 404);
  }
  await sendOtp(role, phone);
  res.json({ ok: true });
});

auth.post('/:role/otp/verify', async (req, res) => {
  const role = roleOf(req);
  const phone = phoneOf(req.body.phone);
  await verifyOtp(role, phone, req.body.otp);
  const account = (await findByPhone(role, phone)) ?? (await tx(() => {
    need(role !== 'rider', 'This number is not registered. Please contact your admin.', 404);
    return createAccount(role, phone, req.body);
  }));
  if (role !== 'dealer' && account.active === false) throw new ApiError(403, 'This account is not active. Please contact the ICECLUB team.');
  res.json(signedIn(role, account));
});

const WRONG_PASSWORD = 'Incorrect mobile number or password.';

auth.post('/:role/login', async (req, res) => {
  const role = roleOf(req);
  const phone = phoneOf(req.body.phone);
  const account = await findByPhone(role, phone);
  const matches = account?.passwordHash && (await bcrypt.compare(str(req.body.password, 200), account.passwordHash));
  need(matches, role === 'rider' ? WRONG_PASSWORD : `${WRONG_PASSWORD} New here, or forgot it? Sign in with OTP.`, 401);
  if (role !== 'dealer' && account.active === false) throw new ApiError(403, 'This account is not active. Please contact the ICECLUB team.');
  res.json(signedIn(role, account));
});
