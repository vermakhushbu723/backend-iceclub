/** Starts a server on a freshly seeded `iceclub_test` database, for the apps' contract tests. */
process.env.ICECLUB_TEST = '1';
process.env.PORT = process.env.PORT || '4100';

const { config } = await import('../src/config/index.js');
const { connectDb } = await import('../src/config/database.js');
const { startServer } = await import('../src/app.js');
const { seed } = await import('../src/seed/run.js');

if (config.dbName !== 'iceclub_test') throw new Error('Refusing to run outside the test database');
await connectDb();
await seed({ reset: true });
startServer(config.port, '127.0.0.1', () => console.log(`Test server ready on ${config.port}`));
