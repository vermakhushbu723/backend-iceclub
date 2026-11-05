import { Setting } from '../models/index.js';

export const SETTING_DEFAULTS = {
  company: { name: 'ICECLUB', tagline: 'Smart Ice Distribution', phone: '+917009090977', whatsapp: '917009090977', serviceArea: 'Mumbai, Thane, Navi Mumbai & Palghar', address: '', gstin: '', fssai: '', upiId: '', stateCode: '27' },
  charges: { minOrder: 1000, freeDeliveryAbove: 5000, deliveryFee: 250 },
  customerCharges: { minOrder: 99, freeDeliveryAbove: 499, deliveryFee: 49, expressFee: 39, referralReward: 50, pointsPerRupees: 10, pointsToRedeem: 100, rupeesPerPoint: 0.1, maxWalletTopUp: 10000 },
  slots: [['6 AM - 9 AM', 6], ['9 AM - 12 PM', 9], ['12 PM - 3 PM', 12], ['3 PM - 6 PM', 15], ['6 PM - 9 PM', 18]],
  slotLeadHours: 2,
  tierRates: { Standard: 1, Silver: 0.97, Gold: 0.95 },
  servicePinPrefixes: ['400', '401', '410', '421'],
  riderPay: { workingDays: 26, perDelivery: 10, monthlyTarget: 100, targetBonus: 500 },
};

export async function setting(key) {
  const row = await Setting.findById(key).lean();
  return row?.value ?? SETTING_DEFAULTS[key];
}

export const saveSetting = (key, value) => Setting.findByIdAndUpdate(key, { value }, { upsert: true });

export const slotNames = (slots) => slots.map(([label]) => label);
