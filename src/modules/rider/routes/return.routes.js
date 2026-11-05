import { Router } from 'express';
import { Complaint, Order } from '../../../models/index.js';
import { buyersFor } from '../rider.helpers.js';
import { riderReturn } from '../rider.views.js';
import { nextComplaintNumber } from '../../../services/complaint.service.js';
import { notify, notifyAdmin } from '../../../services/notification.service.js';
import { photosFrom } from '../../../services/orders/order-lifecycle.service.js';
import { buyerNameOf } from '../../../services/orders/order.helpers.js';
import { geo, need, newId, notFound, positiveInt, read, str, write } from '../../../utils/http.js';

const router = Router();

router.get('/returns', read(async (req) => (await Complaint.find({ riderId: req.user._id, source: 'rider' }).sort({ submittedAt: -1 }).lean()).map((c) => riderReturn(req, c))));

router.post('/returns', write(async (req) => {
  const order = await Order.findOne({ _id: str(req.body.orderId, 60), $or: [{ riderId: req.user._id }, { 'pastAttempts.riderId': req.user._id }] }).lean();
  if (!order) throw notFound('Order');
  const type = { damagedBags: 'damagedBags', meltedIce: 'meltedBags', shortQuantity: 'shortQuantity' }[req.body.type];
  need(type, 'Select the problem');
  const qty = positiveInt(req.body.quantity, 'Enter how many units');
  const [buyer] = Object.values(await buyersFor([order]));
  const [row] = await Complaint.create([{ _id: newId('CM'), number: await nextComplaintNumber(), orderId: order._id, orderNumber: order.number, dealerId: order.dealerId, customerId: order.customerId, buyerName: buyerNameOf(order, buyer), riderId: req.user._id, source: 'rider', type, qty, description: str(req.body.note, 1000), photos: photosFrom(req.body.photos), submittedAt: new Date(), location: geo(req.body.location) }], {});
  await notify('rider', req.user, 'order', 'Report submitted', `${qty} units on ${order.number}. Bring the stock back to the factory.`);
  await notifyAdmin('complaint', 'Rider report', `${req.user.name}: ${row.number}.`, '/orders/returns');
  return riderReturn(req, row.toObject());
}));

export default router;
