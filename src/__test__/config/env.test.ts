import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const REQUIRED = [
  'CORS_ORIGIN',
  'JWT_SECRET',
  'JWT_REFRESH_SECRET',
  'JWT_REFRESH_HASH_SECRET',
  'JWT_ACCESS_TOKEN_EXPIRES_IN_MINUTES',
  'JWT_REFRESH_TOKEN_EXPIRES_IN_DAYS',
  'PORT',
  'DATABASE_USER',
  'DATABASE_PASSWORD',
  'DATABASE_HOST',
  'DATABASE_NAME',
  'SHADOW_DATABASE_NAME',
  'DATABASE_PORT',
];

// env.ts runs its checks when imported, so each test imports a fresh copy.
const loadEnv = async () => (await import('../../config/env')).env;

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('env', () => {
  // An empty value counts as missing. It is also not overwritten by dotenv,
  // so a local .env file cannot mask the missing variable.
  it.each(REQUIRED)('throws when %s is missing', async (name) => {
    vi.stubEnv(name, '');

    await expect(loadEnv()).rejects.toThrow(`${name} is not defined in environment variables`);
  });

  it('parses numeric settings', async () => {
    vi.stubEnv('PORT', '8080');
    vi.stubEnv('DATABASE_PORT', '3307');
    vi.stubEnv('JWT_ACCESS_TOKEN_EXPIRES_IN_MINUTES', '15');
    vi.stubEnv('JWT_REFRESH_TOKEN_EXPIRES_IN_DAYS', '30');

    const env = await loadEnv();

    expect(env.port).toBe(8080);
    expect(env.db.port).toBe(3307);
    expect(env.jwt.accessTokenExpiresInMinutes).toBe(15);
    expect(env.jwt.refreshTokenExpiresInDays).toBe(30);
  });

  it('defaults NODE_ENV to development', async () => {
    vi.stubEnv('NODE_ENV', '');

    expect((await loadEnv()).nodeEnv).toBe('development');
  });

  it('exposes the configured values', async () => {
    const env = await loadEnv();

    expect(env).toMatchObject({
      nodeEnv: 'test',
      corsOrigin: 'http://localhost:3000',
      jwt: { secret: 'test-secret', refreshSecret: 'test-refresh-secret' },
      db: { host: 'localhost', name: 'test', shadowName: 'test_shadow' },
    });
  });
});
