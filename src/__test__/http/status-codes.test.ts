import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../../app';

const { prisma } = vi.hoisted(() => ({
  prisma: {
    user: { findUnique: vi.fn(), create: vi.fn() },
    refreshToken: { deleteMany: vi.fn() },
  },
}));

// vi.mock is hoisted above the imports, so `app` is loaded with the fake client.
vi.mock('../../config/db', () => ({ prisma }));

const accessTokenFor = (userId: number) =>
  jwt.sign({ sub: String(userId) }, process.env.JWT_SECRET!, { expiresIn: '5m' });

beforeEach(() => {
  vi.resetAllMocks();
});

describe('POST /auth/register', () => {
  it('returns 409 when the username is already taken', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 1 });

    const res = await request(app).post('/auth/register').send({
      username: 'alice',
      password: 'secret123',
      email: 'alice@example.com',
    });

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ message: 'Username is already taken' });
    expect(prisma.user.create).not.toHaveBeenCalled();
  });
});

describe('POST /auth/revoke-expired-tokens', () => {
  const revoke = (userId: number) =>
    request(app)
      .post('/auth/revoke-expired-tokens')
      .set('Authorization', `Bearer ${accessTokenFor(userId)}`);

  it.each(['USER', 'MOD'])('returns 403 for a %s', async (role) => {
    prisma.user.findUnique.mockResolvedValue({ role });

    const res = await revoke(1);

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ message: 'Only admins can revoke expired tokens' });
    expect(prisma.refreshToken.deleteMany).not.toHaveBeenCalled();
  });

  it('returns 403 when the user no longer exists', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    const res = await revoke(1);

    expect(res.status).toBe(403);
  });

  it('returns 401 without a token', async () => {
    const res = await request(app).post('/auth/revoke-expired-tokens');

    expect(res.status).toBe(401);
  });

  it('revokes expired tokens for an admin', async () => {
    prisma.user.findUnique.mockResolvedValue({ role: 'ADMIN' });
    prisma.refreshToken.deleteMany.mockResolvedValue({ count: 3 });

    const res = await revoke(1);

    expect(res.status).toBe(204);
    expect(prisma.refreshToken.deleteMany).toHaveBeenCalledOnce();
  });
});
