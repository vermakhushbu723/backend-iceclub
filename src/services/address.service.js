import { need, newId, str } from '../utils/http.js';

const DEFAULT_POINT = { lat: 19.076, lng: 72.8777 };

/** Reads an address from a client. Keeps the saved map point when the client doesn't send one. */
export function addressFrom(body, existing) {
  const line = str(body.line);
  const city = str(body.city, 80);
  const pincode = str(body.pincode, 6);
  need(line, 'Enter the address');
  need(city, 'Enter the city');
  need(/^[1-9]\d{5}$/.test(pincode), 'Enter a valid 6-digit PIN code');
  const lat = Number(body.latitude ?? body.lat);
  const lng = Number(body.longitude ?? body.lng);
  const hasPoint = lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 && (lat !== 0 || lng !== 0);
  return {
    id: str(body.id, 60) || newId('A'),
    label: str(body.label, 40) || 'Address',
    contactName: str(body.contactName ?? body.name, 80),
    phone: str(body.phone, 13),
    line,
    landmark: str(body.landmark, 120),
    city,
    pincode,
    instructions: str(body.instructions, 300),
    isDefault: body.isDefault === true,
    lat: hasPoint ? lat : (existing?.lat ?? DEFAULT_POINT.lat),
    lng: hasPoint ? lng : (existing?.lng ?? DEFAULT_POINT.lng),
  };
}

/** Saves one address into a person's list. The first address, or one marked default, becomes the default. */
export function upsertAddress(list, incoming) {
  const existing = list.find((a) => a.id === incoming.id);
  const saved = addressFrom(incoming, existing);
  if (list.length === 0 || (list.length === 1 && existing)) saved.isDefault = true;
  const next = existing ? list.map((a) => (a.id === saved.id ? saved : a)) : [...list, saved];
  return saved.isDefault ? next.map((a) => ({ ...a, isDefault: a.id === saved.id })) : next;
}

export function removeAddress(list, id) {
  need(list.length > 1, 'Keep at least one delivery address');
  const removed = list.find((a) => a.id === id);
  need(removed, 'Address not found', 404);
  const next = list.filter((a) => a.id !== id);
  if (removed.isDefault) next[0] = { ...next[0], isDefault: true };
  return next;
}

export const setDefaultAddress = (list, id) => {
  need(list.some((a) => a.id === id), 'Address not found', 404);
  return list.map((a) => ({ ...a, isDefault: a.id === id }));
};
