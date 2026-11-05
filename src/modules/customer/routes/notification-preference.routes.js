import { Router } from 'express';
import { Customer } from '../../../models/index.js';
import { read, str, write } from '../../../utils/http.js';

const router = Router();

router.get('/notification-prefs', read((req) => req.user.notificationPrefs ?? {}));

router.put('/notification-prefs', write(async (req) => {
  const prefs = {};
  for (const [key, value] of Object.entries(req.body && typeof req.body === 'object' ? req.body : {})) prefs[str(key, 60).replaceAll('.', '').replaceAll('$', '')] = value === true;
  await Customer.updateOne({ _id: req.user._id }, { notificationPrefs: prefs });
}));

export default router;
