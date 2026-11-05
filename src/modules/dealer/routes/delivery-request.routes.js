import dayjs from 'dayjs';
import { Router } from 'express';
import { DeliveryRequest } from '../../../models/index.js';
import { notifyAdmin } from '../../../services/notification.service.js';
import { dateOf, need, newId, notFound, read, str, write } from '../../../utils/http.js';

const router = Router();

const requestView = (r) => ({ id: r._id, date: r.date, slot: r.slot, addressLabel: r.addressLabel, details: r.details, requestedAt: r.requestedAt, status: r.status });

router.get('/delivery-requests', read(async (req) => (await DeliveryRequest.find({ dealerId: req.user._id }).sort({ date: 1 }).lean()).map(requestView)));

router.post('/delivery-requests', write(async (req) => {
  const date = dateOf(req.body.date);
  need(!dayjs(date).isBefore(dayjs().startOf('day')), 'That date has passed');
  const [saved] = await DeliveryRequest.create([{ _id: newId('DR'), dealerId: req.user._id, date, slot: str(req.body.slot, 40), addressLabel: str(req.body.addressLabel, 80), details: str(req.body.details, 500), requestedAt: new Date() }], {});
  await notifyAdmin('order', 'Delivery request', `${req.user.businessName} asked for a delivery.`, '/orders/requests');
  return requestView(saved.toObject());
}));

router.delete('/delivery-requests/:id', write(async (req) => {
  const request = await DeliveryRequest.findOne({ _id: str(req.params.id, 60), dealerId: req.user._id });
  if (!request) throw notFound('Delivery request');
  await request.deleteOne();
}));

export default router;
