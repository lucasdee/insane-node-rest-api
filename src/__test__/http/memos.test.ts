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

const listMemos = (user: UserRow, query = '') =>
  request(app).get(`/memos${query}`).set('Authorization', bearer(user.id));

const createMemo = (user: UserRow, title = 'Shopping', content = 'Milk, eggs', tags?: string[]) =>
  request(app)
    .post('/memos/create')
    .set('Authorization', bearer(user.id))
    .send({ title, content, tags });

const putTags = (user: UserRow, memoUuid: string, tags: string[]) =>
  request(app).put(`/memos/${memoUuid}/tags`).set('Authorization', bearer(user.id)).send({ tags });

/** The titles of the user's memos matching `query`, sorted. */
const titles = async (user: UserRow, query: string) =>
  (await listMemos(user, query)).body.map((l: { memo: { title: string } }) => l.memo.title).sort();

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
  alice = seedUser({ username: 'alice', displayName: 'Alice' });
  bob = seedUser({ username: 'bob' });
  carol = seedUser({ username: 'carol' });
});

describe('authentication', () => {
  it.each([
    ['GET', '/memos'],
    ['POST', '/memos/create'],
    ['POST', '/memos/assign'],
    ['PUT', `/memos/${randomUUID()}/tags`],
  ])('%s %s returns 401 without a token', async (method, path) => {
    const res = await request(app)[method.toLowerCase() as 'get' | 'post' | 'put'](path);

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

  it('shows assignees who wrote the memo', async () => {
    const memoUuid = await memoBy(alice);
    await assign(alice, memoUuid, bob.uuid);

    const res = await listMemos(bob);

    expect(res.body[0].memo).toMatchObject({
      authorUuid: alice.uuid,
      authorUsername: 'alice',
      authorDisplayName: 'Alice',
    });
  });

  it('returns a null display name for authors without one', async () => {
    await createMemo(bob, 'Bob memo');

    const res = await listMemos(bob);

    expect(res.body[0].memo).toMatchObject({ authorUsername: 'bob', authorDisplayName: null });
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
      authorUsername: alice.username,
      authorDisplayName: alice.displayName,
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

  it('returns no tags when none are given', async () => {
    const res = await createMemo(alice);

    expect(res.body.tags).toEqual([]);
  });

  it('stores the tags lowercased, de-duplicated and sorted', async () => {
    const res = await createMemo(alice, 'Shopping', 'Milk', ['Home', 'groceries', 'HOME']);

    expect(res.status).toBe(201);
    expect(res.body.tags).toEqual(['groceries', 'home']);
    expect(fakeDb.tags.map((t) => t.name).sort()).toEqual(['groceries', 'home']);
  });

  it('reuses existing tags across memos', async () => {
    await createMemo(alice, 'Memo A', 'Content', ['home']);
    await createMemo(bob, 'Memo B', 'Content', ['home']);

    expect(fakeDb.tags).toHaveLength(1);
    expect(fakeDb.memosOnTags).toHaveLength(2);
  });
});

describe('GET /memos filtered by tags', () => {
  beforeEach(async () => {
    await createMemo(alice, 'Groceries', 'Content', ['home', 'shopping']);
    await createMemo(alice, 'Chores', 'Content', ['home']);
    await createMemo(alice, 'Report', 'Content', ['work']);
    await createMemo(alice, 'Untagged', 'Content');
  });

  it('filters by a single tag', async () => {
    expect(await titles(alice, '?tags=home')).toEqual(['Chores', 'Groceries']);
  });

  it('matches tags regardless of case', async () => {
    expect(await titles(alice, '?tags=HOME')).toEqual(['Chores', 'Groceries']);
  });

  it('with several tags, requires all of them by default', async () => {
    expect(await titles(alice, '?tags=home&tags=shopping')).toEqual(['Groceries']);
  });

  it('with match=all, requires all of the tags', async () => {
    expect(await titles(alice, '?tags=home&tags=work&match=all')).toEqual([]);
  });

  it('with match=any, requires at least one of the tags', async () => {
    expect(await titles(alice, '?tags=shopping&tags=work&match=any')).toEqual([
      'Groceries',
      'Report',
    ]);
  });

  it('returns nothing for a tag no memo carries', async () => {
    expect(await titles(alice, '?tags=unknown')).toEqual([]);
  });

  it('returns every memo without a tag filter', async () => {
    expect(await titles(alice, '?match=any')).toHaveLength(4);
  });

  it('never returns memos the caller is not assigned to', async () => {
    await createMemo(bob, 'Bob home', 'Content', ['home']);

    expect(await titles(alice, '?tags=home')).toEqual(['Chores', 'Groceries']);
    expect(await titles(bob, '?tags=home')).toEqual(['Bob home']);
  });

  it('includes memos shared with the caller, with their tags', async () => {
    const [groceries] = (await listMemos(alice, '?tags=shopping')).body;
    await assign(alice, groceries.memoUuid, bob.uuid);

    const res = await listMemos(bob, '?tags=shopping');

    expect(res.body).toHaveLength(1);
    expect(res.body[0].memo.tags).toEqual(['home', 'shopping']);
  });
});

describe('PUT /memos/{memoUuid}/tags', () => {
  it.each(['ADMIN', 'MOD'] as const)('lets a %s replace the memo’s tags', async (role) => {
    const created = await createMemo(alice, 'Memo', 'Content', ['old']);
    const memoUuid = created.body.uuid;
    await assign(alice, memoUuid, bob.uuid, role);

    const res = await putTags(bob, memoUuid, ['New', 'other']);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ uuid: memoUuid, tags: ['new', 'other'] });
    expect(await titles(alice, '?tags=new')).toEqual(['Memo']);
    expect(await titles(alice, '?tags=old')).toEqual([]);
  });

  it('clears the tags when given an empty list', async () => {
    const memoUuid = (await createMemo(alice, 'Memo', 'Content', ['home'])).body.uuid;

    const res = await putTags(alice, memoUuid, []);

    expect(res.status).toBe(200);
    expect(res.body.tags).toEqual([]);
    expect(fakeDb.memosOnTags).toHaveLength(0);
  });

  it('leaves other memos’ tags alone', async () => {
    const memoUuid = (await createMemo(alice, 'Memo A', 'Content', ['home'])).body.uuid;
    await createMemo(alice, 'Memo B', 'Content', ['home']);

    await putTags(alice, memoUuid, ['work']);

    expect(await titles(alice, '?tags=home')).toEqual(['Memo B']);
  });

  it('forbids a USER on the memo from changing its tags', async () => {
    const memoUuid = (await createMemo(alice, 'Memo', 'Content', ['home'])).body.uuid;
    await assign(alice, memoUuid, bob.uuid);

    const res = await putTags(bob, memoUuid, ['work']);

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ message: "Only the memo's ADMINs and MODs can change its tags" });
    expect(await titles(alice, '?tags=home')).toEqual(['Memo']);
  });

  it('forbids changing the tags of a memo the caller has no access to', async () => {
    const memoUuid = await memoBy(alice);

    const res = await putTags(bob, memoUuid, ['work']);

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ message: 'Memo not found or you do not have access to it' });
  });

  it('returns 403 for a memo that does not exist, without revealing that', async () => {
    const res = await putTags(alice, randomUUID(), ['work']);

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ message: 'Memo not found or you do not have access to it' });
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

  it('forbids sharing a memo the caller has no access to, answering as for a missing memo', async () => {
    const memoUuid = await memoBy(alice);

    const res = await assign(bob, memoUuid, carol.uuid);
    const missing = await assign(bob, randomUUID(), carol.uuid);

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ message: 'Memo not found or you do not have access to it' });
    expect(res.body).toEqual(missing.body);
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
  const MEMO_FIELDS = [
    'authorDisplayName',
    'authorUsername',
    'authorUuid',
    'content',
    'createdAt',
    'tags',
    'title',
    'uuid',
  ];
  const MEMO_ON_USER_FIELDS = ['assignedAt', 'assignedByUuid', 'memoUuid', 'role', 'userUuid'];

  /** Fails if any numeric value, such as an internal id, appears anywhere in the body. */
  const expectNoNumbers = (body: unknown) => {
    JSON.stringify(body, (_key, value: unknown) => {
      expect(typeof value).not.toBe('number');
      return value;
    });
  };

  it('POST /memos/create returns only public memo fields', async () => {
    const res = await createMemo(alice, 'Shopping', 'Milk', ['home']);

    expect(Object.keys(res.body).sort()).toEqual(MEMO_FIELDS);
    expectNoNumbers(res.body);
  });

  it('POST /memos/assign returns only public assignment fields', async () => {
    const res = await assign(alice, await memoBy(alice), bob.uuid);

    expect(Object.keys(res.body).sort()).toEqual(MEMO_ON_USER_FIELDS);
    expectNoNumbers(res.body);
  });

  it('PUT /memos/{memoUuid}/tags returns only public memo fields', async () => {
    const res = await putTags(alice, await memoBy(alice), ['home']);

    expect(Object.keys(res.body).sort()).toEqual(MEMO_FIELDS);
    expectNoNumbers(res.body);
  });

  it('GET /memos returns only public assignment and memo fields', async () => {
    await createMemo(alice, 'Shopping', 'Milk', ['home']);

    const res = await listMemos(alice);

    expect(Object.keys(res.body[0]).sort()).toEqual([...MEMO_ON_USER_FIELDS, 'memo'].sort());
    expect(Object.keys(res.body[0].memo).sort()).toEqual(MEMO_FIELDS);
    expectNoNumbers(res.body);
  });
});
