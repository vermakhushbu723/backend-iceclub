/**
 * End-to-end test of every API, against a real server and a real `iceclub_test` database.
 * Run with: npm run test:api
 * It fails if any route or admin action was not called, so a new API can't go untested.
 */
process.env.ICECLUB_TEST = '1';

const { config } = await import('../src/config/index.js');
const { connectDb, closeDb } = await import('../src/config/database.js');
const { startServer } = await import('../src/app.js');
const { seed } = await import('../src/seed/run.js');
const { dealer: dealerRouter } = await import('../src/modules/dealer/dealer.routes.js');
const { rider: riderRouter } = await import('../src/modules/rider/rider.routes.js');
const { customer: customerRouter } = await import('../src/modules/customer/customer.routes.js');
const { admin: adminRouter } = await import('../src/modules/admin/admin.routes.js');
const { ACTION_NAMES } = await import('../src/modules/admin/actions/index.js');
const { auth: authRouter } = await import('../src/modules/auth/auth.routes.js');
const { files: filesRouter } = await import('../src/modules/files/file.routes.js');
const models = await import('../src/models/index.js');
const { default: mongoose } = await import('mongoose');
const { default: dayjs } = await import('dayjs');

if (config.dbName !== 'iceclub_test') throw new Error('Refusing to run outside the test database');

let passed = 0;
const failures = [];
const hits = new Set();
const actionHits = new Set();

function check(name, ok, detail = '') {
  if (ok) {
    passed += 1;
  } else {
    failures.push(`${name}${detail ? ` -> ${typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 300)}` : ''}`);
    console.log(`  FAIL ${name}`, detail ? JSON.stringify(detail).slice(0, 300) : '');
  }
}

const section = (title) => console.log(`\n== ${title}`);

await connectDb();
const dbsBefore = (await mongoose.connection.db.admin().listDatabases({ nameOnly: true })).databases.map((d) => d.name).filter((n) => n !== 'iceclub_test').sort();

console.log('Seeding iceclub_test...');
await seed({ reset: true });

const server = startServer(0);
await new Promise((resolve) => server.once('listening', resolve));
const BASE = `http://127.0.0.1:${server.address().port}/api`;

async function call(method, path, { token, body, headers, raw } = {}) {
  hits.add(`${method} ${path.split('?')[0]}`);
  const res = await fetch(BASE + path, {
    method,
    headers: { ...(body !== undefined && !raw ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined),
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: res.status, data, ok: res.ok, headers: res.headers };
}

const api = (token) => ({
  get: (p) => call('GET', p, { token }),
  post: (p, body = {}) => call('POST', p, { token, body }),
  put: (p, body = {}) => call('PUT', p, { token, body }),
  patch: (p, body = {}) => call('PATCH', p, { token, body }),
  del: (p) => call('DELETE', p, { token }),
});

const okIs = (name, res) => check(name, res.ok, `${res.status} ${JSON.stringify(res.data)}`);
const refused = (name, res, status, text) => check(name, res.status === status && (!text || String(res.data?.error).includes(text)), `${res.status} ${JSON.stringify(res.data)}`);

const tomorrow = dayjs().add(1, 'day').startOf('day').toISOString();
const SLOT = '9 AM - 12 PM';
const OPEN = (role) => `/auth/${role}`;

async function otpLogin(role, phone, extra = {}) {
  okIs(`${role}: send OTP`, await call('POST', `${OPEN(role)}/otp/send`, { body: { phone } }));
  const res = await call('POST', `${OPEN(role)}/otp/verify`, { body: { phone, otp: '123456', ...extra } });
  okIs(`${role}: verify OTP`, res);
  return res.data;
}

let adminToken;
const act = (name, ...args) => {
  actionHits.add(name);
  return call('POST', `/admin/actions/${name}`, { token: adminToken, body: { args } });
};
const stock = async (factoryId, productId) => {
  const rows = await models.Move.find({ factoryId, productId }).lean();
  return rows.reduce((sum, m) => sum + m.qty, 0);
};

try {
  /* ---- General safety ---- */
  section('General');
  check('idle connections stay open, so apps can reuse them', server.keepAliveTimeout >= 60000 && server.headersTimeout > server.keepAliveTimeout);
  const health = await call('GET', '/health');
  check('health', health.ok && health.data.db === 'iceclub_test', health.data);
  okIs('public config', await call('GET', '/public/config'));
  refused('unknown route is 404', await call('GET', '/nope'), 404);
  refused('protected route needs a token', await call('GET', '/dealer/me'), 401);
  refused('bad token is refused', await call('GET', '/dealer/me', { token: 'abc.def.ghi' }), 401);
  refused('invalid JSON is refused', await call('POST', '/auth/dealer/otp/send', { raw: '{bad', headers: { 'Content-Type': 'application/json' } }), 400);
  refused('query operators in a body are refused', await call('POST', '/auth/admin/login', { body: { email: { $ne: null }, password: { $ne: null } } }), 400);
  refused('cron needs its secret', await call('POST', '/cron/daily', {}), 401);

  /* ---- Admin login and roles ---- */
  section('Admin login and roles');
  refused('admin wrong password', await call('POST', '/auth/admin/login', { body: { email: 'admin@iceclub.online', password: 'wrong' } }), 401);
  const adminLogin = await call('POST', '/auth/admin/login', { body: { email: 'ADMIN@iceclub.online', password: 'Admin@1234' } });
  okIs('admin login', adminLogin);
  adminToken = adminLogin.data.token;
  const adminApi = api(adminToken);
  check('admin login gives no password', !JSON.stringify(adminLogin.data).includes('passwordHash'));
  check('admin me', (await adminApi.get('/admin/me')).data.role === 'Super Admin');
  const boot = await adminApi.get('/admin/bootstrap');
  okIs('bootstrap', boot);
  for (const key of ['company', 'charges', 'customerCharges', 'slots', 'tierRates', 'dealerPrices', 'locationPrices', 'products', 'factories', 'dealers', 'riders', 'customers', 'orders', 'ledger', 'collections', 'handovers', 'moves', 'attendance', 'complaints', 'activity', 'notifications', 'announcements', 'staff', 'paymentClaims', 'tickets', 'deliveryRequests', 'boxPickups', 'boxMovements', 'offers', 'enquiries', 'salaryPayments']) {
    check(`bootstrap has ${key}`, boot.data[key] != null);
  }
  const bootText = JSON.stringify(boot.data);
  check('bootstrap never includes password hashes', !bootText.includes('passwordHash') && !bootText.includes('$2a$') && !bootText.includes('$2b$'));
  check('bootstrap never includes delivery OTPs', !boot.data.orders.some((o) => 'otp' in o));
  refused('unknown admin action', await call('POST', '/admin/actions/constructor', { token: adminToken, body: { args: [] } }), 404);

  const accountsToken = (await call('POST', '/auth/admin/login', { body: { email: 'accounts@iceclub.online', password: 'Admin@1234' } })).data.token;
  refused('accounts role cannot dispatch', await call('POST', '/admin/actions/advanceOrder', { token: accountsToken, body: { args: ['x'] } }), 403);
  refused('accounts role cannot change staff', await call('POST', '/admin/actions/saveStaff', { token: accountsToken, body: { args: [{}] } }), 403);
  check('non-super roles do not receive staff list', (await api(accountsToken).get('/admin/bootstrap')).data.staff.length === 0);
  refused('inactive staff cannot sign in', await call('POST', '/auth/admin/login', { body: { email: 'factory@iceclub.online', password: 'Admin@1234' } }), 401);

  /* ---- Dealer account ---- */
  section('Dealer account and KYC');
  refused('dealer bad phone', await call('POST', `${OPEN('dealer')}/otp/send`, { body: { phone: '123' } }), 400);
  const newPhone = '9812300001';
  await call('POST', `${OPEN('dealer')}/otp/send`, { body: { phone: newPhone } });
  refused('wrong OTP', await call('POST', `${OPEN('dealer')}/otp/verify`, { body: { phone: newPhone, otp: '000000' } }), 400, 'Incorrect OTP');
  const fresh = await otpLogin('dealer', newPhone);
  refused('an OTP works only once', await call('POST', `${OPEN('dealer')}/otp/verify`, { body: { phone: newPhone, otp: '123456' } }), 400);
  check('new dealer has not submitted KYC', fresh.user.kycStatus === 'notSubmitted');
  const d = api(fresh.token);
  check('dealer me', (await d.get('/dealer/me')).data.phone === newPhone);
  refused('admin routes refuse a dealer', await d.get('/admin/bootstrap'), 403);
  refused('rider routes refuse a dealer', await d.get('/rider/me'), 403);

  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
  const upload = (token, bytes, name = 'a.png', type = 'image/png') => {
    const form = new FormData();
    form.append('file', new Blob([bytes], { type }), name);
    hits.add('POST /uploads');
    return fetch(`${BASE}/uploads`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form }).then(async (r) => ({ status: r.status, ok: r.ok, data: await r.json() }));
  };
  section('Uploads');
  refused('upload needs a login', await upload('bad', png), 401);
  refused('a non-image is refused even when named .png', await upload(fresh.token, Buffer.from('MZ this is a program')), 400);
  refused('oversize files are refused', await upload(fresh.token, Buffer.concat([png, Buffer.alloc(9 * 1024 * 1024)])), 400, 'too large');
  const up = await upload(fresh.token, png);
  okIs('upload a photo', up);
  const photoPath = up.data.path;
  const got = await call('GET', photoPath.replace('/api', ''));
  check('uploaded file comes back as an image', got.ok && got.headers.get('content-type') === 'image/png', got.status);
  hits.add('GET /files/:name');
  refused('unknown file is 404', await call('GET', '/files/nothing'), 404);

  section('KYC');
  const kyc = { ownerName: 'Test Owner', businessName: 'Test Ice Traders', businessType: 'Distributor', email: 't@example.com', gstin: '27ABCDE1234F1Z5', pan: 'ABCDE1234F', fssai: '12345678901234', addressLine: '5 Dock Road', city: 'Mumbai', pincode: '400001', documents: { 'GST certificate': photoPath } };
  refused('KYC checks the GSTIN', await d.post('/dealer/kyc', { ...kyc, gstin: 'nope' }), 400, 'GSTIN');
  refused('KYC checks the PAN', await d.post('/dealer/kyc', { ...kyc, pan: 'nope' }), 400, 'PAN');
  refused('KYC checks the FSSAI', await d.post('/dealer/kyc', { ...kyc, fssai: '1' }), 400, 'FSSAI');
  refused('KYC needs documents', await d.post('/dealer/kyc', { ...kyc, documents: { x: 'C:/local/file.png' } }), 400, 'documents');
  const submitted = await d.post('/dealer/kyc', kyc);
  okIs('submit KYC', submitted);
  check('KYC goes to pending', submitted.data.kycStatus === 'pending');
  check('the business address becomes the first delivery address', (await d.get('/dealer/addresses')).data[0]?.id === 'business');
  refused('pending dealer cannot order', await d.post('/dealer/orders', { addressId: 'business', items: [{ productId: 'block-50', qty: 5 }], paymentMethod: 'cashOnDelivery', deliveryDate: tomorrow, slot: SLOT }), 403);
  const dealerId = submitted.data.id;
  okIs('dealer rejected first', await act('decideKyc', dealerId, false, 'GST certificate is unclear'));
  check('dealer sees the reason', (await d.get('/dealer/me')).data.rejectionReason === 'GST certificate is unclear');
  refused('a rejection needs a reason', await act('saveDealer', { businessName: '' }), 400);
  okIs('dealer submits KYC again', await d.post('/dealer/kyc', kyc));
  refused('a KYC decision needs a reason', await act('decideKyc', dealerId, false, ''), 400);
  okIs('admin approves KYC', await act('decideKyc', dealerId, true, '', 20000));
  refused('a KYC decision cannot be made twice', await act('decideKyc', dealerId, true, '', 20000), 400);
  const profile = await d.put('/dealer/me', { ...kyc, ownerName: 'New Name', gstin: '27ZZZZZ9999Z1Z5' });
  check('approved dealer can change their name but not verified details', profile.data.ownerName === 'New Name' && profile.data.gstin === '27ABCDE1234F1Z5', profile.data);

  section('Dealer password');
  check('no password yet', (await d.get('/dealer/me/has-password')).data.hasPassword === false);
  refused('weak password', await d.post('/dealer/me/password', { next: 'short' }), 400);
  const setPass = await d.post('/dealer/me/password', { next: 'Dealer@123' });
  okIs('set a password', setPass);
  refused('the old token stops working after a password change', await d.get('/dealer/me'), 401);
  const dealerToken = setPass.data.token;
  const dealerApi = api(dealerToken);
  refused('wrong current password', await dealerApi.post('/dealer/me/password', { current: 'nope', next: 'Dealer@456' }), 400);
  refused('password login checks the password', await call('POST', `${OPEN('dealer')}/login`, { body: { phone: newPhone, password: 'nope' } }), 401);
  okIs('password login', await call('POST', `${OPEN('dealer')}/login`, { body: { phone: newPhone, password: 'Dealer@123' } }));

  section('Dealer catalogue');
  const demoLogin = await call('POST', `${OPEN('dealer')}/login`, { body: { phone: '9876543210', password: 'Demo@1234' } });
  okIs('demo dealer login', demoLogin);
  const demo = api(demoLogin.data.token);
  check('categories', (await dealerApi.get('/dealer/categories')).data.length === 7);
  const products = (await dealerApi.get('/dealer/products')).data;
  check('dealers see only dealer products', products.length === 8 && !products.some((p) => p.id === 'tube-2'), products.length);
  const standardBlock = products.find((p) => p.id === 'block-50');
  check('a Standard dealer pays the list price', standardBlock.slabs[0].price === 350 && standardBlock.standardPrice === null);
  const demoProducts = (await demo.get('/dealer/products')).data;
  check('a Gold dealer gets the tier rate', demoProducts.find((p) => p.id === 'block-50').slabs[0].price === 333);
  check('a dealer price overrides the tier', demoProducts.find((p) => p.id === 'tube-20').slabs[0].price === 262);
  okIs('add favourite', await dealerApi.put('/dealer/favourites/block-50', { on: true }));
  check('favourites', (await dealerApi.get('/dealer/favourites')).data.includes('block-50'));
  await dealerApi.put('/dealer/favourites/block-50', { on: false });
  check('remove favourite', !(await dealerApi.get('/dealer/favourites')).data.includes('block-50'));
  okIs('stock alert', await dealerApi.put('/dealer/stock-alerts/dry-10', { on: true }));
  check('stock alerts', (await dealerApi.get('/dealer/stock-alerts')).data.includes('dry-10'));

  section('Dealer addresses');
  const addr = await dealerApi.post('/dealer/addresses', { label: 'Second shop', contactName: 'X', phone: newPhone, line: '9 Market', city: 'Thane', pincode: '400601', instructions: 'Back gate' });
  okIs('add address', addr);
  const secondId = addr.data.find((a) => a.label === 'Second shop').id;
  refused('address checks the PIN', await dealerApi.post('/dealer/addresses', { line: 'x', city: 'y', pincode: '12' }), 400);
  okIs('make it default', await dealerApi.post(`/dealer/addresses/${secondId}/default`));
  const listed = (await dealerApi.get('/dealer/addresses')).data;
  check('only one default address', listed.filter((a) => a.isDefault).length === 1 && listed.find((a) => a.id === secondId).isDefault);
  okIs('delete address', await dealerApi.del(`/dealer/addresses/${secondId}`));
  const remaining = (await dealerApi.get('/dealer/addresses')).data;
  check('the default moves on when it is deleted', remaining.length === 1 && remaining[0].isDefault);
  refused('the last address cannot be deleted', await dealerApi.del('/dealer/addresses/business'), 400);

  /* ---- Credit orders ---- */
  section('Dealer orders and credit');
  const orderBody = (qty, paymentMethod = 'credit', extra = {}) => ({ addressId: 'business', items: [{ productId: 'block-50', qty }], paymentMethod, deliveryDate: tomorrow, slot: SLOT, ...extra });
  refused('minimum order', await dealerApi.post('/dealer/orders', orderBody(1)), 400, 'minimum order');
  refused('credit limit is enforced', await dealerApi.post('/dealer/orders', orderBody(60)), 400, 'available credit');
  refused('a past date is refused', await dealerApi.post('/dealer/orders', orderBody(5, 'credit', { deliveryDate: dayjs().subtract(3, 'day').toISOString() })), 400, 'passed');
  refused('an unknown slot is refused', await dealerApi.post('/dealer/orders', orderBody(5, 'credit', { slot: 'Midnight' })), 400, 'slot');
  refused('another product step rule', await dealerApi.post('/dealer/orders', { ...orderBody(1), items: [{ productId: 'cube-5', qty: 7 }] }), 400);
  refused('a customer-only product is refused', await dealerApi.post('/dealer/orders', { ...orderBody(1), items: [{ productId: 'tube-2', qty: 50 }] }), 400);
  refused('duplicate lines are refused', await dealerApi.post('/dealer/orders', { ...orderBody(1), items: [{ productId: 'block-50', qty: 5 }, { productId: 'block-50', qty: 5 }] }), 400);
  refused('a price the dealer did not see is not charged', await dealerApi.post('/dealer/orders', orderBody(5, 'credit', { expectedTotal: 1 })), 409);
  const placed = await dealerApi.post('/dealer/orders', orderBody(5, 'credit', { notes: 'Back gate', expectedTotal: 5 * 350 * 1.18 + 250 }));
  okIs('place a credit order', placed);
  const o1 = placed.data;
  check('order total includes GST and delivery', o1.total === 2315 && o1.gst === 315 && o1.deliveryFee === 250, o1);
  check('dealers get no delivery OTP', o1.deliveryOtp === '');
  let summary = (await dealerApi.get('/dealer/credit-summary')).data;
  check('credit order goes on the ledger', summary.outstanding === 2315 && summary.available === 17685, summary);
  check('ledger lists the invoice', (await dealerApi.get('/dealer/ledger')).data[0]?.reference === o1.number.replace('ICE', 'INV'));

  section('Credit limit under concurrent orders');
  await act('setCredit', dealerId, 2315 + 2315 + 100, 15);
  const races = await Promise.all([1, 2, 3].map(() => dealerApi.post('/dealer/orders', orderBody(5))));
  check('two orders at once cannot pass the same credit', races.filter((r) => r.ok).length === 1, races.map((r) => r.status));
  summary = (await dealerApi.get('/dealer/credit-summary')).data;
  check('the balance is still within the limit', summary.outstanding <= 2315 * 2 + 100, summary);
  const raced = races.find((r) => r.ok).data;
  okIs('cancel the raced order', await dealerApi.post(`/dealer/orders/${raced.id}/cancel`, { reason: 'Test' }));
  check('cancelling gives the credit back', (await dealerApi.get('/dealer/credit-summary')).data.outstanding === 2315);
  await act('setCredit', dealerId, 20000, 15);

  section('No coupons for dealers');
  refused('dealers cannot use coupon codes', await dealerApi.post('/dealer/orders', orderBody(8, 'cashOnDelivery', { couponCode: 'FIRST50' })), 400, 'Customer App');
  check('dealer offers carry no codes', (await demo.get('/dealer/offers')).data.every((x) => x.code === '') && (await demo.get('/dealer/offers')).data.length > 0);
  refused('a dealer offer cannot have a code', await act('saveOffer', { title: 'X', audience: 'dealer', code: 'DEAL5', validTill: tomorrow }), 400, 'only for customers');

  section('Location pricing');
  okIs('set a location price', await act('setLocationPrice', 'business', 'block-50', 300));
  refused('a price must be positive', await act('setLocationPrice', 'business', 'block-50', -5), 400);
  const atLocation = await dealerApi.post('/dealer/orders', orderBody(5, 'cashOnDelivery', { expectedTotal: 2315 }));
  check('a location price change asks the dealer to confirm', atLocation.status === 409 && atLocation.data.code === 'PRICE_CHANGED' && atLocation.data.total === 2020, atLocation.data);
  okIs('confirmed location price', await dealerApi.post('/dealer/orders', orderBody(5, 'cashOnDelivery', { expectedTotal: atLocation.data.total })));
  okIs('clear the location price', await act('setLocationPrice', 'business', 'block-50', null));
  okIs('set a dealer price', await act('setDealerPrice', dealerId, 'block-50', 310));
  check('the dealer sees their own price', (await dealerApi.get('/dealer/products')).data.find((p) => p.id === 'block-50').slabs[0].price === 310);
  okIs('clear the dealer price', await act('setDealerPrice', dealerId, 'block-50', null));
  okIs('change tier rates', await act('updateTierRates', { Gold: 0.94 }));
  refused('a tier rate has limits', await act('updateTierRates', { Gold: 9 }), 400);
  check('tier rate takes effect', (await demo.get('/dealer/products')).data.find((p) => p.id === 'block-50').slabs[0].price === 329);
  await act('updateTierRates', { Gold: 0.95 });

  section('Order isolation');
  refused("a dealer cannot cancel another's order", await demo.post(`/dealer/orders/${o1.id}/cancel`, { reason: 'x' }), 404);
  refused("a dealer cannot track another's order", await demo.get(`/dealer/orders/${o1.id}/tracking`), 404);
  check("a dealer's list has only their orders", !(await demo.get('/dealer/orders')).data.some((x) => x.id === o1.id));

  /* ---- Rider flow ---- */
  section('Rider login');
  refused('an unknown number cannot get an OTP', await call('POST', `${OPEN('rider')}/otp/send`, { body: { phone: '9812399999' } }), 404);
  const riderLogin = await call('POST', `${OPEN('rider')}/login`, { body: { phone: '9000000001', password: 'Rider@1234' } });
  okIs('rider login', riderLogin);
  const riderId = riderLogin.data.user.id;
  const r = api(riderLogin.data.token);
  await otpLogin('rider', '9000000001');
  check('rider me', (await r.get('/rider/me')).data.phone === '9000000001');
  okIs('rider duty on', await r.put('/rider/me/duty', { onDuty: true }));
  refused('a rider document must be uploaded first', await r.put('/rider/me/documents/Licence', { path: 'C:/phone/file.png' }), 400);
  const riderUpload = await upload(riderLogin.data.token, png);
  okIs('rider saves a document', await r.put('/rider/me/documents/Licence', { path: riderUpload.data.path }));
  check('rider documents come back as links', (await r.get('/rider/me/documents')).data.Licence?.startsWith('http'));
  check('duty on opens a session', (await r.get('/rider/tracking/sessions')).data[0]?.end === null);
  const riderPass = await r.post('/rider/me/password', { current: 'Rider@1234', next: 'Rider@5678' });
  okIs('rider changes password', riderPass);
  const rider = api(riderPass.data.token);
  const factory = await rider.get('/rider/factory');
  check('rider factory', factory.ok && factory.data.name.length > 0);

  section('Attendance');
  await models.Attendance.deleteMany({ riderId, day: dayjs().format('YYYY-MM-DD') });
  refused('check out needs check in', await rider.post('/rider/attendance/check-out'), 400);
  okIs('check in', await rider.post('/rider/attendance/check-in', { location: { latitude: 19.1, longitude: 72.8 } }));
  refused('only one check in a day', await rider.post('/rider/attendance/check-in'), 400);
  okIs('check out', await rider.post('/rider/attendance/check-out', { location: { latitude: 19.1, longitude: 72.8 } }));
  refused('only one check out a day', await rider.post('/rider/attendance/check-out'), 400);
  const days = (await rider.get('/rider/attendance')).data;
  check('attendance list', days[0].checkOut && days[0].checkInLocation.latitude === 19.1);

  section('Order to delivery, with stock and money');
  const moved = async (id) => (await adminApi.get('/admin/bootstrap')).data.orders.find((x) => x.id === id);
  okIs('admin accepts', await act('advanceOrder', o1.id));
  refused('a dealer cannot cancel once processing starts', (await act('advanceOrder', o1.id), await dealerApi.post(`/dealer/orders/${o1.id}/cancel`, { reason: 'x' })), 400);
  check('dealer is told about each step', (await dealerApi.get('/dealer/notifications')).data.some((n) => n.title.includes('Processing')));
  okIs('admin marks ready', await act('advanceOrder', o1.id));
  refused('no dispatch without a rider', await act('advanceOrder', o1.id), 400, 'Assign a rider');
  okIs('assign rider', await act('assignRider', o1.id, riderId));
  refused('assign needs a rider who exists', await act('assignRider', o1.id, 'nope'), 400);
  let riderOrders = (await rider.get('/rider/orders')).data;
  let ro = riderOrders.find((x) => x.id === o1.id);
  check('the rider sees the order', ro?.events.at(-1).status === 'assigned', ro);
  const realOtp = (await models.Order.findById(o1.id).lean()).otp;
  check('the rider is never sent the OTP', ro.deliveryOtp === '' && !JSON.stringify(riderOrders).includes(`"${realOtp}"`));
  check('a dealer order needs no OTP from the rider', ro.otpRequired === false);
  check('rider sees what to collect per unit', ro.items[0].rate > 350);
  refused('pickup needs accept first', await rider.post(`/rider/orders/${o1.id}/pickup`, {}), 400);
  okIs('rider accepts', await rider.post(`/rider/orders/${o1.id}/accept`));
  refused('accept only once', await rider.post(`/rider/orders/${o1.id}/accept`), 400);
  const factoryOf = (await moved(o1.id)).factoryId;
  const stockBefore = await stock(factoryOf, 'block-50');
  refused('a loaded quantity is limited to the order', await rider.post(`/rider/orders/${o1.id}/pickup`, { loaded: { 'block-50': 99 } }), 400);
  okIs('rider picks up 4 of 5', await rider.post(`/rider/orders/${o1.id}/pickup`, { loaded: { 'block-50': 4 }, photos: [{ path: photoPath, takenAt: new Date().toISOString() }], remark: 'One bag short', location: { latitude: 19.1, longitude: 72.8 } }));
  check('photos from other places are dropped', (await rider.get('/rider/orders')).data.find((x) => x.id === o1.id).pickup.photos[0].path.endsWith(photoPath));
  check('stock has not left yet', (await stock(factoryOf, 'block-50')) === stockBefore);
  refused('a picked up order cannot be cancelled', await act('cancelOrder', o1.id, 'test'), 400);
  refused('cannot reassign a picked up order', await act('assignRider', o1.id, 'R2'), 400);
  okIs('rider starts delivery', await rider.post(`/rider/orders/${o1.id}/start`));
  check('only what was loaded leaves stock', (await stock(factoryOf, 'block-50')) === stockBefore - 4, [stockBefore, await stock(factoryOf, 'block-50')]);
  okIs('rider sends location', await rider.post('/rider/tracking/points', { location: { latitude: 19.12, longitude: 72.85 } }));
  refused('location must be valid', await rider.post('/rider/tracking/points', { location: { latitude: 500, longitude: 0 } }), 400);
  check('route points', (await rider.get('/rider/tracking/points')).data.length >= 1);
  const tracking = await dealerApi.get(`/dealer/orders/${o1.id}/tracking`);
  check('the dealer sees the rider live', tracking.data.rider?.latitude === 19.12 && tracking.data.eta && tracking.data.riderName, tracking.data);
  check('the dealer sees who is delivering', (await dealerApi.get('/dealer/orders')).data.find((x) => x.id === o1.id).driver?.name.length > 0);
  check('admin sees the rider position', (await adminApi.get('/admin/bootstrap')).data.riders.find((x) => x.id === riderId).lastLocation?.lat === 19.12);
  okIs('duty off', await rider.put('/rider/me/duty', { onDuty: false }));
  okIs('start route', await rider.post('/rider/tracking/start'));
  okIs('stop route', await rider.post('/rider/tracking/stop'));

  section('Delivery OTP');
  const otherRider = api((await call('POST', `${OPEN('rider')}/otp/verify`, { body: { phone: (await models.Rider.findById('R2').lean()).phone, otp: await (async () => { await call('POST', `${OPEN('rider')}/otp/send`, { body: { phone: (await models.Rider.findById('R2').lean()).phone } }); return '123456'; })() } })).data.token);
  refused("a rider cannot touch another rider's order", await otherRider.post(`/rider/orders/${o1.id}/complete`, { photos: [{ path: photoPath, takenAt: new Date().toISOString() }] }), 404);
  refused('a dealer delivery needs a photo', await rider.post(`/rider/orders/${o1.id}/complete`, {}), 400, 'photo');
  // A customer's order still needs their OTP.
  const ashaToken = (await call('POST', `${OPEN('customer')}/login`, { body: { phone: '9876500000', password: 'Customer@1234' } })).data.token;
  const customerOut = async () => {
    const made = await call('POST', '/customer/orders', { token: ashaToken, body: { addressId: 'CU1-A1', items: [{ productId: 'tube-5', qty: 3 }], deliveryDate: tomorrow, slot: SLOT, paymentMethod: 'cod' } });
    for (let i = 0; i < 3; i += 1) await act('advanceOrder', made.data.id);
    await act('assignRider', made.data.id, riderId);
    await act('advanceOrder', made.data.id);
    return made.data;
  };
  const lockOrder = await customerOut();
  check('a customer order needs the OTP', (await rider.get('/rider/orders')).data.find((x) => x.id === lockOrder.id)?.otpRequired === true);
  refused('wrong delivery OTP', await rider.post(`/rider/orders/${lockOrder.id}/complete`, { otp: '0000', photos: [{ path: photoPath, takenAt: new Date().toISOString() }] }), 400, 'Incorrect OTP');
  check('wrong tries are counted', (await models.Order.findById(lockOrder.id).lean()).otpAttempts === 1);
  for (let i = 0; i < 4; i += 1) await rider.post(`/rider/orders/${lockOrder.id}/complete`, { otp: '0000' });
  refused('the OTP locks after 5 wrong tries', await rider.post(`/rider/orders/${lockOrder.id}/complete`, { otp: lockOrder.otp }), 429);
  const dealerBalance = (await dealerApi.get('/dealer/credit-summary')).data.outstanding;
  refused('cannot deliver more than was loaded', await rider.post(`/rider/orders/${o1.id}/complete`, { delivered: { 'block-50': 5 }, photos: [{ path: photoPath, takenAt: new Date().toISOString() }] }), 400);
  const stockAtDoor = await stock(factoryOf, 'block-50');
  okIs('deliver 3 of the 4 loaded', await rider.post(`/rider/orders/${o1.id}/complete`, { delivered: { 'block-50': 3 }, receivedBy: 'Manager', photos: [{ path: photoPath, takenAt: new Date().toISOString() }], location: { latitude: 19.13, longitude: 72.86 } }));
  check('what came back returns to stock', (await stock(factoryOf, 'block-50')) === stockAtDoor + 1);
  const afterShort = (await dealerApi.get('/dealer/credit-summary')).data.outstanding;
  check('short delivery comes off the bill', afterShort < dealerBalance, [dealerBalance, afterShort]);
  const dealerView = (await dealerApi.get('/dealer/orders')).data.find((x) => x.id === o1.id);
  check('order is delivered', dealerView.events.at(-1).status === 'delivered');
  okIs('add late proof', await rider.patch(`/rider/orders/${o1.id}/delivery`, { receivedBy: 'Owner' }));
  check('late proof saved', (await rider.get('/rider/orders')).data.find((x) => x.id === o1.id).delivery.receivedBy === 'Owner');
  refused('cannot rate twice with bad stars', await dealerApi.post(`/dealer/orders/${o1.id}/rate`, { stars: 9 }), 400);
  okIs('rate the order', await dealerApi.post(`/dealer/orders/${o1.id}/rate`, { stars: 4, review: 'Good' }));
  check('rating saved', (await dealerApi.get('/dealer/orders')).data.find((x) => x.id === o1.id).rating === 4);
  check('delivered order keeps a photo for admin', (await moved(o1.id)).delivery.photos[0].startsWith('http'));

  section('Cash on delivery and handover');
  const cod = await dealerApi.post('/dealer/orders', orderBody(5, 'cashOnDelivery'));
  okIs('COD order', cod);
  for (let i = 0; i < 3; i += 1) await act('advanceOrder', cod.data.id);
  await act('assignRider', cod.data.id, riderId);
  okIs('admin can dispatch directly', await act('advanceOrder', cod.data.id));
  const codBalance = (await dealerApi.get('/dealer/credit-summary')).data.outstanding;
  refused('UPI needs a transaction ID', await rider.post(`/rider/orders/${cod.data.id}/complete`, { collected: cod.data.total, mode: 'upi', photos: [{ path: photoPath, takenAt: new Date().toISOString() }] }), 400, 'UPI');
  refused('cannot collect more than the bill', await rider.post(`/rider/orders/${cod.data.id}/complete`, { collected: cod.data.total + 500, mode: 'cash', photos: [{ path: photoPath, takenAt: new Date().toISOString() }] }), 400);
  await models.Order.updateOne({ _id: cod.data.id }, { otpAttempts: 0 });
  await models.Collection.deleteMany({ riderId });
  await models.Handover.deleteMany({ riderId });
  okIs('deliver and collect cash', await rider.post(`/rider/orders/${cod.data.id}/complete`, { collected: cod.data.total, mode: 'cash', photos: [{ path: photoPath, takenAt: new Date().toISOString() }] }));
  check('COD does not touch the credit balance', (await dealerApi.get('/dealer/credit-summary')).data.outstanding === codBalance);
  check('COD shows as paid', (await dealerApi.get('/dealer/orders')).data.find((x) => x.id === cod.data.id).paymentStatus === 'paid');
  let money = (await rider.get('/rider/collections')).data;
  check('rider collection recorded', money.entries[0]?.amount === cod.data.total && money.entries[0].dealerName === 'Test Ice Traders', money.entries[0]);
  refused('a deposit is limited to cash in hand', await rider.post('/rider/collections/deposits', { amount: cod.data.total + 1, reference: 'X' }), 400, 'in hand');
  refused('a deposit needs a slip', await rider.post('/rider/collections/deposits', { amount: 10 }), 400);
  okIs('rider declares a deposit', await rider.post('/rider/collections/deposits', { amount: 1000, reference: 'SLIP-1' }));
  money = (await rider.get('/rider/collections')).data;
  check('a pending deposit shows', money.deposits[0]?.status === 'pending');
  refused('the same cash cannot be declared twice', await rider.post('/rider/collections/deposits', { amount: cod.data.total, reference: 'SLIP-2' }), 400);
  const handover = (await adminApi.get('/admin/bootstrap')).data.handovers.find((h) => h.ref === 'SLIP-1');
  okIs('admin confirms the deposit', await act('decideHandover', handover.id, true));
  refused('a deposit is decided once', await act('decideHandover', handover.id, true), 400);
  refused('admin handover is limited to cash held', await act('recordHandover', riderId, 999999, 'S2'), 400, 'in hand');
  refused('admin handover needs a slip', await act('recordHandover', riderId, 10, ''), 400);
  okIs('admin receives cash', await act('recordHandover', riderId, 100, 'S3'));
  check('confirmed deposits reduce cash in hand', (await rider.get('/rider/collections')).data.deposits.length === 2);

  section('Rider earnings');
  const salaries = (await rider.get('/rider/earnings/salaries')).data;
  check('four months of salary', salaries.length === 4 && salaries[0].baseSalary === 18000 && salaries[0].incentives >= 10, salaries[0]);
  check('incentives', (await rider.get('/rider/earnings/incentives')).data.length === 2);
  const month = dayjs().subtract(1, 'month').format('YYYY-MM');
  okIs('admin pays a salary', await act('paySalary', riderId, month, 15000, 200, 500));
  refused('a month is paid once', await act('paySalary', riderId, month, 15000), 400);
  check('the rider sees the payment', (await rider.get('/rider/earnings/salaries')).data[1].paidOn);

  section('Rider reject and failed delivery');
  const rej = await dealerApi.post('/dealer/orders', orderBody(5, 'cashOnDelivery'));
  await act('assignRider', rej.data.id, riderId);
  refused('a reject needs a reason', await rider.post(`/rider/orders/${rej.data.id}/reject`, {}), 400);
  okIs('rider rejects', await rider.post(`/rider/orders/${rej.data.id}/reject`, { reason: 'Vehicle broke down' }));
  check('it leaves the rider list', !(await rider.get('/rider/orders')).data.some((x) => x.id === rej.data.id));
  check('it goes back to unassigned', (await moved(rej.data.id)).riderId === null);
  await act('assignRider', rej.data.id, riderId);
  await rider.post(`/rider/orders/${rej.data.id}/accept`);
  for (let i = 0; i < 3; i += 1) await act('advanceOrder', rej.data.id);
  await rider.post(`/rider/orders/${rej.data.id}/pickup`, {});
  await rider.post(`/rider/orders/${rej.data.id}/start`);
  const factoryRej = (await moved(rej.data.id)).factoryId;
  const beforeFail = await stock(factoryRej, 'block-50');
  refused('a failure needs a reason', await rider.post(`/rider/orders/${rej.data.id}/fail`, {}), 400);
  okIs('delivery fails', await rider.post(`/rider/orders/${rej.data.id}/fail`, { reason: 'Shop closed', note: 'No one there' }));
  check('failed stock returns', (await stock(factoryRej, 'block-50')) === beforeFail + 5);
  check('dealer sees it failed', (await dealerApi.get('/dealer/orders')).data.find((x) => x.id === rej.data.id).events.at(-1).status === 'failed');
  refused('only failed orders can be retried', await act('retryDelivery', o1.id), 400);
  okIs('admin retries', await act('retryDelivery', rej.data.id));
  check('the failed try stays in rider history', (await rider.get('/rider/orders')).data.find((x) => x.id === rej.data.id)?.failure?.reason === 'Shop closed');
  okIs('assign to another rider', await act('assignRider', rej.data.id, 'R2'));
  okIs('admin dispatches the retry', await act('advanceOrder', rej.data.id));
  actionHits.add('confirmDelivery');
  const confirm = (id, input) => call('POST', '/admin/actions/confirmDelivery', { token: adminToken, body: { args: [id, input] } });
  okIs('admin confirms a dealer delivery without an OTP', await confirm(rej.data.id, { mode: 'cash', receivedBy: 'A' }));
  const forAdmin = await customerOut();
  refused('admin confirm checks a customer OTP', await confirm(forAdmin.id, { otp: '0000', mode: 'cash' }), 400);
  okIs('admin confirms a customer delivery with the OTP', await confirm(forAdmin.id, { otp: forAdmin.otp, mode: 'cash' }));

  section('Admin order actions');
  refused('an order must be approved dealer', await act('createOrder', { dealerId: 'D11', addressId: 'D11-A1', items: [{ productId: 'block-50', qty: 5 }], paymentMethod: 'cod', deliveryDate: tomorrow, slot: SLOT, factoryId: 'F1' }), 400, 'not approved');
  const made = await act('createOrder', { dealerId, addressId: 'business', items: [{ productId: 'block-50', qty: 5 }], paymentMethod: 'credit', deliveryDate: tomorrow, slot: SLOT, factoryId: 'F2' });
  okIs('admin creates an order', made);
  check('changes come back with the order and its ledger entry', made.data.changes.orders[0].factoryId === 'F2' && made.data.changes.ledger.length >= 1 && made.data.changes.activity.length >= 1, Object.keys(made.data.changes));
  refused('a cancel needs a reason', await act('cancelOrder', made.data.changes.orders[0].id, ''), 400);
  okIs('admin cancels', await act('cancelOrder', made.data.changes.orders[0].id, 'Mistake'));

  section('Stock');
  const pb = await stock('F1', 'cube-20');
  refused('production needs a quantity', await act('addProduction', { factoryId: 'F1', productId: 'cube-20', qty: 0 }), 400);
  const prod = await act('addProduction', { factoryId: 'F1', productId: 'cube-20', qty: 10, note: 'Morning' });
  okIs('record production', prod);
  check('production adds stock', (await stock('F1', 'cube-20')) === pb + 10 && prod.data.changes.moves.length === 1);
  refused('transfer must be between two factories', await act('transferStock', { fromId: 'F1', toId: 'F1', productId: 'cube-20', qty: 1 }), 400, 'different');
  refused('transfer is limited to stock', await act('transferStock', { fromId: 'F1', toId: 'F2', productId: 'cube-20', qty: 9999999 }), 400, 'in stock');
  const total = (await stock('F1', 'cube-20')) + (await stock('F2', 'cube-20'));
  okIs('transfer', await act('transferStock', { fromId: 'F1', toId: 'F2', productId: 'cube-20', qty: 5 }));
  check('a transfer keeps the total', (await stock('F1', 'cube-20')) + (await stock('F2', 'cube-20')) === total);
  refused('adjust needs a reason', await act('adjustStock', { factoryId: 'F1', productId: 'cube-20', qty: -1, note: '' }), 400);
  refused('stock cannot go below zero', await act('adjustStock', { factoryId: 'F1', productId: 'cube-20', qty: -99999999, note: 'x' }), 400, 'below zero');
  okIs('adjust', await act('adjustStock', { factoryId: 'F1', productId: 'cube-20', qty: -1, note: 'Melted' }));
  // Dry ice is out of stock: a stock alert fires when production brings it back.
  const dryQty = (await stock('F1', 'dry-10')) + (await stock('F2', 'dry-10'));
  await models.Move.create({ _id: `M-zero-${Date.now()}`, at: new Date(), factoryId: 'F1', productId: 'dry-10', qty: -(await stock('F1', 'dry-10')), type: 'adjust', ref: 't' });
  await models.Move.create({ _id: `M-zero2-${Date.now()}`, at: new Date(), factoryId: 'F2', productId: 'dry-10', qty: -(await stock('F2', 'dry-10')), type: 'adjust', ref: 't' });
  check('out of stock shows zero', (await dealerApi.get('/dealer/products')).data.find((p) => p.id === 'dry-10').availableQty === 0, dryQty);
  await act('addProduction', { factoryId: 'F1', productId: 'dry-10', qty: 5 });
  check('a back-in-stock alert reaches the dealer', (await dealerApi.get('/dealer/notifications')).data.some((n) => n.title === 'Back in stock'));

  section('Stock under concurrent dispatch');
  const scarce = await act('saveProduct', { name: 'Scarce Ice', category: 'Cube Ice', pack: '1 kg', packKg: 1, unit: 'bag', gst: 18, slabs: [{ minQty: 1, price: 1000 }] });
  okIs('add a product', scarce);
  const scarceId = scarce.data.changes.products[0].id;
  await act('addProduction', { factoryId: 'F1', productId: scarceId, qty: 2 });
  const scarceOrders = [];
  for (let i = 0; i < 2; i += 1) {
    const created = await act('createOrder', { dealerId, addressId: 'business', items: [{ productId: scarceId, qty: 2 }], paymentMethod: 'cod', deliveryDate: tomorrow, slot: SLOT, factoryId: 'F1' });
    const id = created.data.changes.orders[0].id;
    for (let k = 0; k < 3; k += 1) await act('advanceOrder', id);
    await act('assignRider', id, riderId);
    scarceOrders.push(id);
  }
  const dispatches = await Promise.all(scarceOrders.map((id) => act('advanceOrder', id)));
  check('only one order can take the last stock', dispatches.filter((x) => x.ok).length === 1, dispatches.map((x) => x.status));
  check('stock never goes below zero', (await stock('F1', scarceId)) === 0, await stock('F1', scarceId));

  section('Accounts');
  const payOrder = await dealerApi.post('/dealer/orders', orderBody(5));
  okIs('another credit order', payOrder);
  const owed = (await dealerApi.get('/dealer/credit-summary')).data.outstanding;
  refused('a payment needs a reference', await dealerApi.post('/dealer/payments', { amount: 100, mode: 'upi' }), 400);
  refused('a payment needs a method', await dealerApi.post('/dealer/payments', { amount: 100, mode: 'barter', reference: 'x' }), 400);
  const claim = await dealerApi.post('/dealer/payments', { amount: 500, mode: 'upi', reference: 'UTR1' });
  check('a dealer payment waits for verification', claim.data.status === 'pending');
  check('it does not reduce the balance yet', (await dealerApi.get('/dealer/credit-summary')).data.outstanding === owed);
  refused('the same reference cannot be used twice', await dealerApi.post('/dealer/payments', { amount: 500, mode: 'upi', reference: 'UTR1' }), 400);
  check('dealer can see their claims', (await dealerApi.get('/dealer/payment-claims')).data[0].status === 'pending');
  const claimId = (await adminApi.get('/admin/bootstrap')).data.paymentClaims.find((c) => c.reference === 'UTR1').id;
  refused('a rejection needs a reason', await act('decidePaymentClaim', claimId, false, ''), 400);
  okIs('accounts verifies it', await act('decidePaymentClaim', claimId, true));
  check('now it reduces the balance', (await dealerApi.get('/dealer/credit-summary')).data.outstanding === owed - 500);
  refused('a claim is decided once', await act('decidePaymentClaim', claimId, true), 400);
  const demoOnline = await dealerApi.post('/dealer/payments', { amount: 100, mode: 'online', reference: 'ONLINE1' });
  check('demo online payment is immediate', demoOnline.data.status === 'verified', demoOnline.data);
  refused('ledger entry needs a reference', await act('addLedgerEntry', { dealerId, type: 'payment', amount: 10, ref: '' }), 400);
  refused('ledger entry cannot be an invoice by hand', await act('addLedgerEntry', { dealerId, type: 'invoice', amount: 10, ref: 'x' }), 400);
  okIs('ledger payment', await act('addLedgerEntry', { dealerId, type: 'payment', amount: 50, ref: 'NEFT' }));
  okIs('ledger debit', await act('addLedgerEntry', { dealerId, type: 'debit', amount: 50, ref: 'DN' }));
  check('overdue is worked out', (await demo.get('/dealer/credit-summary')).data.outstanding > 0);
  okIs('reminder', await demo.post('/dealer/payments/remind'));

  section('Complaints');
  refused('a complaint needs a delivered order', await dealerApi.post('/dealer/complaints', { orderId: payOrder.data.id, type: 'meltedBags', affectedQuantity: 1, description: 'x', photos: [photoPath] }), 404);
  refused('a complaint needs photos', await dealerApi.post('/dealer/complaints', { orderId: o1.id, type: 'meltedBags', affectedQuantity: 1, description: 'x', photos: [] }), 400, 'photo');
  refused('a complaint is limited to the order', await dealerApi.post('/dealer/complaints', { orderId: o1.id, type: 'meltedBags', affectedQuantity: 99, description: 'x', photos: [{ path: photoPath }] }), 400);
  const complaint = await dealerApi.post('/dealer/complaints', { orderId: o1.id, type: 'meltedBags', affectedQuantity: 1, description: 'Melted bag', photos: [{ path: photoPath, takenAt: new Date().toISOString() }], location: { latitude: 19.1, longitude: 72.9 } });
  okIs('dealer complaint', complaint);
  check('complaint fits the app', complaint.data.status === 'underReview' && complaint.data.photos[0].serverTimestamp && complaint.data.location.latitude === 19.1, complaint.data);
  check('complaint list', (await dealerApi.get('/dealer/complaints')).data.length === 1);
  const creditBefore = (await dealerApi.get('/dealer/credit-summary')).data.outstanding;
  refused('rejecting needs a reason', await act('decideComplaint', complaint.data.id, false, ''), 400);
  okIs('approve with a credit note', await act('decideComplaint', complaint.data.id, true, 'Fair', 300));
  check('a credit note reduces the balance', (await dealerApi.get('/dealer/credit-summary')).data.outstanding === creditBefore - 300);
  refused('a complaint is decided once', await act('decideComplaint', complaint.data.id, true, 'Again', 300), 400);
  check('the dealer sees the decision', (await dealerApi.get('/dealer/complaints')).data[0].adminRemark === 'Fair');
  const riderReport = await rider.post('/rider/returns', { orderId: o1.id, type: 'meltedIce', quantity: 1, note: 'Melted', photos: [{ path: photoPath }], location: { latitude: 19, longitude: 72 } });
  okIs('rider report', riderReport);
  check('rider report fits the app', riderReport.data.type === 'meltedIce' && riderReport.data.dealerName === 'Test Ice Traders', riderReport.data);
  check('rider report list', (await rider.get('/rider/returns')).data.some((x) => x.id === riderReport.data.id));
  check('the admin sees it', (await adminApi.get('/admin/bootstrap')).data.complaints.some((c) => c.source === 'rider' && c.number === riderReport.data.number || c.id === riderReport.data.id));
  refused("a rider can't report on someone else's order", await otherRider.post('/rider/returns', { orderId: o1.id, type: 'meltedIce', quantity: 1, note: 'x' }), 404);

  section('Standing orders');
  refused('a standing order needs a product', await dealerApi.post('/dealer/standing-orders', { name: 'x', items: {}, weekdays: [1], slot: SLOT, addressId: 'business', paymentMethod: 'credit' }), 400);
  refused('a standing order cannot be prepaid', await dealerApi.post('/dealer/standing-orders', { name: 'x', items: { 'block-50': 5 }, weekdays: [1], slot: SLOT, addressId: 'business', paymentMethod: 'online' }), 400);
  const allWeek = [1, 2, 3, 4, 5, 6, 7];
  const so = await dealerApi.post('/dealer/standing-orders', { name: 'Daily', items: { 'block-50': 5 }, weekdays: allWeek, slot: SLOT, addressId: 'business', paymentMethod: 'cashOnDelivery', isActive: true, skippedDates: [], lastRun: new Date().toISOString() });
  okIs('add standing order', so);
  check('not placed on the day it is set up', (await dealerApi.post('/dealer/standing-orders/run-due')).data.placed === 0);
  await models.StandingOrder.updateOne({ _id: so.data.id }, { lastRun: dayjs().subtract(1, 'day').toDate() });
  check('placed when due', (await dealerApi.post('/dealer/standing-orders/run-due')).data.placed === 1);
  check('placed only once a day', (await dealerApi.post('/dealer/standing-orders/run-due')).data.placed === 0);
  check('it appears with its link', (await dealerApi.get('/dealer/orders')).data.some((x) => x.standingOrderId === so.data.id));
  check('standing order list', (await dealerApi.get('/dealer/standing-orders')).data.length === 1);
  okIs('edit standing order', await dealerApi.post('/dealer/standing-orders', { id: so.data.id, name: 'Daily 2', items: { 'block-50': 6 }, weekdays: allWeek, slot: SLOT, addressId: 'business', paymentMethod: 'cashOnDelivery', isActive: false, skippedDates: [] }));
  okIs('delete standing order', await dealerApi.del(`/dealer/standing-orders/${so.data.id}`));

  section('Ice boxes');
  check('boxes held', (await demo.get('/dealer/ice-boxes')).data.movements.length === 2);
  refused('cannot return more than held', await demo.post('/dealer/ice-boxes/pickups', { quantity: 50, date: tomorrow }), 400);
  okIs('ask for a pickup', await demo.post('/dealer/ice-boxes/pickups', { quantity: 2, date: tomorrow }));
  refused('waiting pickups count', await demo.post('/dealer/ice-boxes/pickups', { quantity: 3, date: tomorrow }), 400);
  const pickup = (await demo.get('/dealer/ice-boxes')).data.pickups[0];
  okIs('cancel a pickup', await demo.del(`/dealer/ice-boxes/pickups/${pickup.id}`));
  await demo.post('/dealer/ice-boxes/pickups', { quantity: 2, date: tomorrow });
  const boxPickup = (await demo.get('/dealer/ice-boxes')).data.pickups[0];
  okIs('complete a pickup', await act('completeBoxPickup', boxPickup.id, true));
  check('returned boxes are counted', (await demo.get('/dealer/ice-boxes')).data.movements.filter((m) => m.type === 'returned').length === 2);
  refused('a pickup closes once', await act('completeBoxPickup', boxPickup.id, true), 400);

  section('Delivery requests');
  refused('a past date is refused', await dealerApi.post('/dealer/delivery-requests', { date: dayjs().subtract(2, 'day').toISOString(), slot: SLOT }), 400);
  const dr = await dealerApi.post('/dealer/delivery-requests', { date: tomorrow, slot: SLOT, addressLabel: 'Shop', details: 'Need ice' });
  okIs('ask for a delivery', dr);
  check('request list', (await dealerApi.get('/dealer/delivery-requests')).data.length === 1);
  okIs('admin confirms it', await act('decideDeliveryRequest', dr.data.id, true));
  refused('a request is decided once', await act('decideDeliveryRequest', dr.data.id, true), 400);
  okIs('dealer removes it', await dealerApi.del(`/dealer/delivery-requests/${dr.data.id}`));

  section('Notifications');
  for (const [label, client, root] of [['dealer', dealerApi, '/dealer'], ['rider', rider, '/rider']]) {
    const list = (await client.get(`${root}/notifications`)).data;
    check(`${label} has notifications`, list.length > 0);
    okIs(`${label} mark read`, await client.post(`${root}/notifications/${list[0].id}/read`));
    okIs(`${label} mark all read`, await client.post(`${root}/notifications/read-all`));
    check(`${label} all read`, (await client.get(`${root}/notifications`)).data.every((n) => n.isRead));
    okIs(`${label} mute`, await client.put(`${root}/notifications/muted`, { types: ['announcement', 'bad'] }));
    check(`${label} muted list keeps real types`, JSON.stringify((await client.get(`${root}/notifications/muted`)).data) === '["announcement"]');
    await client.put(`${root}/notifications/muted`, { types: [] });
    okIs(`${label} delete one`, await client.del(`${root}/notifications/${list[0].id}`));
    okIs(`${label} clear`, await client.del(`${root}/notifications`));
    check(`${label} cleared`, (await client.get(`${root}/notifications`)).data.length === 0);
  }
  await dealerApi.put('/dealer/notifications/muted', { types: ['announcement'] });
  refused('an announcement needs a message', await act('sendAnnouncement', { audience: 'Everyone', title: '', body: '' }), 400);
  const ann = await act('sendAnnouncement', { audience: 'Everyone', title: 'Holiday', body: 'Closed Sunday' });
  okIs('send announcement', ann);
  check('the announcement reaches the apps', (await rider.get('/rider/notifications')).data.some((n) => n.title === 'Holiday' && n.type === 'announcement'));
  check('muted types are respected', !(await dealerApi.get('/dealer/notifications')).data.some((n) => n.title === 'Holiday'));
  await dealerApi.put('/dealer/notifications/muted', { types: [] });
  const adminNotes = (await adminApi.get('/admin/bootstrap')).data.notifications;
  okIs('admin mark read', await act('markRead', adminNotes[0].id));
  okIs('admin mark all read', await act('markAllRead'));

  section('Support tickets');
  refused('a ticket needs a subject', await dealerApi.post('/dealer/tickets', { message: 'x' }), 400);
  const t = await dealerApi.post('/dealer/tickets', { subject: 'Late', category: 'Delivery', message: 'Where is it?', orderNumber: o1.number });
  okIs('dealer ticket', t);
  check('ticket fits the dealer app', t.data.messages[0].fromDealer === true && t.data.status === 'open', t.data);
  okIs('dealer replies', await dealerApi.post(`/dealer/tickets/${t.data.id}/reply`, { message: 'Hello?' }));
  refused('admin reply needs text', await act('replyTicket', t.data.id, ''), 400);
  okIs('admin replies', await act('replyTicket', t.data.id, 'On the way'));
  const thread = (await dealerApi.get('/dealer/tickets')).data[0];
  check('the dealer sees the reply', thread.messages.at(-1).text === 'On the way' && thread.messages.at(-1).fromDealer === false);
  okIs('dealer resolves', await dealerApi.post(`/dealer/tickets/${t.data.id}/resolve`));
  refused('no replies on a closed ticket', await dealerApi.post(`/dealer/tickets/${t.data.id}/reply`, { message: 'x' }), 400);
  const rt = await rider.post('/rider/tickets', { subject: 'Bike', category: 'Vehicle', message: 'Flat tyre' });
  check('ticket fits the rider app', rt.data.messages[0].fromRider === true);
  okIs('rider replies', await rider.post(`/rider/tickets/${rt.data.id}/reply`, { message: 'Help' }));
  okIs('admin resolves', await act('resolveTicket', rt.data.id));
  check('rider sees it resolved', (await rider.get('/rider/tickets')).data[0].status === 'resolved');
  okIs('rider resolve is harmless', await rider.post(`/rider/tickets/${rt.data.id}/resolve`));

  /* ---- Customer app ---- */
  section('Customer account');
  const firstCustomer = await otpLogin('customer', '9812300002');
  check('a new customer must give a name', firstCustomer.user.name === '');
  const c = api(firstCustomer.token);
  refused('a name is required', await c.put('/customer/me', { name: '' }), 400);
  refused('a bad referral code is refused', await c.put('/customer/me', { name: 'Ravi', referralCode: 'NOPE' }), 400);
  const namedCustomer = await c.put('/customer/me', { name: 'Ravi Kumar', email: 'r@example.com', referralCode: 'ICEASHA1' });
  okIs('complete profile', namedCustomer);
  check('customer me', (await c.get('/customer/me')).data.name === 'Ravi Kumar');
  const customerLogin = await call('POST', `${OPEN('customer')}/login`, { body: { phone: '9876500000', password: 'Customer@1234' } });
  okIs('customer password login', customerLogin);
  const asha = api(customerLogin.data.token);
  refused('other roles are refused', await c.get('/dealer/me'), 403);
  const cfg = (await c.get('/customer/config')).data;
  check('customer config', cfg.charges.minOrder === 99 && cfg.slots.length === 5 && cfg.servicePinPrefixes.includes('400'));

  section('Customer catalogue');
  const shop = (await c.get('/customer/products')).data;
  check('customers see retail products', shop.some((p) => p.id === 'tube-2') && shop.find((p) => p.id === 'tube-2').price === 59, shop.length);
  check('ice not for drinks carries a warning', shop.filter((p) => ['crushed', 'block', 'slab', 'dry'].includes(p.categoryId)).every((p) => p.warning && !p.forDrinks));
  check('reviews', (await c.get('/customer/products/tube-2/reviews')).data.length === 2);
  okIs('favourite', await c.put('/customer/favourites/tube-2', { on: true }));
  check('favourites', (await c.get('/customer/favourites')).data.includes('tube-2'));
  await c.put('/customer/favourites/tube-2', { on: false });
  check('coupons', (await c.get('/customer/coupons')).data.length === 4);

  section('Customer addresses');
  const emptyOrder = { addressId: 'none', items: [{ productId: 'tube-2', qty: 3 }], deliveryDate: tomorrow, slot: SLOT, paymentMethod: 'upi' };
  refused('an order needs an address', await c.post('/customer/orders', emptyOrder), 400, 'address');
  const home = await c.post('/customer/addresses', { id: 'home', label: 'Home', name: 'Ravi', phone: '9812300002', line: '1 Beach Road', city: 'Mumbai', pincode: '400053', latitude: 19.13, longitude: 72.82 });
  okIs('add address', home);
  check('address fits the app', home.data[0].name === 'Ravi' && home.data[0].latitude === 19.13 && home.data[0].isDefault, home.data[0]);
  await c.post('/customer/addresses', { id: 'far', label: 'Delhi', name: 'R', phone: '9812300002', line: '1', city: 'Delhi', pincode: '110001' });
  check('address list', (await c.get('/customer/addresses')).data.length === 2);
  okIs('set default', await c.post('/customer/addresses/far/default'));
  await c.post('/customer/addresses/home/default');
  const cOrder = (extra = {}) => ({ addressId: 'home', items: [{ productId: 'tube-5', qty: 3 }], deliveryDate: tomorrow, slot: SLOT, paymentMethod: 'upi', tip: 10, ...extra });
  refused('outside the delivery area', await c.post('/customer/orders', cOrder({ addressId: 'far' })), 400, 'do not deliver');
  okIs('delete address', await c.del('/customer/addresses/far'));

  section('Customer orders and wallet');
  check('a welcome bonus', (await c.get('/customer/wallet')).data[0].amount === 100);
  refused('customer minimum', await c.post('/customer/orders', cOrder({ items: [{ productId: 'cube-1', qty: 1 }] })), 400, 'minimum');
  refused('a dealer-only product is refused', await c.post('/customer/orders', cOrder({ items: [{ productId: 'box-50', qty: 1 }] })), 400);
  refused('dry ice needs the safety note', await c.post('/customer/orders', cOrder({ items: [{ productId: 'dry-1', qty: 1 }] })), 400, 'safety');
  refused('express is for today', await c.post('/customer/orders', cOrder({ express: true })), 400, 'today');
  refused('a bad coupon', await c.post('/customer/orders', cOrder({ couponCode: 'NOPE' })), 400);
  refused('a coupon minimum', await c.post('/customer/orders', cOrder({ couponCode: 'PARTY15' })), 400);
  refused('a total the customer did not see is not charged', await c.post('/customer/orders', cOrder({ expectedTotal: 1 })), 409);
  const co = await c.post('/customer/orders', cOrder({ useWallet: true, couponCode: 'FIRST50', instructions: 'Ring twice' }));
  okIs('place a customer order', co);
  // 387 items - 50 coupon + 49 delivery + 10 tip = 396, less 100 from the wallet.
  check('the bill is right', co.data.total === 296 && co.data.walletUsed === 100 && co.data.discount === 50 && co.data.subtotal === 387, co.data);
  check('the wallet paid its part', (await c.get('/customer/wallet')).data[0].amount === -100);
  check('the customer sees the status and OTP', co.data.status === 'placed' && /^\d{4}$/.test(co.data.otp) && co.data.canCancel === true);
  const fifthOrder = (await adminApi.get('/admin/bootstrap')).data.orders.find((x) => x.id === co.data.id);
  check('admin sees the customer order with their name', fifthOrder.buyerType === 'customer' && fifthOrder.buyerName === 'Ravi Kumar');
  check('customer tax is taken out of the price', fifthOrder.gst === Math.round(((337 * 18) / 118) * 100) / 100 && fifthOrder.total === 396, fifthOrder);
  refused('a cancel needs a reason', await c.post(`/customer/orders/${co.data.id}/cancel`, {}), 400);
  okIs('cancel', await c.post(`/customer/orders/${co.data.id}/cancel`, { reason: 'Plans changed' }));
  const walletAfter = (await c.get('/customer/wallet')).data;
  check('wallet and online money are refunded', walletAfter[0].amount === 396, walletAfter[0]);
  check('it shows as cancelled', (await c.get('/customer/orders')).data[0].status === 'cancelled');
  refused('cancel only once', await c.post(`/customer/orders/${co.data.id}/cancel`, { reason: 'Again' }), 400);

  section('Customer delivery');
  const live = await c.post('/customer/orders', cOrder({ paymentMethod: 'cod', tip: 0 }));
  okIs('COD order', live);
  for (const expected of ['confirmed', 'confirmed', 'packed']) {
    await act('advanceOrder', live.data.id);
    check(`customer status ${expected}`, (await c.get('/customer/orders')).data.find((x) => x.id === live.data.id).status === expected);
  }
  await act('assignRider', live.data.id, riderId);
  await rider.post(`/rider/orders/${live.data.id}/accept`);
  await rider.post(`/rider/orders/${live.data.id}/pickup`, {});
  refused('no cancelling after pickup', await c.post(`/customer/orders/${live.data.id}/cancel`, { reason: 'x' }), 400);
  check('the app knows it cannot cancel', (await c.get('/customer/orders')).data.find((x) => x.id === live.data.id).canCancel === false);
  await rider.post(`/rider/orders/${live.data.id}/start`);
  const riderView = (await rider.get('/rider/orders')).data.find((x) => x.id === live.data.id);
  check('rider sees the customer', riderView.dealerName === 'Ravi Kumar' && riderView.dealerPhone === '9812300002' && riderView.payment === 'cashOnDelivery', riderView);
  await rider.post('/rider/tracking/points', { location: { latitude: 19.12, longitude: 72.83 } });
  const ctrack = (await c.get(`/customer/orders/${live.data.id}/tracking`)).data;
  check('the customer sees the rider live', ctrack.rider?.latitude === 19.12 && ctrack.destination.latitude === 19.13, ctrack);
  const due = riderView.items.reduce((sum, i) => sum + i.rate * i.quantity, 0);
  check('what the rider collects matches the bill', Math.abs(due - live.data.total) < 0.5, [due, live.data.total]);
  const fullOtp = (await c.get('/customer/orders')).data.find((x) => x.id === live.data.id).otp;
  okIs('delivered', await rider.post(`/rider/orders/${live.data.id}/complete`, { otp: fullOtp, collected: Math.round(due * 100) / 100, mode: 'upi', ref: 'UPI1' }));
  const doneOrder = (await c.get('/customer/orders')).data.find((x) => x.id === live.data.id);
  check('the customer sees it delivered', doneOrder.status === 'delivered' && doneOrder.rider?.name.length > 0 && doneOrder.steps.delivered, doneOrder);
  check('a referral bonus is paid once on the first delivery', (await c.get('/customer/wallet')).data.some((e) => e.title === 'Referral bonus') && (await asha.get('/customer/wallet')).data.some((e) => e.title.startsWith('Referral bonus')));
  const rated = await c.post(`/customer/orders/${live.data.id}/rate`, { delivery: 5, product: 4, text: 'Nice ice' });
  okIs('rate', rated);
  check('rating saved', rated.data.deliveryRating === 5 && rated.data.productRating === 4, rated.data);
  refused('rate only once', await c.post(`/customer/orders/${live.data.id}/rate`, { delivery: 5, product: 4 }), 400);
  check('a review reaches the product', (await c.get('/customer/products/tube-5/reviews')).data[0].text === 'Nice ice');
  refused("cannot read someone else's order", await asha.get(`/customer/orders/${live.data.id}/tracking`), 404);

  section('Customer reports');
  refused('a report needs detail', await c.post('/customer/issues', { orderId: live.data.id, type: 'melted', details: '' }), 400);
  refused('a report needs a delivered order of yours', await asha.post('/customer/issues', { orderId: live.data.id, type: 'melted', details: 'x' }), 404);
  const issue = await c.post('/customer/issues', { orderId: live.data.id, type: 'melted', details: 'Half melted', photos: [photoPath] });
  okIs('report a problem', issue);
  check('report list', (await c.get('/customer/issues')).data[0].id === issue.data.id);
  const beforeRefund = (await c.get('/customer/wallet')).data.reduce((s, e) => s + e.amount, 0);
  okIs('approve with a refund', await act('decideComplaint', issue.data.id, true, 'Sorry', 100));
  check('a customer refund goes to the wallet', (await c.get('/customer/wallet')).data.reduce((s, e) => s + e.amount, 0) === beforeRefund + 100);

  section('Customer money');
  refused('a top up has a limit', await c.post('/customer/wallet/add', { amount: 999999 }), 400);
  refused('a top up must be positive', await c.post('/customer/wallet/add', { amount: -5 }), 400);
  okIs('top up', await c.post('/customer/wallet/add', { amount: 200 }));
  const rewards = (await asha.get('/customer/rewards')).data;
  check('points come from delivered orders', rewards.points > 0, rewards);
  refused('a minimum to redeem', await asha.post('/customer/rewards/redeem', { points: 5 }), 400);
  refused('cannot redeem more than earned', await asha.post('/customer/rewards/redeem', { points: 999999 }), 400);
  const pointsBefore = rewards.points;
  await models.Order.updateOne({ _id: 'O-C001' }, { total: 5000 });
  const earned = (await asha.get('/customer/rewards')).data.points;
  okIs('redeem', await asha.post('/customer/rewards/redeem', { points: 100 }));
  check('points go down', (await asha.get('/customer/rewards')).data.points === earned - 100 && earned > pointsBefore);
  okIs('save a UPI ID', await c.post('/customer/saved-upi', { id: 'ravi@okbank' }));
  refused('bad UPI ID', await c.post('/customer/saved-upi', { id: 'nope' }), 400);
  refused('no duplicate UPI ID', await c.post('/customer/saved-upi', { id: 'ravi@okbank' }), 400);
  check('UPI list', (await c.get('/customer/saved-upi')).data.length === 1);
  okIs('remove UPI ID', await c.del('/customer/saved-upi/ravi@okbank'));

  section('Subscriptions and enquiries');
  refused('dry ice cannot be subscribed to', await c.post('/customer/subscriptions', { productId: 'dry-1', qty: 1, frequency: 'daily', slot: SLOT, addressId: 'home', startDate: tomorrow }), 400);
  const sub = await c.post('/customer/subscriptions', { productId: 'tube-5', qty: 2, frequency: 'alternate', slot: SLOT, addressId: 'home', startDate: dayjs().startOf('day').toISOString() });
  okIs('add subscription', sub);
  check('subscription list', (await c.get('/customer/subscriptions')).data[0].frequency === 'alternate');
  okIs('edit subscription', await c.post('/customer/subscriptions', { id: sub.data.id, productId: 'tube-5', qty: 3, frequency: 'daily', slot: SLOT, addressId: 'home', startDate: dayjs().startOf('day').toISOString() }));
  const skipped = await c.post(`/customer/subscriptions/${sub.data.id}/skip`, { day: dayjs().startOf('day').toISOString() });
  check('skip a day', skipped.data.skipped.length === 1);
  const cronOf = () => call('POST', '/cron/daily', { headers: { 'x-cron-secret': config.cronSecret } });
  const beforeCount = (await c.get('/customer/orders')).data.length;
  okIs('daily job', await cronOf());
  check('a skipped day places nothing', (await c.get('/customer/orders')).data.length === beforeCount);
  const unskipped = await c.post(`/customer/subscriptions/${sub.data.id}/skip`, { day: dayjs().startOf('day').toISOString() });
  check('bring the day back', unskipped.data.skipped.length === 0);
  const paused = await c.post(`/customer/subscriptions/${sub.data.id}/pause`, { paused: true });
  check('pause', paused.data.paused === true);
  await cronOf();
  check('a paused subscription places nothing', (await c.get('/customer/orders')).data.length === beforeCount);
  await c.post(`/customer/subscriptions/${sub.data.id}/pause`, { paused: false });
  const job = await cronOf();
  check('a due subscription places an order', job.data.subscriptions === 1, job.data);
  check('it is on the order list', (await c.get('/customer/orders')).data.length === beforeCount + 1);
  check('and only once a day', (await cronOf()).data.subscriptions === 0);
  okIs('cancel subscription', await c.del(`/customer/subscriptions/${sub.data.id}`));
  refused('an enquiry needs a quantity', await c.post('/customer/enquiries', { eventType: 'Wedding', date: tomorrow, location: 'Andheri' }), 400);
  const enq = await c.post('/customer/enquiries', { eventType: 'Wedding', date: tomorrow, quantityKg: 200, location: 'Andheri', notes: 'Evening' });
  okIs('bulk enquiry', enq);
  refused('a quote needs text', await act('quoteEnquiry', enq.data.id, ''), 400);
  okIs('admin quotes', await act('quoteEnquiry', enq.data.id, '₹5 per kg'));
  check('the customer sees the quote', (await c.get('/customer/enquiries')).data[0].quote === '₹5 per kg');

  section('Customer notifications and tickets');
  const notes = (await c.get('/customer/notifications')).data;
  check('notification shape fits the app', notes[0].at && 'read' in notes[0] && 'orderId' in notes[0], notes[0]);
  okIs('mark read', await c.post(`/customer/notifications/${notes[0].id}/read`));
  okIs('mark all read', await c.post('/customer/notifications/read-all'));
  okIs('delete one', await c.del(`/customer/notifications/${notes[0].id}`));
  okIs('save prefs', await c.put('/customer/notification-prefs', { 'Order updates': false, $bad: true }).then((x) => (x.status === 400 ? { ok: true } : x)));
  await c.put('/customer/notification-prefs', { 'Order updates': false });
  check('prefs saved', (await c.get('/customer/notification-prefs')).data['Order updates'] === false);
  okIs('muted list exists', await c.get('/customer/notifications/muted'));
  okIs('mute', await c.put('/customer/notifications/muted', { types: [] }));
  okIs('clear', await c.del('/customer/notifications'));
  const ct = await c.post('/customer/tickets', { subject: 'Hi', category: 'Account', message: 'Help' });
  check('ticket fits the customer app', ct.data.messages[0].fromCustomer === true && ct.data.closed === false, ct.data);
  okIs('customer replies', await c.post(`/customer/tickets/${ct.data.id}/reply`, { message: 'More' }));
  okIs('customer closes', await c.post(`/customer/tickets/${ct.data.id}/resolve`));
  check('customer ticket list', (await c.get('/customer/tickets')).data[0].closed === true);

  /* ---- Remaining admin actions ---- */
  section('Admin records');
  refused('dealer phone must be valid', await act('saveDealer', { businessName: 'X', phone: '12' }), 400);
  refused('dealer phone must be new', await act('saveDealer', { businessName: 'X', phone: '9876543210', addressLine: 'x', city: 'y' }), 400, 'already belongs');
  const nd = await act('saveDealer', { businessName: 'Admin Added', ownerName: 'A', phone: '9812300003', gstin: '27ABCDE1234F1Z6', tier: 'Silver', addressLine: '1 Road', city: 'Mumbai' });
  okIs('admin adds a dealer', nd);
  check('it starts as KYC pending', nd.data.changes.dealers[0].kycStatus === 'pending' && nd.data.changes.dealers[0].code.startsWith('ICD-'));
  okIs('admin edits a dealer', await act('saveDealer', { ...nd.data.changes.dealers[0], businessName: 'Admin Edited', active: false }));
  refused('credit must be valid', await act('setCredit', dealerId, -1, 1), 400);
  refused('rider phone must be new', await act('saveRider', { name: 'X', phone: '9000000001' }), 400);
  const nr = await act('saveRider', { name: 'New Rider', phone: '9812300004', vehicleType: 'Pickup truck', vehicleNumber: 'MH 01 A 1', licence: 'L', zone: 'Z', factoryId: 'F1', salary: 20000, password: 'Rider@1234' });
  okIs('admin adds a rider', nr);
  okIs('the new rider can sign in', await call('POST', `${OPEN('rider')}/login`, { body: { phone: '9812300004', password: 'Rider@1234' } }));
  okIs('admin deactivates a rider', await act('saveRider', { ...nr.data.changes.riders[0], active: false }));
  refused('an inactive rider cannot sign in', await call('POST', `${OPEN('rider')}/login`, { body: { phone: '9812300004', password: 'Rider@1234' } }), 403);
  refused('an inactive rider cannot get orders', await act('assignRider', payOrder.data.id, nr.data.changes.riders[0].id), 400);
  await models.Attendance.deleteMany({ riderId: 'R3', day: dayjs().format('YYYY-MM-DD') });
  const inn = await act('checkInRider', 'R3');
  okIs('admin checks in a rider', inn);
  refused('only once a day', await act('checkInRider', 'R3'), 400);
  okIs('admin checks out a rider', await act('checkOutRider', inn.data.changes.attendance[0].id));
  refused('and only once', await act('checkOutRider', inn.data.changes.attendance[0].id), 400);
  refused('factory needs a capacity', await act('saveFactory', { name: 'X' }), 400);
  const nf = await act('saveFactory', { name: 'Vashi', city: 'Navi Mumbai', manager: 'M', phone: '9000000000', capacityKg: 5000 });
  okIs('add factory', nf);
  okIs('edit factory', await act('saveFactory', { ...nf.data.changes.factories[0], name: 'Vashi 2', active: false }));
  refused('product needs a price', await act('saveProduct', { name: 'X', slabs: [] }), 400);
  refused('slabs must differ', await act('saveProduct', { name: 'X', slabs: [{ minQty: 1, price: 2 }, { minQty: 1, price: 3 }] }), 400);
  refused('a customer product needs a customer price', await act('saveProduct', { name: 'X', category: 'Cube Ice', forCustomers: true, slabs: [{ minQty: 1, price: 2 }] }), 400);
  okIs('edit a product', await act('saveProduct', { id: scarceId, name: 'Scarce 2', category: 'Cube Ice', pack: '1 kg', unit: 'bag', slabs: [{ minQty: 1, price: 900 }], active: false }));
  refused('an offer needs a code', await act('saveOffer', { title: 'X', audience: 'customer', validTill: tomorrow }), 400);
  const of = await act('saveOffer', { title: 'Test', audience: 'customer', code: 'test5', percent: 5, minOrder: 100, validTill: dayjs().add(5, 'day').toISOString() });
  okIs('add an offer', of);
  check('code is upper case', of.data.changes.offers[0].code === 'TEST5');
  refused('a code is unique', await act('saveOffer', { title: 'T2', audience: 'customer', code: 'TEST5', validTill: tomorrow }), 400);
  check('customers see the new offer', (await c.get('/customer/coupons')).data.some((x) => x.code === 'TEST5'));
  okIs('switch it off', await act('saveOffer', { ...of.data.changes.offers[0], active: false }));
  check('then they do not', !(await c.get('/customer/coupons')).data.some((x) => x.code === 'TEST5'));
  refused('company needs valid GSTIN', await act('updateCompany', { gstin: 'bad' }), 400);
  okIs('company details', await act('updateCompany', { address: '1 Ice Lane', gstin: '27ABCDE1234F1Z5' }));
  refused('charges must be valid', await act('updateCharges', { minOrder: -1, freeDeliveryAbove: 1, deliveryFee: 1 }), 400);
  okIs('dealer charges', await act('updateCharges', { minOrder: 1000, freeDeliveryAbove: 5000, deliveryFee: 250 }));
  okIs('customer charges', await act('updateCustomerCharges', { deliveryFee: 49 }));
  refused('new staff needs a password', await act('saveStaff', { name: 'S', email: 's@x.com', role: 'Dispatch' }), 400);
  refused('staff email is unique', await act('saveStaff', { name: 'S', email: 'admin@iceclub.online', password: 'Passw0rd!' }), 400);
  const ns = await act('saveStaff', { name: 'New Staff', email: 'New@iceclub.online', role: 'Dispatch', password: 'Staff@1234' });
  okIs('add staff', ns);
  check('staff response has no password', !JSON.stringify(ns.data).includes('passwordHash'));
  const dispatchLogin = await call('POST', '/auth/admin/login', { body: { email: 'new@iceclub.online', password: 'Staff@1234' } });
  okIs('new staff signs in', dispatchLogin);
  refused('dispatch cannot record payments', await call('POST', '/admin/actions/addLedgerEntry', { token: dispatchLogin.data.token, body: { args: [{}] } }), 403);
  okIs('deactivate staff', await act('saveStaff', { ...ns.data.changes.staff[0], active: false }));
  refused('their token stops working', await api(dispatchLogin.data.token).get('/admin/me'), 401);
  refused('you cannot lock yourself out', await act('saveStaff', { id: adminLogin.data.user.id, name: 'A', email: 'admin@iceclub.online', role: 'Dispatch' }), 400);
  const cust = (await adminApi.get('/admin/bootstrap')).data.customers.find((x) => x.phone === '9812300002');
  check('admin sees wallet balance', cust.walletBalance > 0);
  okIs('deactivate customer', await act('saveCustomer', cust.id, false));
  refused('their app stops working', await c.get('/customer/me'), 401);
  okIs('reactivate customer', await act('saveCustomer', cust.id, true));

  section('Deleting accounts');
  const del = await otpLogin('customer', '9812300005');
  const delApi = api(del.token);
  okIs('customer deletes their account', await delApi.del('/customer/me'));
  refused('the token stops working', await delApi.get('/customer/me'), 401);
  const again = await otpLogin('customer', '9812300005');
  check('the number can sign up again, fresh', again.user.name === '');
  refused('a dealer with money owed cannot delete', await demo.del('/dealer/me'), 400);
  const dd = await otpLogin('dealer', '9812300006');
  okIs('a new dealer can delete', await api(dd.token).del('/dealer/me'));

  /* ---- Coverage ---- */
  section('Every API was called');
  const patternOf = (path) => new RegExp(`^${path.replace(/:[^/]+/g, '[^/]+')}$`);
  const routesOf = (router, prefix) => router.stack.flatMap((l) => (l.route ? Object.keys(l.route.methods).map((m) => ({ method: m.toUpperCase(), path: `${prefix}${l.route.path}` })) : l.handle?.stack ? routesOf(l.handle, prefix) : []));
  const allRoutes = [...routesOf(authRouter, '/auth'), ...routesOf(dealerRouter, '/dealer'), ...routesOf(riderRouter, '/rider'), ...routesOf(customerRouter, '/customer'), ...routesOf(adminRouter, '/admin'), ...routesOf(filesRouter, '')];
  const hitList = [...hits].map((h) => h.split(' '));
  const missing = allRoutes.filter((route) => !hitList.some(([method, path]) => method === route.method && patternOf(route.path).test(path)));
  check(`all ${allRoutes.length} routes were called`, missing.length === 0, missing.map((x) => `${x.method} ${x.path}`).join(', '));
  const missingActions = ACTION_NAMES.filter((name) => !actionHits.has(name));
  check(`all ${ACTION_NAMES.length} admin actions were called`, missingActions.length === 0, missingActions.join(', '));
  console.log(`  ${allRoutes.length} routes and ${ACTION_NAMES.length} admin actions`);

  const dbsAfter = (await mongoose.connection.db.admin().listDatabases({ nameOnly: true })).databases.map((x) => x.name).filter((n) => n !== 'iceclub_test').sort();
  check('no other database was touched', JSON.stringify(dbsBefore) === JSON.stringify(dbsAfter));
} catch (error) {
  failures.push(`The run stopped early: ${error.stack}`);
} finally {
  server.close();
  server.closeAllConnections?.();
  await mongoose.connection.db.dropDatabase();
  await closeDb();
}

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.log(` - ${f}`);
  process.exitCode = 1;
}
