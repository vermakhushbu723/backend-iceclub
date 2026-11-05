import { Offer, Product } from '../../../models/index.js';
import { CATEGORY_IDS } from '../admin.helpers.js';
import { ACCOUNTS, FACTORY } from '../admin.roles.js';
import { adminProduct } from '../admin.views.js';
import { logActivity } from '../../../services/notification.service.js';
import { bool, doc, need, newId, num, str } from '../../../utils/http.js';

export const productActions = {
  saveProduct: [FACTORY, async (req, values) => {
    const name = str(values?.name, 120);
    need(name, 'Enter the product name');
    const slabs = (Array.isArray(values.slabs) ? values.slabs : []).map((s) => ({ minQty: num(s?.minQty), price: num(s?.price) })).filter((s) => s.minQty > 0 && s.price > 0).sort((a, b) => a.minQty - b.minQty);
    need(slabs.length, 'Add at least one price');
    need(new Set(slabs.map((s) => s.minQty)).size === slabs.length, 'Each price slab needs a different quantity');
    const category = str(values.category, 60);
    const fields = { name, category, categoryId: CATEGORY_IDS[category] ?? 'cube', pack: str(values.pack, 60), packKg: num(values.packKg) || 0, unit: str(values.unit, 20), hsn: str(values.hsn, 12), gst: num(values.gst) || 0, cost: num(values.cost) || 0, lowStock: num(values.lowStock) || 0, slabs };
    if (values.active != null) fields.active = bool(values.active);
    if (values.forCustomers != null) fields.forCustomers = bool(values.forCustomers);
    if (values.retailPrice != null) fields.retailPrice = Math.max(0, num(values.retailPrice) || 0);
    if (values.mrp != null) fields.mrp = Math.max(0, num(values.mrp) || 0);
    if (fields.forCustomers) need((fields.retailPrice ?? 0) > 0, 'Enter the customer price');
    const id = str(values.id, 60);
    const productId = id || newId('P');
    if (id) await Product.updateOne({ _id: id }, fields);
    else {
      const image = { dry: 'DryIce.png', cube: 'CubeIce.png', tube: 'CubeIce.png' }[fields.categoryId] ?? 'CrushedBlockIce.png';
      await Product.create([{ _id: productId, image, ...fields }], {});
      await logActivity(`Product ${name} added`);
    }
    return { products: [adminProduct(await Product.findById(productId).lean())] };
  }],

  saveOffer: [ACCOUNTS, async (req, values) => {
    const title = str(values?.title, 120);
    need(title, 'Enter the title');
    const audience = values.audience === 'customer' ? 'customer' : 'dealer';
    const code = str(values.code, 30).toUpperCase();
    const kind = str(values.kind, 20) || 'current';
    if (kind !== 'scheme') need(code, 'Enter the coupon code');
    const id = str(values.id, 60);
    if (code) need(!(await Offer.exists({ code, audience, _id: { $ne: id } })), 'This code is already in use');
    const validTill = new Date(values.validTill);
    need(!Number.isNaN(validTill.getTime()), 'Select the last date');
    const percent = Math.max(0, num(values.percent) || 0);
    need(percent <= 100, 'A discount cannot be above 100%');
    const fields = { audience, kind, code, title, description: str(values.description, 300), percent, flatOff: Math.max(0, num(values.flatOff) || 0), maxDiscount: Math.max(0, num(values.maxDiscount) || 0), minOrder: Math.max(0, num(values.minOrder) || 0), freeDelivery: bool(values.freeDelivery), tier: str(values.tier, 20), validTill, active: values.active !== false };
    const offerId = id || newId('OF');
    if (id) await Offer.updateOne({ _id: id }, fields);
    else await Offer.create([{ _id: offerId, ...fields }], {});
    return { offers: [doc(await Offer.findById(offerId).lean())] };
  }],
};
