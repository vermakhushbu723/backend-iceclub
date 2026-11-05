import { Router } from 'express';
import { Factory } from '../../../models/index.js';
import { notFound, read } from '../../../utils/http.js';

const router = Router();

router.get('/factory', read(async (req) => {
  const factory = await Factory.findById(req.user.factoryId).lean();
  if (!factory) throw notFound('Factory');
  return { name: factory.name, address: factory.address || factory.city, contactName: factory.manager, phone: factory.phone, loadingHours: factory.loadingHours, instructions: factory.instructions };
}));

export default router;
