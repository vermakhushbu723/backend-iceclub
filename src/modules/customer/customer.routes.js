import { Router } from 'express';
import { requireRole } from '../../middleware/auth.js';
import { notificationRoutes } from '../shared/notification.routes.js';
import { ticketRoutes } from '../shared/ticket.routes.js';
import accountRoutes from './routes/account.routes.js';
import catalogRoutes from './routes/catalog.routes.js';
import addressRoutes from './routes/address.routes.js';
import couponRoutes from './routes/coupon.routes.js';
import orderRoutes from './routes/order.routes.js';
import issueRoutes from './routes/issue.routes.js';
import walletRoutes from './routes/wallet.routes.js';
import subscriptionRoutes from './routes/subscription.routes.js';
import enquiryRoutes from './routes/enquiry.routes.js';
import notificationPreferenceRoutes from './routes/notification-preference.routes.js';

/** Everything the Customer App calls. Each feature has its own file in ./routes. */
export const customer = Router();

customer.use(requireRole('customer'));
customer.use(accountRoutes);
customer.use(catalogRoutes);
customer.use(addressRoutes);
customer.use(couponRoutes);
customer.use(orderRoutes);
customer.use(issueRoutes);
customer.use(walletRoutes);
customer.use(subscriptionRoutes);
customer.use(enquiryRoutes);
customer.use(notificationPreferenceRoutes);
notificationRoutes(customer, 'customer');
ticketRoutes(customer, 'customer');
