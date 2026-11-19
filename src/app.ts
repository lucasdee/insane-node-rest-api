import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import morgan from 'morgan';
import fs from 'fs';
import { createStream } from 'rotating-file-stream';

import { swaggerRouter } from './docs/openapi';
import { RegisterRoutes } from './routes/routes';
import { errorHandler } from './middlewares/errorHandler';
import { env } from './config/env';
import { NotFoundError } from './errors';
import { healthRouter } from './health';

const accessLogStream = (dir: string) => {
  fs.mkdirSync(dir, { recursive: true });
  return createStream('access.log', { interval: '1d', path: dir });
};

const app = express();

// Behind a reverse proxy, lets req.ip be the client's address (from X-Forwarded-For),
// which the rate limits key on. Off unless TRUST_PROXY is set.
app.set('trust proxy', env.trustProxy);

app.use(helmet());

// Before the request logs: probes run every few seconds and would flood them.
app.use('/health', healthRouter);

app.use(cors({ origin: env.corsOrigin, credentials: true }));
app.use(cookieParser());
app.use(express.json());
// Colored, short request lines on the console while developing. Production relies on
// the access log file, and tests stay quiet.
if (env.nodeEnv !== 'production' && env.nodeEnv !== 'test') {
  app.use(morgan('dev'));
}
if (env.accessLog.enabled) {
  app.use(morgan('combined', { stream: accessLogStream(env.accessLog.dir) }));
}

RegisterRoutes(app);

// Without it, /docs falls through to the JSON 404 below.
if (env.docsEnabled) {
  app.use('/docs', swaggerRouter);
}

// Anything no route matched: answer with JSON like the rest of the API, not Express's HTML page.
app.use(() => {
  throw new NotFoundError('Route not found');
});

app.use(errorHandler);

export default app;
