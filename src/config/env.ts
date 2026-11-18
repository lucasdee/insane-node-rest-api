import dotenv from 'dotenv';

dotenv.config();

if (!process.env.CORS_ORIGIN) {
  throw new Error('CORS_ORIGIN is not defined in environment variables');
}

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET is not defined in environment variables');
}

if (!process.env.JWT_REFRESH_SECRET) {
  throw new Error('JWT_REFRESH_SECRET is not defined in environment variables');
}

if (!process.env.JWT_REFRESH_HASH_SECRET) {
  throw new Error('JWT_REFRESH_HASH_SECRET is not defined in environment variables');
}

if (!process.env.JWT_ACCESS_TOKEN_EXPIRES_IN_MINUTES) {
  throw new Error('JWT_ACCESS_TOKEN_EXPIRES_IN_MINUTES is not defined in environment variables');
}

if (!process.env.JWT_REFRESH_TOKEN_EXPIRES_IN_DAYS) {
  throw new Error('JWT_REFRESH_TOKEN_EXPIRES_IN_DAYS is not defined in environment variables');
}

if (!process.env.PORT) {
  throw new Error('PORT is not defined in environment variables');
}

if (!process.env.DATABASE_USER) {
  throw new Error('DATABASE_USER is not defined in environment variables');
}

if (!process.env.DATABASE_PASSWORD) {
  throw new Error('DATABASE_PASSWORD is not defined in environment variables');
}

if (!process.env.DATABASE_HOST) {
  throw new Error('DATABASE_HOST is not defined in environment variables');
}

if (!process.env.DATABASE_NAME) {
  throw new Error('DATABASE_NAME is not defined in environment variables');
}

if (!process.env.SHADOW_DATABASE_NAME) {
  throw new Error('SHADOW_DATABASE_NAME is not defined in environment variables');
}

if (!process.env.DATABASE_PORT) {
  throw new Error('DATABASE_PORT is not defined in environment variables');
}

/** Reads an optional positive integer. Unset or empty means `fallback`. */
const optionalPositiveInt = (name: string, fallback: number): number => {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer, got "${raw}"`);
  }
  return value;
};

/**
 * Express's `trust proxy` setting: a number of proxy hops (e.g. `1`), `true`/`false`,
 * or a comma-separated list of trusted addresses or subnets. Unset means no proxy is
 * trusted, and the client IP is the address of the connection.
 */
const parseTrustProxy = (raw: string | undefined): boolean | number | string => {
  if (raw === undefined || raw === '' || raw === 'false') return false;
  if (raw === 'true') return true;
  if (/^\d+$/.test(raw)) return Number(raw);
  return raw;
};

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10),
  corsOrigin: process.env.CORS_ORIGIN,
  jwt: {
    secret: process.env.JWT_SECRET,
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    refreshHashSecret: process.env.JWT_REFRESH_HASH_SECRET,
    accessTokenExpiresInMinutes: parseInt(process.env.JWT_ACCESS_TOKEN_EXPIRES_IN_MINUTES, 10),
    refreshTokenExpiresInDays: parseInt(process.env.JWT_REFRESH_TOKEN_EXPIRES_IN_DAYS, 10),
  },
  db: {
    user: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    host: process.env.DATABASE_HOST,
    name: process.env.DATABASE_NAME,
    shadowName: process.env.SHADOW_DATABASE_NAME,
    port: parseInt(process.env.DATABASE_PORT, 10),
  },
  trustProxy: parseTrustProxy(process.env.TRUST_PROXY),
  // Requests per client IP to the auth endpoints, per window (see middlewares/rateLimit).
  rateLimit: {
    enabled: process.env.RATE_LIMIT_ENABLED !== 'false',
    loginMax: optionalPositiveInt('RATE_LIMIT_LOGIN_MAX', 10),
    registerMax: optionalPositiveInt('RATE_LIMIT_REGISTER_MAX', 5),
    refreshMax: optionalPositiveInt('RATE_LIMIT_REFRESH_MAX', 60),
  },
};
