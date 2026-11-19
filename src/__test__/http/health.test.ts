import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../../app';

const { $queryRaw } = vi.hoisted(() => ({ $queryRaw: vi.fn() }));

// vi.mock is hoisted above the imports, so `app` is loaded with the fake client.
vi.mock('../../config/db', () => ({ prisma: { $queryRaw } }));

beforeEach(() => {
  $queryRaw.mockReset();
});

describe('GET /health', () => {
  it('answers without touching the database', async () => {
    $queryRaw.mockRejectedValue(new Error('database down'));

    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
    expect(res.headers['cache-control']).toBe('no-store');
    expect($queryRaw).not.toHaveBeenCalled();
  });

  it('needs no token', async () => {
    const res = await request(app).get('/health').set('Authorization', 'Bearer not-a-jwt');

    expect(res.status).toBe(200);
  });
});

describe('GET /health/ready', () => {
  it('returns 200 when the database answers', async () => {
    $queryRaw.mockResolvedValue([{ 1: 1 }]);

    const res = await request(app).get('/health/ready');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
    expect(res.headers['cache-control']).toBe('no-store');
    expect($queryRaw).toHaveBeenCalledTimes(1);
  });

  it('returns 503 without the cause when the database is unreachable', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    $queryRaw.mockRejectedValue(new Error('connect ECONNREFUSED 10.0.0.5:3306'));

    try {
      const res = await request(app).get('/health/ready');

      expect(res.status).toBe(503);
      expect(res.body).toEqual({ status: 'unavailable' });
      expect(res.text).not.toContain('ECONNREFUSED');
      expect(error).toHaveBeenCalledWith(
        'Readiness check failed: the database is unreachable.',
        expect.any(Error),
      );
    } finally {
      error.mockRestore();
    }
  });
});
