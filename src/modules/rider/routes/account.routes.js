import { fileUrl } from '../../../utils/urls.js';
import { Router } from 'express';
import { Rider } from '../../../models/index.js';
import { openSession } from '../rider.helpers.js';
import { riderAccount } from '../rider.views.js';
import { changePassword } from '../../../services/password.service.js';
import { bool, need, photoPath, read, str, write } from '../../../utils/http.js';

const router = Router();

router.get('/me', read((req) => riderAccount(req.user)));

router.post('/me/password', write((req) => changePassword('rider', req.user, req.body.current, req.body.next)));

router.put('/me/duty', write(async (req) => {
  const on = bool(req.body.onDuty);
  await Rider.updateOne({ _id: req.user._id }, { onDuty: on });
  await openSession(req.user._id, on);
  return riderAccount({ ...req.user, onDuty: on });
}));

const documentsOut = (req, documents) => Object.fromEntries(Object.entries(documents ?? {}).map(([name, path]) => [name, fileUrl(req, path)]));

router.get('/me/documents', read((req) => documentsOut(req, req.user.documents)));

router.put('/me/documents/:name', write(async (req) => {
  const path = photoPath(req.body.path);
  need(path, 'Upload the document first');
  const documents = { ...(req.user.documents ?? {}), [str(req.params.name, 60).replaceAll('.', '').replaceAll('$', '')]: path };
  await Rider.updateOne({ _id: req.user._id }, { documents });
  return documentsOut(req, documents);
}));

export default router;
