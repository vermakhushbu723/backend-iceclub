import { Collection, Customer, IceBoxMovement, Order, Rider } from '../../models/index.js';
import { addLedger } from '../ledger.service.js';
import { logActivity, notify, notifyAdmin } from '../notification.service.js';
import { buyerNameOf, buyerOf, MAX_OTP_ATTEMPTS, tellBuyer } from './order.helpers.js';
import { setting } from '../settings.service.js';
import { addMove, lockFactory, stockOf } from '../stock.service.js';
import { addWallet } from '../wallet.service.js';
import { onTimeFor } from '../../utils/dates.js';
import { ApiError, need, newId, notFound, photoPath, round2, str } from '../../utils/http.js';

const NEXT_STATUS = { placed: 'accepted', accepted: 'processing', processing: 'readyForDispatch', readyForDispatch: 'outForDelivery' };
const STATUS_MESSAGES = {
  accepted: ['Your order has been accepted.', 'order'],
  processing: ['Your order is being prepared.', 'order'],
  readyForDispatch: ['Your order is packed and ready for dispatch.', 'order'],
};
const LABELS = { accepted: 'Accepted', processing: 'Processing', readyForDispatch: 'Ready for dispatch', outForDelivery: 'Out for delivery', delivered: 'Delivered' };
const CANCELLABLE = ['placed', 'accepted', 'processing', 'readyForDispatch', 'failed'];

export const findOrder = async (id) => {
  const order = await Order.findById(str(id, 60));
  if (!order) throw notFound('Order');
  return order;
};

export async function assignRider(order, riderId) {
  need(!['delivered', 'cancelled', 'failed'].includes(order.status), 'This order is already closed');
  need(order.status !== 'outForDelivery', 'This order has already left with its rider');
  need(!order.pickup, 'The rider has already picked up this order');
  const rider = await Rider.findById(str(riderId, 60)).lean();
  need(rider?.active && !rider.deletedAt, 'Select an active rider');
  const previous = order.riderId;
  order.riderId = rider._id;
  order.riderEvents = [{ status: 'assigned', at: new Date() }];
  await order.save();
  await logActivity(`${order.number} assigned to ${rider.name}`);
  await notify('rider', rider, 'order', 'New order assigned', `${order.number} has been assigned to you.`, { route: '/orders' });
  if (previous && previous !== rider._id) {
    const old = await Rider.findById(previous).lean();
    if (old) await notify('rider', old, 'order', 'Order reassigned', `${order.number} is no longer assigned to you.`, { route: '/orders' });
  }
  return order;
}

/** Leaving for delivery takes the stock out of the factory. Only what was loaded leaves. */
async function dispatch(order) {
  need(order.riderId, 'Assign a rider before dispatch');
  await lockFactory(order.factoryId);
  const rider = await Rider.findById(order.riderId).lean();
  const loaded = order.pickup?.loaded ?? {};
  const dispatched = {};
  for (const line of order.lines) {
    const qty = order.pickup ? (loaded[line.productId] ?? line.qty) : line.qty;
    if (qty > 0) {
      const inStock = await stockOf(order.factoryId, line.productId);
      need(inStock >= qty, `Only ${inStock} ${line.unit} of ${line.name} (${line.pack}) in stock at this factory`);
      await addMove({ factoryId: order.factoryId, productId: line.productId, qty: -qty, type: 'dispatch', ref: order.number, note: rider?.name ?? '' });
    }
    dispatched[line.productId] = qty;
  }
  const at = new Date();
  order.dispatched = dispatched;
  order.markModified('dispatched');
  order.status = 'outForDelivery';
  order.events.push({ status: 'outForDelivery', at });
  order.riderEvents.push({ status: 'outForDelivery', at });
  await order.save();
  await logActivity(`${order.number} dispatched with ${rider?.name}`);
  await notifyAdmin('delivery', 'Order dispatched', `${order.number} left with ${rider?.name}.`, '/tracking');
  await tellBuyer(order, 'delivery', `${order.number}: Out for delivery`, needsOtp(order) ? `Your order is on the way. Share OTP ${order.otp} with the rider.` : 'Your order is on the way.');
}

export async function advanceOrder(order) {
  const next = NEXT_STATUS[order.status];
  need(next, 'This order has no further step here');
  if (next === 'outForDelivery') {
    await dispatch(order);
    return order;
  }
  order.status = next;
  order.events.push({ status: next, at: new Date() });
  await order.save();
  await logActivity(`${order.number}: ${LABELS[next]}`);
  await tellBuyer(order, ...[STATUS_MESSAGES[next][1], `${order.number}: ${LABELS[next]}`, STATUS_MESSAGES[next][0]]);
  return order;
}

/** Gives back what was paid: wallet money and online payments to a customer's wallet, credit to a dealer's account. */
async function refund(order, partAmount, reason) {
  if (order.buyerType === 'customer') {
    const paid = order.walletUsed + (order.paymentMethod === 'cod' ? 0 : order.total - order.walletUsed);
    const money = partAmount ?? paid;
    if (money > 0) await addWallet(order.customerId, money, `${reason} for order ${order.number}`);
    return money;
  }
  if (order.paymentMethod === 'credit') {
    const money = partAmount ?? order.total;
    if (money > 0) await addLedger(order.dealerId, 'creditNote', money, order.invoiceNumber, reason);
    return money;
  }
  return 0;
}

export async function cancelOrder(order, reason, { allowed = CANCELLABLE, by = 'admin' } = {}) {
  need(allowed.includes(order.status), 'This order can no longer be cancelled');
  need(!order.pickup || order.status === 'failed', 'The rider has already picked up this order, so it can no longer be cancelled');
  const why = str(reason, 300);
  need(why, 'Say why the order is cancelled');
  order.status = 'cancelled';
  order.cancelReason = why;
  order.events.push({ status: 'cancelled', at: new Date() });
  if (order.paymentMethod === 'online') order.paymentStatus = 'refunded';
  await order.save();
  const money = await refund(order, null, 'Order cancelled');
  await logActivity(`Order ${order.number} cancelled`, 'red');
  await tellBuyer(order, 'order', 'Order cancelled', order.buyerType === 'customer' && money > 0 ? `Your refund for ${order.number} is in your wallet.` : `${order.number} has been cancelled.`);
  if (order.riderId) {
    const rider = await Rider.findById(order.riderId).lean();
    if (rider) await notify('rider', rider, 'order', 'Order cancelled', `${order.number} was cancelled. Do not deliver it.`, { route: '/orders' });
  }
  if (by !== 'admin') await notifyAdmin('order', 'Order cancelled', `${order.number} was cancelled by the buyer.`, `/orders?open=${order._id}`);
  return order;
}

/** Customers share an OTP with the rider. Dealers don't: a photo proves their delivery. */
export const needsOtp = (order) => order.buyerType === 'customer';

/**
 * The buyer's OTP proves the delivery. Wrong guesses are limited, so it can't be tried until it works.
 * Call this before the transaction: a failed transaction would undo the count of wrong guesses.
 */
export async function checkDeliveryOtp(orderId, otp) {
  const order = await findOrder(orderId);
  need(order.status === 'outForDelivery', 'Only an order out for delivery can be confirmed');
  if (!needsOtp(order)) return;
  need(order.otpAttempts < MAX_OTP_ATTEMPTS, 'Too many wrong OTPs for this order. Please contact your admin.', 429);
  if (str(otp, 10) !== order.otp) {
    await Order.updateOne({ _id: order._id }, { $inc: { otpAttempts: 1 } });
    throw new ApiError(400, 'Incorrect OTP. Ask the customer to check the code in their app.');
  }
}

/**
 * Finishes a delivery. Anything not accepted goes back into stock and off the bill,
 * and only the amount for what was accepted can be collected.
 */
export async function completeDelivery(order, input) {
  const buyer = await buyerOf(order);
  const dispatched = order.dispatched ?? Object.fromEntries(order.lines.map((l) => [l.productId, l.qty]));
  const delivered = {};
  for (const line of order.lines) {
    const asked = input.delivered?.[line.productId];
    const qty = asked == null ? (dispatched[line.productId] ?? line.qty) : Number(asked);
    need(Number.isInteger(qty) && qty >= 0, 'Enter a valid delivered quantity');
    need(qty <= (dispatched[line.productId] ?? line.qty), `You can't deliver more ${line.name} than was loaded`);
    delivered[line.productId] = qty;
  }
  const photos = photosFrom(input.photos);
  // A dealer gives no OTP, so the rider's photo is the proof of delivery.
  if (input.byRider && !needsOtp(order)) need(photos.length > 0, 'Take a photo of the delivered goods');
  const at = new Date();
  const ratios = amountPerUnit(order);
  const due = round2(order.lines.reduce((sum, l) => sum + ratios[l.productId] * delivered[l.productId], 0));
  const fullDue = round2(order.lines.reduce((sum, l) => sum + ratios[l.productId] * l.qty, 0));

  let collected = 0;
  let mode = null;
  let reference = '';
  if (order.paymentMethod === 'cod') {
    collected = input.collected == null ? due : round2(Number(input.collected));
    need(collected >= 0 && collected <= due + 1, `The amount to collect is ₹${due}`);
    if (collected > 0) {
      mode = str(input.mode ?? input.collectionMode, 10) || 'cash';
      need(['cash', 'upi'].includes(mode), 'Select cash or UPI');
      reference = str(input.ref ?? input.collectionReference, 80);
      need(mode === 'cash' || reference, 'Enter the UPI transaction ID');
      await Collection.create([{ _id: newId('C'), riderId: order.riderId, orderId: order._id, orderNumber: order.number, buyerName: buyerNameOf(order, buyer), dealerId: order.dealerId, amount: collected, mode, at, ref: reference }], {});
    }
  }

  const slots = await setting('slots');
  order.delivery = {
    at,
    otpConfirmed: needsOtp(order),
    receivedBy: str(input.receivedBy, 80),
    onTime: onTimeFor(order, at, slots),
    delivered,
    photos,
    remark: str(input.remark, 300),
    location: input.location ?? null,
    collected,
    collectionMode: mode,
    collectionReference: reference,
  };
  order.markModified('delivery');
  order.status = 'delivered';
  order.events.push({ status: 'delivered', at });
  order.riderEvents.push({ status: 'delivered', at });
  if (order.paymentMethod === 'cod') order.paymentStatus = 'paid';
  await order.save();

  // Stock that came back on the vehicle.
  for (const line of order.lines) {
    const back = (dispatched[line.productId] ?? line.qty) - delivered[line.productId];
    if (back > 0) await addMove({ factoryId: order.factoryId, productId: line.productId, qty: back, type: 'return', ref: order.number, note: 'Not accepted at delivery' });
  }
  // A short delivery comes off the bill for anything already charged.
  const shortAmount = round2(fullDue - due);
  if (shortAmount > 0 && order.paymentMethod !== 'cod') await refund(order, shortAmount, 'Short delivery');

  const boxes = order.lines.filter((l) => l.returnable).reduce((sum, l) => sum + delivered[l.productId], 0);
  if (boxes > 0 && order.dealerId) await IceBoxMovement.create([{ _id: newId('IB'), dealerId: order.dealerId, type: 'issued', quantity: boxes, date: at, reference: order.number }], {});

  await logActivity(`Order ${order.number} delivered`, 'green');
  await tellBuyer(order, 'delivery', `${order.number}: Delivered`, 'Your order has been delivered. Thank you!');
  if (order.buyerType === 'customer') await payReferralBonus(buyer);
  return order;
}

/** What one unit of each line costs the buyer in the end, including GST, delivery and any discount. */
export function amountPerUnit(order) {
  const value = order.lines.reduce((sum, l) => sum + l.qty * l.rate, 0);
  const payable = order.total - (order.walletUsed ?? 0);
  return Object.fromEntries(order.lines.map((l) => [l.productId, value === 0 ? 0 : Math.round(((l.rate * payable) / value) * 10000) / 10000]));
}

export function photosFrom(photos, at = new Date()) {
  if (!Array.isArray(photos)) return [];
  return photos.slice(0, 10).map((p) => ({ url: photoPath(p?.path ?? p?.url ?? p), takenAt: p?.takenAt ? new Date(p.takenAt) : at, serverAt: new Date() })).filter((p) => p.url);
}

async function payReferralBonus(customer) {
  if (!customer?.referredBy || customer.referralPaid) return;
  const charges = await setting('customerCharges');
  const referrer = await Customer.findOne({ referralCode: customer.referredBy, deletedAt: null }).lean();
  if (!referrer || referrer._id === customer._id) return;
  await Customer.updateOne({ _id: customer._id }, { referralPaid: true });
  await addWallet(referrer._id, charges.referralReward, `Referral bonus: ${customer.name}`);
  await addWallet(customer._id, charges.referralReward, 'Referral bonus');
  await notify('customer', referrer, 'order', 'Referral bonus', `₹${charges.referralReward} was added to your wallet.`);
}

/** A failed delivery puts what was loaded back into stock. The admin then retries or cancels it. */
export async function failDelivery(order, input) {
  const reason = str(input.reason, 200);
  need(reason, 'Select a reason');
  const at = new Date();
  if (order.status === 'outForDelivery') {
    for (const line of order.lines) {
      const back = order.dispatched?.[line.productId] ?? line.qty;
      if (back > 0) await addMove({ factoryId: order.factoryId, productId: line.productId, qty: back, type: 'return', ref: order.number, note: `Delivery failed: ${reason}` });
    }
  }
  order.failure = { reason, at, note: str(input.note, 300), photos: photosFrom(input.photos, at), location: input.location ?? null };
  order.markModified('failure');
  order.status = 'failed';
  order.events.push({ status: 'failed', at });
  order.riderEvents.push({ status: 'failed', at });
  await order.save();
  await logActivity(`Delivery of ${order.number} failed: ${reason}`, 'red');
  await notifyAdmin('delivery', 'Delivery failed', `${order.number}: ${reason}.`, `/orders?open=${order._id}`);
  await tellBuyer(order, 'delivery', `${order.number}: Delivery failed`, `We could not deliver your order: ${reason}. We will contact you.`);
  return order;
}

/** Sends a failed order out again. The failed try stays in the rider's history. */
export async function retryDelivery(order) {
  need(order.status === 'failed', 'Only a failed delivery can be tried again');
  const { riderEvents } = order.toObject();
  order.pastAttempts.push({ riderId: order.riderId, riderEvents, pickup: order.pickup, failure: order.failure });
  order.markModified('pastAttempts');
  order.riderId = null;
  order.riderEvents = [];
  order.pickup = null;
  order.dispatched = null;
  order.failure = null;
  order.otpAttempts = 0;
  order.status = 'readyForDispatch';
  order.events.push({ status: 'readyForDispatch', at: new Date() });
  await order.save();
  await logActivity(`${order.number} sent out again`);
  return order;
}
