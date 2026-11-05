import { Router } from 'express';
import { Order, Review, Rider } from '../../../models/index.js';
import { customerOrder } from '../customer.views.js';
import { fresh } from '../customer.helpers.js';
import { placeCustomerOrder } from '../../../services/orders/customer-order.service.js';
import { cancelOrder, findOrder } from '../../../services/orders/order-lifecycle.service.js';
import { ownOrder } from '../../../services/orders/order.helpers.js';
import { trackingOf } from '../../../services/tracking.service.js';
import { need, newId, num, read, str, write } from '../../../utils/http.js';

const router = Router();

const withRider = async (order) => customerOrder(order, order.riderId && ['outForDelivery', 'delivered'].includes(order.status) ? await Rider.findById(order.riderId).lean() : null);

router.get('/orders', read(async (req) => {
  const orders = await Order.find({ customerId: req.user._id }).sort({ placedAt: -1 }).limit(300).lean();
  const riders = Object.fromEntries((await Rider.find({ _id: { $in: orders.map((o) => o.riderId).filter(Boolean) } }).lean()).map((r) => [r._id, r]));
  return orders.map((o) => customerOrder(o, ['outForDelivery', 'delivered'].includes(o.status) ? riders[o.riderId] : null));
}));

router.post('/orders', write(async (req) => {
  const order = await placeCustomerOrder(await fresh(req), req.body);
  return customerOrder(order, null);
}));

router.post('/orders/:id/cancel', write(async (req) => {
  await ownOrder({ customerId: req.user._id }, req.params.id);
  const order = await findOrder(req.params.id);
  need(str(req.body.reason, 200), 'Select a reason');
  await cancelOrder(order, req.body.reason, { allowed: ['placed', 'accepted', 'processing', 'readyForDispatch'], by: 'customer' });
  return customerOrder(order.toObject(), null);
}));

router.post('/orders/:id/rate', write(async (req) => {
  const order = await ownOrder({ customerId: req.user._id, status: 'delivered' }, req.params.id);
  const delivery = num(req.body.delivery);
  const product = num(req.body.product);
  need([delivery, product].every((v) => Number.isInteger(v) && v >= 1 && v <= 5), 'Choose between 1 and 5 stars');
  need(order.rating == null, 'You have already rated this order');
  const text = str(req.body.text, 1000);
  await Order.updateOne({ _id: order._id }, { rating: delivery, productRating: product, review: text });
  const author = `${req.user.name.split(' ')[0]}`;
  for (const line of order.lines) {
    await Review.create([{ _id: newId('RV'), productId: line.productId, customerId: req.user._id, author, rating: product, text: text || `Rated ${product} out of 5.`, at: new Date() }], {});
  }
  return withRider(await Order.findById(order._id).lean());
}));

router.get('/orders/:id/tracking', read(async (req) => trackingOf(await ownOrder({ customerId: req.user._id }, req.params.id))));

export default router;
