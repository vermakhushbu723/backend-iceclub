import { Wallet } from '../models/index.js';
import { newId, round2 } from '../utils/http.js';

export async function walletBalance(customerId) {
  const [row] = await Wallet.aggregate([{ $match: { customerId } }, { $group: { _id: null, total: { $sum: '$amount' } } }]);
  return round2(row?.total ?? 0);
}

export const addWallet = (customerId, walletAmount, title) => Wallet.create([{ _id: newId('W'), customerId, amount: round2(walletAmount), title, at: new Date() }], {});
