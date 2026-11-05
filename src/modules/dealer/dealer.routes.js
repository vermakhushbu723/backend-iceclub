import { Router } from 'express';
import { requireRole } from '../../middleware/auth.js';
import { notificationRoutes } from '../shared/notification.routes.js';
import { ticketRoutes } from '../shared/ticket.routes.js';
import accountRoutes from './routes/account.routes.js';
import catalogRoutes from './routes/catalog.routes.js';
import addressRoutes from './routes/address.routes.js';
import orderRoutes from './routes/order.routes.js';
import paymentRoutes from './routes/payment.routes.js';
import complaintRoutes from './routes/complaint.routes.js';
import standingOrderRoutes from './routes/standing-order.routes.js';
import iceBoxRoutes from './routes/ice-box.routes.js';
import offerRoutes from './routes/offer.routes.js';
import deliveryRequestRoutes from './routes/delivery-request.routes.js';

/** Everything the Dealer App calls. Each feature has its own file in ./routes. */
export const dealer = Router();

dealer.use(requireRole('dealer'));
dealer.use(accountRoutes);
dealer.use(catalogRoutes);
dealer.use(addressRoutes);
dealer.use(orderRoutes);
dealer.use(paymentRoutes);
dealer.use(complaintRoutes);
dealer.use(standingOrderRoutes);
dealer.use(iceBoxRoutes);
dealer.use(offerRoutes);
dealer.use(deliveryRequestRoutes);
notificationRoutes(dealer, 'dealer');
ticketRoutes(dealer, 'dealer');
