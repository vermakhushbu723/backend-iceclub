import { Customer, Dealer, DutySession } from '../../models/index.js';
import { newId } from '../../utils/http.js';

export const openSession = async (riderId, on) => {
  const open = await DutySession.findOne({ riderId, end: null }).lean();
  if (on && !open) await DutySession.create([{ _id: newId('DS'), riderId, start: new Date() }], {});
  if (!on && open) await DutySession.updateOne({ _id: open._id }, { end: new Date() });
};

export const buyersFor = async (orders) => {
  const dealers = await Dealer.find({ _id: { $in: orders.map((o) => o.dealerId).filter(Boolean) } }).select('businessName phone').lean();
  const customers = await Customer.find({ _id: { $in: orders.map((o) => o.customerId).filter(Boolean) } }).select('name phone').lean();
  return Object.fromEntries([...dealers, ...customers].map((b) => [b._id, b]));
};
