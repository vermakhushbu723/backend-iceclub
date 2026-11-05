import { Factory, Offer, Order, Product } from '../../models/index.js';
import { nextOrderNumber } from '../counter.service.js';
import { addLedger, creditSummary, lockDealer } from '../ledger.service.js';
import { logActivity, notify, notifyAdmin } from '../notification.service.js';
import { checkDelivery, lineOf, nearestFactory, newOtp, requireDemoPayments } from './order.helpers.js';
import { dealerRate } from '../pricing.service.js';
import { setting } from '../settings.service.js';
import { availableStock } from '../stock.service.js';
import { ApiError, need, newId, round2, str } from '../../utils/http.js';

/** GST is charged after the discount, spread across the lines by their value. */
export function dealerBill(lines, charges, discountAsked = 0) {
  const subtotal = lines.reduce((sum, l) => sum + l.qty * l.rate, 0);
  const discount = Math.min(discountAsked, subtotal);
  const ratio = subtotal === 0 ? 0 : (subtotal - discount) / subtotal;
  const gst = lines.reduce((sum, l) => sum + (l.qty * l.rate * ratio * l.gst) / 100, 0);
  const deliveryFee = lines.length === 0 || subtotal >= charges.freeDeliveryAbove ? 0 : charges.deliveryFee;
  return { subtotal: round2(subtotal), discount: round2(discount), gst: round2(gst), deliveryFee, total: round2(subtotal - discount + gst + deliveryFee) };
}

const offerDiscount = (offer, subtotal) => {
  if (subtotal < offer.minOrder) return 0;
  const value = offer.percent > 0 ? (subtotal * offer.percent) / 100 : offer.flatOff;
  return offer.maxDiscount > 0 ? Math.min(value, offer.maxDiscount) : value;
};

export async function dealerOffer(dealer, code) {
  const offer = await Offer.findOne({ audience: 'dealer', code, active: true, validTill: { $gte: new Date() } }).lean();
  need(offer && (!offer.tier || offer.tier === dealer.tier), 'That coupon code is not valid');
  return offer;
}

export async function linesFromItems(items, rateOf, audience) {
  need(Array.isArray(items), 'Add at least one product');
  const chosen = items.filter((i) => i && str(i.productId, 60) && Number(i.qty) > 0);
  need(chosen.length, 'Add at least one product');
  need(new Set(chosen.map((i) => String(i.productId))).size === chosen.length, 'Each product can be added only once');
  const lines = [];
  for (const item of chosen) {
    const qty = Number(item.qty);
    need(Number.isInteger(qty) && qty <= 100000, 'Enter a valid quantity');
    const product = await Product.findById(str(item.productId, 60)).lean();
    need(product?.active && (audience === 'any' || product[audience]), 'A product in this order is no longer available');
    lines.push(lineOf(product, qty, await rateOf(product, qty)));
  }
  return lines;
}

/** by is 'app' when the dealer orders for themselves, or 'admin' when staff order for them. */
export async function placeDealerOrder(dealer, input, by = 'app') {
  need(dealer.kycStatus === 'approved' && dealer.active, `${dealer.businessName || 'This dealer'} is not approved for orders yet`);
  const address = dealer.addresses.find((a) => a.id === str(input.addressId, 60));
  need(address, 'Select a delivery location');
  const method = str(input.paymentMethod, 20);
  need(['credit', 'online', 'cod'].includes(method), 'Select a payment method');
  await checkDelivery(input.deliveryDate, str(input.slot, 40), { skipLeadCheck: by === 'admin' || Boolean(input.standingOrderId) });

  const lines = await linesFromItems(input.items, (product, qty) => dealerRate(dealer, product, qty, address.id), 'forDealers');

  if (by === 'app') {
    const stock = await availableStock();
    for (const line of lines) {
      const product = await Product.findById(line.productId).lean();
      need(line.qty >= product.minOrder, `The minimum for ${line.name} (${line.pack}) is ${product.minOrder}`);
      need(line.qty % product.step === 0, `${line.name} (${line.pack}) is sold in multiples of ${product.step}`);
      need((stock[line.productId] ?? 0) >= line.qty, `Only ${stock[line.productId] ?? 0} of ${line.name} (${line.pack}) available`);
    }
  }

  const charges = await setting('charges');
  let discount = 0;
  let couponCode = null;
  if (str(input.couponCode, 30)) {
    const offer = await dealerOffer(dealer, str(input.couponCode, 30).toUpperCase());
    const subtotal = lines.reduce((sum, l) => sum + l.qty * l.rate, 0);
    need(subtotal >= offer.minOrder, `Coupon ${offer.code} needs an order of ₹${offer.minOrder} or more`);
    discount = offerDiscount(offer, subtotal);
    couponCode = offer.code;
  }
  const bill = dealerBill(lines, charges, discount);
  need(bill.subtotal >= charges.minOrder, `The minimum order value is ₹${charges.minOrder}`);

  // The app shows a bill from its own copy of the prices. Never charge a different amount without asking.
  if (input.expectedTotal != null && Math.abs(Number(input.expectedTotal) - bill.total) > 0.01) {
    throw new ApiError(409, `The price at this delivery address makes your total ₹${bill.total}. Place the order again to confirm.`, { code: 'PRICE_CHANGED', total: bill.total });
  }

  if (method === 'online' && by === 'app') requireDemoPayments();
  if (method === 'credit') {
    await lockDealer(dealer._id);
    const credit = await creditSummary(dealer);
    need(bill.total <= credit.available, `This order is above the available credit of ₹${credit.available}`);
  }

  const number = await nextOrderNumber();
  const at = new Date();
  const factory = str(input.factoryId, 60) ? await Factory.findById(str(input.factoryId, 60)).lean() : await nearestFactory(address);
  need(factory?.active, 'Select an active factory');

  const [order] = await Order.create([{
    _id: newId('O'),
    number,
    invoiceNumber: number.replace('ICE', 'INV'),
    buyerType: 'dealer',
    dealerId: dealer._id,
    addressId: address.id,
    address,
    lines,
    itemTotal: bill.subtotal,
    ...bill,
    couponCode,
    paymentMethod: method,
    paymentStatus: { credit: 'onCredit', online: 'paid', cod: 'pending' }[method],
    deliveryDate: new Date(input.deliveryDate),
    slot: str(input.slot, 40),
    factoryId: factory._id,
    otp: newOtp(),
    status: 'placed',
    placedAt: at,
    events: [{ status: 'placed', at }],
    notes: str(input.notes, 500),
    standingOrderId: str(input.standingOrderId, 60) || null,
  }], {});

  if (method === 'credit') await addLedger(dealer._id, 'invoice', bill.total, order.invoiceNumber, 'Order on credit');
  await notify('dealer', dealer, 'order', 'Order placed', `${number} for ₹${bill.total} has been placed.`, { route: `/orders/${order._id}` });
  await logActivity(`New order ${number} for ${dealer.businessName}`, 'orange');
  if (by === 'app') await notifyAdmin('order', 'New order', `${dealer.businessName} placed ${number}.`, `/orders?open=${order._id}`);
  return order.toObject();
}
