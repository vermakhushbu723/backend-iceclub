import { Activity, Notification } from '../models/index.js';
import { newId } from '../utils/http.js';

export const logActivity = (text, color = 'blue') => Activity.create({ _id: newId('AC'), at: new Date(), text, color });

const NOTIFICATION_TYPE_OF_APP = new Set(['order', 'payment', 'delivery', 'announcement']);

/** Adds a notification unless the person has muted that type. */
export async function notify(ownerType, owner, type, title, body, extra = {}) {
  const ownerId = owner?._id ?? owner ?? null;
  if (owner?.mutedTypes?.includes(type)) return null;
  const appType = ownerType === 'admin' || NOTIFICATION_TYPE_OF_APP.has(type) ? type : 'order';
  const [row] = await Notification.create([{ _id: newId('N'), ownerType, ownerId, type: appType, title, body, at: new Date(), ...extra }], {});
  return row;
}

export const notifyAdmin = (type, title, body, route) => notify('admin', null, type, title, body, { route });
