import { describe, it, expect, vi, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../app';

// app.ts decides whether to mount /docs when it is imported, so the setting must be in
// place before that import: vi.hoisted runs above the imports. Production is the case
// where docs are off by default.
vi.hoisted(() => {
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('DOCS_ENABLED', '');
  // Production would otherwise write this test's requests to ./logs.
  vi.stubEnv('ACCESS_LOG_ENABLED', 'false');
});

vi.mock('../../config/db', () => ({ prisma: {} }));

afterAll(() => {
  vi.unstubAllEnvs();
});

describe('API docs in production', () => {
  it.each(['/docs', '/docs/', '/docs/swagger-ui-init.js'])('are not served at %s', async (path) => {
    const res = await request(app).get(path);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ message: 'Route not found' });
  });

  it('leaves the API itself working', async () => {
    const res = await request(app).get('/users/me');

    expect(res.status).toBe(401);
  });
});
