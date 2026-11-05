import { Router } from 'express';
import { config } from '../../../config/index.js';
import { Customer, Product, Review } from '../../../models/index.js';
import { customerProduct } from '../customer.views.js';
import { setting } from '../../../services/settings.service.js';
import { availableStock } from '../../../services/stock.service.js';
import { bool, read, str, write } from '../../../utils/http.js';

const router = Router();

router.get('/config', read(async () => {
  const [charges, slots, lead, prefixes, company] = await Promise.all([setting('customerCharges'), setting('slots'), setting('slotLeadHours'), setting('servicePinPrefixes'), setting('company')]);
  return { charges, slots, slotLeadHours: lead, servicePinPrefixes: prefixes, supportPhone: company.phone, whatsapp: company.whatsapp, serviceArea: company.serviceArea, payments: { online: config.demoPayments, demo: config.demoPayments } };
}));

router.get('/products', read(async () => {
  const [products, stock] = await Promise.all([Product.find({ forCustomers: true, active: true }).lean(), availableStock()]);
  return products.map((p) => customerProduct(p, stock[p._id] ?? 0));
}));

router.get('/products/:id/reviews', read(async (req) => (await Review.find({ productId: str(req.params.id, 60) }).sort({ at: -1 }).limit(100).lean()).map((r) => ({ productId: r.productId, author: r.author, rating: r.rating, text: r.text, at: r.at }))));

router.get('/favourites', read((req) => req.user.favourites ?? []));

router.put('/favourites/:id', write(async (req) => {
  const id = str(req.params.id, 60);
  const list = req.user.favourites ?? [];
  await Customer.updateOne({ _id: req.user._id }, { favourites: bool(req.body.on) ? [...new Set([...list, id])] : list.filter((x) => x !== id) });
}));

export default router;
