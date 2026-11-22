import { describe, it, expect, vi, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../app';

// Rate limiting is off for the other test files (see vitest.config.mts). The limiters are
// created when app.ts is imported, so the settings must be in place before that import:
// vi.hoisted runs above the imports. With one trusted proxy hop, each test can act as
// its own client via X-Forwarded-For.
vi.hoisted(() => {
  vi.stubEnv('RATE_LIMIT_ENABLED', 'true');
  vi.stubEnv('RATE_LIMIT_LOGIN_MAX', '3');
  vi.stubEnv('RATE_LIMIT_REGISTER_MAX', '2');
  vi.stubEnv('RATE_LIMIT_REFRESH_MAX', '2');
  vi.stubEnv('TRUST_PROXY', '1');
});

vi.mock('../../config/db', () => ({ prisma: {} }));

afterAll(() => {
  vi.unstubAllEnvs();
});

/**
 * An empty body (422) or a missing cookie (401) is answered without touching the
 * database or bcrypt. The limiter runs before validation, so these requests count.
 */
const post = (path: string, ip: string) =>
  request(app).post(path).set('X-Forwarded-For', ip).send({});

describe('rate limits on the auth endpoints', () => {
  it.each([
    ['/auth/login', 3, '10.0.0.1'],
    ['/auth/register', 2, '10.0.0.2'],
    ['/auth/refresh', 2, '10.0.0.3'],
  ])('allows %s %i times per client IP, then answers 429', async (path, limit, ip) => {
    for (let i = 0; i < limit; i++) {
      expect((await post(path, ip)).status).not.toBe(429);
    }

    const res = await post(path, ip);

    expect(res.status).toBe(429);
    expect(res.headers['content-type']).toMatch(/^application\/json/);
    expect(res.body).toEqual({ message: 'Too many requests, please try again later' });
    expect(res.headers['retry-after']).toEqual(expect.any(String));
    expect(res.headers['ratelimit-policy']).toContain(`q=${limit}`);
  });

  it('counts each client IP separately', async () => {
    for (let i = 0; i < 4; i++) await post('/auth/login', '10.0.1.1');

    expect((await post('/auth/login', '10.0.1.1')).status).toBe(429);
    expect((await post('/auth/login', '10.0.1.2')).status).toBe(422);
  });

  it('counts each endpoint separately', async () => {
    for (let i = 0; i < 4; i++) await post('/auth/login', '10.0.2.1');

    expect((await post('/auth/login', '10.0.2.1')).status).toBe(429);
    expect((await post('/auth/register', '10.0.2.1')).status).toBe(422);
  });

  it('does not limit other endpoints', async () => {
    for (let i = 0; i < 10; i++) {
      const res = await request(app).get('/users/me').set('X-Forwarded-For', '10.0.3.1');
      expect(res.status).toBe(401);
    }
  });
});
