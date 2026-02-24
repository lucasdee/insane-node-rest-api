import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createStream } from 'rotating-file-stream';

import { swaggerRouter } from './docs/openapi.js';
import { RegisterRoutes } from './routes/routes.js';
import { errorHandler } from './middlewares/errorHandler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const logsDir = path.join(__dirname, 'logs');
fs.mkdirSync(logsDir, { recursive: true });

const accessLogStream = createStream('access.log', {
  interval: '1d', // rotate daily
  path: logsDir,
});

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));
app.use(morgan('combined', { stream: accessLogStream }));

RegisterRoutes(app);

app.use('/docs', swaggerRouter);

app.use(errorHandler);

export default app;
