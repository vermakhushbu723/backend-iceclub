import { Dealer } from '../../../models/index.js';
import { findDealer, GSTIN, reloadDealer, setPrice } from '../admin.helpers.js';
import { ACCOUNTS } from '../admin.roles.js';
import { logActivity, notify } from '../../../services/notification.service.js';
import { bool, need, newId, num, phoneOf, str } from '../../../utils/http.js';

export const dealerActions = {
  saveDealer: [ACCOUNTS, async (req, values) => {
    const name = str(values?.businessName, 120);
    need(name, 'Enter the business name');
    const phone = phoneOf(values.phone);
    const id = str(values.id, 60);
    const duplicate = await Dealer.findOne({ phone, _id: { $ne: id }, deletedAt: null }).lean();
    need(!duplicate, `This mobile number already belongs to ${duplicate?.businessName}`);
    const gstin = str(values.gstin, 15).toUpperCase();
    need(!gstin || GSTIN.test(gstin), 'Enter a valid 15-character GSTIN');
    const fields = { businessName: name, ownerName: str(values.ownerName, 80), phone, email: str(values.email, 120), gstin, pan: str(values.pan, 10).toUpperCase(), fssai: str(values.fssai, 14), tier: ['Standard', 'Silver', 'Gold'].includes(values.tier) ? values.tier : 'Standard' };
    if (values.active != null) fields.active = bool(values.active);
    if (id) {
      await findDealer(id);
      await Dealer.updateOne({ _id: id }, fields);
      return reloadDealer(req, id);
    }
    const newDealerId = newId('D');
    const line = str(values.addressLine);
    const city = str(values.city, 80);
    need(line && city, 'Enter the shop address and city');
    const count = await Dealer.countDocuments({});
    await Dealer.create([{ _id: newDealerId, ...fields, code: `ICD-${count + 101}`, kycStatus: 'pending', joinedOn: new Date(), addressLine: line, city, pincode: str(values.pincode, 6), addresses: [{ id: `${newDealerId}-A1`, label: 'Main shop', contactName: fields.ownerName, phone, line, city, pincode: str(values.pincode, 6), isDefault: true, lat: 19.076, lng: 72.8777 }] }], {});
    await logActivity(`Dealer ${name} added`);
    return reloadDealer(req, newDealerId);
  }],

  decideKyc: [ACCOUNTS, async (req, id, approve, reason, creditLimit = 0) => {
    const dealer = await findDealer(id);
    need(dealer.kycStatus === 'pending', 'This application has already been decided');
    const why = str(reason, 300);
    if (!approve) need(why, 'Say why the application is rejected');
    const limit = approve ? num(creditLimit) : dealer.creditLimit;
    need(limit >= 0, 'Enter a valid credit limit');
    await Dealer.updateOne({ _id: dealer._id }, { kycStatus: approve ? 'approved' : 'rejected', rejectionReason: approve ? '' : why, creditLimit: limit });
    await logActivity(`KYC ${approve ? 'approved' : 'rejected'}: ${dealer.businessName}`, approve ? 'green' : 'red');
    await notify('dealer', dealer, 'announcement', approve ? 'Your account is approved' : 'KYC needs attention', approve ? 'You can now place orders.' : why);
    return reloadDealer(req, dealer._id);
  }],

  setCredit: [ACCOUNTS, async (req, id, creditLimit, creditDays) => {
    const limit = num(creditLimit);
    const days = num(creditDays);
    need(limit >= 0 && days >= 0 && Number.isInteger(days), 'Enter a valid credit limit and period');
    const dealer = await findDealer(id);
    await Dealer.updateOne({ _id: dealer._id }, { creditLimit: limit, creditDays: days });
    await logActivity(`Credit limit of ${dealer.businessName} changed`);
    return reloadDealer(req, dealer._id);
  }],

  setDealerPrice: [ACCOUNTS, (req, dealerId, productId, price) => setPrice('dealer', dealerId, productId, price)],
  setLocationPrice: [ACCOUNTS, (req, addressId, productId, price) => setPrice('location', addressId, productId, price)],
};
