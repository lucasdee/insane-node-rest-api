import { Router } from 'express';
import swaggerUi from 'swagger-ui-express';
import apiSpec from './swagger.json';

export const swaggerRouter = Router().use('/', swaggerUi.serve, swaggerUi.setup(apiSpec));
