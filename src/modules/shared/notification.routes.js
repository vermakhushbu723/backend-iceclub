import { customerNotification } from '../customer/customer.views.js';
import { MODELS } from '../../middleware/auth.js';
import { Notification } from '../../models/index.js';
import { appNotification } from './shared.views.js';
import { read, str, write } from '../../utils/http.js';

const NOTIFICATION_TYPES = ['order', 'payment', 'delivery', 'announcement'];

/** Notifications work the same in the three apps. */
export function notificationRoutes(router, role) {
  const mine = (req) => ({ ownerType: role, ownerId: req.user._id });
  const view = role === 'customer' ? customerNotification : appNotification;

  router.get('/notifications', read(async (req) => (await Notification.find(mine(req)).sort({ at: -1 }).limit(200).lean()).map(view)));
  router.post('/notifications/read-all', write(async (req) => {
    await Notification.updateMany(mine(req), { read: true });
  }));
  router.post('/notifications/:id/read', write(async (req) => {
    await Notification.updateOne({ ...mine(req), _id: str(req.params.id, 60) }, { read: true });
  }));
  router.delete('/notifications/:id', write(async (req) => {
    await Notification.deleteOne({ ...mine(req), _id: str(req.params.id, 60) });
  }));
  router.delete('/notifications', write(async (req) => {
    await Notification.deleteMany(mine(req));
  }));
  router.get('/notifications/muted', read(async (req) => req.user.mutedTypes ?? []));
  router.put('/notifications/muted', write(async (req) => {
    const types = (Array.isArray(req.body.types) ? req.body.types : []).filter((t) => NOTIFICATION_TYPES.includes(t));
    await MODELS[role].updateOne({ _id: req.user._id }, { mutedTypes: types });
  }));
}
