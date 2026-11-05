import { fileUrl } from '../../utils/urls.js';

export const photosOut = (req, photos) => (photos ?? []).map((p) => ({ path: fileUrl(req, p.url), takenAt: p.takenAt }));

export const appAddress = (a) => ({ id: a.id, label: a.label, contactName: a.contactName ?? '', phone: a.phone ?? '', line: a.line, city: a.city, pincode: a.pincode, instructions: a.instructions ?? '', isDefault: a.isDefault ?? false });

export const appNotification = (n) => ({ id: n._id, type: n.type, title: n.title, body: n.body, createdAt: n.at, isRead: n.read, route: n.route });

const OWNER_FLAG = { dealer: 'fromDealer', rider: 'fromRider' };

export const appTicket = (t, role) => ({
  id: t._id,
  subject: t.subject,
  category: t.category,
  messages: t.messages.map((m) => ({ text: m.text, [OWNER_FLAG[role]]: m.fromOwner, at: m.at })),
  status: t.status,
  orderNumber: t.orderNumber,
});
