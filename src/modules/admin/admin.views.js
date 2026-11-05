import { Customer, Dealer, Price } from '../../models/index.js';
import { walletBalance } from '../../services/wallet.service.js';
import { doc } from '../../utils/http.js';
import { fileUrl } from '../../utils/urls.js';

export const adminProduct = (p) => {
  const { image, ...rest } = doc(p);
  return { ...rest, image: `/images/${image}` };
};

export function adminOrder(req, o, buyerName) {
  const { otp, otpAttempts, rev, ...rest } = doc(o);
  return {
    ...rest,
    buyerName: buyerName ?? '',
    delivery: o.delivery && { ...o.delivery, photos: (o.delivery.photos ?? []).map((p) => fileUrl(req, p.url)) },
    pickup: o.pickup && { ...o.pickup, photos: (o.pickup.photos ?? []).map((p) => fileUrl(req, p.url)) },
  };
}

export const adminComplaint = (req, c) => ({ ...doc(c), photos: (c.photos ?? []).map((p) => ({ ...p, url: fileUrl(req, p.url) })) });

export const dealerRow = (req, d) => {
  const { documents, favourites, stockAlerts, mutedTypes, reminderOn, ...rest } = doc(d);
  return { ...rest, documents: Object.entries(documents ?? {}).map(([name, path]) => ({ name, url: fileUrl(req, path) })) };
};

export const riderRow = (req, r) => {
  const { mutedTypes, documents, ...rest } = doc(r);
  return { ...rest, documents: Object.entries(documents ?? {}).map(([name, path]) => ({ name, url: fileUrl(req, path) })) };
};

export const customerRow = async (c) => {
  const { savedUpi, favourites, notificationPrefs, referredBy, referralPaid, ...rest } = doc(c);
  return { ...rest, walletBalance: await walletBalance(c._id) };
};

export const buyerNames = async (orders) => {
  const dealers = await Dealer.find({ _id: { $in: orders.map((o) => o.dealerId).filter(Boolean) } }).select('businessName').lean();
  const customers = await Customer.find({ _id: { $in: orders.map((o) => o.customerId).filter(Boolean) } }).select('name').lean();
  return Object.fromEntries([...dealers.map((d) => [d._id, d.businessName]), ...customers.map((c) => [c._id, c.name])]);
};

export const orderRows = async (req, orders) => {
  const names = await buyerNames(orders);
  return orders.map((o) => adminOrder(req, o, names[o.dealerId ?? o.customerId]));
};

export async function priceTables() {
  const rows = await Price.find().lean();
  const tables = { dealerPrices: {}, locationPrices: {} };
  for (const r of rows) {
    const table = r.scope === 'dealer' ? tables.dealerPrices : tables.locationPrices;
    (table[r.key] ??= {})[r.productId] = r.price;
  }
  return tables;
}

export const ticketRow = (t) => doc(t);
