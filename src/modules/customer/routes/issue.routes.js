import { Router } from 'express';
import { Complaint } from '../../../models/index.js';
import { customerIssue } from '../customer.views.js';
import { nextComplaintNumber } from '../../../services/complaint.service.js';
import { notifyAdmin } from '../../../services/notification.service.js';
import { photosFrom } from '../../../services/orders/order-lifecycle.service.js';
import { ownOrder } from '../../../services/orders/order.helpers.js';
import { need, newId, read, str, write } from '../../../utils/http.js';

const router = Router();

const ISSUE_TYPES = ['damaged', 'melted', 'short', 'wrong', 'other'];

router.get('/issues', read(async (req) => (await Complaint.find({ customerId: req.user._id, source: 'customer' }).sort({ submittedAt: -1 }).lean()).map((c) => customerIssue(req, c))));

router.post('/issues', write(async (req) => {
  const order = await ownOrder({ customerId: req.user._id, status: 'delivered' }, req.body.orderId);
  const type = str(req.body.type, 20);
  need(ISSUE_TYPES.includes(type), 'Select the problem');
  const description = str(req.body.details, 2000);
  need(description, 'Tell us what went wrong');
  const [row] = await Complaint.create([{ _id: newId('CM'), number: await nextComplaintNumber(), orderId: order._id, orderNumber: order.number, customerId: req.user._id, buyerName: req.user.name, riderId: order.riderId, source: 'customer', type, qty: 0, description, photos: photosFrom(req.body.photos), submittedAt: new Date() }], {});
  await notifyAdmin('complaint', 'Customer report', `${req.user.name}: ${row.number}.`, '/orders/returns');
  return customerIssue(req, row.toObject());
}));

export default router;
