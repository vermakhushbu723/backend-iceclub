import { Router } from 'express';
import { Dealer } from '../../../models/index.js';
import { appAddress } from '../../shared/shared.views.js';
import { removeAddress, setDefaultAddress, upsertAddress } from '../../../services/address.service.js';
import { read, str, write } from '../../../utils/http.js';

const router = Router();

router.get('/addresses', read((req) => (req.user.addresses ?? []).map(appAddress)));

router.post('/addresses', write(async (req) => {
  const addresses = upsertAddress(req.user.addresses ?? [], req.body);
  await Dealer.updateOne({ _id: req.user._id }, { addresses });
  return addresses.map(appAddress);
}));

router.delete('/addresses/:id', write(async (req) => {
  await Dealer.updateOne({ _id: req.user._id }, { addresses: removeAddress(req.user.addresses ?? [], str(req.params.id, 60)) });
}));

router.post('/addresses/:id/default', write(async (req) => {
  await Dealer.updateOne({ _id: req.user._id }, { addresses: setDefaultAddress(req.user.addresses ?? [], str(req.params.id, 60)) });
}));

export default router;
