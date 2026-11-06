import { Router } from 'express';
import { Offer } from '../../../models/index.js';
import { read } from '../../../utils/http.js';

const router = Router();

router.get('/offers', read(async (req) => {
  const offers = await Offer.find({ audience: 'dealer', code: '', active: true, validTill: { $gte: new Date() }, tier: { $in: ['', req.user.tier] } }).lean();
  return offers.map((o) => ({ kind: o.kind, code: o.code, title: o.title, description: o.description, percent: o.percent, maxDiscount: o.maxDiscount, minOrder: o.minOrder, validTill: o.validTill }));
}));

export default router;
