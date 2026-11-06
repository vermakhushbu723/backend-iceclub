import { Router } from 'express';
import { Order } from '../../../models/index.js';
import { buyersFor } from '../rider.helpers.js';
import { riderOrder } from '../rider.views.js';
import { logActivity, notify, notifyAdmin } from '../../../services/notification.service.js';
import { advanceOrder, checkDeliveryOtp, completeDelivery, failDelivery, findOrder, photosFrom } from '../../../services/orders/order-lifecycle.service.js';
import { geo, need, notFound, num, read, str, tx, write } from '../../../utils/http.js';

const router = Router();

router.get('/orders', read(async (req) => {
  const id = req.user._id;
  const orders = await Order.find({
    $or: [{ riderId: id, status: { $ne: 'cancelled' }, 'riderEvents.0': { $exists: true } }, { 'pastAttempts.riderId': id }],
  }).sort({ deliveryDate: -1 }).limit(500).lean();
  const buyers = await buyersFor(orders);
  const rows = [];
  for (const o of orders) {
    const buyer = buyers[o.dealerId ?? o.customerId];
    if (o.riderId === id && o.riderEvents.length) rows.push(riderOrder(req, o, buyer));
    else for (const attempt of o.pastAttempts.filter((a) => a.riderId === id)) rows.push(riderOrder(req, o, buyer, attempt));
  }
  return rows;
}));

const STATUS_OF = (order) => order.riderEvents.at(-1)?.status;

async function mine(req) {
  const order = await findOrder(req.params.id);
  if (order.riderId !== req.user._id) throw notFound('Order');
  return order;
}

const alreadyMessage = (status) => `This order is already ${String(status).replace(/([A-Z])/g, ' $1').toLowerCase()}.`;

const respond = async (req, order) => {
  const plain = order.toObject();
  const [buyer] = Object.values(await buyersFor([plain]));
  return riderOrder(req, plain, buyer);
};

router.post('/orders/:id/accept', write(async (req) => {
  const order = await mine(req);
  need(STATUS_OF(order) === 'assigned', alreadyMessage(STATUS_OF(order)));
  order.riderEvents.push({ status: 'accepted', at: new Date() });
  await order.save();
  return respond(req, order);
}));

router.post('/orders/:id/reject', write(async (req) => {
  const order = await mine(req);
  need(STATUS_OF(order) === 'assigned', 'This order can no longer be rejected.');
  const reason = str(req.body.reason, 200);
  need(reason, 'Select a reason');
  order.riderId = null;
  order.riderEvents = [];
  await order.save();
  await notifyAdmin('order', 'Order returned by rider', `${req.user.name} returned ${order.number}: ${reason}.`, '/riders/assign');
  await logActivity(`${req.user.name} returned ${order.number}`, 'orange');
  await notify('rider', req.user, 'order', 'Order returned', `${order.number} was returned to the admin: ${reason}.`);
}));

router.post('/orders/:id/pickup', write(async (req) => {
  const order = await mine(req);
  need(STATUS_OF(order) === 'accepted', alreadyMessage(STATUS_OF(order)));
  need(order.status === 'readyForDispatch', 'This order is not ready at the factory yet.');
  const at = new Date();
  const loaded = {};
  for (const line of order.lines) {
    const asked = req.body.loaded?.[line.productId];
    const qty = asked == null ? line.qty : num(asked);
    need(Number.isInteger(qty) && qty >= 0 && qty <= line.qty, `Enter a valid loaded quantity for ${line.name}`);
    loaded[line.productId] = qty;
  }
  need(Object.values(loaded).some((q) => q > 0), 'Load at least one item');
  order.pickup = { loaded, photos: photosFrom(req.body.photos, at), at, remark: str(req.body.remark, 300), location: geo(req.body.location) };
  order.markModified('pickup');
  order.riderEvents.push({ status: 'pickedUp', at });
  await order.save();
  return respond(req, order);
}));

router.post('/orders/:id/start', write(async (req) => {
  const order = await mine(req);
  need(STATUS_OF(order) === 'pickedUp', alreadyMessage(STATUS_OF(order)));
  await advanceOrder(order);
  return respond(req, order);
}));

router.post('/orders/:id/complete', async (req, res) => {
  const before = await mine(req);
  need(STATUS_OF(before) === 'outForDelivery', alreadyMessage(STATUS_OF(before)));
  await checkDeliveryOtp(before._id, req.body.otp);
  const body = await tx(async () => {
    const order = await mine(req);
    need(order.status === 'outForDelivery', 'This order has already been completed.');
    await completeDelivery(order, { ...req.body, byRider: true, location: geo(req.body.location) });
    return respond(req, order);
  });
  res.json(body);
});

/** Adds proof to a finished delivery, such as a late photo or the receiver's name. */
router.patch('/orders/:id/delivery', write(async (req) => {
  const order = await mine(req);
  need(order.status === 'delivered' && order.delivery, 'This order has not been delivered yet.');
  order.delivery = { ...order.delivery, receivedBy: str(req.body.receivedBy, 80) || order.delivery.receivedBy, photos: Array.isArray(req.body.photos) ? photosFrom(req.body.photos, order.delivery.at) : order.delivery.photos };
  order.markModified('delivery');
  await order.save();
  return respond(req, order);
}));

router.post('/orders/:id/fail', write(async (req) => {
  const order = await mine(req);
  need(['accepted', 'pickedUp', 'outForDelivery'].includes(STATUS_OF(order)), alreadyMessage(STATUS_OF(order)));
  await failDelivery(order, { ...req.body, location: geo(req.body.location) });
  await notify('rider', req.user, 'order', 'Delivery failed', `${order.number}: ${order.failure.reason}. Return the stock to the factory.`, { route: `/orders/${order._id}` });
  return respond(req, order);
}));

export default router;
