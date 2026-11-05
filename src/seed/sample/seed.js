import dayjs from 'dayjs';
import { billFor, dealerPrice } from './logic.js';

/* Sample data for the demo. Prices match the sample catalogue in the Dealer App. */

const ICE_HSN = '22019010';

const PRODUCTS = [
  { id: 'tube-20', name: 'Tube Ice', category: 'Tube Ice', pack: '20 kg bag', packKg: 20, unit: 'bag', slabs: [[1, 300], [10, 280], [25, 255]], cost: 190, image: '/images/CrushedBlockIce.png' },
  { id: 'cube-5', name: 'Cube Ice', category: 'Cube Ice', pack: '5 kg bag', packKg: 5, unit: 'bag', slabs: [[1, 90], [20, 82], [50, 75]], cost: 52, image: '/images/CubeIce.png' },
  { id: 'cube-20', name: 'Cube Ice', category: 'Cube Ice', pack: '20 kg bag', packKg: 20, unit: 'bag', slabs: [[1, 320], [10, 295], [25, 270]], cost: 200, image: '/images/CubeIce.png' },
  { id: 'block-50', name: 'Block Ice', category: 'Block Ice', pack: '50 kg block', packKg: 50, unit: 'block', slabs: [[1, 350], [10, 320], [20, 290]], cost: 210, image: '/images/CrushedBlockIce.png' },
  { id: 'slab-25', name: 'Slab Ice', category: 'Slab Ice', pack: '25 kg slab', packKg: 25, unit: 'slab', slabs: [[1, 190], [10, 175], [25, 160]], cost: 110, image: '/images/CrushedBlockIce.png' },
  { id: 'crushed-25', name: 'Crushed Ice', category: 'Crushed Ice', pack: '25 kg bag', packKg: 25, unit: 'bag', slabs: [[1, 220], [10, 200], [25, 180]], cost: 125, image: '/images/CrushedBlockIce.png' },
  { id: 'dry-10', name: 'Dry Ice', category: 'Dry Ice', pack: '10 kg pack', packKg: 10, unit: 'pack', slabs: [[1, 950], [5, 900], [10, 850]], cost: 620, image: '/images/DryIce.png' },
].map((p) => ({ ...p, slabs: p.slabs.map(([minQty, price]) => ({ minQty, price })), gst: 18, hsn: ICE_HSN, minOrder: 1, active: true, lowStock: 40, returnable: false }));

const DEALER_NAMES = [
  ['Shree Sai Traders', 'Ramesh Patil', 'Andheri East', 19.1136, 72.8697, 'Gold'],
  ['Om Ice Distributors', 'Suresh Yadav', 'Goregaon West', 19.1663, 72.8526, 'Gold'],
  ['Crystal Ice Mart', 'Neha Shah', 'Bandra West', 19.0596, 72.8295, 'Silver'],
  ['Rai Ice Suppliers', 'Amit Rai', 'Thane West', 19.2183, 72.9781, 'Silver'],
  ['Ice Club Retail', 'Priya Nair', 'Worli', 19.0176, 72.8162, 'Standard'],
  ['Sea Fresh Fish Market', 'Imran Shaikh', 'Versova', 19.1351, 72.8146, 'Standard'],
  ['Blue Bay Hotel', 'Kiran Desai', 'Juhu', 19.1075, 72.8263, 'Silver'],
  ['Metro Caterers', 'Vikas Jain', 'Vashi, Navi Mumbai', 19.0771, 72.9988, 'Standard'],
  ['Palghar Cold Store', 'Sunil More', 'Palghar', 19.6967, 72.7699, 'Standard'],
  ['City Bar and Lounge', 'Rohan Mehta', 'Lower Parel', 18.9984, 72.8301, 'Silver'],
];

const RIDER_NAMES = ['Rohit Sharma', 'Sanjay Kumar', 'Arif Khan', 'Manoj Pawar', 'Deepak Singh', 'Vijay Gawde', 'Nitin Bhosale', 'Rahul Tiwari'];

const SLOTS = ['6 AM - 9 AM', '9 AM - 12 PM', '12 PM - 3 PM', '3 PM - 6 PM', '6 PM - 9 PM'];

/** Repeatable random numbers, so the demo looks the same on every machine. */
function randomFrom(seed) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createSeed(now = dayjs()) {
  const random = randomFrom(20261103);
  const int = (min, max) => min + Math.floor(random() * (max - min + 1));
  const pick = (list) => list[int(0, list.length - 1)];
  const iso = (d) => d.toISOString();

  const charges = { minOrder: 1000, freeDeliveryAbove: 5000, deliveryFee: 250 };
  const company = {
    name: 'ICECLUB',
    tagline: 'Smart Ice Distribution',
    phone: '+917009090977',
    whatsapp: '917009090977',
    serviceArea: 'Mumbai, Thane, Navi Mumbai & Palghar',
    address: '',
    gstin: '',
    fssai: '',
    upiId: '',
    stateCode: '27',
  };

  const factories = [
    { id: 'F1', name: 'Andheri Factory (sample)', city: 'Mumbai', manager: 'Loading Supervisor', phone: company.phone, capacityKg: 30000, lat: 19.1197, lng: 72.8464, active: true },
    { id: 'F2', name: 'Thane Factory (sample)', city: 'Thane', manager: 'Plant Manager', phone: company.phone, capacityKg: 20000, lat: 19.2, lng: 72.9636, active: true },
  ];

  const dealers = DEALER_NAMES.map(([businessName, ownerName, area, lat, lng, tier], i) => {
    const id = `D${i + 1}`;
    return {
      id,
      code: `ICD-${String(101 + i)}`,
      businessName,
      ownerName,
      phone: `98765432${String(10 + i)}`,
      email: '',
      gstin: `27AAAAA00${String(10 + i)}A1Z5`,
      pan: `AAAAA00${String(10 + i)}A`,
      fssai: `115000000000${String(10 + i)}`,
      tier,
      kycStatus: 'approved',
      rejectionReason: '',
      documents: ['GST certificate', 'PAN card', 'FSSAI licence', 'Shop or trade licence'],
      creditLimit: tier === 'Gold' ? 200000 : tier === 'Silver' ? 100000 : 50000,
      creditDays: tier === 'Gold' ? 30 : 15,
      joinedOn: iso(now.subtract(int(100, 300), 'day')),
      active: true,
      addresses: [{ id: `${id}-A1`, label: 'Main shop', line: `Sample Road, ${area}`, city: area, pincode: '4000' + String(10 + i), lat, lng }],
    };
  });
  dealers[0].addresses.push({ id: 'D1-A2', label: 'Second outlet', line: 'Sample Market, Powai', city: 'Powai', pincode: '400076', lat: 19.1176, lng: 72.906 });
  dealers.push(
    { ...dealers[4], id: 'D11', code: 'ICD-111', businessName: 'New Star Traders', ownerName: 'Harish Gupta', phone: '9876500111', gstin: '27AAAAA0111A1Z5', pan: 'AAAAA0111A', fssai: '11500000000111', tier: 'Standard', kycStatus: 'pending', creditLimit: 0, creditDays: 15, joinedOn: iso(now.subtract(1, 'day')), addresses: [{ id: 'D11-A1', label: 'Main shop', line: 'Sample Road, Dadar', city: 'Dadar', pincode: '400014', lat: 19.0178, lng: 72.8478 }] },
    { ...dealers[4], id: 'D12', code: 'ICD-112', businessName: 'Coastal Ice Point', ownerName: 'Farhan Ali', phone: '9876500112', gstin: '27AAAAA0112A1Z5', pan: 'AAAAA0112A', fssai: '11500000000112', tier: 'Standard', kycStatus: 'pending', creditLimit: 0, creditDays: 15, joinedOn: iso(now.subtract(2, 'day')), addresses: [{ id: 'D12-A1', label: 'Main shop', line: 'Sample Road, Malad', city: 'Malad', pincode: '400064', lat: 19.1874, lng: 72.8484 }] },
    { ...dealers[4], id: 'D13', code: 'ICD-113', businessName: 'Rejected Sample Store', ownerName: 'Test Owner', phone: '9876500113', gstin: '27AAAAA0113A1Z5', pan: 'AAAAA0113A', fssai: '11500000000113', tier: 'Standard', kycStatus: 'rejected', rejectionReason: 'GST certificate is not readable.', creditLimit: 0, creditDays: 15, joinedOn: iso(now.subtract(9, 'day')), addresses: [{ id: 'D13-A1', label: 'Main shop', line: 'Sample Road, Kurla', city: 'Kurla', pincode: '400070', lat: 19.0728, lng: 72.8826 }] },
  );

  const riders = RIDER_NAMES.map((name, i) => ({
    id: `R${i + 1}`,
    name,
    phone: `90000000${String(10 + i)}`,
    vehicleType: i % 3 === 0 ? 'Pickup truck' : 'Three-wheeler',
    vehicleNumber: `MH 0${(i % 4) + 1} AB ${1234 + i}`,
    licence: `MH02202000000${String(10 + i)}`,
    zone: dealers[i].addresses[0].city,
    factoryId: i % 2 === 0 ? 'F1' : 'F2',
    active: true,
    onDuty: i < 6,
    salary: 18000,
    joinedOn: iso(now.subtract(int(100, 400), 'day')),
  }));

  const state = { products: PRODUCTS, dealers, tierRates: { Standard: 1, Silver: 0.97, Gold: 0.95 }, dealerPrices: { D1: { 'tube-20': 262 } }, locationPrices: { 'D1-A2': { 'tube-20': 270 } } };

  const orders = [];
  const ledger = [];
  const collections = [];
  const handovers = [];
  const moves = [];
  const activity = [];
  const attendance = [];
  let seq = 0;
  let tripsToday = 0;
  const TRIP_STARTS = [12, 28, 6, 52, 20];

  const approved = dealers.filter((d) => d.kycStatus === 'approved');

  // Opening stock 91 days ago, then daily production that keeps pace with sales.
  const start = now.subtract(91, 'day').startOf('day');
  for (const f of factories) {
    for (const p of PRODUCTS) {
      moves.push({ id: `M-o-${f.id}-${p.id}`, at: iso(start), factoryId: f.id, productId: p.id, qty: 400, type: 'opening', ref: 'Opening stock', note: '' });
    }
  }

  const addOrder = (daysAgo, status) => {
    const dealer = pick(approved);
    const address = pick(dealer.addresses);
    const planned = now.subtract(daysAgo, 'day').startOf('day').add(int(7, Math.min(20, daysAgo === 0 ? Math.max(7, now.hour()) : 20)), 'hour').add(int(0, 59), 'minute');
    // An order can't have been placed later than now.
    const placed = planned.isAfter(now) ? now.subtract(int(30, 90), 'minute') : planned;
    const lines = Array.from({ length: int(1, 3) }, () => pick(PRODUCTS))
      .filter((p, i, all) => all.indexOf(p) === i)
      .map((p) => {
        const qty = int(5, 40);
        return { productId: p.id, name: p.name, pack: p.pack, unit: p.unit, hsn: p.hsn, qty, rate: dealerPrice(state, dealer, p, qty, address.id), gst: p.gst };
      });
    const bill = billFor(lines, charges);
    const payment = pick(['credit', 'credit', 'credit', 'cod', 'cod', 'online']);
    const factory = factories[int(0, 1)];
    const rider = riders.filter((r) => r.factoryId === factory.id)[int(0, 3)];
    seq += 1;
    const number = `ICE-${placed.format('YYMMDD')}-${String(seq).padStart(4, '0')}`;
    const order = {
      id: `O${seq}`,
      number,
      invoiceNumber: number.replace('ICE', 'INV'),
      dealerId: dealer.id,
      addressId: address.id,
      lines,
      ...bill,
      paymentMethod: payment,
      deliveryDate: iso(placed.add(daysAgo === 0 ? 0 : 1, 'day')),
      slot: pick(SLOTS),
      factoryId: factory.id,
      riderId: null,
      otp: String(int(1000, 9999)),
      status,
      placedAt: iso(placed),
      events: [{ status: 'placed', at: iso(placed) }],
      cancelReason: '',
      delivery: null,
    };
    const flow = ['accepted', 'processing', 'readyForDispatch', 'outForDelivery', 'delivered'];
    if (status === 'cancelled') {
      order.events.push({ status: 'cancelled', at: iso(placed.add(40, 'minute')) });
      order.cancelReason = pick(['Dealer changed the quantity', 'Ordered by mistake', 'Delivery time does not suit']);
    } else {
      const stop = flow.indexOf(status);
      let at = placed;
      for (let i = 0; i <= stop; i++) {
        at = at.add(int(10, 25), 'minute');
        if (daysAgo === 0 && at.isAfter(now)) at = now.subtract(stop - i + 1, 'minute');
        // Today's trips left at different times, so the map shows riders along the whole route.
        if (daysAgo === 0 && flow[i] === 'outForDelivery') {
          const left = now.subtract(TRIP_STARTS[tripsToday++ % TRIP_STARTS.length], 'minute');
          if (left.isAfter(at)) at = left;
        }
        order.events.push({ status: flow[i], at: iso(at) });
      }
      if (stop >= 2) order.riderId = rider.id;
      if (stop >= 3) {
        const dispatchedAt = order.events.find((e) => e.status === 'outForDelivery').at;
        for (const l of lines) {
          moves.push({ id: `M-d-${order.id}-${l.productId}`, at: dispatchedAt, factoryId: factory.id, productId: l.productId, qty: -l.qty, type: 'dispatch', ref: number, note: rider.name });
        }
      }
      if (status === 'delivered') {
        const at2 = order.events.at(-1).at;
        order.delivery = { at: at2, otpConfirmed: true, receivedBy: dealer.ownerName, onTime: random() > 0.12, photos: [lines[0] && PRODUCTS.find((p) => p.id === lines[0].productId).image], location: { lat: address.lat, lng: address.lng } };
        if (payment === 'cod') {
          collections.push({ id: `C${seq}`, riderId: rider.id, orderId: order.id, dealerId: dealer.id, amount: bill.total, mode: random() > 0.4 ? 'cash' : 'upi', at: at2, ref: '' });
        }
      }
    }
    if (payment === 'credit' && status !== 'cancelled') {
      ledger.push({ id: `L-i-${seq}`, dealerId: dealer.id, type: 'invoice', amount: bill.total, at: iso(placed), ref: order.invoiceNumber, note: 'Order on credit' });
    }
    orders.push(order);
    return order;
  };

  for (let day = 90; day >= 1; day--) {
    const count = int(5, 9);
    for (let i = 0; i < count; i++) addOrder(day, random() > 0.06 ? 'delivered' : 'cancelled');
  }
  const today = [...Array(3).fill('delivered'), ...Array(2).fill('placed'), ...Array(2).fill('accepted'), ...Array(2).fill('processing'), 'readyForDispatch', ...Array(5).fill('outForDelivery')];
  today.forEach((status) => addOrder(0, status));

  // Dealers pay older invoices, leaving a realistic balance and a little overdue.
  for (const dealer of approved) {
    const invoices = ledger.filter((e) => e.dealerId === dealer.id && e.type === 'invoice').sort((a, b) => a.at.localeCompare(b.at));
    let n = 0;
    for (const inv of invoices) {
      const age = now.diff(dayjs(inv.at), 'day');
      if (age > dealer.creditDays + 3 || (age > 6 && random() > 0.55)) {
        n += 1;
        ledger.push({ id: `L-p-${inv.id}`, dealerId: dealer.id, type: 'payment', amount: inv.amount, at: iso(dayjs(inv.at).add(int(3, Math.min(age, dealer.creditDays)), 'day')), ref: `UTR-S${dealer.id}${n}`, note: pick(['Bank transfer', 'UPI']) });
      }
    }
  }
  const overdueDealer = approved[3];
  ledger.push({ id: 'L-od', dealerId: overdueDealer.id, type: 'debit', amount: 24500, at: iso(now.subtract(40, 'day')), ref: 'OPENING-BAL', note: 'Opening balance (sample)' });

  // Production covers each day's dispatches and adds a little, so stock never goes negative.
  const dispatchedOn = {};
  for (const m of moves) {
    if (m.type !== 'dispatch') continue;
    const key = `${m.at.slice(0, 10)}-${m.factoryId}-${m.productId}`;
    dispatchedOn[key] = (dispatchedOn[key] ?? 0) - m.qty;
  }
  const dispatchKey = (at, f, p) => `${iso(at).slice(0, 10)}-${f.id}-${p.id}`;
  for (let day = 90; day >= 0; day--) {
    const at = now.subtract(day, 'day').startOf('day').add(day === 0 ? Math.min(now.hour(), 6) : 6, 'hour');
    for (const f of factories) {
      const share = f.id === 'F1' ? 0.6 : 0.4;
      for (const p of PRODUCTS) {
        const qty = int(10, 26) * (p.packKg >= 20 ? 1 : 2);
        moves.push({ id: `M-p-${day}-${f.id}-${p.id}`, at: iso(at), factoryId: f.id, productId: p.id, qty: Math.round(qty * (share + 0.5)) + (dispatchedOn[dispatchKey(at, f, p)] ?? 0), type: 'production', ref: `PR-${at.format('YYMMDD')}`, note: '' });
      }
    }
  }
  moves.push(
    { id: 'M-t-1o', at: iso(now.subtract(2, 'day')), factoryId: 'F1', productId: 'block-50', qty: -30, type: 'transferOut', ref: 'TR-1001', note: 'To Thane Factory (sample)' },
    { id: 'M-t-1i', at: iso(now.subtract(2, 'day')), factoryId: 'F2', productId: 'block-50', qty: 30, type: 'transferIn', ref: 'TR-1001', note: 'From Andheri Factory (sample)' },
  );

  // Dry ice loses weight in storage, so a write-off leaves it low enough to show the stock alert.
  for (const [factoryId, left] of [['F1', 14], ['F2', 9]]) {
    const held = moves.filter((m) => m.factoryId === factoryId && m.productId === 'dry-10').reduce((sum, m) => sum + m.qty, 0);
    moves.push({ id: `M-a-${factoryId}`, at: iso(now), factoryId, productId: 'dry-10', qty: left - held, type: 'adjust', ref: 'ADJ-1001', note: 'Storage loss write-off (sample)' });
  }

  // Attendance for the last 30 days, and riders' cash mostly handed over.
  for (const r of riders) {
    for (let day = 30; day >= 0; day--) {
      const date = now.subtract(day, 'day');
      if (date.day() === 0 || (day > 0 && random() < 0.08)) continue;
      if (day === 0 && !r.onDuty) continue;
      const checkIn = date.startOf('day').add(7, 'hour').add(int(0, 45), 'minute');
      if (checkIn.isAfter(now)) continue;
      attendance.push({ id: `A-${r.id}-${day}`, riderId: r.id, checkIn: iso(checkIn), checkOut: day === 0 ? null : iso(checkIn.add(int(8, 10), 'hour')), location: { lat: 19.1197, lng: 72.8464 } });
    }
    const cash = collections.filter((c) => c.riderId === r.id && c.mode === 'cash' && now.diff(dayjs(c.at), 'day') >= 1);
    const held = cash.reduce((sum, c) => sum + c.amount, 0);
    if (held) handovers.push({ id: `H-${r.id}`, riderId: r.id, amount: Math.round(held), at: iso(now.subtract(1, 'day').startOf('day').add(20, 'hour')), ref: `SLIP-${r.id}`, receivedBy: 'Cashier' });
  }

  const delivered = orders.filter((o) => o.status === 'delivered');
  const recent = delivered.slice(-30, -1);
  const complaints = [
    ['damagedBags', 'dealer', 3, 'Bags were torn on arrival.', 'underReview', 2],
    ['meltedBags', 'dealer', 2, 'Ice had melted during transport.', 'underReview', 5],
    ['shortQuantity', 'rider', 1, 'One bag short at loading.', 'underReview', 7],
    ['meltedBags', 'dealer', 2, 'Sample approved complaint.', 'approved', 11],
    ['shortQuantity', 'dealer', 1, 'Sample rejected complaint.', 'rejected', 15],
  ].map(([type, source, qty, description, status, idx], i) => {
    const order = recent[idx];
    const dealer = dealers.find((d) => d.id === order.dealerId);
    const address = dealer.addresses.find((a) => a.id === order.addressId);
    const at = dayjs(order.delivery.at).add(30, 'minute');
    return {
      id: `CM${i + 1}`,
      number: `CMP-${1001 + i}`,
      orderId: order.id,
      dealerId: order.dealerId,
      riderId: order.riderId,
      source,
      type,
      qty,
      description,
      photos: [{ url: '/images/CrushedBlockIce.png', takenAt: iso(at.subtract(5, 'minute')), serverAt: iso(at) }],
      submittedAt: iso(at),
      location: { lat: address.lat, lng: address.lng },
      status,
      remark: status === 'approved' ? 'Credit note issued.' : status === 'rejected' ? 'Delivery record shows the full quantity.' : '',
      decidedAt: status === 'underReview' ? null : iso(at.add(1, 'day')),
      creditAmount: status === 'approved' ? round(qty * order.lines[0].rate) : 0,
    };
  });

  const log = (at, text, color) => activity.push({ id: `AC${activity.length + 1}`, at, text, color });
  delivered.slice(-3).forEach((o) => log(o.delivery.at, `Order ${o.number} delivered`, 'green'));
  orders.filter((o) => o.status === 'placed').slice(-2).forEach((o) => log(o.placedAt, `New order from ${dealers.find((d) => d.id === o.dealerId).businessName}`, 'orange'));
  log(iso(now.subtract(50, 'minute')), 'Stock updated: Block Ice +20 blocks', 'green');

  const notifications = [
    { id: 'N1', type: 'kyc', title: 'New KYC application', body: 'New Star Traders is waiting for approval.', at: iso(now.subtract(1, 'day')), read: false, route: '/dealers/kyc' },
    { id: 'N2', type: 'complaint', title: 'Complaints to review', body: 'Three complaints are waiting for a decision.', at: iso(now.subtract(3, 'hour')), read: false, route: '/orders/returns' },
    { id: 'N3', type: 'order', title: 'New orders today', body: 'New orders are waiting to be accepted.', at: iso(now.subtract(1, 'hour')), read: false, route: '/orders/status/placed' },
  ];

  const staff = [
    { id: 'S1', name: 'Ashwin Rai', email: 'admin@iceclub.online', role: 'Super Admin', active: true },
    { id: 'S2', name: 'Accounts Team', email: 'accounts@iceclub.online', role: 'Accounts', active: true },
    { id: 'S3', name: 'Dispatch Team', email: 'dispatch@iceclub.online', role: 'Dispatch', active: true },
    { id: 'S4', name: 'Factory Team', email: 'factory@iceclub.online', role: 'Factory', active: false },
  ];

  return {
    company,
    charges,
    slots: SLOTS,
    tierRates: state.tierRates,
    dealerPrices: state.dealerPrices,
    locationPrices: state.locationPrices,
    products: PRODUCTS,
    factories,
    dealers,
    riders,
    orders,
    ledger,
    collections,
    handovers,
    moves,
    attendance,
    complaints,
    activity,
    notifications,
    announcements: [],
    staff,
    orderSeq: seq,
  };
}

const round = (v) => Math.round(v * 100) / 100;
