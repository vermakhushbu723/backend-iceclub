import { Router } from 'express';
import { requireRole } from '../../middleware/auth.js';
import { notificationRoutes } from '../shared/notification.routes.js';
import { ticketRoutes } from '../shared/ticket.routes.js';
import accountRoutes from './routes/account.routes.js';
import orderRoutes from './routes/order.routes.js';
import attendanceRoutes from './routes/attendance.routes.js';
import earningsRoutes from './routes/earnings.routes.js';
import collectionRoutes from './routes/collection.routes.js';
import returnRoutes from './routes/return.routes.js';
import trackingRoutes from './routes/tracking.routes.js';
import factoryRoutes from './routes/factory.routes.js';

/** Everything the Rider App calls. Each feature has its own file in ./routes. */
export const rider = Router();

rider.use(requireRole('rider'));
rider.use(accountRoutes);
rider.use(orderRoutes);
rider.use(attendanceRoutes);
rider.use(earningsRoutes);
rider.use(collectionRoutes);
rider.use(returnRoutes);
rider.use(trackingRoutes);
rider.use(factoryRoutes);
notificationRoutes(rider, 'rider');
ticketRoutes(rider, 'rider');
