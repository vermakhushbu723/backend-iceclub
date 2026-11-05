import { Staff } from '../../../models/index.js';
import { GSTIN } from '../admin.helpers.js';
import { ACCOUNTS, SUPER_ONLY } from '../admin.roles.js';
import { checkNewPassword, hashPassword } from '../../../services/password.service.js';
import { saveSetting, setting } from '../../../services/settings.service.js';
import { ApiError, bool, doc, need, newId, num, str } from '../../../utils/http.js';

export const settingsActions = {
  updateCompany: [SUPER_ONLY, async (req, values) => {
    const current = await setting('company');
    const next = { ...current };
    for (const key of ['name', 'tagline', 'phone', 'whatsapp', 'serviceArea', 'address', 'gstin', 'fssai', 'upiId', 'stateCode']) {
      if (values?.[key] != null) next[key] = str(values[key], 300);
    }
    need(next.name, 'Enter the company name');
    need(/^\d{2}$/.test(next.stateCode), 'Enter the 2-digit state code');
    need(!next.gstin || GSTIN.test(next.gstin), 'Enter a valid 15-character GSTIN');
    await saveSetting('company', next);
    return { company: next };
  }],

  updateCharges: [SUPER_ONLY, async (req, values) => {
    const charges = { minOrder: num(values?.minOrder), freeDeliveryAbove: num(values?.freeDeliveryAbove), deliveryFee: num(values?.deliveryFee) };
    need(Object.values(charges).every((v) => v >= 0), 'Enter valid amounts');
    await saveSetting('charges', charges);
    return { charges };
  }],

  updateCustomerCharges: [SUPER_ONLY, async (req, values) => {
    const current = await setting('customerCharges');
    const next = { ...current };
    for (const key of Object.keys(current)) {
      if (values?.[key] != null) {
        next[key] = num(values[key]);
        need(next[key] >= 0, 'Enter valid amounts');
      }
    }
    await saveSetting('customerCharges', next);
    return { customerCharges: next };
  }],

  updateTierRates: [ACCOUNTS, async (req, values) => {
    const next = { ...(await setting('tierRates')) };
    for (const tier of ['Standard', 'Silver', 'Gold']) {
      if (values?.[tier] != null) {
        next[tier] = num(values[tier]);
        need(next[tier] >= 0.5 && next[tier] <= 1.5, 'A tier rate must be between 0.5 and 1.5');
      }
    }
    await saveSetting('tierRates', next);
    return { tierRates: next };
  }],

  saveStaff: [SUPER_ONLY, async (req, values) => {
    const name = str(values?.name, 80);
    need(name, 'Enter the name');
    const email = str(values.email, 120).toLowerCase();
    need(/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email), 'Enter a valid email');
    const id = str(values.id, 60);
    need(!(await Staff.exists({ email, _id: { $ne: id } })), 'This email is already in use');
    const role = ['Super Admin', 'Accounts', 'Dispatch', 'Factory'].includes(values.role) ? values.role : 'Dispatch';
    if (id === req.user._id) need(role === 'Super Admin' && values.active !== false, 'You cannot remove your own access');
    const fields = { name, email, role };
    if (values.active != null) fields.active = bool(values.active);
    if (values.password) fields.passwordHash = await hashPassword(checkNewPassword(values.password));
    else if (!id) throw new ApiError(400, 'Enter a password for the new staff member');
    const staffId = id || newId('S');
    if (id) {
      const changedAccess = values.password || values.active === false;
      await Staff.updateOne({ _id: id }, { ...fields, ...(changedAccess ? { $inc: { tokenVersion: 1 } } : {}) });
    } else await Staff.create([{ _id: staffId, ...fields }], {});
    return { staff: [doc(await Staff.findById(staffId).lean())] };
  }],
};
