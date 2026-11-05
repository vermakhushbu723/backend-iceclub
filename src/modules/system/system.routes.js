import { Router } from 'express';
import { config } from '../../config/index.js';
import { runDailyJobs } from '../../services/jobs.service.js';
import { setting } from '../../services/settings.service.js';
import { ApiError } from '../../utils/http.js';

export const system = Router();

system.get('/health', (_req, res) => res.json({ ok: true, db: config.dbName, demoOtp: Boolean(config.demoOtp), demoPayments: config.demoPayments }));

system.get('/public/config', async (_req, res) => {
  const [company, charges] = await Promise.all([setting('company'), setting('charges')]);
  res.json({ name: company.name, phone: company.phone, whatsapp: company.whatsapp, serviceArea: company.serviceArea, charges });
});

system.post('/cron/daily', async (req, res) => {
  if (!config.cronSecret || req.get('x-cron-secret') !== config.cronSecret) throw new ApiError(401, 'Not allowed');
  res.json(await runDailyJobs());
});
