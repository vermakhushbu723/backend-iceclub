import compression from 'compression';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { connectDb } from './config/database.js';
import { config } from './config/index.js';
import { errorHandler } from './middleware/error-handler.js';
import { rejectOperators } from './middleware/no-operators.js';
import { admin } from './modules/admin/admin.routes.js';
import { auth } from './modules/auth/auth.routes.js';
import { customer } from './modules/customer/customer.routes.js';
import { dealer } from './modules/dealer/dealer.routes.js';
import { files } from './modules/files/file.routes.js';
import { rider } from './modules/rider/rider.routes.js';
import { system } from './modules/system/system.routes.js';
import { ApiError } from './utils/http.js';

/**
 * Node closes an idle connection after 5 seconds by default. An app reusing that connection at
 * the same moment fails with "could not reach the server", so idle connections stay open longer.
 */
export function startServer(port, host, onReady) {
  const server = createApp().listen(port, host, onReady);
  server.keepAliveTimeout = 65 * 1000;
  server.headersTimeout = 66 * 1000;
  return server;
}

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(helmet());
  // Mobile apps send no Origin header, so this list only concerns browsers.
  app.use(cors({ origin: (origin, done) => done(null, !origin || config.corsOrigins.includes('*') || config.corsOrigins.includes(origin)) }));
  app.use(compression());
  app.use(express.json({ limit: '1mb' }));
  app.use(rejectOperators);

  app.use('/api', async (_req, _res, next) => {
    await connectDb();
    next();
  });

  app.use('/api', system);
  app.use('/api/auth', auth);
  app.use('/api/dealer', dealer);
  app.use('/api/rider', rider);
  app.use('/api/customer', customer);
  app.use('/api/admin', admin);
  app.use('/api', files);
  app.use('/api', (_req, _res, next) => next(new ApiError(404, 'Not found')));

  app.use(errorHandler);
  return app;
}
