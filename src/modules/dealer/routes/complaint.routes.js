import { Router } from 'express';
import { Complaint } from '../../../models/index.js';
import { dealerComplaint } from '../dealer.views.js';
import { nextComplaintNumber } from '../../../services/complaint.service.js';
import { notify, notifyAdmin } from '../../../services/notification.service.js';
import { photosFrom } from '../../../services/orders/order-lifecycle.service.js';
import { ownOrder } from '../../../services/orders/order.helpers.js';
import { geo, need, newId, positiveInt, read, str, write } from '../../../utils/http.js';

const router = Router();

router.get('/complaints', read(async (req) => (await Complaint.find({ dealerId: req.user._id, source: 'dealer' }).sort({ submittedAt: -1 }).lean()).map((c) => dealerComplaint(req, c))));

router.post('/complaints', write(async (req) => {
  const order = await ownOrder({ dealerId: req.user._id, status: 'delivered' }, req.body.orderId);
  const type = str(req.body.type, 20);
  need(['damagedBags', 'meltedBags', 'shortQuantity'].includes(type), 'Select the problem');
  const qty = positiveInt(req.body.affectedQuantity, 'Enter how many units are affected');
  need(qty <= order.lines.reduce((sum, l) => sum + l.qty, 0), 'That is more than this order had');
  const description = str(req.body.description, 2000);
  need(description, 'Describe the problem');
  const photos = photosFrom(req.body.photos);
  need(photos.length > 0, 'Add at least one photo');
  const [complaint] = await Complaint.create([{ _id: newId('CM'), number: await nextComplaintNumber(), orderId: order._id, orderNumber: order.number, dealerId: req.user._id, buyerName: req.user.businessName, riderId: order.riderId, source: 'dealer', type, qty, description, photos, submittedAt: new Date(), location: geo(req.body.location) }], {});
  await notify('dealer', req.user, 'order', 'Complaint received', `${complaint.number} for order ${order.number} is under review.`, { route: `/complaints/${complaint._id}` });
  await notifyAdmin('complaint', 'New complaint', `${req.user.businessName}: ${complaint.number}.`, '/orders/returns');
  return dealerComplaint(req, complaint.toObject());
}));

export default router;
