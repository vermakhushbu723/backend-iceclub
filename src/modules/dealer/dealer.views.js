import { appAddress } from '../shared/shared.views.js';
import { geoOut } from '../../utils/http.js';
import { assetPath, fileUrl } from '../../utils/urls.js';

export const dealerAccount = (d) => ({
  id: d._id,
  phone: d.phone,
  ownerName: d.ownerName ?? '',
  businessName: d.businessName ?? '',
  businessType: d.businessType ?? '',
  email: d.email ?? '',
  gstin: d.gstin ?? '',
  pan: d.pan ?? '',
  fssai: d.fssai ?? '',
  addressLine: d.addressLine ?? '',
  city: d.city ?? '',
  pincode: d.pincode ?? '',
  documents: d.documents ?? {},
  kycStatus: d.kycStatus,
  rejectionReason: d.rejectionReason ?? '',
  tier: d.tier,
  creditLimit: d.creditLimit ?? 0,
  creditDays: d.creditDays ?? 0,
  joinedOn: d.joinedOn ?? null,
  active: d.active,
});

export const dealerProduct = (p, available, slabs, standardPrice) => ({
  id: p._id,
  name: p.name,
  categoryId: p.categoryId,
  description: p.description,
  image: assetPath(p.image),
  unit: p.unit,
  packSize: p.pack,
  slabs,
  minOrderQty: p.minOrder,
  stepQty: p.step,
  gstPercent: p.gst,
  availableQty: available,
  uses: p.uses,
  usageWarning: p.warning,
  isReturnable: p.returnable,
  hsnCode: p.hsn,
  standardPrice,
});

const DEALER_METHOD = { credit: 'credit', online: 'online', cod: 'cashOnDelivery' };

export function dealerOrder(o, rider) {
  return {
    id: o._id,
    number: o.number,
    lines: o.lines.map((l) => ({ productId: l.productId, name: l.name, packSize: l.pack, image: assetPath(l.image), unit: l.unit, quantity: l.qty, unitPrice: l.rate, gstPercent: l.gst, isReturnable: l.returnable ?? false, hsnCode: l.hsn ?? '' })),
    subtotal: o.subtotal,
    discount: o.discount ?? 0,
    gst: o.gst,
    deliveryFee: o.deliveryFee,
    total: o.total,
    address: appAddress(o.address),
    deliveryDate: o.deliveryDate,
    slot: o.slot,
    paymentMethod: DEALER_METHOD[o.paymentMethod],
    paymentStatus: o.paymentStatus,
    events: o.events,
    deliveryOtp: o.otp,
    couponCode: o.couponCode,
    notes: o.notes ?? '',
    driver: rider ? { name: rider.name, phone: rider.phone, vehicle: rider.vehicleNumber ?? '' } : null,
    cancelReason: o.cancelReason || null,
    rating: o.rating,
    review: o.review,
    standingOrderId: o.standingOrderId,
  };
}

export const dealerComplaint = (req, c) => ({
  id: c._id,
  number: c.number,
  orderId: c.orderId,
  orderNumber: c.orderNumber,
  type: c.type,
  affectedQuantity: c.qty,
  description: c.description,
  photos: (c.photos ?? []).map((p) => ({ path: fileUrl(req, p.url), takenAt: p.takenAt, uploadedAt: p.serverAt, serverTimestamp: p.serverAt })),
  submittedAt: c.submittedAt,
  location: c.location ? geoOut(c.location) : { latitude: 0, longitude: 0, accuracyMetres: null },
  status: c.status,
  adminRemark: c.remark || null,
  decidedAt: c.decidedAt,
});
