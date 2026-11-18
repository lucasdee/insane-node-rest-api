import crypto from 'crypto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../../app';

type RefreshTokenRow = {
  tokenHash: string;
  userId: number;
  expiresAt: Date;
  familyId: string;
  revoked: boolean;
};

/**
 * In-memory stand-in for prisma.refreshToken with Prisma's semantics:
 * `create` throws (P2002) on a duplicate tokenHash, `delete` throws (P2025)
 * when the row is missing, `updateMany` and `deleteMany` return a count.
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
    create: vi.fn(async ({ data }: { data: Omit<RefreshTokenRow, 'revoked'> }) => {
      if (store.has(data.tokenHash)) {
        throw Object.assign(new Error('Unique constraint failed on tokenHash'), { code: 'P2002' });
      }
      const row = { revoked: false, ...data };
      store.set(data.tokenHash, row);
      return { ...row };
    }),
    updateMany: vi.fn(
      async ({
        where,
        data,
      }: {
        where: Partial<RefreshTokenRow>;
        data: Partial<RefreshTokenRow>;
      }) => {
        let count = 0;
        for (const row of store.values()) {
          if (matches(row, where)) {
            Object.assign(row, data);
            count++;
          }
        }
        return { count };
      },
    ),
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

// A unique jti, as the API sets, so that two tokens signed in the same second differ.
const refreshTokenFor = (userId: number, secret = REFRESH_SECRET) =>
  jwt.sign({ sub: userId }, secret, { expiresIn: '7d', jwtid: crypto.randomUUID() });

const expiredRefreshTokenFor = (userId: number) =>
  jwt.sign({ sub: userId, exp: Math.floor(Date.now() / 1000) - 60 }, REFRESH_SECRET);

const accessTokenFor = (userId: number) =>
  jwt.sign({ sub: String(userId) }, process.env.JWT_SECRET!, { expiresIn: '5m' });

const hashOf = (token: string) =>
  crypto.createHmac('sha512', process.env.JWT_REFRESH_HASH_SECRET!).update(token).digest('hex');

/** Signs a refresh token and stores it as an active session (its own family by default). */
const issueRefreshToken = (userId: number, familyId: string = crypto.randomUUID()) => {
  const token = refreshTokenFor(userId);
  store.set(hashOf(token), {
    tokenHash: hashOf(token),
    userId,
    expiresAt: new Date(Date.now() + 60_000),
    familyId,
    revoked: false,
  });
  return token;
};

/** The refresh token a successful response sets in its cookie. */
const refreshTokenOf = (res: request.Response) =>
  /^refreshToken=([^;]+)/.exec(res.headers['set-cookie']?.[0] ?? '')![1];

const cookie = (token: string) => `refreshToken=${token}`;

const refresh = (token: string) => request(app).post('/auth/refresh').set('Cookie', cookie(token));

const logout = (token: string) => request(app).post('/auth/logout').set('Cookie', cookie(token));

const CLEARED_COOKIE = /^refreshToken=;.*Max-Age=0/;

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

  it('rotates a valid refresh token within its family, keeping the old one as revoked', async () => {
    const token = issueRefreshToken(1, 'family-a');

    const res = await refresh(token);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('accessToken');
    expect(res.headers['set-cookie']?.[0]).toMatch(/^refreshToken=.+; HttpOnly/);
    expect(store.get(hashOf(token))).toMatchObject({ revoked: true, familyId: 'family-a' });
    expect(store.get(hashOf(refreshTokenOf(res)))).toMatchObject({
      revoked: false,
      familyId: 'family-a',
      userId: 1,
    });
  });

  describe('when a rotated token is reused', () => {
    it('returns 401 and revokes every token of its family', async () => {
      const stolen = issueRefreshToken(1, 'family-a');
      const current = refreshTokenOf(await refresh(stolen));

      const reuse = await refresh(stolen);

      expect(reuse.status).toBe(401);
      expect(reuse.body).toEqual({ message: 'Refresh token has already been used' });
      expect([...store.values()].filter((t) => t.familyId === 'family-a')).toEqual([]);

      // Whoever holds the latest token of the family is logged out as well.
      const next = await refresh(current);
      expect(next.status).toBe(401);
    });

    it('leaves the user’s other sessions alone', async () => {
      const laptop = issueRefreshToken(1, 'laptop');
      const phone = issueRefreshToken(1, 'phone');
      await refresh(laptop);

      await refresh(laptop);

      expect((await refresh(phone)).status).toBe(200);
    });

    it('does not issue new tokens', async () => {
      const stolen = issueRefreshToken(1);
      await refresh(stolen);
      refreshToken.create.mockClear();

      await refresh(stolen);

      expect(refreshToken.create).not.toHaveBeenCalled();
    });
  });

  it('returns 401 without revoking the family when a concurrent request rotates the token first', async () => {
    const token = refreshTokenFor(1);
    // The lookup still sees the token as active, but another request marks it as
    // rotated before this one does.
    refreshToken.findUnique.mockResolvedValueOnce({
      tokenHash: hashOf(token),
      userId: 1,
      expiresAt: new Date(Date.now() + 60_000),
      familyId: 'family-a',
      revoked: false,
    });

    const res = await refresh(token);

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ message: 'Refresh token has already been used' });
    expect(refreshToken.create).not.toHaveBeenCalled();
    expect(refreshToken.deleteMany).not.toHaveBeenCalled();
  });
});

describe('POST /auth/logout', () => {
  it('returns 401 without a refresh token cookie, and still clears the cookie', async () => {
    const res = await request(app).post('/auth/logout');

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ message: 'No refresh token in cookie' });
    expect(res.headers['set-cookie']?.[0]).toMatch(CLEARED_COOKIE);
  });

  it.each(invalidRefreshTokens)(
    'returns 401 for %s, and still clears the cookie',
    async (_label, makeToken) => {
      const res = await logout(makeToken());

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ message: 'Invalid or expired refresh token' });
      expect(res.headers['set-cookie']?.[0]).toMatch(CLEARED_COOKIE);
      expect(refreshToken.delete).not.toHaveBeenCalled();
      expect(refreshToken.deleteMany).not.toHaveBeenCalled();
    },
  );

  it('revokes a valid refresh token and clears the cookie', async () => {
    const token = issueRefreshToken(1);

    const res = await logout(token);

    expect(res.status).toBe(204);
    expect(res.headers['set-cookie']?.[0]).toMatch(CLEARED_COOKIE);
    expect(store.has(hashOf(token))).toBe(false);
  });

  it.each([
    [
      'an expired access token',
      jwt.sign({ sub: '1' }, process.env.JWT_SECRET!, { expiresIn: -10 }),
    ],
    ['an invalid access token', 'not-a-jwt'],
  ])('ignores %s, since the refresh cookie is the credential', async (_label, accessToken) => {
    const token = issueRefreshToken(1);

    const res = await logout(token).set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(204);
    expect(store.has(hashOf(token))).toBe(false);
  });

  it('sends the cleared cookie only once', async () => {
    const res = await logout(issueRefreshToken(1));

    expect(res.headers['set-cookie']).toHaveLength(1);
  });

  it('succeeds when logging out twice with the same token', async () => {
    const token = issueRefreshToken(1);

    const first = await logout(token);
    const second = await logout(token);

    expect(first.status).toBe(204);
    expect(second.status).toBe(204);
    expect(second.headers['set-cookie']?.[0]).toMatch(CLEARED_COOKIE);
  });

  it('succeeds for a validly signed token that is not stored', async () => {
    const res = await logout(refreshTokenFor(1));

    expect(res.status).toBe(204);
  });

  it('ends the whole session, including the tokens it rotated out', async () => {
    const first = issueRefreshToken(1, 'family-a');
    const current = refreshTokenOf(await refresh(first));

    await logout(current);

    expect(store.size).toBe(0);
    // With the family gone, the old token is unknown rather than a detected reuse.
    const res = await refresh(first);
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/Could not find refresh token/);
  });

  it('leaves the user’s other sessions alone', async () => {
    const laptop = issueRefreshToken(1, 'laptop');
    const phone = issueRefreshToken(1, 'phone');

    await logout(laptop);

    expect(store.has(hashOf(phone))).toBe(true);
    expect((await refresh(phone)).status).toBe(200);
  });
});
