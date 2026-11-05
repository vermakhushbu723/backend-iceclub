import dayjs from 'dayjs';
import { Customer, Offer, Order, Product } from '../../models/index.js';
import { nextOrderNumber } from '../counter.service.js';
import { logActivity, notify, notifyAdmin } from '../notification.service.js';
import { linesFromItems } from './dealer-order.service.js';
import { checkDelivery, nearestFactory, newOtp, requireDemoPayments } from './order.helpers.js';
import { setting } from '../settings.service.js';
import { availableStock } from '../stock.service.js';
import { addWallet, walletBalance } from '../wallet.service.js';
import { ApiError, need, newId, round2, str } from '../../utils/http.js';

/** Customer prices already include GST. The wallet can pay all or part of the bill. */
export function customerBill({ mrpTotal, itemTotal, coupon, express, tip, walletBalance: balance, useWallet }, charges) {
  let discount = 0;
  let freeByCoupon = false;
  if (coupon && itemTotal >= coupon.minOrder) {
    discount = coupon.percent > 0 ? (itemTotal * coupon.percent) / 100 : coupon.flatOff;
    if (coupon.maxDiscount > 0) discount = Math.min(discount, coupon.maxDiscount);
    discount = round2(Math.min(discount, itemTotal));
    freeByCoupon = coupon.freeDelivery;
  }
  const deliveryFee = freeByCoupon || itemTotal - discount >= charges.freeDeliveryAbove || itemTotal === 0 ? 0 : charges.deliveryFee;
  const expressFee = express ? charges.expressFee : 0;
  const grand = round2(itemTotal - discount + deliveryFee + expressFee + tip);
  const walletUsed = useWallet ? round2(Math.min(balance, grand)) : 0;
  return { mrpTotal, itemTotal, discount, deliveryFee, expressFee, tip, grand, walletUsed, toPay: round2(grand - walletUsed), savings: round2(mrpTotal - itemTotal + discount) };
}

export async function customerCoupon(code) {
  const coupon = await Offer.findOne({ audience: 'customer', code: code.trim().toUpperCase(), active: true, validTill: { $gte: new Date() } }).lean();
  need(coupon, 'That coupon code is not valid');
  return coupon;
}

const CUSTOMER_METHODS = { upi: 'online', card: 'online', netbanking: 'online', wallet: 'online', cod: 'cod' };
const pinServed = (pincode, prefixes) => prefixes.some((prefix) => pincode.startsWith(prefix));

export async function placeCustomerOrder(customer, input, { subscriptionId = null } = {}) {
  need(customer.active, 'This account is not active');
  const address = customer.addresses.find((a) => a.id === str(input.addressId, 60));
  need(address, 'Select a delivery address');
  const prefixes = await setting('servicePinPrefixes');
  need(pinServed(address.pincode, prefixes), `We do not deliver to ${address.pincode} yet`);

  const express = input.express === true;
  const date = input.deliveryDate;
  if (express) need(dayjs(date).isSame(dayjs(), 'day'), 'Express delivery is for today only');
  await checkDelivery(date, str(input.slot, 40), { express, skipLeadCheck: Boolean(subscriptionId) });

  const lines = await linesFromItems(input.items, (product) => product.retailPrice, 'forCustomers');
  const stock = await availableStock();
  for (const line of lines) need((stock[line.productId] ?? 0) >= line.qty, 'Something in your cart is out of stock');
  const products = await Product.find({ _id: { $in: lines.map((l) => l.productId) } }).lean();
  if (products.some((p) => p.categoryId === 'dry')) need(input.dryIceAccepted === true || subscriptionId, 'Please accept the dry ice safety note');

  const charges = await setting('customerCharges');
  const itemTotal = round2(lines.reduce((sum, l) => sum + l.qty * l.rate, 0));
  need(itemTotal >= charges.minOrder, `The minimum order is ₹${charges.minOrder}`);
  const mrpTotal = round2(lines.reduce((sum, l) => sum + l.qty * (products.find((p) => p._id === l.productId).mrp || l.rate), 0));

  let coupon = null;
  if (str(input.couponCode, 30)) {
    coupon = await customerCoupon(str(input.couponCode, 30));
    need(itemTotal >= coupon.minOrder, `Coupon ${coupon.code} needs an order of ₹${coupon.minOrder} or more`);
  }
  const tip = Math.max(0, Math.min(Number(input.tip) || 0, 500));
  const useWallet = input.useWallet === true;
  await Customer.updateOne({ _id: customer._id }, { $inc: { rev: 1 } });
  const balance = useWallet ? await walletBalance(customer._id) : 0;
  const bill = customerBill({ mrpTotal, itemTotal, coupon, express, tip, walletBalance: balance, useWallet }, charges);

  if (input.expectedTotal != null && Math.abs(Number(input.expectedTotal) - bill.toPay) > 0.01) {
    throw new ApiError(409, `Your total is now ₹${bill.toPay}. Please check your order and try again.`, { code: 'PRICE_CHANGED', total: bill.toPay });
  }

  const detail = bill.toPay === 0 ? 'wallet' : str(input.paymentMethod, 20);
  need(CUSTOMER_METHODS[detail], 'Select a payment method');
  const method = CUSTOMER_METHODS[detail];
  if (method === 'online' && bill.toPay > 0) requireDemoPayments();

  // Prices include GST, so the tax is taken out of the amount, for the invoice.
  const net = itemTotal - bill.discount;
  const ratio = itemTotal === 0 ? 0 : net / itemTotal;
  const gst = round2(lines.reduce((sum, l) => sum + (l.qty * l.rate * ratio * l.gst) / (100 + l.gst), 0));

  const number = await nextOrderNumber();
  const at = new Date();
  const factory = await nearestFactory(address);
  const [order] = await Order.create([{
    _id: newId('O'),
    number,
    invoiceNumber: number.replace('ICE', 'INV'),
    buyerType: 'customer',
    customerId: customer._id,
    addressId: address.id,
    address,
    lines,
    itemTotal,
    mrpTotal,
    discount: bill.discount,
    subtotal: round2(net - gst),
    gst,
    deliveryFee: bill.deliveryFee,
    expressFee: bill.expressFee,
    tip: bill.tip,
    walletUsed: bill.walletUsed,
    total: bill.grand,
    couponCode: coupon?.code ?? null,
    paymentMethod: method,
    paymentDetail: detail,
    paymentStatus: method === 'cod' ? 'pending' : 'paid',
    deliveryDate: new Date(date),
    slot: express ? 'Express, within 60 minutes' : str(input.slot, 40),
    factoryId: factory._id,
    otp: newOtp(),
    status: 'placed',
    placedAt: at,
    events: [{ status: 'placed', at }],
    notes: str(input.instructions, 500),
    subscriptionId,
  }], {});

  if (bill.walletUsed > 0) await addWallet(customer._id, -bill.walletUsed, `Paid for order ${number}`);
  await notify('customer', customer, 'order', 'Order placed', `We have your order ${number}.`, { orderId: order._id });
  await logActivity(`New customer order ${number} from ${customer.name}`, 'orange');
  await notifyAdmin('order', 'New customer order', `${customer.name} placed ${number}.`, `/orders?open=${order._id}`);
  return order.toObject();
}
