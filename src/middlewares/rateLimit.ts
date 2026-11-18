import type { RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import { env } from '../config/env';

const MINUTE = 60 * 1000;

/**
 * Limits requests per client IP, counted in memory. That suits a single instance;
 * several instances behind a load balancer would each count separately and need a
 * shared store (e.g. Redis). Behind a proxy, set TRUST_PROXY so that the client IP
 * is taken from X-Forwarded-For rather than being the proxy's own address.
 */
const perIpLimit = (windowMs: number, limit: number): RequestHandler =>
  env.rateLimit.enabled
    ? rateLimit({
        windowMs,
        limit,
        standardHeaders: 'draft-8',
        legacyHeaders: false,
        message: { message: 'Too many requests, please try again later' },
      })
    : (_req, _res, next) => next();

/** Slows down password guessing; every login also costs a bcrypt comparison. */
export const loginRateLimit = perIpLimit(15 * MINUTE, env.rateLimit.loginMax);

/** Limits account creation; every registration also costs a bcrypt hash. */
export const registerRateLimit = perIpLimit(60 * MINUTE, env.rateLimit.registerMax);

export const refreshRateLimit = perIpLimit(15 * MINUTE, env.rateLimit.refreshMax);
