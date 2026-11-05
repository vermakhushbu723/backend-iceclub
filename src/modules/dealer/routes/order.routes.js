import { Router } from 'express';
import { Order, Rider } from '../../../models/index.js';
import { approved, fresh } from '../dealer.helpers.js';
import { dealerOrder } from '../dealer.views.js';
import { placeDealerOrder } from '../../../services/orders/dealer-order.service.js';
import { cancelOrder } from '../../../services/orders/order-lifecycle.service.js';
import { ownOrder } from '../../../services/orders/order.helpers.js';
import { trackingOf } from '../../../services/tracking.service.js';
import { need, num, read, str, write } from '../../../utils/http.js';

const router = Router();

const withRiders = async (orders) => {
  const ids = [...new Set(orders.map((o) => o.riderId).filter(Boolean))];
  const riders = Object.fromEntries((await Rider.find({ _id: { $in: ids } }).lean()).map((r) => [r._id, r]));
  return orders.map((o) => dealerOrder(o, ['outForDelivery', 'delivered'].includes(o.status) ? riders[o.riderId] : null));
};

router.get('/orders', read(async (req) => withRiders(await Order.find({ dealerId: req.user._id }).sort({ placedAt: -1 }).limit(500).lean())));

router.post('/orders', write(async (req) => {
  approved(req);
  const method = { cashOnDelivery: 'cod', credit: 'credit', online: 'online' }[req.body.paymentMethod];
  const order = await placeDealerOrder(await fresh(req), { ...req.body, paymentMethod: method, factoryId: null });
  return dealerOrder(order, null);
}));

router.post('/orders/:id/cancel', write(async (req) => {
  await ownOrder({ dealerId: req.user._id }, req.params.id);
  const order = await Order.findById(str(req.params.id, 60));
  await cancelOrder(order, req.body.reason || 'Cancelled by dealer', { allowed: ['placed', 'accepted'], by: 'dealer' });
  return dealerOrder(order.toObject(), null);
}));

router.post('/orders/:id/rate', write(async (req) => {
  await ownOrder({ dealerId: req.user._id, status: 'delivered' }, req.params.id);
  const stars = num(req.body.stars);
  need(Number.isInteger(stars) && stars >= 1 && stars <= 5, 'Choose between 1 and 5 stars');
  await Order.updateOne({ _id: str(req.params.id, 60) }, { rating: stars, review: str(req.body.review, 1000) });
}));

router.get('/orders/:id/tracking', read(async (req) => trackingOf(await ownOrder({ dealerId: req.user._id }, req.params.id))));

export default router;
