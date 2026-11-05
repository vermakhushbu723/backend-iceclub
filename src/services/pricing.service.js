import { Price } from '../models/index.js';
import { setting } from './settings.service.js';

export const slabPrice = (product, qty) => {
  let price = product.slabs[0].price;
  for (const slab of product.slabs) if (qty >= slab.minQty) price = slab.price;
  return price;
};

/** Location price, then dealer price, then the dealer's tier applied to the volume prices. */
export async function dealerRate(dealer, product, qty, addressId) {
  if (addressId) {
    const atLocation = await Price.findOne({ scope: 'location', key: addressId, productId: product._id }).lean();
    if (atLocation) return atLocation.price;
  }
  const forDealer = await Price.findOne({ scope: 'dealer', key: dealer._id, productId: product._id }).lean();
  if (forDealer) return forDealer.price;
  const slab = slabPrice(product, qty);
  if (product.returnable) return slab;
  const rates = await setting('tierRates');
  return Math.round(slab * (rates[dealer.tier] ?? 1));
}
