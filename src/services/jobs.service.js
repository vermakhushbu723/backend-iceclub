import dayjs from 'dayjs';
import { Customer, Dealer, Ledger, StandingOrder, Subscription } from '../models/index.js';
import { creditSummaryOf } from './ledger.service.js';
import { notify } from './notification.service.js';
import { placeCustomerOrder } from './orders/customer-order.service.js';
import { placeDealerOrder } from './orders/dealer-order.service.js';
import { dayKey } from '../utils/dates.js';
import { tx } from '../utils/http.js';

const isoWeekday = (d) => (d.day() === 0 ? 7 : d.day());

export const standingDue = (s, now = new Date()) => {
  const today = dayjs(now).startOf('day');
  return s.isActive && s.weekdays.includes(isoWeekday(today)) && !s.skippedDates.some((d) => dayjs(d).isSame(today, 'day')) && today.isAfter(dayjs(s.lastRun).startOf('day'));
};

/** Places today's standing orders. A failure tells the dealer instead of stopping the others. */
export async function runStandingOrders(dealerId) {
  const standing = await StandingOrder.find(dealerId ? { dealerId } : {}).lean();
  let placed = 0;
  for (const s of standing.filter((x) => standingDue(x))) {
    const dealer = await Dealer.findById(s.dealerId).lean();
    if (!dealer || dealer.deletedAt) continue;
    try {
      await tx(async () => {
        await placeDealerOrder(dealer, {
          addressId: dealer.addresses.some((a) => a.id === s.addressId) ? s.addressId : dealer.addresses[0]?.id,
          items: Object.entries(s.items).map(([productId, qty]) => ({ productId, qty })),
          paymentMethod: { cashOnDelivery: 'cod', credit: 'credit', online: 'online' }[s.paymentMethod] ?? s.paymentMethod,
          deliveryDate: dayjs().startOf('day').toISOString(),
          slot: s.slot,
          notes: `Standing order: ${s.name}`,
          standingOrderId: s._id,
        });
        await StandingOrder.updateOne({ _id: s._id }, { lastRun: new Date() });
      });
      placed += 1;
    } catch (error) {
      await StandingOrder.updateOne({ _id: s._id }, { lastRun: new Date() });
      await notify('dealer', dealer, 'order', `Could not place "${s.name}"`, error.status ? error.message : 'Please place this order yourself.');
    }
  }
  return placed;
}

const GAP_DAYS = { daily: 1, alternate: 2, weekly: 7 };

export const subscriptionDueOn = (s, day = new Date()) => {
  const today = dayjs(day).startOf('day');
  const start = dayjs(s.startDate).startOf('day');
  if (s.paused || today.isBefore(start)) return false;
  if (today.diff(start, 'day') % GAP_DAYS[s.frequency] !== 0) return false;
  if (s.skipped.some((d) => dayjs(d).isSame(today, 'day'))) return false;
  return !s.lastRun || today.isAfter(dayjs(s.lastRun).startOf('day'));
};

export async function runSubscriptions() {
  const subscriptions = await Subscription.find({ paused: false }).lean();
  let placed = 0;
  for (const s of subscriptions.filter((x) => subscriptionDueOn(x))) {
    const customer = await Customer.findById(s.customerId).lean();
    if (!customer || customer.deletedAt) continue;
    try {
      await tx(async () => {
        await placeCustomerOrder(customer, {
          addressId: s.addressId,
          items: [{ productId: s.productId, qty: s.qty }],
          deliveryDate: dayjs().startOf('day').toISOString(),
          slot: s.slot,
          paymentMethod: 'cod',
        }, { subscriptionId: s._id });
        await Subscription.updateOne({ _id: s._id }, { lastRun: new Date() });
      });
      placed += 1;
    } catch (error) {
      await Subscription.updateOne({ _id: s._id }, { lastRun: new Date() });
      await notify('customer', customer, 'order', 'Subscription delivery not placed', error.status ? error.message : 'Please place this order yourself.');
    }
  }
  return placed;
}

/** At most one reminder a day for each dealer with overdue money. */
export async function remindOverdue(dealer) {
  const today = dayKey();
  if (dealer.reminderOn === today) return false;
  const summary = creditSummaryOf(await Ledger.find({ dealerId: dealer._id }).lean(), dealer);
  if (summary.overdue <= 0) return false;
  await Dealer.updateOne({ _id: dealer._id }, { reminderOn: today });
  await notify('dealer', dealer, 'payment', 'Payment overdue', `₹${summary.overdue} is overdue. Please pay to keep your credit active.`, { route: '/payments' });
  return true;
}

export async function runDailyJobs() {
  const standingOrders = await runStandingOrders();
  const subscriptions = await runSubscriptions();
  let reminders = 0;
  for (const dealer of await Dealer.find({ kycStatus: 'approved', deletedAt: null }).lean()) {
    if (await remindOverdue(dealer)) reminders += 1;
  }
  return { standingOrders, subscriptions, reminders };
}
