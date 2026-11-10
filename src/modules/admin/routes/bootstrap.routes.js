import { Router } from 'express';
import { Activity, Announcement, Attendance, Collection, Complaint, Customer, Dealer, DeliveryRequest, Enquiry, Factory, FactoryPickup, FuelTopUp, Handover, IceBoxMovement, IceBoxPickup, Ledger, Move, Notification, Offer, Order, PaymentClaim, Product, Rider, SalaryPayment, Staff, Ticket } from '../../../models/index.js';
import { adminComplaint, adminProduct, customerRow, dealerRow, orderRows, priceTables, riderRow, ticketRow } from '../admin.views.js';
import { setting, slotNames } from '../../../services/settings.service.js';
import { availableStock } from '../../../services/stock.service.js';
import { docs, read } from '../../../utils/http.js';
import { fileUrl } from '../../../utils/urls.js';

const router = Router();

/* Everything the panel shows. */

router.get('/bootstrap', read(async (req) => {
  const staffList = req.user.role === 'Super Admin' ? await Staff.find({ deletedAt: null }).lean() : [];
  const [company, charges, customerCharges, slots, tierRates, riderPay, tables, products, factories, dealers, riders, customers, orders, ledger, collections, handovers, moves, attendance, complaints, activity, notifications, announcements, claims, tickets, requests, pickups, movements, offers, enquiries, salaries, factoryPickups, fuelTopUps] = await Promise.all([
    setting('company'), setting('charges'), setting('customerCharges'), setting('slots'), setting('tierRates'), setting('riderPay'), priceTables(),
    Product.find().lean(), Factory.find().lean(), Dealer.find({ deletedAt: null }).lean(), Rider.find({ deletedAt: null }).lean(), Customer.find({ deletedAt: null }).lean(),
    Order.find().sort({ placedAt: 1 }).lean(), Ledger.find().sort({ at: 1 }).lean(), Collection.find().lean(), Handover.find().lean(), Move.find().sort({ at: 1 }).lean(), Attendance.find().lean(), Complaint.find().lean(),
    Activity.find().sort({ at: -1 }).limit(200).lean(), Notification.find({ ownerType: 'admin' }).sort({ at: -1 }).limit(100).lean(), Announcement.find().sort({ at: -1 }).limit(100).lean(),
    PaymentClaim.find().sort({ at: -1 }).lean(), Ticket.find().lean(), DeliveryRequest.find().sort({ date: 1 }).lean(), IceBoxPickup.find().sort({ requestedAt: -1 }).lean(), IceBoxMovement.find().lean(), Offer.find().lean(), Enquiry.find().sort({ at: -1 }).lean(), SalaryPayment.find().lean(), FactoryPickup.find().sort({ date: -1 }).limit(500).lean(), FuelTopUp.find().sort({ at: -1 }).limit(1000).lean(),
  ]);
  return {
    company, charges, customerCharges, slots: slotNames(slots), tierRates, riderPay, ...tables,
    products: products.map(adminProduct),
    factories: docs(factories),
    dealers: dealers.map((d) => dealerRow(req, d)),
    riders: riders.map((r) => riderRow(req, r)),
    customers: await Promise.all(customers.map(customerRow)),
    orders: await orderRows(req, orders),
    ledger: docs(ledger),
    collections: docs(collections),
    handovers: docs(handovers),
    moves: docs(moves),
    attendance: docs(attendance),
    complaints: complaints.map((c) => adminComplaint(req, c)),
    activity: docs(activity),
    notifications: docs(notifications),
    announcements: docs(announcements),
    staff: docs(staffList),
    paymentClaims: docs(claims),
    tickets: tickets.map(ticketRow),
    deliveryRequests: docs(requests),
    factoryPickups: docs(factoryPickups),
    fuelTopUps: docs(fuelTopUps).map((f) => ({ ...f, video: fileUrl(req, f.video) })),
    boxPickups: docs(pickups),
    boxMovements: docs(movements),
    offers: docs(offers),
    enquiries: docs(enquiries),
    salaryPayments: docs(salaries),
    stock: await availableStock(),
    now: new Date(),
  };
}));

router.get('/me', read((req) => ({ id: req.user._id, name: req.user.name, email: req.user.email, role: req.user.role })));

export default router;
