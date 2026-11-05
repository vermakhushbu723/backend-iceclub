import { round2 } from '../../utils/http.js';
import { assetPath, fileUrl } from '../../utils/urls.js';

export const customerAccount = (c) => ({ phone: c.phone, name: c.name ?? '', email: c.email ?? '', referralCode: c.referralCode ?? '' });

export const customerAddress = (a) => ({ id: a.id, label: a.label, name: a.contactName ?? '', phone: a.phone ?? '', line: a.line, landmark: a.landmark ?? '', city: a.city, pincode: a.pincode, latitude: a.lat ?? 0, longitude: a.lng ?? 0, isDefault: a.isDefault ?? false });

export const customerProduct = (p, available) => ({
  id: p._id,
  name: p.name,
  categoryId: p.categoryId,
  description: p.description,
  image: assetPath(p.image),
  pack: p.pack,
  weightKg: p.packKg,
  price: p.retailPrice,
  mrp: p.mrp || p.retailPrice,
  rating: p.rating,
  uses: p.uses,
  warning: p.warning,
  forDrinks: p.forDrinks,
  bestseller: p.bestseller,
  inStock: available > 0,
  subscribable: p.subscribable,
});

const CUSTOMER_STATUS = { placed: 'placed', accepted: 'confirmed', processing: 'confirmed', readyForDispatch: 'packed', outForDelivery: 'outForDelivery', delivered: 'delivered', failed: 'failed', cancelled: 'cancelled' };

export function customerOrder(o, rider) {
  const steps = {};
  for (const e of o.events) {
    const step = CUSTOMER_STATUS[e.status];
    // A retried delivery walks these steps again, so the latest time wins.
    steps[step] = e.at;
  }
  const cancelled = o.status === 'cancelled';
  return {
    id: o._id,
    number: o.number,
    lines: o.lines.map((l) => ({ productId: l.productId, name: l.name, pack: l.pack, image: assetPath(l.image), qty: l.qty, price: l.rate })),
    subtotal: o.itemTotal,
    discount: o.discount ?? 0,
    deliveryFee: o.deliveryFee,
    expressFee: o.expressFee ?? 0,
    tip: o.tip ?? 0,
    walletUsed: o.walletUsed ?? 0,
    total: round2(o.total - (o.walletUsed ?? 0)),
    paymentMethod: o.paymentDetail || 'cod',
    addressLabel: o.address.label,
    addressText: [o.address.line, o.address.landmark, `${o.address.city} - ${o.address.pincode}`].filter(Boolean).join(', '),
    receiverName: o.address.contactName ?? '',
    receiverPhone: o.address.phone ?? '',
    latitude: o.address.lat ?? 0,
    longitude: o.address.lng ?? 0,
    deliveryDate: o.deliveryDate,
    slot: o.slot,
    placedAt: o.placedAt,
    otp: o.otp,
    couponCode: o.couponCode,
    instructions: o.notes ?? '',
    cancelledAt: cancelled ? o.events.at(-1).at : null,
    cancelReason: o.cancelReason || null,
    deliveryRating: o.rating,
    productRating: o.productRating,
    reviewText: o.review,
    status: CUSTOMER_STATUS[o.status],
    steps,
    canCancel: ['placed', 'accepted', 'processing', 'readyForDispatch'].includes(o.status) && !o.pickup,
    rider: rider ? { name: rider.name, phone: rider.phone, vehicle: rider.vehicleNumber ?? '' } : null,
  };
}

export const customerIssue = (req, c) => ({
  id: c._id,
  number: c.number,
  orderId: c.orderId,
  orderNumber: c.orderNumber,
  type: c.type,
  details: c.description,
  photos: (c.photos ?? []).map((p) => fileUrl(req, p.url)),
  at: c.submittedAt,
  status: c.status,
  remark: c.remark ?? '',
  creditAmount: c.creditAmount ?? 0,
});

export const customerNotification = (n) => ({ id: n._id, title: n.title, body: n.body, at: n.at, read: n.read, orderId: n.orderId, offerCode: n.offerCode });

export const customerTicket = (t) => ({
  id: t._id,
  subject: t.subject,
  category: t.category,
  messages: t.messages.map((m) => ({ text: m.text, fromCustomer: m.fromOwner, at: m.at })),
  closed: t.status === 'resolved',
});
