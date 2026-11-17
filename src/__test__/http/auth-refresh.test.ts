import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../../app';

const { refreshToken } = vi.hoisted(() => ({
  refreshToken: { findUnique: vi.fn(), delete: vi.fn(), create: vi.fn() },
}));

// vi.mock is hoisted above the imports, so `app` is loaded with the fake client.
vi.mock('../../config/db', () => ({ prisma: { refreshToken } }));

const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET!;

const refreshTokenFor = (
  userId: number,
  secret = REFRESH_SECRET,
  expiresIn: jwt.SignOptions['expiresIn'] = '7d',
) => jwt.sign({ sub: userId }, secret, { expiresIn });

const expiredRefreshTokenFor = (userId: number) =>
  jwt.sign({ sub: userId, exp: Math.floor(Date.now() / 1000) - 60 }, REFRESH_SECRET);

const accessTokenFor = (userId: number) =>
  jwt.sign({ sub: String(userId) }, process.env.JWT_SECRET!, { expiresIn: '5m' });

const cookie = (token: string) => `refreshToken=${token}`;

const invalidRefreshTokens = [
  ['a malformed token', () => 'not-a-jwt'],
  ['an expired token', () => expiredRefreshTokenFor(1)],
  ['a token signed with the wrong secret', () => refreshTokenFor(1, 'wrong-secret')],
  ['an access token used as a refresh token', () => accessTokenFor(1)],
] as const;

beforeEach(() => {
  vi.resetAllMocks();
});

describe('POST /auth/refresh', () => {
  it.each(invalidRefreshTokens)('returns 401 for %s', async (_label, makeToken) => {
    const res = await request(app).post('/auth/refresh').set('Cookie', cookie(makeToken()));

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ message: 'Invalid or expired refresh token' });
    expect(refreshToken.findUnique).not.toHaveBeenCalled();
  });

  it('returns 401 without a refresh token cookie', async () => {
    const res = await request(app).post('/auth/refresh');

    expect(res.status).toBe(401);
  });

  it('rotates a valid refresh token', async () => {
    refreshToken.findUnique.mockResolvedValue({
      userId: 1,
      expiresAt: new Date(Date.now() + 60_000),
    });
    refreshToken.delete.mockResolvedValue({});
    refreshToken.create.mockResolvedValue({});

    const res = await request(app)
      .post('/auth/refresh')
      .set('Cookie', cookie(refreshTokenFor(1)));

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('accessToken');
    expect(res.headers['set-cookie']?.[0]).toMatch(/^refreshToken=.+; HttpOnly/);
    expect(refreshToken.delete).toHaveBeenCalledOnce();
    expect(refreshToken.create).toHaveBeenCalledOnce();
  });
});

describe('POST /auth/logout', () => {
  it.each(invalidRefreshTokens)('returns 401 for %s', async (_label, makeToken) => {
    const res = await request(app)
      .post('/auth/logout')
      .set('Authorization', `Bearer ${accessTokenFor(1)}`)
      .set('Cookie', cookie(makeToken()));

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ message: 'Invalid or expired refresh token' });
    expect(refreshToken.delete).not.toHaveBeenCalled();
  });

  it('revokes a valid refresh token and clears the cookie', async () => {
    refreshToken.delete.mockResolvedValue({});

    const res = await request(app)
      .post('/auth/logout')
      .set('Authorization', `Bearer ${accessTokenFor(1)}`)
      .set('Cookie', cookie(refreshTokenFor(1)));

    expect(res.status).toBe(204);
    expect(res.headers['set-cookie']?.[0]).toMatch(/^refreshToken=;.*Max-Age=0/);
    expect(refreshToken.delete).toHaveBeenCalledOnce();
  });
});
