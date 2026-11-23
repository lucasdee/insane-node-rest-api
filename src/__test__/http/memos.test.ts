import { describe, it, expect, vi, beforeEach } from 'vitest';
import { randomUUID } from 'crypto';
import request from 'supertest';
import app from '../../app';
import { fakeDb, resetFakeDb, seedUser, type UserRow } from '../helpers/fake-prisma';
import { bearer } from '../helpers/tokens';

vi.mock('../../config/db', async () => ({
  prisma: (await import('../helpers/fake-prisma')).fakePrisma,
}));

let alice: UserRow;
let bob: UserRow;
let carol: UserRow;

const listMemos = (user: UserRow) =>
  request(app).get('/memos').set('Authorization', bearer(user.id));

const createMemo = (user: UserRow, title = 'Shopping', content = 'Milk, eggs') =>
  request(app).post('/memos/create').set('Authorization', bearer(user.id)).send({ title, content });

type Role = 'USER' | 'MOD' | 'ADMIN';

const assign = (by: UserRow, memoUuid: string, userUuid: string, role?: Role) =>
  request(app)
    .post('/memos/assign')
    .set('Authorization', bearer(by.id))
    .send({ memoUuid, userUuid, role });

/** Creates a memo as `author` and returns its uuid. */
const memoBy = async (author: UserRow): Promise<string> => (await createMemo(author)).body.uuid;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

beforeEach(() => {
  resetFakeDb();
  alice = seedUser({ username: 'alice' });
  bob = seedUser({ username: 'bob' });
  carol = seedUser({ username: 'carol' });
});

describe('authentication', () => {
  it.each([
    ['GET', '/memos'],
    ['POST', '/memos/create'],
    ['POST', '/memos/assign'],
  ])('%s %s returns 401 without a token', async (method, path) => {
    const res = await request(app)[method === 'GET' ? 'get' : 'post'](path);

    expect(res.status).toBe(401);
  });
});

describe('GET /memos', () => {
  it('returns an empty list for a user without memos', async () => {
    const res = await listMemos(alice);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns only the caller’s memos', async () => {
    await createMemo(alice, 'Alice memo');
    await createMemo(bob, 'Bob memo');

    const res = await listMemos(alice);

    expect(res.body).toHaveLength(1);
    expect(res.body[0].memo.title).toBe('Alice memo');
  });
});

describe('POST /memos/create', () => {
  it('creates the memo and makes the author its ADMIN', async () => {
    const res = await createMemo(alice, 'Shopping', 'Milk, eggs');

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      uuid: expect.stringMatching(UUID),
      title: 'Shopping',
      content: 'Milk, eggs',
      authorUuid: alice.uuid,
    });

    const list = await listMemos(alice);
    expect(list.body).toEqual([
      expect.objectContaining({
        memoUuid: res.body.uuid,
        userUuid: alice.uuid,
        assignedByUuid: alice.uuid,
        role: 'ADMIN',
        memo: expect.objectContaining({ title: 'Shopping' }),
      }),
    ]);
  });
});

describe('POST /memos/assign', () => {
  it('lets the memo’s ADMIN share it, and the assignee sees it as USER', async () => {
    const memoUuid = await memoBy(alice);

    const res = await assign(alice, memoUuid, bob.uuid);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      memoUuid,
      userUuid: bob.uuid,
      assignedByUuid: alice.uuid,
      role: 'USER',
    });

    const bobsMemos = await listMemos(bob);
    expect(bobsMemos.body).toEqual([
      expect.objectContaining({
        memoUuid,
        role: 'USER',
        memo: expect.objectContaining({ uuid: memoUuid, authorUuid: alice.uuid }),
      }),
    ]);
  });

  it.each(['USER', 'MOD', 'ADMIN'] as const)(
    'lets the memo’s ADMIN assign the %s role',
    async (role) => {
      const memoUuid = await memoBy(alice);

      const res = await assign(alice, memoUuid, bob.uuid, role);

      expect(res.status).toBe(201);
      expect(res.body.role).toBe(role);
      expect(await listMemos(bob).then((r) => r.body[0].role)).toBe(role);
    },
  );

  it('lets a user re-share a memo shared with them as ADMIN', async () => {
    const memoUuid = await memoBy(alice);
    await assign(alice, memoUuid, bob.uuid, 'ADMIN');

    const res = await assign(bob, memoUuid, carol.uuid, 'MOD');

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ userUuid: carol.uuid, assignedByUuid: bob.uuid, role: 'MOD' });
  });

  it('lets a MOD on the memo share it as USER', async () => {
    const memoUuid = await memoBy(alice);
    await assign(alice, memoUuid, bob.uuid, 'MOD');

    const res = await assign(bob, memoUuid, carol.uuid);

    expect(res.status).toBe(201);
    expect(res.body.role).toBe('USER');
  });

  it.each(['MOD', 'ADMIN'] as const)(
    'forbids a MOD on the memo from assigning the %s role',
    async (role) => {
      const memoUuid = await memoBy(alice);
      await assign(alice, memoUuid, bob.uuid, 'MOD');

      const res = await assign(bob, memoUuid, carol.uuid, role);

      expect(res.status).toBe(403);
      expect(res.body).toEqual({ message: `Only the memo's ADMINs can assign the ${role} role` });
      expect(await listMemos(carol).then((r) => r.body)).toEqual([]);
    },
  );

  it('forbids a USER on the memo from sharing it', async () => {
    const memoUuid = await memoBy(alice);
    await assign(alice, memoUuid, bob.uuid);

    const res = await assign(bob, memoUuid, carol.uuid);

    expect(res.status).toBe(403);
    expect(await listMemos(carol).then((r) => r.body)).toEqual([]);
  });

  it('forbids sharing a memo the caller has no access to', async () => {
    const memoUuid = await memoBy(alice);

    const res = await assign(bob, memoUuid, carol.uuid);

    expect(res.status).toBe(403);
  });

  it('returns 403 for a memo that does not exist, without revealing that', async () => {
    const res = await assign(alice, randomUUID(), bob.uuid);

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ message: 'Memo not found or you do not have access to it' });
  });

  it('returns 409 when the user is already assigned', async () => {
    const memoUuid = await memoBy(alice);
    await assign(alice, memoUuid, bob.uuid);

    const res = await assign(alice, memoUuid, bob.uuid);

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ message: 'The user is already assigned to the memo' });
    expect(fakeDb.memosOnUsers).toHaveLength(2);
  });

  it('returns 404 when the target user does not exist', async () => {
    const memoUuid = await memoBy(alice);

    const res = await assign(alice, memoUuid, randomUUID());

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ message: 'User not found' });
    expect(fakeDb.memosOnUsers).toHaveLength(1);
  });

  it('checks access to the memo before looking up the target user', async () => {
    const memoUuid = await memoBy(alice);

    const res = await assign(bob, memoUuid, randomUUID());

    expect(res.status).toBe(403);
  });
});

describe('memo data exposure', () => {
  const MEMO_FIELDS = ['authorUuid', 'content', 'createdAt', 'title', 'uuid'];
  const MEMO_ON_USER_FIELDS = ['assignedAt', 'assignedByUuid', 'memoUuid', 'role', 'userUuid'];

  /** Fails if any numeric value, such as an internal id, appears anywhere in the body. */
  const expectNoNumbers = (body: unknown) => {
    JSON.stringify(body, (_key, value: unknown) => {
      expect(typeof value).not.toBe('number');
      return value;
    });
  };

  it('POST /memos/create returns only public memo fields', async () => {
    const res = await createMemo(alice);

    expect(Object.keys(res.body).sort()).toEqual(MEMO_FIELDS);
    expectNoNumbers(res.body);
  });

  it('POST /memos/assign returns only public assignment fields', async () => {
    const res = await assign(alice, await memoBy(alice), bob.uuid);

    expect(Object.keys(res.body).sort()).toEqual(MEMO_ON_USER_FIELDS);
    expectNoNumbers(res.body);
  });

  it('GET /memos returns only public assignment and memo fields', async () => {
    await createMemo(alice);

    const res = await listMemos(alice);

    expect(Object.keys(res.body[0]).sort()).toEqual([...MEMO_ON_USER_FIELDS, 'memo'].sort());
    expect(Object.keys(res.body[0].memo).sort()).toEqual(MEMO_FIELDS);
    expectNoNumbers(res.body);
  });
});
