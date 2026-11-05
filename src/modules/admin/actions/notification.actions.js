import { Announcement, Customer, Dealer, Notification, Rider } from '../../../models/index.js';
import { ALL } from '../admin.roles.js';
import { logActivity } from '../../../services/notification.service.js';
import { doc, docs, need, newId, str } from '../../../utils/http.js';

export const notificationActions = {
  sendAnnouncement: [ALL, async (req, input) => {
    const title = str(input?.title, 120);
    const body = str(input?.body, 1000);
    need(title && body, 'Enter the title and the message');
    const audience = ['All dealers', 'All riders', 'All customers', 'Everyone'].includes(input.audience) ? input.audience : 'Everyone';
    const at = new Date();
    const send = async (type, model, filter) => {
      const people = await model.find({ deletedAt: null, ...filter }).select('mutedTypes').lean();
      const rows = people.filter((p) => !p.mutedTypes?.includes('announcement')).map((p) => ({ _id: newId('N'), ownerType: type, ownerId: p._id, type: 'announcement', title, body, at, read: false }));
      if (rows.length) await Notification.insertMany(rows);
      return rows.length;
    };
    let reached = 0;
    if (audience === 'All dealers' || audience === 'Everyone') reached += await send('dealer', Dealer, { kycStatus: 'approved' });
    if (audience === 'All riders' || audience === 'Everyone') reached += await send('rider', Rider, { active: true });
    if (audience === 'All customers' || audience === 'Everyone') reached += await send('customer', Customer, { active: true });
    const [row] = await Announcement.create([{ _id: newId('AN'), audience, title, body, at }], {});
    await logActivity(`Announcement sent to ${audience}`);
    return { announcements: [{ ...doc(row.toObject()), reached }] };
  }],

  markRead: [ALL, async (req, id) => {
    await Notification.updateOne({ _id: str(id, 60), ownerType: 'admin' }, { read: true });
    return { notifications: [doc(await Notification.findById(str(id, 60)).lean())].filter(Boolean) };
  }],

  markAllRead: [ALL, async () => {
    await Notification.updateMany({ ownerType: 'admin' }, { read: true });
    return { notifications: docs(await Notification.find({ ownerType: 'admin' }).sort({ at: -1 }).limit(100).lean()) };
  }],
};
