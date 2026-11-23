import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import app from '../../app';

vi.mock('../../config/db', () => ({ prisma: {} }));

const ALLOWED_ORIGIN = 'http://localhost:3000';

describe('security headers', () => {
  it('sets helmet headers and hides the framework', async () => {
    const res = await request(app).get('/users/me');

    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(res.headers['strict-transport-security']).toBeDefined();
    expect(res.headers['content-security-policy']).toBeDefined();
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});

describe('CORS', () => {
  it('allows the configured origin with credentials', async () => {
    const res = await request(app).get('/users/me').set('Origin', ALLOWED_ORIGIN);

    expect(res.headers['access-control-allow-origin']).toBe(ALLOWED_ORIGIN);
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  it('never echoes back another origin', async () => {
    const res = await request(app).get('/users/me').set('Origin', 'https://evil.example');

    expect(res.headers['access-control-allow-origin']).not.toBe('https://evil.example');
  });

  it('answers preflight requests', async () => {
    const res = await request(app)
      .options('/memos/create')
      .set('Origin', ALLOWED_ORIGIN)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'Authorization, Content-Type');

    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe(ALLOWED_ORIGIN);
    expect(res.headers['access-control-allow-methods']).toContain('POST');
  });
});

describe('API docs', () => {
  it('serves Swagger UI at /docs/', async () => {
    const res = await request(app).get('/docs/');

    expect(res.status).toBe(200);
    expect(res.text).toContain('swagger-ui');
  });
});

describe('unknown routes', () => {
  it.each([
    ['an unknown GET path', 'get', '/does-not-exist'],
    ['an unknown POST path', 'post', '/does-not-exist'],
    ['a known path with an unsupported method', 'get', '/auth/login'],
  ] as const)('returns a JSON 404 for %s', async (_label, method, path) => {
    const res = await request(app)[method](path);

    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toMatch(/^application\/json/);
    expect(res.body).toEqual({ message: 'Route not found' });
  });
});
