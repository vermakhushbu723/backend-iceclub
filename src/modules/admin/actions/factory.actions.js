import dayjs from 'dayjs';
import { Dealer, Factory, Product } from '../../../models/index.js';
import { FACTORY } from '../admin.roles.js';
import { logActivity, notify } from '../../../services/notification.service.js';
import { addMove, availableStock, lockFactory, stockOf } from '../../../services/stock.service.js';
import { bool, doc, need, newId, notFound, num, str } from '../../../utils/http.js';

export const factoryActions = {
  saveFactory: [FACTORY, async (req, values) => {
    const name = str(values?.name, 120);
    need(name, 'Enter the factory name');
    const capacityKg = num(values.capacityKg);
    need(capacityKg > 0, 'Enter the daily capacity');
    const fields = { name, city: str(values.city, 80), address: str(values.address), manager: str(values.manager, 80), phone: str(values.phone, 15), capacityKg };
    if (values.active != null) fields.active = bool(values.active);
    const id = str(values.id, 60);
    const factoryId = id || newId('F');
    if (id) await Factory.updateOne({ _id: id }, fields);
    else await Factory.create([{ _id: factoryId, lat: 19.076, lng: 72.8777, ...fields }], {});
    return { factories: [doc(await Factory.findById(factoryId).lean())] };
  }],

  addProduction: [FACTORY, async (req, input) => {
    const factoryId = str(input?.factoryId, 60);
    const productId = str(input?.productId, 60);
    const qty = num(input?.qty);
    need(factoryId && productId, 'Select the factory and product');
    need(Number.isInteger(qty) && qty > 0, 'Enter the quantity produced');
    const product = await Product.findById(productId).lean();
    if (!product) throw notFound('Product');
    need(await Factory.exists({ _id: factoryId }), 'Select the factory and product');
    await lockFactory(factoryId);
    const before = (await availableStock())[productId] ?? 0;
    await addMove({ factoryId, productId, qty, type: 'production', ref: `PR-${dayjs().format('YYMMDD')}`, note: str(input.note, 200) });
    await logActivity(`Stock updated: ${product.name} +${qty} ${product.unit}`, 'green');
    // Dealers who asked to hear when this is back in stock.
    if (before < product.minOrder && before + qty >= product.minOrder) {
      for (const dealer of await Dealer.find({ stockAlerts: productId, deletedAt: null }).lean()) {
        await notify('dealer', dealer, 'order', 'Back in stock', `${product.name} (${product.pack}) is available again.`, { route: `/products/${productId}` });
      }
    }
    return {};
  }],

  transferStock: [FACTORY, async (req, input) => {
    const fromId = str(input?.fromId, 60);
    const toId = str(input?.toId, 60);
    const productId = str(input?.productId, 60);
    const qty = num(input?.qty);
    need(fromId && toId && productId, 'Select both factories and the product');
    need(fromId !== toId, 'Choose two different factories');
    need(Number.isInteger(qty) && qty > 0, 'Enter the quantity to transfer');
    await lockFactory(fromId);
    const inStock = await stockOf(fromId, productId);
    need(qty <= inStock, `Only ${inStock} in stock at the sending factory`);
    const from = await Factory.findById(fromId).lean();
    const to = await Factory.findById(toId).lean();
    need(from && to, 'Select both factories and the product');
    const ref = `TR-${Date.now().toString().slice(-6)}`;
    await addMove({ factoryId: fromId, productId, qty: -qty, type: 'transferOut', ref, note: `To ${to.name}` });
    await addMove({ factoryId: toId, productId, qty, type: 'transferIn', ref, note: `From ${from.name}` });
    await logActivity(`Stock transfer ${ref} recorded`);
    return {};
  }],

  adjustStock: [FACTORY, async (req, input) => {
    const factoryId = str(input?.factoryId, 60);
    const productId = str(input?.productId, 60);
    const qty = num(input?.qty);
    const note = str(input?.note, 200);
    need(factoryId && productId, 'Select the factory and product');
    need(Number.isInteger(qty) && qty !== 0, 'Enter a quantity above or below zero');
    need(note, 'Say why the stock is being adjusted');
    await lockFactory(factoryId);
    need((await stockOf(factoryId, productId)) + qty >= 0, 'Stock cannot go below zero');
    await addMove({ factoryId, productId, qty, type: 'adjust', ref: 'Adjustment', note });
    return {};
  }],
};
