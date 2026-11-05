import dayjs from 'dayjs';

export const dayKey = (date = new Date()) => dayjs(date).format('YYYY-MM-DD');

/** Whether a delivery was on time: by the end of its slot, which lasts three hours. */
export function onTimeFor(order, deliveredAt, slots) {
  const start = slots.find(([label]) => label === order.slot)?.[1];
  if (start == null) return true;
  return !dayjs(deliveredAt).isAfter(dayjs(order.deliveryDate).startOf('day').add(start + 3, 'hour'));
}
