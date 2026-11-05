import dayjs from 'dayjs';
import { Factory, Rider } from '../models/index.js';

const KM_PER_MINUTE = 25 / 60;
const FRESH_MINUTES = 15;

function distanceKm(a, b) {
  const rad = (d) => (d * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

/** Where the order is now, for the buyer's map. The rider's position comes from the Rider App. */
export async function trackingOf(order) {
  const factory = await Factory.findById(order.factoryId).lean();
  const origin = { latitude: factory?.lat ?? 19.1197, longitude: factory?.lng ?? 72.8464 };
  const to = { lat: order.address.lat ?? 19.076, lng: order.address.lng ?? 72.8777 };
  const destination = { latitude: to.lat, longitude: to.lng };
  const out = order.status === 'outForDelivery';
  const rider = order.riderId ? await Rider.findById(order.riderId).lean() : null;
  const fix = rider?.lastLocation?.at && dayjs().diff(rider.lastLocation.at, 'minute') <= FRESH_MINUTES ? rider.lastLocation : null;
  const from = out && fix ? fix : { lat: origin.latitude, lng: origin.longitude };
  const started = order.events.findLast((e) => e.status === 'outForDelivery')?.at ?? new Date();
  const eta = dayjs(out && fix ? new Date() : started).add(distanceKm(from, to) / KM_PER_MINUTE, 'minute').toDate();
  return {
    origin,
    destination,
    rider: out && fix ? { latitude: fix.lat, longitude: fix.lng } : null,
    eta: out ? eta : null,
    updatedAt: out && fix ? fix.at : null,
    riderName: rider?.name ?? null,
    riderPhone: rider?.phone ?? null,
    vehicle: rider?.vehicleNumber ?? null,
  };
}
