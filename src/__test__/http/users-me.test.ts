import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../../app';

const { findUnique } = vi.hoisted(() => ({ findUnique: vi.fn() }));

// vi.mock is hoisted above the imports, so `app` is loaded with the fake client.
vi.mock('../../config/db', () => ({ prisma: { user: { findUnique } } }));

const accessTokenFor = (userId: number) =>
  jwt.sign({ sub: String(userId) }, process.env.JWT_SECRET!, { expiresIn: '5m' });

beforeEach(() => {
  findUnique.mockReset();
});

describe('GET /users/me', () => {
  it('returns 404 when the authenticated user no longer exists', async () => {
    findUnique.mockResolvedValue(null);

    const res = await request(app)
      .get('/users/me')
      .set('Authorization', `Bearer ${accessTokenFor(42)}`);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ message: 'User not found' });
    expect(findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 42 } }));
  });

  it('returns 401 without a token', async () => {
    const res = await request(app).get('/users/me');

    expect(res.status).toBe(401);
    expect(findUnique).not.toHaveBeenCalled();
  });
});
