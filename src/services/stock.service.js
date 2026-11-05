import { Factory, Move } from '../models/index.js';
import { newId } from '../utils/http.js';

export async function stockOf(factoryId, productId) {
  const [row] = await Move.aggregate([{ $match: { factoryId, productId } }, { $group: { _id: null, qty: { $sum: '$qty' } } }]);
  return row?.qty ?? 0;
}

/** Stock of every product across all active factories. */
export async function availableStock() {
  const factories = await Factory.find({ active: true }).select('_id').lean();
  const rows = await Move.aggregate([{ $match: { factoryId: { $in: factories.map((f) => f._id) } } }, { $group: { _id: '$productId', qty: { $sum: '$qty' } } }]);
  return Object.fromEntries(rows.map((r) => [r._id, Math.max(0, r.qty)]));
}

/** Makes concurrent stock changes at one factory wait for each other. */
export const lockFactory = (factoryId) => Factory.updateOne({ _id: factoryId }, { $inc: { rev: 1 } });

export const addMove = (values) => Move.create([{ _id: newId('M'), at: new Date(), note: '', ...values }], {});
