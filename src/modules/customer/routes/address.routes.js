import { Router } from 'express';
import { Customer } from '../../../models/index.js';
import { customerAddress } from '../customer.views.js';
import { removeAddress, setDefaultAddress, upsertAddress } from '../../../services/address.service.js';
import { read, str, write } from '../../../utils/http.js';

const router = Router();

router.get('/addresses', read((req) => (req.user.addresses ?? []).map(customerAddress)));

router.post('/addresses', write(async (req) => {
  const addresses = upsertAddress(req.user.addresses ?? [], req.body);
  await Customer.updateOne({ _id: req.user._id }, { addresses });
  return addresses.map(customerAddress);
}));

router.delete('/addresses/:id', write(async (req) => {
  const list = req.user.addresses ?? [];
  const id = str(req.params.id, 60);
  // A customer may remove their last address, unlike a dealer, whose account needs one.
  const addresses = list.length === 1 && list[0].id === id ? [] : removeAddress(list, id);
  await Customer.updateOne({ _id: req.user._id }, { addresses });
  return addresses.map(customerAddress);
}));

router.post('/addresses/:id/default', write(async (req) => {
  const addresses = setDefaultAddress(req.user.addresses ?? [], str(req.params.id, 60));
  await Customer.updateOne({ _id: req.user._id }, { addresses });
  return addresses.map(customerAddress);
}));

export default router;
