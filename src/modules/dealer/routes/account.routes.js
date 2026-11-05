import { Router } from 'express';
import { Dealer, Order } from '../../../models/index.js';
import { fresh } from '../dealer.helpers.js';
import { dealerAccount } from '../dealer.views.js';
import { upsertAddress } from '../../../services/address.service.js';
import { creditSummary } from '../../../services/ledger.service.js';
import { logActivity, notifyAdmin } from '../../../services/notification.service.js';
import { changePassword } from '../../../services/password.service.js';
import { need, photoPath, read, str, write } from '../../../utils/http.js';

const router = Router();

router.get('/me', read((req) => dealerAccount(req.user)));

const GSTIN = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

const PAN = /^[A-Z]{5}\d{4}[A-Z]$/;

const FSSAI = /^\d{14}$/;

function profileFields(body) {
  return {
    ownerName: str(body.ownerName, 80),
    businessName: str(body.businessName, 120),
    businessType: str(body.businessType, 60),
    email: str(body.email, 120),
    gstin: str(body.gstin, 15).toUpperCase(),
    pan: str(body.pan, 10).toUpperCase(),
    fssai: str(body.fssai, 14),
    addressLine: str(body.addressLine),
    city: str(body.city, 80),
    pincode: str(body.pincode, 6),
  };
}

function documentsFrom(body) {
  const documents = {};
  for (const [name, path] of Object.entries(body.documents && typeof body.documents === 'object' ? body.documents : {})) {
    const url = photoPath(path);
    if (url) documents[str(name, 60)] = url;
  }
  return documents;
}

router.put('/me', write(async (req) => {
  const fields = profileFields(req.body);
  need(fields.ownerName, 'Enter your name');
  // KYC details are checked by the team, so an approved dealer can't change them without review.
  const locked = req.user.kycStatus === 'approved' ? ['businessName', 'gstin', 'pan', 'fssai'] : [];
  for (const key of locked) delete fields[key];
  await Dealer.updateOne({ _id: req.user._id }, fields);
  return dealerAccount(await fresh(req));
}));

router.post('/kyc', write(async (req) => {
  need(req.user.kycStatus !== 'approved', 'Your account is already approved');
  const fields = profileFields(req.body);
  need(fields.businessName, 'Enter the business name');
  need(fields.ownerName, 'Enter your name');
  need(GSTIN.test(fields.gstin), 'Enter a valid 15-character GSTIN');
  need(PAN.test(fields.pan), 'Enter a valid 10-character PAN');
  need(FSSAI.test(fields.fssai), 'Enter a valid 14-digit FSSAI number');
  need(fields.addressLine && fields.city, 'Enter your business address');
  need(/^[1-9]\d{5}$/.test(fields.pincode), 'Enter a valid 6-digit PIN code');
  const documents = documentsFrom(req.body);
  need(Object.keys(documents).length > 0, 'Upload your documents');
  const duplicate = await Dealer.exists({ gstin: fields.gstin, _id: { $ne: req.user._id }, deletedAt: null });
  need(!duplicate, 'This GSTIN is already registered with another dealer');
  const addresses = upsertAddress(req.user.addresses ?? [], { id: 'business', label: 'Business address', contactName: fields.ownerName, phone: req.user.phone, line: fields.addressLine, city: fields.city, pincode: fields.pincode, isDefault: true });
  const count = await Dealer.countDocuments({});
  await Dealer.updateOne({ _id: req.user._id }, { ...fields, documents, addresses, kycStatus: 'pending', rejectionReason: '', joinedOn: new Date(), code: req.user.code || `ICD-${100 + count}` });
  await notifyAdmin('kyc', 'New KYC application', `${fields.businessName} is waiting for approval.`, '/dealers/kyc');
  await logActivity(`KYC submitted: ${fields.businessName}`, 'orange');
  return dealerAccount(await fresh(req));
}));

router.get('/me/has-password', read((req) => ({ hasPassword: Boolean(req.user.passwordHash) })));

router.post('/me/password', write((req) => changePassword('dealer', req.user, req.body.current, req.body.next)));

/** Bills and ledgers must be kept by law, so a deleted account loses its personal details but not those. */
router.delete('/me', write(async (req) => {
  const open = await Order.exists({ dealerId: req.user._id, status: { $nin: ['delivered', 'cancelled'] } });
  need(!open, 'You have orders in progress. Please wait for them to finish first.');
  const summary = await creditSummary(req.user);
  need(summary.outstanding <= 0, 'Please clear your outstanding balance before deleting your account.');
  await Dealer.updateOne({ _id: req.user._id }, { deletedAt: new Date(), active: false, phone: `deleted-${req.user._id}`, email: '', ownerName: 'Deleted dealer', pan: '', documents: {}, addresses: [], passwordHash: '', tokenVersion: (req.user.tokenVersion ?? 0) + 1 });
}));

export default router;
