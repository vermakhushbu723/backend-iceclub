import { config } from '../config/index.js';
import { SETTING_DEFAULTS } from '../services/settings.service.js';
import bcrypt from 'bcryptjs';
import dayjs from 'dayjs';
import mongoose from 'mongoose';
import { closeDb, connectDb } from '../config/database.js';
import { Activity, Attendance, Collection, Complaint, Counter, Customer, Dealer, Factory, Handover, IceBoxMovement, Ledger, Move, Notification, Offer, Order, Price, Product, Review, Rider, Setting, Staff, Wallet } from '../models/index.js';
import { createSeed } from './sample/seed.js';
import { dayKey } from '../utils/dates.js';

/* Sample data for the demo: `npm run seed`. It stops if the database already has data, unless given --reset. */

const WARNING = 'For industrial use and chilling purposes only. Not for human consumption. Use tube ice in crushed form for drinks.';
const DRY_WARNING = 'Handle with insulated gloves and keep in a ventilated area. Do not touch with bare hands, eat it, or seal it in an airtight container.';

// Prices, packs and costs are placeholders until the business confirms them.
const PRODUCT_EXTRAS = {
  'tube-20': { categoryId: 'tube', name: 'Tube Ice', description: 'Tube ice in crushed form, the option for human consumption where crushed ice is needed.', image: 'CrushedBlockIce.png', minOrder: 2, step: 1, uses: ['Bars', 'Hotels', 'Catering'], forCustomers: true, retailPrice: 420, mrp: 480, rating: 4.6, forDrinks: true },
  'cube-5': { categoryId: 'cube', description: 'Purified water cube ice for parties, weddings, BBQs, corporate events and daily use.', image: 'CubeIce.png', minOrder: 5, step: 5, uses: ['Homes', 'Restaurants', 'Hotels', 'Cafes', 'Bars', 'Parties'], forCustomers: true, retailPrice: 149, mrp: 175, rating: 4.8, forDrinks: true, bestseller: true },
  'cube-20': { categoryId: 'cube', description: 'Purified water cube ice in a bulk bag for events and high-volume outlets.', image: 'CubeIce.png', minOrder: 2, step: 1, uses: ['Weddings', 'Catering', 'Corporate events'], forCustomers: true, retailPrice: 499, mrp: 560, rating: 4.7, forDrinks: true },
  'block-50': { categoryId: 'block', description: 'Large, slow-melting ice blocks for industrial chilling.', image: 'CrushedBlockIce.png', minOrder: 1, step: 1, uses: ['Industrial chilling', 'Fish transport'], warning: WARNING, forCustomers: true, retailPrice: 449, mrp: 500, rating: 4.5 },
  'slab-25': { categoryId: 'slab', description: 'Flat ice slabs for display counters and chilling.', image: 'CrushedBlockIce.png', minOrder: 2, step: 1, uses: ['Display counters', 'Chilling'], warning: WARNING, forCustomers: true, retailPrice: 279, mrp: 310, rating: 4.3 },
  'crushed-25': { categoryId: 'crushed', description: 'Crushed ice for seafood displays and chilling.', image: 'CrushedBlockIce.png', minOrder: 2, step: 1, uses: ['Seafood displays', 'Chilling'], warning: WARNING, forCustomers: true, retailPrice: 349, mrp: 400, rating: 4.3 },
  'dry-10': { categoryId: 'dry', description: 'For frozen food transport, medical storage, laboratories and special cooling.', image: 'DryIce.png', minOrder: 1, step: 1, uses: ['Frozen food transport', 'Medical storage', 'Laboratories'], warning: DRY_WARNING, subscribable: false },
};

const slab = (price) => [{ minQty: 1, price }];
const hsn = '22019010';
const EXTRA_PRODUCTS = [
  { _id: 'box-50', name: 'Ice Box', category: 'Ice Boxes', categoryId: 'box', description: 'A returnable insulated box. The deposit is held on your account until you return it.', image: 'IceBox.png', pack: '50 L box', packKg: 0, unit: 'box', slabs: slab(500), cost: 300, gst: 0, hsn: '39231090', returnable: true, uses: ['Delivery', 'Outdoor events', 'Commercial use'], forDealers: true, subscribable: false, lowStock: 5 },
  { _id: 'tube-2', name: 'Tube Ice', category: 'Tube Ice', categoryId: 'tube', description: 'Clear, hygienic tube ice for everyday drinks at home.', image: 'CubeIce.png', pack: '2 kg bag', packKg: 2, unit: 'bag', slabs: slab(59), cost: 25, hsn, forDealers: false, forCustomers: true, retailPrice: 59, mrp: 70, rating: 4.7, uses: ['Drinks', 'Home'], forDrinks: true, bestseller: true },
  { _id: 'tube-5', name: 'Tube Ice', category: 'Tube Ice', categoryId: 'tube', description: 'A bigger pack of tube ice for family get-togethers.', image: 'CubeIce.png', pack: '5 kg bag', packKg: 5, unit: 'bag', slabs: slab(129), cost: 55, hsn, forDealers: false, forCustomers: true, retailPrice: 129, mrp: 150, rating: 4.6, uses: ['Drinks', 'Get-togethers'], forDrinks: true, bestseller: true },
  { _id: 'cube-1', name: 'Cube Ice', category: 'Cube Ice', categoryId: 'cube', description: 'Slow-melting cubes for a small celebration at home.', image: 'CubeIce.png', pack: '1 kg bag', packKg: 1, unit: 'bag', slabs: slab(39), cost: 15, hsn, forDealers: false, forCustomers: true, retailPrice: 39, mrp: 45, rating: 4.8, uses: ['Drinks', 'Home'], forDrinks: true },
  { _id: 'crushed-5', name: 'Crushed Ice', category: 'Crushed Ice', categoryId: 'crushed', description: 'Crushed ice for seafood displays and chilling.', image: 'CrushedBlockIce.png', pack: '5 kg bag', packKg: 5, unit: 'bag', slabs: slab(99), cost: 40, hsn, forDealers: false, forCustomers: true, retailPrice: 99, mrp: 115, rating: 4.4, uses: ['Seafood displays', 'Chilling'], warning: WARNING },
  { _id: 'block-25', name: 'Block Ice', category: 'Block Ice', categoryId: 'block', description: 'A slow-melting block for long cooling.', image: 'CrushedBlockIce.png', pack: '25 kg block', packKg: 25, unit: 'block', slabs: slab(249), cost: 110, hsn, forDealers: false, forCustomers: true, retailPrice: 249, mrp: 280, rating: 4.5, uses: ['Long cooling', 'Transport'], warning: WARNING },
  { _id: 'dry-1', name: 'Dry Ice', category: 'Dry Ice', categoryId: 'dry', description: 'For fog effects and short-term frozen transport.', image: 'DryIce.png', pack: '1 kg pack', packKg: 1, unit: 'pack', slabs: slab(149), cost: 70, hsn, forDealers: false, forCustomers: true, retailPrice: 149, mrp: 170, rating: 4.6, uses: ['Fog effect', 'Frozen transport'], warning: DRY_WARNING, subscribable: false },
  { _id: 'dry-5', name: 'Dry Ice', category: 'Dry Ice', categoryId: 'dry', description: 'For frozen food transport and special cooling.', image: 'DryIce.png', pack: '5 kg pack', packKg: 5, unit: 'pack', slabs: slab(649), cost: 320, hsn, forDealers: false, forCustomers: true, retailPrice: 649, mrp: 720, rating: 4.5, uses: ['Frozen food transport', 'Special cooling'], warning: DRY_WARNING, subscribable: false },
  { _id: 'box-20', name: 'Insulated Ice Box', category: 'Ice Boxes', categoryId: 'box', description: 'Keeps ice frozen for hours at picnics and parties.', image: 'IceBox.png', pack: '20 litre box', packKg: 0, unit: 'box', slabs: slab(899), cost: 500, gst: 18, hsn: '39231090', forDealers: false, forCustomers: true, retailPrice: 899, mrp: 1100, rating: 4.4, uses: ['Picnics', 'Parties'], subscribable: false, lowStock: 5 },
];

const rename = ({ id, ...rest }) => ({ _id: id, ...rest });

const inAMonth = () => dayjs().add(60, 'day').toDate();
const offers = () => [
  { _id: 'OF3', audience: 'dealer', kind: 'scheme', code: '', title: 'Monthly volume scheme', description: "Buy 500 bags in a month and get a 2% credit note on that month's purchases.", validTill: inAMonth() },
  { _id: 'OF6', audience: 'customer', code: 'FIRST50', title: '₹50 off your order', description: 'On orders of ₹299 or more.', minOrder: 299, flatOff: 50, validTill: inAMonth() },
  { _id: 'OF7', audience: 'customer', code: 'COOL10', title: '10% off', description: 'Up to ₹100 off on orders of ₹199 or more.', minOrder: 199, percent: 10, maxDiscount: 100, validTill: inAMonth() },
  { _id: 'OF8', audience: 'customer', code: 'FREEDEL', title: 'Free delivery', description: 'On orders of ₹149 or more.', minOrder: 149, freeDelivery: true, validTill: inAMonth() },
  { _id: 'OF9', audience: 'customer', code: 'PARTY15', title: '15% off party orders', description: 'Up to ₹300 off on orders of ₹999 or more.', minOrder: 999, percent: 15, maxDiscount: 300, validTill: inAMonth() },
];

const RIDER_FLOW = { accepted: ['assigned'], processing: ['assigned', 'accepted'], readyForDispatch: ['assigned', 'accepted'], outForDelivery: ['assigned', 'accepted', 'pickedUp', 'outForDelivery'], delivered: ['assigned', 'accepted', 'pickedUp', 'outForDelivery', 'delivered'], placed: ['assigned'], cancelled: [] };

function orderDoc(o, dealersById, productsById) {
  const dealer = dealersById[o.dealerId];
  const address = dealer.addresses.find((a) => a.id === o.addressId);
  const payable = { credit: 'onCredit', online: 'paid', cod: o.status === 'delivered' ? 'paid' : 'pending' };
  const lastAt = o.events.at(-1).at;
  const riderEvents = o.riderId ? (RIDER_FLOW[o.status] ?? []).map((status) => ({ status, at: o.events.find((e) => e.status === status)?.at ?? lastAt })) : [];
  const fullQty = Object.fromEntries(o.lines.map((l) => [l.productId, l.qty]));
  const delivered = o.status === 'delivered';
  return {
    ...rename(o),
    buyerType: 'dealer',
    address,
    itemTotal: o.subtotal,
    discount: 0,
    lines: o.lines.map((l) => ({ ...l, image: productsById[l.productId]?.image ?? 'CubeIce.png', returnable: false })),
    paymentStatus: payable[o.paymentMethod],
    riderEvents,
    dispatched: ['outForDelivery', 'delivered'].includes(o.status) ? fullQty : null,
    pickup: ['outForDelivery', 'delivered'].includes(o.status) ? { loaded: fullQty, photos: [], at: lastAt, remark: '', location: null } : null,
    delivery: delivered ? { ...o.delivery, delivered: fullQty, photos: (o.delivery.photos ?? []).filter(Boolean).map((url) => ({ url, takenAt: o.delivery.at, serverAt: o.delivery.at })), remark: '', collected: 0, collectionMode: null, collectionReference: '' } : null,
  };
}

const PASSWORDS = { dealer: 'Demo@1234', rider: 'Rider@1234', admin: 'Admin@1234', customer: 'Customer@1234' };

export async function seed({ reset = false } = {}) {
  await connectDb();
  const { db } = mongoose.connection;
  need(db.databaseName.startsWith('iceclub'));
  const hasData = await Product.exists({});
  if (hasData && !reset) throw new Error(`Database "${db.databaseName}" already has data. Run with --reset to replace it.`);
  if (reset) {
    for (const { name } of await db.listCollections().toArray()) await db.collection(name).deleteMany({});
  }
  await Promise.all(Object.values(mongoose.models).map((model) => model.init().then(() => model.createCollection().catch(() => {}))));

  const now = dayjs();
  const s = createSeed(now);
  const hashes = Object.fromEntries(await Promise.all(Object.entries(PASSWORDS).map(async ([k, v]) => [k, await bcrypt.hash(v, 10)])));

  const products = [
    ...s.products.map((p) => ({ ...rename(p), name: p.id === 'tube-20' ? 'Tube Ice' : p.name, categoryId: p.category.split(' ')[0].toLowerCase(), forDealers: true, ...PRODUCT_EXTRAS[p.id], image: PRODUCT_EXTRAS[p.id].image })),
    ...EXTRA_PRODUCTS,
  ];
  const productsById = Object.fromEntries(products.map((p) => [p._id, p]));

  const dealersById = {};
  const dealers = s.dealers.map((d) => {
    const documents = Object.fromEntries(d.documents.map((name) => [name, '/images/IceBox.png']));
    const addresses = d.addresses.map((a, i) => ({ ...a, contactName: d.ownerName, phone: d.phone, isDefault: i === 0, instructions: '' }));
    const row = { ...rename(d), documents, addresses, addressLine: addresses[0].line, city: addresses[0].city, pincode: addresses[0].pincode, businessType: 'Distributor', passwordHash: d.id === 'D1' ? hashes.dealer : '' };
    dealersById[d.id] = row;
    return row;
  });

  const riders = s.riders.map((r, i) => ({ ...rename(r), phone: i === 0 ? '9000000001' : r.phone, passwordHash: i === 0 ? hashes.rider : '' }));

  const moves = s.moves.map(rename);
  // Stock for the products only sold here, and for the seed's own.
  for (const factory of s.factories) {
    for (const p of EXTRA_PRODUCTS) moves.push({ _id: `M-x-${factory.id}-${p._id}`, at: now.subtract(30, 'day').toDate(), factoryId: factory.id, productId: p._id, qty: 200, type: 'opening', ref: 'Opening stock', note: '' });
  }

  const customer = {
    _id: 'CU1',
    phone: '9876500000',
    name: 'Asha Rao',
    email: 'asha@example.com',
    referralCode: 'ICEASHA1',
    passwordHash: hashes.customer,
    joinedOn: now.subtract(40, 'day').toDate(),
    addresses: [{ id: 'CU1-A1', label: 'Home', contactName: 'Asha Rao', phone: '9876500000', line: '12 Sea View Apartments', landmark: 'Near the park', city: 'Mumbai', pincode: '400053', isDefault: true, lat: 19.1364, lng: 72.8296 }],
  };
  const customerOrder = (id, daysAgo, productId, qty) => {
    const product = productsById[productId];
    const placed = now.subtract(daysAgo, 'day');
    const at = placed.toDate();
    const itemTotal = product.retailPrice * qty;
    const deliveryFee = itemTotal >= 499 ? 0 : 49;
    const gst = Math.round(((itemTotal * 18) / 118) * 100) / 100;
    const qtyMap = { [productId]: qty };
    return {
      _id: id, number: `ICE-${placed.format('YYMMDD')}-C${id.slice(-3)}`, invoiceNumber: `INV-${placed.format('YYMMDD')}-C${id.slice(-3)}`, buyerType: 'customer', customerId: 'CU1', addressId: 'CU1-A1', address: customer.addresses[0],
      lines: [{ productId, name: product.name, pack: product.pack, unit: product.unit, image: product.image, hsn: product.hsn, qty, rate: product.retailPrice, gst: 18, returnable: false }],
      itemTotal, mrpTotal: product.mrp * qty, discount: 0, subtotal: itemTotal - gst, gst, deliveryFee, total: itemTotal + deliveryFee, paymentMethod: 'online', paymentDetail: 'upi', paymentStatus: 'paid', deliveryDate: at, slot: '9 AM - 12 PM', factoryId: 'F1', riderId: 'R1', otp: '4827', status: 'delivered', placedAt: at,
      events: ['placed', 'accepted', 'processing', 'readyForDispatch', 'outForDelivery', 'delivered'].map((status, i) => ({ status, at: placed.add(i * 15, 'minute').toDate() })),
      riderEvents: ['assigned', 'accepted', 'pickedUp', 'outForDelivery', 'delivered'].map((status, i) => ({ status, at: placed.add(i * 15, 'minute').toDate() })),
      dispatched: qtyMap, pickup: { loaded: qtyMap, photos: [], at, remark: '', location: null },
      delivery: { at: placed.add(75, 'minute').toDate(), otpConfirmed: true, receivedBy: 'Asha Rao', onTime: true, delivered: qtyMap, photos: [], remark: '', location: null, collected: 0, collectionMode: null, collectionReference: '' },
    };
  };

  await Promise.all([
    Setting.insertMany(Object.entries({ ...SETTING_DEFAULTS, company: s.company, charges: s.charges, tierRates: s.tierRates }).map(([_id, value]) => ({ _id, value }))),
    Counter.insertMany([{ _id: 'order', seq: s.orderSeq + 100 }, { _id: 'complaint', seq: s.complaints.length + 1 }]),
    Price.insertMany([
      ...Object.entries(s.dealerPrices).flatMap(([key, row]) => Object.entries(row).map(([productId, price]) => ({ _id: `PD-${key}-${productId}`, scope: 'dealer', key, productId, price }))),
      ...Object.entries(s.locationPrices).flatMap(([key, row]) => Object.entries(row).map(([productId, price]) => ({ _id: `PL-${key}-${productId}`, scope: 'location', key, productId, price }))),
    ]),
    Product.insertMany(products),
    Factory.insertMany(s.factories.map((f) => ({ ...rename(f), address: `Sample Industrial Estate, ${f.city}` }))),
    Dealer.insertMany(dealers),
    Rider.insertMany(riders),
    Customer.insertMany([customer]),
    Wallet.insertMany([{ _id: 'W1', customerId: 'CU1', amount: 100, title: 'Welcome bonus', at: now.subtract(40, 'day').toDate() }]),
    Order.insertMany([...s.orders.map((o) => orderDoc(o, dealersById, productsById)), customerOrder('O-C001', 2, 'tube-5', 3), customerOrder('O-C002', 8, 'cube-1', 4)]),
    Ledger.insertMany(s.ledger.map(rename)),
    Collection.insertMany(s.collections.map((c) => {
      const order = s.orders.find((o) => o.id === c.orderId);
      return { ...rename(c), orderNumber: order?.number ?? '', buyerName: dealersById[c.dealerId]?.businessName ?? '' };
    })),
    Handover.insertMany(s.handovers.map((h) => ({ ...rename(h), status: 'confirmed' }))),
    Move.insertMany(moves),
    Attendance.insertMany(uniqueAttendance(s.attendance)),
    Complaint.insertMany(s.complaints.map((c) => {
      const order = s.orders.find((o) => o.id === c.orderId);
      return { ...rename(c), orderNumber: order.number, buyerName: dealersById[c.dealerId].businessName };
    })),
    Activity.insertMany(s.activity.map(rename)),
    Notification.insertMany([
      ...s.notifications.map((n) => ({ ...rename(n), ownerType: 'admin', ownerId: null })),
      { _id: 'N-D1', ownerType: 'dealer', ownerId: 'D1', type: 'announcement', title: 'Welcome to ICECLUB', body: 'Order ice, track deliveries and manage your account from here.', at: now.toDate(), read: false, route: null },
      { _id: 'N-R1', ownerType: 'rider', ownerId: 'R1', type: 'announcement', title: 'Welcome to ICECLUB', body: 'Your deliveries will show up here.', at: now.toDate(), read: false, route: null },
      { _id: 'N-C1', ownerType: 'customer', ownerId: 'CU1', type: 'order', title: 'Order delivered', body: 'Your recent order was delivered. How was it?', at: now.subtract(2, 'day').toDate(), read: true, orderId: 'O-C001' },
      { _id: 'N-C2', ownerType: 'customer', ownerId: 'CU1', type: 'order', title: '10% off this weekend', body: 'Use COOL10 on orders of ₹199 or more.', at: now.subtract(6, 'hour').toDate(), read: false, offerCode: 'COOL10' },
    ]),
    Offer.insertMany(offers()),
    Review.insertMany(products.filter((p) => p.forCustomers).flatMap((p) => [
      { _id: `RV-${p._id}-1`, productId: p._id, author: 'Rohan M.', rating: 5, text: 'Delivered on time and well packed.', at: now.subtract(3, 'day').toDate() },
      { _id: `RV-${p._id}-2`, productId: p._id, author: 'Sneha K.', rating: 4, text: 'Good quality. Delivery was a little late once.', at: now.subtract(12, 'day').toDate() },
    ])),
    IceBoxMovement.insertMany([{ _id: 'IB1', dealerId: 'D1', type: 'issued', quantity: 6, date: now.subtract(60, 'day').toDate(), reference: 'Sample delivery' }, { _id: 'IB2', dealerId: 'D1', type: 'returned', quantity: 2, date: now.subtract(20, 'day').toDate(), reference: 'Pickup' }]),
    Staff.insertMany(s.staff.map((p) => ({ ...rename(p), passwordHash: hashes.admin }))),
  ]);
  return { orders: s.orders.length + 2, products: products.length, today: dayKey() };
}

function uniqueAttendance(rows) {
  const seen = new Set();
  const out = [];
  for (const row of rows) {
    const day = dayKey(row.checkIn);
    const key = `${row.riderId}:${day}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...rename(row), day, location: row.location ? { lat: row.location.lat, lng: row.location.lng } : null });
  }
  return out;
}

function need(ok) {
  if (!ok) throw new Error('Refusing to touch a database whose name does not start with "iceclub"');
}

if (process.argv[1]?.endsWith('run.js')) {
  seed({ reset: process.argv.includes('--reset') })
    .then((summary) => console.log(`Seeded "${config.dbName}":`, summary))
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    })
    .finally(closeDb);
}
