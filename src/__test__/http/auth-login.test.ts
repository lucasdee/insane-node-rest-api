import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import app from '../../app';

type RefreshTokenRow = { tokenHash: string; userId: number; expiresAt: Date };

/**
 * In-memory stand-in for the Prisma client. refreshToken.create enforces the
 * unique constraint on tokenHash the way the database does (P2002).
 */
const { tokens, prisma } = vi.hoisted(() => {
  const tokens = new Map<string, RefreshTokenRow>();
  const credentials = { id: 1, username: 'alice', password: '' };

  const prisma = {
    credentials,
    user: {
      findUnique: async ({ where }: { where: { username?: string } }) =>
        where.username === credentials.username
          ? { id: credentials.id, password: credentials.password }
          : null,
    },
    refreshToken: {
      create: async ({ data }: { data: RefreshTokenRow }) => {
        if (tokens.has(data.tokenHash)) {
          throw Object.assign(new Error('Unique constraint failed on tokenHash'), {
            code: 'P2002',
          });
        }
        tokens.set(data.tokenHash, { ...data });
        return { ...data };
      },
    },
  };

  return { tokens, prisma };
});

// vi.mock is hoisted above the imports, so `app` is loaded with the fake client.
vi.mock('../../config/db', () => ({ prisma }));

const login = () =>
  request(app).post('/auth/login').send({ username: 'alice', password: 'secret123' });

const refreshCookieOf = (res: request.Response) =>
  (res.headers['set-cookie'] as unknown as string[])[0].split(';')[0];

beforeEach(async () => {
  tokens.clear();
  prisma.credentials.password = await bcrypt.hash('secret123', 4);
  // Freeze the clock so both logins are issued within the same second. Only Date is
  // faked, so sockets and timers used by supertest keep working.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-01-01T12:00:00.000Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('POST /auth/login', () => {
  it('issues distinct tokens for two logins in the same second', async () => {
    const first = await login();
    const second = await login();

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body.accessToken).not.toBe(first.body.accessToken);
    expect(refreshCookieOf(second)).not.toBe(refreshCookieOf(first));
    expect(tokens.size).toBe(2);
  });

  it('includes a unique jti in access and refresh tokens', async () => {
    const res = await login();

    const access = jwt.decode(res.body.accessToken) as JwtPayload;
    const refresh = jwt.decode(refreshCookieOf(res).replace('refreshToken=', '')) as JwtPayload;

    expect(access.jti).toEqual(expect.any(String));
    expect(refresh.jti).toEqual(expect.any(String));
    expect(access.jti).not.toBe(refresh.jti);
  });
});
