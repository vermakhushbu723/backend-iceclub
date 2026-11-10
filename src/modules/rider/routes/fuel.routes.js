import mongoose from 'mongoose';
import { Router } from 'express';
import { FuelTopUp } from '../../../models/index.js';
import { logActivity, notifyAdmin } from '../../../services/notification.service.js';
import { fileUrl } from '../../../utils/urls.js';
import { need, newId, num, read, str, write } from '../../../utils/http.js';

const router = Router();

const fuelView = (req, f) => ({
  id: f._id, amount: f.amount, litres: f.litres, odometerKm: f.odometerKm ?? null, pump: f.pump ?? '', vehicleNumber: f.vehicleNumber ?? '',
  video: fileUrl(req, f.video), note: f.note ?? '', at: f.at, status: f.status, remark: f.remark ?? '', decidedAt: f.decidedAt ?? null,
});

/** The video must be one this rider uploaded a moment ago, and really a video. */
async function ownVideo(req, value) {
  const name = /^(?:https?:\/\/[^/]+)?\/api\/files\/([a-f0-9]{48})$/.exec(str(value, 300))?.[1];
  need(name, 'Record a video of the fuel being filled');
  const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'uploads' });
  const [file] = await bucket.find({ filename: name }).limit(1).toArray();
  need(file && file.metadata?.ownerType === 'rider' && file.metadata?.ownerId === req.user._id, 'Record a video of the fuel being filled');
  need(String(file.metadata?.contentType).startsWith('video/'), 'The proof has to be a video');
  need(!(await FuelTopUp.exists({ video: `/api/files/${name}` })), 'This video was already used for another top-up');
  return `/api/files/${name}`;
}

router.get('/fuel', read(async (req) => {
  const list = await FuelTopUp.find({ riderId: req.user._id }).sort({ at: -1 }).limit(100).lean();
  const month = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const thisMonth = list.filter((f) => f.at >= month && f.status !== 'rejected');
  return {
    topUps: list.map((f) => fuelView(req, f)),
    month: { amount: thisMonth.reduce((s, f) => s + f.amount, 0), litres: Math.round(thisMonth.reduce((s, f) => s + f.litres, 0) * 100) / 100, count: thisMonth.length },
  };
}));

router.post('/fuel', write(async (req) => {
  const amount = num(req.body.amount);
  need(Number.isFinite(amount) && amount > 0 && amount <= 20000, 'Enter the fuel amount in rupees');
  const litres = num(req.body.litres);
  need(Number.isFinite(litres) && litres > 0 && litres <= 500, 'Enter how many litres were filled');
  const odometer = req.body.odometerKm == null || req.body.odometerKm === '' ? null : num(req.body.odometerKm);
  need(odometer === null || (Number.isFinite(odometer) && odometer >= 0 && odometer < 10_000_000), 'Enter a valid odometer reading');
  const video = await ownVideo(req, req.body.video);
  const [row] = await FuelTopUp.create([{
    _id: newId('FU'), riderId: req.user._id, riderName: req.user.name ?? '', vehicleNumber: req.user.vehicleNumber ?? '',
    amount: Math.round(amount * 100) / 100, litres: Math.round(litres * 100) / 100, odometerKm: odometer, pump: str(req.body.pump, 120), video, note: str(req.body.note, 300), at: new Date(),
  }], {});
  await notifyAdmin('rider', 'Fuel top-up', `${req.user.name} filled ₹${row.amount} (${row.litres} L). Check the video and approve it.`, '/riders/fuel');
  await logActivity(`Fuel top-up by ${req.user.name}: ₹${row.amount}`, 'orange');
  return fuelView(req, row.toObject());
}));

export default router;
