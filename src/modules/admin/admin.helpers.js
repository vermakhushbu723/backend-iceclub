import { Collection, Dealer, Handover, Price } from '../../models/index.js';
import { dealerRow, orderRows, priceTables } from './admin.views.js';
import { need, newId, notFound, num, round2, str } from '../../utils/http.js';

export const orderChange = async (req, order) => ({ orders: await orderRows(req, [order.toObject ? order.toObject() : order]) });

export const findDealer = async (id) => {
  const d = await Dealer.findOne({ _id: str(id, 60), deletedAt: null }).lean();
  if (!d) throw notFound('Dealer');
  return d;
};

export const reloadDealer = async (req, id) => ({ dealers: [dealerRow(req, await Dealer.findById(id).lean())] });

export const CATEGORY_IDS = { 'Tube Ice': 'tube', 'Cube Ice': 'cube', 'Block Ice': 'block', 'Slab Ice': 'slab', 'Crushed Ice': 'crushed', 'Dry Ice': 'dry', 'Ice Boxes': 'box' };

export const GSTIN = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export async function setPrice(scope, key, productId, price) {
  const k = str(key, 80);
  const p = str(productId, 60);
  need(k && p, 'Select a product');
  const filter = { scope, key: k, productId: p };
  if (price == null || price === '') await Price.deleteOne(filter);
  else {
    const value = num(price);
    need(value > 0, 'Enter a valid price');
    await Price.findOneAndUpdate(filter, { $set: { price: round2(value) }, $setOnInsert: { _id: newId('PX') } }, { upsert: true });
  }
  return priceTables();
}

export async function cashHeld(riderId) {
  const cash = (await Collection.find({ riderId, mode: 'cash' }).select('amount').lean()).reduce((sum, c) => sum + c.amount, 0);
  const handed = (await Handover.find({ riderId, status: 'confirmed' }).select('amount').lean()).reduce((sum, h) => sum + h.amount, 0);
  return round2(cash - handed);
}
