import { Ticket } from '../../models/index.js';
import { customerTicket } from '../customer/customer.views.js';
import { appTicket } from './shared.views.js';
import { notifyAdmin } from '../../services/notification.service.js';
import { need, newId, notFound, read, str, write } from '../../utils/http.js';

/** Support tickets work the same in the three apps. The ICECLUB team answers them from the admin panel. */
export function ticketRoutes(router, role) {
  const mine = (req, extra = {}) => ({ ownerType: role, ownerId: req.user._id, ...extra });
  const view = (t) => (role === 'customer' ? customerTicket(t) : appTicket(t, role));
  const nameOf = (user) => user.businessName || user.name || user.phone;

  router.get('/tickets', read(async (req) => (await Ticket.find(mine(req)).lean()).sort((a, b) => b.messages[0].at - a.messages[0].at).map(view)));

  router.post('/tickets', write(async (req) => {
    const subject = str(req.body.subject, 200);
    const category = str(req.body.category, 80);
    const message = str(req.body.message, 2000);
    need(subject, 'Enter a subject');
    need(message, 'Enter your message');
    const at = new Date();
    const [ticket] = await Ticket.create([{
      _id: newId('T'),
      ownerType: role,
      ownerId: req.user._id,
      ownerName: nameOf(req.user),
      subject,
      category,
      orderNumber: str(req.body.orderNumber, 40) || null,
      messages: [
        { text: message, fromOwner: true, at, by: nameOf(req.user) },
        { text: 'Thanks, we have received your request and will get back to you soon.', fromOwner: false, at, by: 'ICECLUB' },
      ],
    }], {});
    await notifyAdmin('ticket', 'New support ticket', `${nameOf(req.user)}: ${subject}`, '/support');
    return view(ticket.toObject());
  }));

  router.post('/tickets/:id/reply', write(async (req) => {
    const ticket = await Ticket.findOne(mine(req, { _id: str(req.params.id, 60) }));
    if (!ticket) throw notFound('Ticket');
    need(ticket.status === 'open', 'This ticket is closed');
    const text = str(req.body.message, 2000);
    need(text, 'Enter your message');
    ticket.messages.push({ text, fromOwner: true, at: new Date(), by: nameOf(req.user) });
    await ticket.save();
    return view(ticket.toObject());
  }));

  router.post('/tickets/:id/resolve', write(async (req) => {
    await Ticket.updateOne(mine(req, { _id: str(req.params.id, 60) }), { status: 'resolved' });
  }));
}
