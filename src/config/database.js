import dns from 'node:dns';
import mongoose from 'mongoose';
import { config } from './index.js';

// Lets every query inside connection.transaction() join the transaction by itself.
mongoose.set('transactionAsyncLocalStorage', true);
mongoose.set('strictQuery', true);

let connecting;

/** Safe to call on every request, for hosts that start the app per request. */
export function connectDb() {
  if (config.dnsServers.length) dns.setServers(config.dnsServers);
  connecting ??= mongoose.connect(config.mongoUri, { dbName: config.dbName, serverSelectionTimeoutMS: 20000 }).catch((error) => {
    connecting = null;
    throw error;
  });
  return connecting;
}

export const closeDb = () => mongoose.disconnect();
