import { startServer } from './app.js';
import { connectDb } from './config/database.js';
import { config } from './config/index.js';
import { runDailyJobs } from './services/jobs.service.js';

const HOUR = 60 * 60 * 1000;

await connectDb();

startServer(config.port, config.host, () => {
  console.log(`ICECLUB API on port ${config.port}, database "${config.dbName}"`);
  if (config.demoOtp) console.log('Demo OTP is ON. Turn it off before real customers use this.');
  if (config.demoPayments) console.log('Demo payments are ON. Turn them off before real customers use this.');
});

// Standing orders, subscriptions and payment reminders go out even if nobody opens an app.
if (!config.isTest) {
  const run = () => runDailyJobs().catch((error) => console.error('Daily jobs failed', error));
  run();
  setInterval(run, HOUR);
}
