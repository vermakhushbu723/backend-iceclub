import { findDealer, orderChange } from '../admin.helpers.js';
import { DISPATCH } from '../admin.roles.js';
import { placeDealerOrder } from '../../../services/orders/dealer-order.service.js';
import { advanceOrder, assignRider, cancelOrder, findOrder, retryDelivery } from '../../../services/orders/order-lifecycle.service.js';

export const orderActions = {
  createOrder: [DISPATCH, async (req, input) => {
    const dealer = await findDealer(input?.dealerId);
    return orderChange(req, await placeDealerOrder(dealer, input, 'admin'));
  }],
  assignRider: [DISPATCH, async (req, orderId, riderId) => orderChange(req, await assignRider(await findOrder(orderId), riderId))],
  advanceOrder: [DISPATCH, async (req, orderId) => orderChange(req, await advanceOrder(await findOrder(orderId)))],
  cancelOrder: [DISPATCH, async (req, orderId, reason) => orderChange(req, await cancelOrder(await findOrder(orderId), reason))],
  retryDelivery: [DISPATCH, async (req, orderId) => orderChange(req, await retryDelivery(await findOrder(orderId)))],
};
