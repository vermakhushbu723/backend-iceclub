import 'dotenv/config';

// Attendance, "today" and delivery slots all follow Indian time, wherever the server runs.
process.env.TZ = 'Asia/Kolkata';

const isTest = process.env.ICECLUB_TEST === '1';
const dbName = isTest ? 'iceclub_test' : process.env.DB_NAME || 'iceclub';

// The cluster holds other projects' databases. Nothing here may ever touch them.
if (!dbName.startsWith('iceclub')) {
  throw new Error(`DB_NAME must start with "iceclub", got "${dbName}"`);
}

for (const name of ['MONGODB_URI', 'JWT_SECRET']) {
  if (!process.env[name]) throw new Error(`${name} is not set. Copy .env.example to .env and fill it in.`);
}
if (process.env.JWT_SECRET.length < 32) throw new Error('JWT_SECRET must be at least 32 characters');

const list = (value) => (value ?? '').split(',').map((s) => s.trim()).filter(Boolean);

export const config = {
  isTest,
  isProduction: process.env.NODE_ENV === 'production',
  mongoUri: process.env.MONGODB_URI,
  dbName,
  port: Number(process.env.PORT || 4000),
  // 127.0.0.1 behind a proxy such as nginx, so the port isn't reachable from outside.
  host: process.env.HOST || undefined,
  dnsServers: list(process.env.DNS_SERVERS),
  corsOrigins: list(process.env.CORS_ORIGINS),
  jwtSecret: process.env.JWT_SECRET,
  cronSecret: process.env.CRON_SECRET,
  demoOtp: process.env.ALLOW_DEMO_OTP === 'true' ? '123456' : null,
  demoPayments: process.env.ALLOW_DEMO_PAYMENTS === 'true',
  tokenDays: { admin: 1, dealer: 30, rider: 30, customer: 60 },
  maxUploadBytes: 8 * 1024 * 1024,
};
