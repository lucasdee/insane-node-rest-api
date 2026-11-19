import { Router } from 'express';
import { prisma } from './config/db';

/**
 * Probes for load balancers and orchestrators. Not part of the API spec, and without
 * auth or rate limits. app.ts mounts them before the request logs, since probes run
 * every few seconds and would flood them.
 */
export const healthRouter = Router();

healthRouter.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

/** Liveness: the process is up and answering. Doesn't touch the database. */
healthRouter.get('/', (_req, res) => {
  res.json({ status: 'ok' });
});

/**
 * Readiness: the database answers too. A 503 tells the load balancer to send traffic
 * elsewhere until it recovers. The cause is logged, not returned.
 */
healthRouter.get('/ready', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok' });
  } catch (err) {
    console.error('Readiness check failed: the database is unreachable.', err);
    res.status(503).json({ status: 'unavailable' });
  }
});
