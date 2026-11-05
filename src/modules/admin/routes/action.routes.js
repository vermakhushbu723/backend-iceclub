import { Router } from 'express';
import { Activity, Collection, Ledger, Move, Notification } from '../../../models/index.js';
import { actions } from '../actions/index.js';
import { orderChange } from '../admin.helpers.js';
import { DISPATCH } from '../admin.roles.js';
import { checkDeliveryOtp, completeDelivery, findOrder } from '../../../services/orders/order-lifecycle.service.js';
import { docs, need, notFound, tx } from '../../../utils/http.js';

const router = Router();

/* confirmDelivery checks the OTP outside the transaction, so wrong guesses stay counted. */
const deliveryAction = async (req, orderId, input) => {
  await checkDeliveryOtp(orderId, input?.otp);
  return tx(async () => orderChange(req, await completeDelivery(await findOrder(orderId), { ...input, location: null })));
};

/** Appended records aren't returned by the actions, so anything new since the action began goes back too. */
async function appended(since) {
  const newer = { at: { $gte: since } };
  const [moves, ledger, collections, activity, notifications] = await Promise.all([Move.find(newer).lean(), Ledger.find(newer).lean(), Collection.find(newer).lean(), Activity.find(newer).lean(), Notification.find({ ...newer, ownerType: 'admin' }).lean()]);
  return { moves: docs(moves), ledger: docs(ledger), collections: docs(collections), activity: docs(activity), notifications: docs(notifications) };
}

const canDo = (user, roles) => user.role === 'Super Admin' || roles.includes(user.role);

router.post('/actions/:name', async (req, res) => {
  const name = req.params.name;
  const args = Array.isArray(req.body?.args) ? req.body.args : [];
  const since = new Date();
  if (name === 'confirmDelivery') {
    need(canDo(req.user, DISPATCH), 'Your role does not allow this', 403);
    const changes = await deliveryAction(req, ...args);
    res.json({ changes: mergeChanges(await appended(since), changes) });
    return;
  }
  const action = Object.hasOwn(actions, name) ? actions[name] : null;
  if (!action) throw notFound('Action');
  const [roles, handler] = action;
  need(canDo(req.user, roles), 'Your role does not allow this', 403);
  const changes = await tx(() => handler(req, ...args));
  res.json({ changes: mergeChanges(await appended(since), changes) });
});

const mergeChanges = (auto, changes) => {
  const merged = { ...auto };
  for (const [key, value] of Object.entries(changes ?? {})) merged[key] = value;
  return merged;
};

export default router;
