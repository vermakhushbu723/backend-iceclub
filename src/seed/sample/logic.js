import dayjs from 'dayjs';
import { round2 } from './format.js';

/* Business rules, kept free of React so they can be tested and moved to the server later. */

export const ORDER_STATUSES = [
  { key: 'placed', label: 'New', title: 'New orders', color: 'blue' },
  { key: 'accepted', label: 'Accepted', title: 'Accepted orders', color: 'cyan' },
  { key: 'processing', label: 'Processing', title: 'Processing orders', color: 'geekblue' },
  { key: 'readyForDispatch', label: 'Ready for dispatch', title: 'Ready for dispatch', color: 'purple' },
  { key: 'outForDelivery', label: 'Out for delivery', title: 'Out for delivery', color: 'orange' },
  { key: 'delivered', label: 'Delivered', title: 'Delivered orders', color: 'green' },
  { key: 'cancelled', label: 'Cancelled', title: 'Cancelled orders', color: 'red' },
];

export const statusOf = (key) => ORDER_STATUSES.find((s) => s.key === key) ?? ORDER_STATUSES[0];

const NEXT_STATUS = { placed: 'accepted', accepted: 'processing', processing: 'readyForDispatch', readyForDispatch: 'outForDelivery' };
export const nextStatus = (status) => NEXT_STATUS[status] ?? null;

export const isActive = (o) => o.status !== 'delivered' && o.status !== 'cancelled';
export const canCancel = (o) => ['placed', 'accepted', 'processing', 'readyForDispatch'].includes(o.status);

export const PAYMENT_LABELS = { credit: 'Dealer credit', online: 'Paid online', cod: 'Collect on delivery' };

export const slabPrice = (product, qty) => {
  let price = product.slabs[0].price;
  for (const slab of product.slabs) if (qty >= slab.minQty) price = slab.price;
  return price;
};

/**
 * The price a dealer pays per unit. The most specific rule wins:
 * delivery location, then this dealer, then the dealer's tier applied to the volume slabs.
 */
export function dealerPrice(state, dealer, product, qty, addressId) {
  const atLocation = addressId ? state.locationPrices[addressId]?.[product.id] : null;
  if (atLocation != null) return atLocation;
  const forDealer = state.dealerPrices[dealer.id]?.[product.id];
  if (forDealer != null) return forDealer;
  const slab = slabPrice(product, qty);
  if (product.returnable) return slab;
  return Math.round(slab * (state.tierRates[dealer.tier] ?? 1));
}

export function billFor(lines, charges) {
  const subtotal = lines.reduce((sum, l) => sum + l.qty * l.rate, 0);
  const gst = lines.reduce((sum, l) => sum + (l.qty * l.rate * l.gst) / 100, 0);
  const deliveryFee = lines.length === 0 || subtotal >= charges.freeDeliveryAbove ? 0 : charges.deliveryFee;
  return { subtotal: round2(subtotal), gst: round2(gst), deliveryFee, total: round2(subtotal + gst + deliveryFee) };
}

/** CGST and SGST inside the company's state, IGST outside it. */
export function taxSplit(order, dealer, company) {
  const intra = !dealer.gstin || dealer.gstin.startsWith(company.stateCode);
  if (!intra) return { intra, cgst: 0, sgst: 0, igst: order.gst };
  const cgst = round2(order.gst / 2);
  return { intra, cgst, sgst: round2(order.gst - cgst), igst: 0 };
}

export const isDebit = (e) => e.type === 'invoice' || e.type === 'debit';

export function outstandingOf(ledger, dealerId) {
  return round2(ledger.filter((e) => e.dealerId === dealerId).reduce((sum, e) => sum + (isDebit(e) ? e.amount : -e.amount), 0));
}

/** Payments settle the oldest invoices first, so what's unpaid beyond the recent invoices is overdue. */
export function overdueOf(ledger, dealer, now = dayjs()) {
  const cutoff = dayjs(now).subtract(dealer.creditDays, 'day');
  const notDue = ledger
    .filter((e) => e.dealerId === dealer.id && isDebit(e) && dayjs(e.at).isAfter(cutoff))
    .reduce((sum, e) => sum + e.amount, 0);
  return Math.max(0, round2(outstandingOf(ledger, dealer.id) - notDue));
}

export const availableCredit = (ledger, dealer) => Math.max(0, round2(dealer.creditLimit - outstandingOf(ledger, dealer.id)));

export function stockOf(moves, factoryId, productId, until) {
  return moves
    .filter((m) => (!factoryId || m.factoryId === factoryId) && m.productId === productId && (!until || dayjs(m.at).isBefore(until)))
    .reduce((sum, m) => sum + m.qty, 0);
}

/** Opening stock, each movement and closing stock for one factory and product on one day. */
export function dayStock(moves, factoryId, productId, day) {
  const start = dayjs(day).startOf('day');
  const end = start.add(1, 'day');
  const today = moves.filter((m) => m.factoryId === factoryId && m.productId === productId && !dayjs(m.at).isBefore(start) && dayjs(m.at).isBefore(end));
  const total = (...types) => today.filter((m) => types.includes(m.type)).reduce((sum, m) => sum + m.qty, 0);
  const opening = stockOf(moves, factoryId, productId, start);
  return {
    opening,
    produced: total('production'),
    transferred: total('transferIn', 'transferOut'),
    dispatched: -total('dispatch'),
    adjusted: total('adjust', 'return'),
    closing: opening + today.reduce((sum, m) => sum + m.qty, 0),
  };
}

export const cashInHand = (collections, handovers, riderId) =>
  round2(
    collections.filter((c) => c.riderId === riderId && c.mode === 'cash').reduce((sum, c) => sum + c.amount, 0) -
      handovers.filter((h) => h.riderId === riderId).reduce((sum, h) => sum + h.amount, 0),
  );

export const inRange = (at, from, to) => !dayjs(at).isBefore(dayjs(from).startOf('day')) && !dayjs(at).isAfter(dayjs(to).endOf('day'));

/** Booked sales per day, oldest first and with empty days included. */
export function dailySales(orders, days, now = dayjs()) {
  const buckets = new Map();
  for (let i = days - 1; i >= 0; i--) {
    const day = dayjs(now).subtract(i, 'day').startOf('day');
    buckets.set(day.format('YYYY-MM-DD'), { date: day.toISOString(), label: day.format('D MMM'), sales: 0, orders: 0 });
  }
  for (const o of orders) {
    if (o.status === 'cancelled') continue;
    const bucket = buckets.get(dayjs(o.placedAt).format('YYYY-MM-DD'));
    if (bucket) {
      bucket.sales += o.total;
      bucket.orders += 1;
    }
  }
  return [...buckets.values()].map((b) => ({ ...b, sales: round2(b.sales) }));
}

/** Sales, cost and profit on delivered orders, before GST and other expenses. */
export function profitOf(order, productsById) {
  const revenue = order.subtotal;
  const cost = order.lines.reduce((sum, l) => sum + l.qty * (productsById[l.productId]?.cost ?? 0), 0);
  return { revenue, cost, profit: round2(revenue - cost) };
}

export function riderPerformance(rider, orders, attendance, collections, from, to) {
  const mine = orders.filter((o) => o.riderId === rider.id && o.delivery && inRange(o.delivery.at, from, to));
  const onTime = mine.filter((o) => o.delivery.onTime).length;
  return {
    delivered: mine.length,
    onTimePercent: mine.length ? Math.round((onTime / mine.length) * 100) : 0,
    collected: round2(collections.filter((c) => c.riderId === rider.id && inRange(c.at, from, to)).reduce((sum, c) => sum + c.amount, 0)),
    daysPresent: attendance.filter((a) => a.riderId === rider.id && inRange(a.checkIn, from, to)).length,
  };
}

/** Where a rider is on the way from the factory to the dealer. Simulated until the Rider App sends real GPS. */
export function riderProgress(order, now = dayjs(), tripMinutes = 40) {
  const started = order.events.find((e) => e.status === 'outForDelivery')?.at;
  if (!started) return { progress: 0, etaMinutes: tripMinutes };
  const elapsed = dayjs(now).diff(dayjs(started), 'minute', true);
  const progress = Math.min(1, Math.max(0, elapsed / tripMinutes));
  return { progress, etaMinutes: Math.max(0, Math.ceil(tripMinutes - elapsed)) };
}
