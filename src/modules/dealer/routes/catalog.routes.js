import { Router } from 'express';
import { Dealer, Price, Product } from '../../../models/index.js';
import { dealerProduct } from '../dealer.views.js';
import { setting } from '../../../services/settings.service.js';
import { availableStock } from '../../../services/stock.service.js';
import { bool, read, str, write } from '../../../utils/http.js';

const router = Router();

const CATEGORIES = [['tube', 'Tube Ice'], ['cube', 'Cube Ice'], ['block', 'Block Ice'], ['slab', 'Slab Ice'], ['crushed', 'Crushed Ice'], ['dry', 'Dry Ice'], ['box', 'Ice Boxes']];

router.get('/categories', read(() => CATEGORIES.map(([id, name]) => ({ id, name }))));

router.get('/products', read(async (req) => {
  const [products, stock, tierRates, dealerPrices] = await Promise.all([
    Product.find({ forDealers: true, active: true }).lean(),
    availableStock(),
    setting('tierRates'),
    Price.find({ scope: 'dealer', key: req.user._id }).lean(),
  ]);
  const special = Object.fromEntries(dealerPrices.map((p) => [p.productId, p.price]));
  const rate = tierRates[req.user.tier] ?? 1;
  return products.map((p) => {
    const base = p.slabs[0].price;
    if (special[p._id] != null) return dealerProduct(p, stock[p._id] ?? 0, [{ minQty: 1, price: special[p._id] }], base);
    if (rate === 1 || p.returnable) return dealerProduct(p, stock[p._id] ?? 0, p.slabs, null);
    return dealerProduct(p, stock[p._id] ?? 0, p.slabs.map((s) => ({ minQty: s.minQty, price: Math.round(s.price * rate) })), base);
  });
}));

const toggled = (list, id, on) => (on ? [...new Set([...list, id])] : list.filter((x) => x !== id));

router.get('/favourites', read((req) => req.user.favourites ?? []));

router.put('/favourites/:id', write(async (req) => {
  await Dealer.updateOne({ _id: req.user._id }, { favourites: toggled(req.user.favourites ?? [], str(req.params.id, 60), bool(req.body.on)) });
}));

router.get('/stock-alerts', read((req) => req.user.stockAlerts ?? []));

router.put('/stock-alerts/:id', write(async (req) => {
  await Dealer.updateOne({ _id: req.user._id }, { stockAlerts: toggled(req.user.stockAlerts ?? [], str(req.params.id, 60), bool(req.body.on)) });
}));

export default router;
