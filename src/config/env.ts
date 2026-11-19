import dotenv from 'dotenv';

dotenv.config();

/*
 * Every setting is read and checked once, when this module is imported, so that a
 * missing or malformed value stops startup with a message naming it. An empty value
 * counts as unset.
 */

const read = (name: string): string | undefined => {
  const raw = process.env[name];
  return raw === undefined || raw === '' ? undefined : raw;
};

const required = (name: string): string => {
  const raw = read(name);
  if (raw === undefined) {
    throw new Error(`${name} is not defined in environment variables`);
  }
  return raw;
};

/** Digits only: rejects what parseInt would quietly accept, like "5abc", " 5" or "1e3". */
const parsePositiveInt = (name: string, raw: string): number => {
  const value = Number(raw);
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer, got "${raw}"`);
  }
  return value;
};

const requiredPositiveInt = (name: string): number => parsePositiveInt(name, required(name));

/** Reads an optional positive integer. Unset means `fallback`. */
const optionalPositiveInt = (name: string, fallback: number): number => {
  const raw = read(name);
  return raw === undefined ? fallback : parsePositiveInt(name, raw);
};

const requiredPort = (name: string): number => {
  const raw = required(name);
  const value = Number(raw);
  if (!/^\d+$/.test(raw) || value < 1 || value > 65535) {
    throw new Error(`${name} must be a port number (1-65535), got "${raw}"`);
  }
  return value;
};

/** Reads an optional `true`/`false`. Unset means `fallback`. */
const optionalBoolean = (name: string, fallback: boolean): boolean => {
  const raw = read(name);
  if (raw === undefined) return fallback;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  throw new Error(`${name} must be "true" or "false", got "${raw}"`);
};

/**
 * Express's `trust proxy` setting: a number of proxy hops (e.g. `1`), `true`/`false`,
 * or a comma-separated list of trusted addresses or subnets. Unset means no proxy is
 * trusted, and the client IP is the address of the connection.
 */
const parseTrustProxy = (raw: string | undefined): boolean | number | string => {
  if (raw === undefined || raw === 'false') return false;
  if (raw === 'true') return true;
  if (/^\d+$/.test(raw)) return Number(raw);
  return raw;
};

const nodeEnv = read('NODE_ENV') ?? 'development';

export const env = {
  nodeEnv,
  port: requiredPort('PORT'),
  corsOrigin: required('CORS_ORIGIN'),
  jwt: {
    secret: required('JWT_SECRET'),
    refreshSecret: required('JWT_REFRESH_SECRET'),
    refreshHashSecret: required('JWT_REFRESH_HASH_SECRET'),
    accessTokenExpiresInMinutes: requiredPositiveInt('JWT_ACCESS_TOKEN_EXPIRES_IN_MINUTES'),
    refreshTokenExpiresInDays: requiredPositiveInt('JWT_REFRESH_TOKEN_EXPIRES_IN_DAYS'),
  },
  db: {
    user: required('DATABASE_USER'),
    password: required('DATABASE_PASSWORD'),
    host: required('DATABASE_HOST'),
    port: requiredPort('DATABASE_PORT'),
    name: required('DATABASE_NAME'),
    // Not used by the app itself: prisma.config.ts builds the shadow database URL from
    // it, which `prisma migrate dev` needs.
    shadowName: required('SHADOW_DATABASE_NAME'),
  },
  trustProxy: parseTrustProxy(read('TRUST_PROXY')),
  // Serve Swagger UI at /docs. Off in production unless turned on explicitly.
  docsEnabled: optionalBoolean('DOCS_ENABLED', nodeEnv !== 'production'),
  // Requests per client IP to the auth endpoints, per window (see middlewares/rateLimit).
  rateLimit: {
    enabled: optionalBoolean('RATE_LIMIT_ENABLED', true),
    loginMax: optionalPositiveInt('RATE_LIMIT_LOGIN_MAX', 10),
    registerMax: optionalPositiveInt('RATE_LIMIT_REGISTER_MAX', 5),
    refreshMax: optionalPositiveInt('RATE_LIMIT_REFRESH_MAX', 60),
  },
};
