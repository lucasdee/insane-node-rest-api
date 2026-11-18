import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';
import fs from 'fs';
import { createStream } from 'rotating-file-stream';

import { swaggerRouter } from './docs/openapi';
import { RegisterRoutes } from './routes/routes';
import { errorHandler } from './middlewares/errorHandler';
import { env } from './config/env';
import { NotFoundError } from './errors';

const logsDir = path.join(__dirname, 'logs');
fs.mkdirSync(logsDir, { recursive: true });

const accessLogStream = createStream('access.log', {
  interval: '1d',
  path: logsDir,
});

const app = express();

// Behind a reverse proxy, lets req.ip be the client's address (from X-Forwarded-For),
// which the rate limits key on. Off unless TRUST_PROXY is set.
app.set('trust proxy', env.trustProxy);

app.use(helmet());
app.use(cors({ origin: env.corsOrigin, credentials: true }));
app.use(cookieParser());
app.use(express.json());
app.use(morgan('dev'));
app.use(morgan('combined', { stream: accessLogStream }));

RegisterRoutes(app);

app.use('/docs', swaggerRouter);

// Anything no route matched: answer with JSON like the rest of the API, not Express's HTML page.
app.use(() => {
  throw new NotFoundError('Route not found');
});

app.use(errorHandler);

export default app;
