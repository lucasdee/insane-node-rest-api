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

  describe('rate limits', () => {
    const OPTIONAL = [
      'RATE_LIMIT_ENABLED',
      'RATE_LIMIT_LOGIN_MAX',
      'RATE_LIMIT_REGISTER_MAX',
      'RATE_LIMIT_REFRESH_MAX',
    ];

    it('are enabled with default limits when not configured', async () => {
      // Empty counts as unset, and is not overwritten by a local .env file.
      OPTIONAL.forEach((name) => vi.stubEnv(name, ''));

      expect((await loadEnv()).rateLimit).toEqual({
        enabled: true,
        loginMax: 10,
        registerMax: 5,
        refreshMax: 60,
      });
    });

    it('read the configured limits', async () => {
      vi.stubEnv('RATE_LIMIT_ENABLED', 'false');
      vi.stubEnv('RATE_LIMIT_LOGIN_MAX', '20');
      vi.stubEnv('RATE_LIMIT_REGISTER_MAX', '3');
      vi.stubEnv('RATE_LIMIT_REFRESH_MAX', '100');

      expect((await loadEnv()).rateLimit).toEqual({
        enabled: false,
        loginMax: 20,
        registerMax: 3,
        refreshMax: 100,
      });
    });

    it.each(['0', '-5', '2.5', 'ten'])('reject a limit of "%s"', async (value) => {
      vi.stubEnv('RATE_LIMIT_LOGIN_MAX', value);

      await expect(loadEnv()).rejects.toThrow(
        `RATE_LIMIT_LOGIN_MAX must be a positive integer, got "${value}"`,
      );
    });
  });

  it.each([
    ['', false],
    ['false', false],
    ['true', true],
    ['1', 1],
    ['2', 2],
    ['loopback, 10.0.0.0/8', 'loopback, 10.0.0.0/8'],
  ])('reads TRUST_PROXY="%s" as %s', async (value, expected) => {
    vi.stubEnv('TRUST_PROXY', value);

    expect((await loadEnv()).trustProxy).toBe(expected);
  });

  describe('DOCS_ENABLED', () => {
    it.each([
      ['development', true],
      ['test', true],
      ['production', false],
    ])('defaults to on unless in production (NODE_ENV=%s)', async (nodeEnv, expected) => {
      vi.stubEnv('NODE_ENV', nodeEnv);
      vi.stubEnv('DOCS_ENABLED', '');

      expect((await loadEnv()).docsEnabled).toBe(expected);
    });

    it.each([
      ['production', 'true', true],
      ['development', 'false', false],
    ])('overrides the default (NODE_ENV=%s, DOCS_ENABLED=%s)', async (nodeEnv, value, expected) => {
      vi.stubEnv('NODE_ENV', nodeEnv);
      vi.stubEnv('DOCS_ENABLED', value);

      expect((await loadEnv()).docsEnabled).toBe(expected);
    });

    it.each(['yes', '1', 'TRUE'])('rejects "%s"', async (value) => {
      vi.stubEnv('DOCS_ENABLED', value);

      await expect(loadEnv()).rejects.toThrow(
        `DOCS_ENABLED must be "true" or "false", got "${value}"`,
      );
    });
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
