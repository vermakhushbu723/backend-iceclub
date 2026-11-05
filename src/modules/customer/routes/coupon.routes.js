import { Router } from 'express';
import { Offer } from '../../../models/index.js';
import { read } from '../../../utils/http.js';

const router = Router();

const couponView = (c) => ({ code: c.code, title: c.title, description: c.description, minOrder: c.minOrder, flatOff: c.flatOff, percentOff: c.percent, maxOff: c.maxDiscount, freeDelivery: c.freeDelivery });

router.get('/coupons', read(async () => (await Offer.find({ audience: 'customer', active: true, validTill: { $gte: new Date() } }).lean()).map(couponView)));

export default router;
