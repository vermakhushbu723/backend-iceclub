import { Router } from 'express';
import { IceBoxMovement, IceBoxPickup } from '../../../models/index.js';
import { notifyAdmin } from '../../../services/notification.service.js';
import { dateOf, need, newId, positiveInt, read, str, write } from '../../../utils/http.js';

const router = Router();

const held = async (dealerId) => (await IceBoxMovement.find({ dealerId }).lean()).reduce((sum, m) => sum + (m.type === 'issued' ? m.quantity : -m.quantity), 0);

const pickupView = (p) => ({ id: p._id, quantity: p.quantity, date: p.date, requestedAt: p.requestedAt });

router.get('/ice-boxes', read(async (req) => ({
  movements: (await IceBoxMovement.find({ dealerId: req.user._id }).sort({ date: -1 }).lean()).map((m) => ({ type: m.type, quantity: m.quantity, date: m.date, reference: m.reference })),
  pickups: (await IceBoxPickup.find({ dealerId: req.user._id, status: 'requested' }).lean()).map(pickupView),
})));

router.post('/ice-boxes/pickups', write(async (req) => {
  const quantity = positiveInt(req.body.quantity, 'Enter how many boxes to return');
  const date = dateOf(req.body.date);
  const waiting = (await IceBoxPickup.find({ dealerId: req.user._id, status: 'requested' }).lean()).reduce((sum, p) => sum + p.quantity, 0);
  need(quantity <= (await held(req.user._id)) - waiting, 'You cannot return more boxes than you hold.');
  await IceBoxPickup.create([{ _id: newId('BP'), dealerId: req.user._id, quantity, date, requestedAt: new Date() }], {});
  await notifyAdmin('order', 'Ice box pickup', `${req.user.businessName} wants ${quantity} boxes collected.`, '/inventory/ice-boxes');
}));

router.delete('/ice-boxes/pickups/:id', write(async (req) => {
  await IceBoxPickup.deleteOne({ _id: str(req.params.id, 60), dealerId: req.user._id, status: 'requested' });
}));

export default router;
