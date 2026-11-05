import dayjs from 'dayjs';
import { randomInt } from 'node:crypto';
import { config } from '../../config/index.js';
import { Customer, Dealer, Factory, Order } from '../../models/index.js';
import { notify } from '../notification.service.js';
import { setting, slotNames } from '../settings.service.js';
import { ApiError, need, notFound, str } from '../../utils/http.js';

export const newOtp = () => String(randomInt(1000, 10000));

export const MAX_OTP_ATTEMPTS = 5;

/** The buyer's account, for sending them updates. */
export const buyerOf = (order) => (order.buyerType === 'customer' ? Customer.findById(order.customerId).lean() : Dealer.findById(order.dealerId).lean());

export const buyerNameOf = (order, buyer) => (order.buyerType === 'customer' ? buyer?.name : buyer?.businessName) || 'Customer';

export async function tellBuyer(order, type, title, body) {
  const buyer = await buyerOf(order);
  if (!buyer) return;
  const extra = order.buyerType === 'customer' ? { orderId: order._id } : { route: `/orders/${order._id}` };
  await notify(order.buyerType, buyer, type, title, body, extra);
}

export const requireDemoPayments = () => {
  if (!config.demoPayments) throw new ApiError(503, 'Online payment is not available yet. Please choose another payment method.');
};

export async function nearestFactory(address) {
  const factories = await Factory.find({ active: true }).lean();
  need(factories.length, 'No factory is taking orders right now');
  const distance = (f) => (f.lat - address.lat) ** 2 + (f.lng - address.lng) ** 2;
  return factories.reduce((best, f) => (distance(f) < distance(best) ? f : best));
}

/** Checks the date and slot. A same-day slot closes before it starts. */
export async function checkDelivery(date, slot, { express = false, skipLeadCheck = false } = {}) {
  const day = dayjs(date);
  need(day.isValid(), 'Select a delivery date');
  need(!day.isBefore(dayjs().startOf('day')), 'The delivery date has passed');
  if (express) return;
  const slots = await setting('slots');
  need(slotNames(slots).includes(slot), 'Select a delivery slot');
  if (skipLeadCheck || !day.isSame(dayjs(), 'day')) return;
  const start = slots.find(([label]) => label === slot)[1];
  const lead = await setting('slotLeadHours');
  need(start - dayjs().hour() >= lead, 'That slot is closed for today. Please choose a later one.');
}

export const lineOf = (product, qty, rate) => ({ productId: product._id, name: product.name, pack: product.pack, unit: product.unit, image: product.image, hsn: product.hsn, qty, rate, gst: product.gst, returnable: product.returnable });

export const ownOrder = async (filter, id) => {
  const order = await Order.findOne({ ...filter, _id: str(id, 60) }).lean();
  if (!order) throw notFound('Order');
  return order;
};
