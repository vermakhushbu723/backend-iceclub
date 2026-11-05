import { Router } from 'express';
import { requireRole } from '../../middleware/auth.js';
import actionRoutes from './routes/action.routes.js';
import bootstrapRoutes from './routes/bootstrap.routes.js';

/** Everything the admin panel calls. Staff roles are checked on each action. */
export const admin = Router();

admin.use(requireRole('admin'));
admin.use(bootstrapRoutes);
admin.use(actionRoutes);
