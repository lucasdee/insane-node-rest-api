import { randomUUID } from 'crypto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import app from '../../app';

type UserRow = {
  id: number;
  uuid: string;
  username: string;
  password: string;
  email: string;
  displayName: string | null;
  role: 'USER' | 'MOD' | 'ADMIN';
  createdAt: Date;
};

type Select = Record<string, boolean> | undefined;

/**
 * In-memory stand-in for the Prisma client. It honours `select`, but returns the
 * FULL row (password included) when no `select` is given, so these tests prove
 * the repository allowlist works even without the global `omit` safety net.
 */
const { fakePrisma, users } = vi.hoisted(() => {
  const users: UserRow[] = [];

  const project = (row: UserRow, select: Select) => {
    if (!select) return { ...row };
    return Object.fromEntries(
      Object.entries(row).filter(([key]) => select[key]),
    ) as Partial<UserRow>;
  };

  const matches = (row: UserRow, where: Partial<UserRow>) =>
    Object.entries(where).every(([key, value]) => row[key as keyof UserRow] === value);

  const fakePrisma = {
    user: {
      findUnique: async ({ where, select }: { where: Partial<UserRow>; select?: Select }) => {
        const row = users.find((u) => matches(u, where));
        return row ? project(row, select) : null;
      },
      create: async ({ data, select }: { data: Partial<UserRow>; select?: Select }) => {
        const row: UserRow = {
          id: users.length + 1,
          uuid: '',
          username: '',
          password: '',
          email: '',
          displayName: null,
          role: 'USER',
          createdAt: new Date(),
          ...data,
        };
        users.push(row);
        return project(row, select);
      },
    },
    refreshToken: {
      create: async ({ data }: { data: object }) => ({ id: 1n, createdAt: new Date(), ...data }),
    },
  };

  return { fakePrisma, users };
});

// vi.mock is hoisted above the imports, so `app` is loaded with the fake client.
vi.mock('../../config/db', () => ({ prisma: fakePrisma }));

const PUBLIC_USER_KEYS = ['createdAt', 'displayName', 'email', 'role', 'username', 'uuid'];

const seedUser = async (overrides: Partial<UserRow> = {}): Promise<UserRow> => {
  const row: UserRow = {
    id: users.length + 1,
    uuid: randomUUID(),
    username: 'alice',
    password: await bcrypt.hash('secret123', 4),
    email: 'alice@example.com',
    displayName: 'Alice',
    role: 'USER',
    createdAt: new Date(),
    ...overrides,
  };
  users.push(row);
  return row;
};

const accessTokenFor = (userId: number) =>
  jwt.sign({ sub: String(userId) }, process.env.JWT_SECRET!, { expiresIn: '5m' });

beforeEach(() => {
  users.length = 0;
});

describe('user data exposure', () => {
  describe('POST /auth/register', () => {
    it('returns only public user fields', async () => {
      const res = await request(app).post('/auth/register').send({
        username: 'newuser',
        password: 'secret123',
        email: 'new@example.com',
        displayName: 'New User',
      });

      expect(res.status).toBe(201);
      expect(Object.keys(res.body).sort()).toEqual(PUBLIC_USER_KEYS);
      expect(res.body).not.toHaveProperty('password');
      expect(res.body).not.toHaveProperty('id');
      expect(JSON.stringify(res.body)).not.toMatch(/\$2[aby]\$/);
    });

    it('stores a bcrypt hash, not the plaintext password', async () => {
      await request(app).post('/auth/register').send({
        username: 'newuser',
        password: 'secret123',
        email: 'new@example.com',
      });

      expect(users).toHaveLength(1);
      expect(users[0].password).not.toBe('secret123');
      expect(await bcrypt.compare('secret123', users[0].password)).toBe(true);
    });
  });

  describe('GET /users/me', () => {
    it('returns only public user fields', async () => {
      const user = await seedUser();

      const res = await request(app)
        .get('/users/me')
        .set('Authorization', `Bearer ${accessTokenFor(user.id)}`);

      expect(res.status).toBe(200);
      expect(Object.keys(res.body).sort()).toEqual(PUBLIC_USER_KEYS);
      expect(res.body).toMatchObject({ uuid: user.uuid, username: 'alice' });
      expect(res.body).not.toHaveProperty('password');
      expect(res.body).not.toHaveProperty('id');
    });
  });

  describe('POST /auth/login', () => {
    it('can still verify the password hash', async () => {
      await seedUser();

      const res = await request(app)
        .post('/auth/login')
        .send({ username: 'alice', password: 'secret123' });

      expect(res.status).toBe(200);
      expect(Object.keys(res.body).sort()).toEqual([
        'accessToken',
        'accessTokenExpiresOn',
        'refreshTokenExpiresOn',
      ]);
    });

    it('rejects a wrong password', async () => {
      await seedUser();

      const res = await request(app)
        .post('/auth/login')
        .send({ username: 'alice', password: 'wrong-password' });

      expect(res.status).toBe(401);
    });
  });
});
