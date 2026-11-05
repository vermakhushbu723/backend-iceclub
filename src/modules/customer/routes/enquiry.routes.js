import { Router } from 'express';
import { Enquiry } from '../../../models/index.js';
import { logActivity, notifyAdmin } from '../../../services/notification.service.js';
import { dateOf, need, newId, positiveInt, read, str, write } from '../../../utils/http.js';

const router = Router();

const enquiryView = (e) => ({ id: e._id, eventType: e.eventType, date: e.date, quantityKg: e.quantityKg, location: e.location, notes: e.notes, at: e.at, status: e.status, quote: e.quote ?? '' });

router.get('/enquiries', read(async (req) => (await Enquiry.find({ customerId: req.user._id }).sort({ at: -1 }).lean()).map(enquiryView)));

router.post('/enquiries', write(async (req) => {
  const eventType = str(req.body.eventType, 60);
  need(eventType, 'Select the event type');
  const location = str(req.body.location, 200);
  need(location, 'Enter the delivery location');
  const [row] = await Enquiry.create([{ _id: newId('EQ'), customerId: req.user._id, customerName: req.user.name, phone: req.user.phone, eventType, date: dateOf(req.body.date), quantityKg: positiveInt(req.body.quantityKg, 'Enter the quantity'), location, notes: str(req.body.notes, 500), at: new Date() }], {});
  await notifyAdmin('order', 'Bulk enquiry', `${req.user.name} needs ${row.quantityKg} kg for a ${eventType}.`, '/customers/enquiries');
  await logActivity(`Bulk enquiry from ${req.user.name}`, 'orange');
  return enquiryView(row.toObject());
}));

export default router;
