import { Router } from 'express';
import { DutySession, Rider, RoutePoint } from '../../../models/index.js';
import { openSession } from '../rider.helpers.js';
import { dayKey } from '../../../utils/dates.js';
import { geo, need, newId, read, str, write } from '../../../utils/http.js';

const router = Router();

router.get('/tracking/points', read(async (req) => {
  const day = str(req.query.day, 10) || dayKey();
  const rows = await RoutePoint.find({ riderId: req.user._id, day }).sort({ at: 1 }).limit(5000).lean();
  return rows.map((p) => ({ location: { latitude: p.lat, longitude: p.lng, accuracyMetres: null }, at: p.at }));
}));

router.post('/tracking/points', write(async (req) => {
  const point = geo(req.body.location);
  need(point, 'Enter a valid location');
  const at = new Date();
  await RoutePoint.create([{ _id: newId('RP'), riderId: req.user._id, day: dayKey(at), ...point, at }], {});
  await Rider.updateOne({ _id: req.user._id }, { lastLocation: { ...point, at } });
}));

router.get('/tracking/sessions', read(async (req) => (await DutySession.find({ riderId: req.user._id }).sort({ start: -1 }).limit(200).lean()).map((s) => ({ start: s.start, end: s.end }))));

router.post('/tracking/start', write(async (req) => openSession(req.user._id, true).then(() => ({ ok: true }))));

router.post('/tracking/stop', write(async (req) => openSession(req.user._id, false).then(() => ({ ok: true }))));

export default router;
