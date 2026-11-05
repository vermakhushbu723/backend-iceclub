import { Router } from 'express';
import { Attendance } from '../../../models/index.js';
import { dayKey } from '../../../utils/dates.js';
import { geo, geoOut, need, newId, read, write } from '../../../utils/http.js';

const router = Router();

const dayView = (a) => ({ checkIn: a.checkIn, checkOut: a.checkOut, checkInLocation: a.location ? geoOut(a.location) : null, checkOutLocation: a.checkOutLocation ? geoOut(a.checkOutLocation) : null });

router.get('/attendance', read(async (req) => (await Attendance.find({ riderId: req.user._id }).sort({ checkIn: -1 }).limit(120).lean()).map(dayView)));

router.post('/attendance/check-in', write(async (req) => {
  const day = dayKey();
  need(!(await Attendance.exists({ riderId: req.user._id, day })), 'You have already checked in today.');
  await Attendance.create([{ _id: newId('A'), riderId: req.user._id, day, checkIn: new Date(), location: geo(req.body.location) }], {});
}));

router.post('/attendance/check-out', write(async (req) => {
  const row = await Attendance.findOne({ riderId: req.user._id, day: dayKey() }).lean();
  need(row, 'Please check in first.');
  need(!row.checkOut, 'You have already checked out today.');
  await Attendance.updateOne({ _id: row._id }, { checkOut: new Date(), checkOutLocation: geo(req.body.location) });
}));

export default router;
