import dayjs from 'dayjs';
import { Counter } from '../models/index.js';

export async function nextSeq(key) {
  const row = await Counter.findByIdAndUpdate(key, { $inc: { seq: 1 } }, { upsert: true, new: true }).lean();
  return row.seq;
}

export async function nextOrderNumber() {
  return `ICE-${dayjs().format('YYMMDD')}-${String(await nextSeq('order')).padStart(4, '0')}`;
}
