import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
// import routes from './routes';
import { swaggerRouter } from './docs/openapi.js';
import { RegisterRoutes } from './routes/routes.js';
import { errorHandler } from './middlewares/errorHandler.js';

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

RegisterRoutes(app);

// app.use('/api', routes);
app.use('/docs', swaggerRouter);

app.use(errorHandler);

export default app;
