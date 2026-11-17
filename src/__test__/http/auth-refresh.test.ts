import crypto from 'crypto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../../app';

type RefreshTokenRow = { tokenHash: string; userId: number; expiresAt: Date };

/**
 * In-memory stand-in for prisma.refreshToken with Prisma's semantics:
 * `create` throws (P2002) on a duplicate tokenHash, `delete` throws (P2025)
 * when the row is missing, `deleteMany` returns a count.
 */
const { store, refreshToken } = vi.hoisted(() => {
  const store = new Map<string, RefreshTokenRow>();

  const matches = (row: RefreshTokenRow, where: Partial<RefreshTokenRow>) =>
    Object.entries(where).every(([key, value]) => row[key as keyof RefreshTokenRow] === value);

  const refreshToken = {
    findUnique: vi.fn(async ({ where }: { where: { tokenHash: string } }) => {
      const row = store.get(where.tokenHash);
      return row ? { ...row } : null;
    }),
    create: vi.fn(async ({ data }: { data: RefreshTokenRow }) => {
      if (store.has(data.tokenHash)) {
        throw Object.assign(new Error('Unique constraint failed on tokenHash'), { code: 'P2002' });
      }
      store.set(data.tokenHash, { ...data });
      return { ...data };
    }),
    delete: vi.fn(async ({ where }: { where: { tokenHash: string } }) => {
      const row = store.get(where.tokenHash);
      if (!row) {
        throw Object.assign(new Error('Record to delete does not exist.'), { code: 'P2025' });
      }
      store.delete(where.tokenHash);
      return row;
    }),
    deleteMany: vi.fn(async ({ where }: { where: Partial<RefreshTokenRow> }) => {
      let count = 0;
      for (const [hash, row] of store) {
        if (matches(row, where)) {
          store.delete(hash);
          count++;
        }
      }
      return { count };
    }),
  };

  return { store, refreshToken };
});

// vi.mock is hoisted above the imports, so `app` is loaded with the fake client.
vi.mock('../../config/db', () => ({ prisma: { refreshToken } }));

const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET!;

const refreshTokenFor = (userId: number, secret = REFRESH_SECRET) =>
  jwt.sign({ sub: userId }, secret, { expiresIn: '7d' });

const expiredRefreshTokenFor = (userId: number) =>
  jwt.sign({ sub: userId, exp: Math.floor(Date.now() / 1000) - 60 }, REFRESH_SECRET);

const accessTokenFor = (userId: number) =>
  jwt.sign({ sub: String(userId) }, process.env.JWT_SECRET!, { expiresIn: '5m' });

const hashOf = (token: string) =>
  crypto.createHmac('sha512', process.env.JWT_REFRESH_HASH_SECRET!).update(token).digest('hex');

/** Signs a refresh token and stores it as an active session. */
const issueRefreshToken = (userId: number) => {
  const token = refreshTokenFor(userId);
  store.set(hashOf(token), {
    tokenHash: hashOf(token),
    userId,
    expiresAt: new Date(Date.now() + 60_000),
  });
  return token;
};

const cookie = (token: string) => `refreshToken=${token}`;

const refresh = (token: string) => request(app).post('/auth/refresh').set('Cookie', cookie(token));

const logout = (token: string) =>
  request(app)
    .post('/auth/logout')
    .set('Authorization', `Bearer ${accessTokenFor(1)}`)
    .set('Cookie', cookie(token));

const invalidRefreshTokens = [
  ['a malformed token', () => 'not-a-jwt'],
  ['an expired token', () => expiredRefreshTokenFor(1)],
  ['a token signed with the wrong secret', () => refreshTokenFor(1, 'wrong-secret')],
  ['an access token used as a refresh token', () => accessTokenFor(1)],
] as const;

beforeEach(() => {
  store.clear();
  vi.clearAllMocks();
});

describe('POST /auth/refresh', () => {
  it.each(invalidRefreshTokens)('returns 401 for %s', async (_label, makeToken) => {
    const res = await refresh(makeToken());

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ message: 'Invalid or expired refresh token' });
    expect(refreshToken.findUnique).not.toHaveBeenCalled();
  });

  it('returns 401 without a refresh token cookie', async () => {
    const res = await request(app).post('/auth/refresh');

    expect(res.status).toBe(401);
  });

  it('rotates a valid refresh token', async () => {
    const token = issueRefreshToken(1);

    const res = await refresh(token);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('accessToken');
    expect(res.headers['set-cookie']?.[0]).toMatch(/^refreshToken=.+; HttpOnly/);
    expect(store.has(hashOf(token))).toBe(false);
    expect(store.size).toBe(1);
  });

  it('rejects a refresh token that was already rotated', async () => {
    const token = issueRefreshToken(1);
    await refresh(token);

    const res = await refresh(token);

    expect(res.status).toBe(401);
  });

  it('returns 401 when a concurrent request revokes the token first', async () => {
    const token = refreshTokenFor(1);
    // The lookup still sees the token, but another request deletes it before this one does.
    refreshToken.findUnique.mockResolvedValueOnce({
      tokenHash: hashOf(token),
      userId: 1,
      expiresAt: new Date(Date.now() + 60_000),
    });

    const res = await refresh(token);

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ message: 'Refresh token has already been used' });
    expect(refreshToken.create).not.toHaveBeenCalled();
  });
});

describe('POST /auth/logout', () => {
  it.each(invalidRefreshTokens)('returns 401 for %s', async (_label, makeToken) => {
    const res = await logout(makeToken());

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ message: 'Invalid or expired refresh token' });
    expect(refreshToken.delete).not.toHaveBeenCalled();
    expect(refreshToken.deleteMany).not.toHaveBeenCalled();
  });

  it('revokes a valid refresh token and clears the cookie', async () => {
    const token = issueRefreshToken(1);

    const res = await logout(token);

    expect(res.status).toBe(204);
    expect(res.headers['set-cookie']?.[0]).toMatch(/^refreshToken=;.*Max-Age=0/);
    expect(store.has(hashOf(token))).toBe(false);
  });

  it('succeeds when logging out twice with the same token', async () => {
    const token = issueRefreshToken(1);

    const first = await logout(token);
    const second = await logout(token);

    expect(first.status).toBe(204);
    expect(second.status).toBe(204);
    expect(second.headers['set-cookie']?.[0]).toMatch(/^refreshToken=;.*Max-Age=0/);
  });

  it('succeeds for a validly signed token that is not stored', async () => {
    const res = await logout(refreshTokenFor(1));

    expect(res.status).toBe(204);
  });
});
