import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'crypto';
import jwt from 'jsonwebtoken';
import app from '../../app';
import { Prisma } from '../../generated/prisma/client';

const { prisma } = vi.hoisted(() => ({
  prisma: {
    user: { findUnique: vi.fn(), create: vi.fn() },
    memo: { findUnique: vi.fn() },
    memoOnUser: { create: vi.fn() },
  },
}));

// vi.mock is hoisted above the imports, so `app` is loaded with the fake client.
vi.mock('../../config/db', () => ({ prisma }));

/** A Prisma error whose message contains internals that must never reach clients. */
const prismaError = (code: string, constraint: string) =>
  new Prisma.PrismaClientKnownRequestError(
    `Invalid \`prisma.model.create()\` invocation: constraint \`${constraint}\` failed`,
    { code, clientVersion: '7.4.2' },
  );

const accessTokenFor = (userId: number) =>
  jwt.sign({ sub: String(userId) }, process.env.JWT_SECRET!, { expiresIn: '5m' });

const expectNoInternals = (body: unknown) => {
  const text = JSON.stringify(body);
  expect(text).not.toMatch(/prisma|invocation|constraint|_key|_fkey/i);
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('Prisma errors are not leaked to clients', () => {
  it('returns 409 for a duplicate email on register', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockRejectedValue(prismaError('P2002', 'users_email_key'));

    const res = await request(app).post('/auth/register').send({
      username: 'newuser',
      password: 'secret123',
      email: 'taken@example.com',
    });

    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      message: 'A resource with the same unique value already exists',
    });
    expectNoInternals(res.body);
  });

  describe('POST /memos/assign', () => {
    const assign = () =>
      request(app)
        .post('/memos/assign')
        .set('Authorization', `Bearer ${accessTokenFor(1)}`)
        .send({ memoUuid: randomUUID(), userUuid: randomUUID() });

    beforeEach(() => {
      prisma.memo.findUnique.mockResolvedValue({ id: 1, users: [{ role: 'ADMIN' }] });
      prisma.user.findUnique.mockResolvedValue({ id: 2 });
    });

    it('returns 409 when the memo is already assigned to the user', async () => {
      prisma.memoOnUser.create.mockRejectedValue(prismaError('P2002', 'PRIMARY'));

      const res = await assign();

      expect(res.status).toBe(409);
      expect(res.body).toEqual({ message: 'The user is already assigned to the memo' });
      expectNoInternals(res.body);
    });

    it('returns 400 when the target user is deleted before the assignment is stored', async () => {
      prisma.memoOnUser.create.mockRejectedValue(
        prismaError('P2003', 'memos_on_users_userId_fkey'),
      );

      const res = await assign();

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ message: 'A referenced resource does not exist' });
      expectNoInternals(res.body);
    });

    it('returns 500 with a generic message for unexpected database errors', async () => {
      prisma.memoOnUser.create.mockRejectedValue(new Error('connect ECONNREFUSED 10.0.0.5:3306'));

      const res = await assign();

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ message: 'Internal server error' });
    });
  });

  it('still returns 400 for a malformed JSON body', async () => {
    const res = await request(app)
      .post('/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"username":');

    expect(res.status).toBe(400);
  });
});
