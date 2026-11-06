import { photosOut } from '../shared/shared.views.js';
import { amountPerUnit } from '../../services/orders/order-lifecycle.service.js';
import { geoOut } from '../../utils/http.js';

export const riderAccount = (r) => ({ id: r._id, phone: r.phone, name: r.name, vehicleType: r.vehicleType ?? '', vehicleNumber: r.vehicleNumber ?? '', licenceNumber: r.licence ?? '', zone: r.zone ?? '', joinedOn: r.joinedOn, onDuty: r.onDuty ?? false });

const RIDER_PAYMENT = { credit: 'credit', online: 'prepaid', cod: 'cashOnDelivery' };

const recordOut = (req, r) =>
  r && {
    ...r,
    photos: photosOut(req, r.photos),
    location: r.location ? geoOut(r.location) : null,
  };

/** The rider's view never includes the buyer's OTP: entering it is the proof of delivery. */
export function riderOrder(req, o, buyer, attempt) {
  const rates = amountPerUnit(o);
  const a = attempt ?? o;
  const delivery = a.delivery ?? (attempt ? null : o.delivery);
  return {
    id: o._id,
    number: o.number,
    dealerName: (o.buyerType === 'customer' ? buyer?.name : buyer?.businessName) || 'Customer',
    dealerPhone: o.address.phone || buyer?.phone || '',
    address: `${o.address.line}, ${o.address.city} ${o.address.pincode}`,
    items: o.lines.map((l) => ({ id: l.productId, name: l.name, packSize: l.pack, unit: l.unit, quantity: l.qty, rate: rates[l.productId] })),
    deliveryDate: o.deliveryDate,
    slot: o.slot,
    payment: RIDER_PAYMENT[o.paymentMethod],
    deliveryOtp: '',
    otpRequired: o.buyerType === 'customer',
    events: a.riderEvents,
    notes: o.notes ?? '',
    pickup: recordOut(req, a.pickup),
    delivery: delivery && {
      delivered: delivery.delivered ?? {},
      receivedBy: delivery.receivedBy ?? '',
      photos: photosOut(req, delivery.photos),
      at: delivery.at,
      remark: delivery.remark ?? '',
      location: delivery.location ? geoOut(delivery.location) : null,
      collected: delivery.collected ?? 0,
      collectionMode: delivery.collectionMode ?? null,
      collectionReference: delivery.collectionReference ?? '',
    },
    failure: recordOut(req, a.failure),
  };
}

export const riderReturn = (req, c) => ({
  id: c._id,
  type: c.type === 'meltedBags' ? 'meltedIce' : c.type,
  orderId: c.orderId,
  orderNumber: c.orderNumber,
  dealerName: c.buyerName ?? '',
  quantity: c.qty,
  note: c.description,
  photos: photosOut(req, c.photos),
  at: c.submittedAt,
  location: c.location ? geoOut(c.location) : null,
});
