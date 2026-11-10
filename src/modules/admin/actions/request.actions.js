import dayjs from 'dayjs';
import { Customer, Dealer, DeliveryRequest, Enquiry, FactoryPickup, IceBoxMovement, IceBoxPickup, Ticket } from '../../../models/index.js';
import { ACCOUNTS, ALL, DISPATCH, FACTORY } from '../admin.roles.js';
import { customerRow, ticketRow } from '../admin.views.js';
import { notify } from '../../../services/notification.service.js';
import { bool, doc, need, newId, notFound, str } from '../../../utils/http.js';

export const requestActions = {
  decideDeliveryRequest: [DISPATCH, async (req, id, approve) => {
    const row = await DeliveryRequest.findById(str(id, 60));
    if (!row) throw notFound('Delivery request');
    need(row.status === 'requested', 'This request has already been decided');
    row.status = approve ? 'confirmed' : 'declined';
    await row.save();
    await notify('dealer', await Dealer.findById(row.dealerId).lean(), 'delivery', approve ? 'Delivery confirmed' : 'Delivery request declined', `Your request for ${dayjs(row.date).format('D MMM')} was ${approve ? 'confirmed' : 'declined'}.`);
    return { deliveryRequests: [doc(row.toObject())] };
  }],

  /** Factory or dispatch staff confirm a dealer's pickup, then mark it collected; or decline it. */
  updateFactoryPickup: [[...DISPATCH, ...FACTORY], async (req, id, status, note) => {
    const row = await FactoryPickup.findById(str(id, 60));
    if (!row) throw notFound('Factory pickup');
    const next = str(status, 20);
    const allowed = { requested: ['confirmed', 'declined'], confirmed: ['collected', 'declined'] }[row.status] ?? [];
    need(allowed.includes(next), row.status === 'requested' || row.status === 'confirmed' ? 'That change is not allowed' : 'This pickup is already closed');
    row.status = next;
    row.staffNote = str(note, 300);
    await row.save();
    const day = dayjs(row.date).format('D MMM');
    const text = {
      confirmed: [`Factory pickup confirmed`, `Collect ${row.quantity} × ${row.productName} at ${row.factoryName} on ${day}, ${row.slot}.`],
      collected: [`Factory pickup collected`, `${row.quantity} × ${row.productName} collected at ${row.factoryName}.`],
      declined: [`Factory pickup declined`, `Your pickup for ${day} at ${row.factoryName} was declined.${row.staffNote ? ' ' + row.staffNote : ''}`],
    }[next];
    await notify('dealer', await Dealer.findById(row.dealerId).lean(), 'delivery', text[0], text[1]);
    return { factoryPickups: [doc(row.toObject())] };
  }],

  completeBoxPickup: [DISPATCH, async (req, id, done) => {
    const row = await IceBoxPickup.findById(str(id, 60));
    if (!row) throw notFound('Pickup');
    need(row.status === 'requested', 'This pickup has already been closed');
    row.status = done ? 'completed' : 'rejected';
    await row.save();
    const changes = { boxPickups: [doc(row.toObject())] };
    if (done) {
      const [movement] = await IceBoxMovement.create([{ _id: newId('IB'), dealerId: row.dealerId, type: 'returned', quantity: row.quantity, date: new Date(), reference: 'Pickup' }], {});
      changes.boxMovements = [doc(movement.toObject())];
    }
    return changes;
  }],

  quoteEnquiry: [ACCOUNTS, async (req, id, quote) => {
    const row = await Enquiry.findById(str(id, 60));
    if (!row) throw notFound('Enquiry');
    const text = str(quote, 500);
    need(text, 'Enter the quote');
    row.status = 'quoted';
    row.quote = text;
    await row.save();
    await notify('customer', row.customerId, 'order', 'Your bulk quote is ready', text);
    return { enquiries: [doc(row.toObject())] };
  }],

  replyTicket: [ALL, async (req, id, message) => {
    const row = await Ticket.findById(str(id, 60));
    if (!row) throw notFound('Ticket');
    need(row.status === 'open', 'This ticket is closed');
    const text = str(message, 2000);
    need(text, 'Enter your reply');
    row.messages.push({ text, fromOwner: false, at: new Date(), by: req.user.name });
    await row.save();
    await notify(row.ownerType, row.ownerId, 'order', 'Support replied', row.subject, row.ownerType === 'customer' ? {} : { route: `/tickets/${row._id}` });
    return { tickets: [ticketRow(row.toObject())] };
  }],

  resolveTicket: [ALL, async (req, id) => {
    const row = await Ticket.findById(str(id, 60));
    if (!row) throw notFound('Ticket');
    row.status = 'resolved';
    await row.save();
    return { tickets: [ticketRow(row.toObject())] };
  }],

  saveCustomer: [ACCOUNTS, async (req, id, active) => {
    const customerId = str(id, 60);
    need(await Customer.exists({ _id: customerId, deletedAt: null }), 'Customer not found', 404);
    await Customer.updateOne({ _id: customerId }, { active: bool(active), $inc: { tokenVersion: active ? 0 : 1 } });
    return { customers: [await customerRow(await Customer.findById(customerId).lean())] };
  }],
};
