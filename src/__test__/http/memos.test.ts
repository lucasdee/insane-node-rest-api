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

const getMemo = (user: UserRow, memoUuid: string) =>
  request(app).get(`/memos/${memoUuid}`).set('Authorization', bearer(user.id));

const patchMemo = (
  user: UserRow,
  memoUuid: string,
  changes: { title?: string; content?: string; tags?: string[] },
) => request(app).patch(`/memos/${memoUuid}`).set('Authorization', bearer(user.id)).send(changes);

const deleteMemo = (user: UserRow, memoUuid: string) =>
  request(app).delete(`/memos/${memoUuid}`).set('Authorization', bearer(user.id));

/** Sets the user's role on the memo directly, e.g. to demote a memo's author. */
const setRole = (user: UserRow, memoUuid: string, role: Role) => {
  const memo = fakeDb.memos.find((m) => m.uuid === memoUuid)!;
  fakeDb.memosOnUsers.find((l) => l.memoId === memo.id && l.userId === user.id)!.role = role;
};

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
    ['GET', `/memos/${randomUUID()}`],
    ['PATCH', `/memos/${randomUUID()}`],
    ['DELETE', `/memos/${randomUUID()}`],
  ])('%s %s returns 401 without a token', async (method, path) => {
    const res =
      await request(app)[method.toLowerCase() as 'get' | 'post' | 'put' | 'patch' | 'delete'](path);

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
    expect(res.body).toEqual({
      message: "Only the memo's author, ADMINs and MODs can change its tags",
    });
    expect(await titles(alice, '?tags=home')).toEqual(['Memo']);
  });

  it('lets the author change the tags even with the USER role on the memo', async () => {
    const memoUuid = (await createMemo(alice, 'Memo', 'Content', ['home'])).body.uuid;
    setRole(alice, memoUuid, 'USER');

    const res = await putTags(alice, memoUuid, ['work']);

    expect(res.status).toBe(200);
    expect(res.body.tags).toEqual(['work']);
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

describe('GET /memos/{memoUuid}', () => {
  it('returns the caller’s assignment with the memo', async () => {
    const memoUuid = (await createMemo(alice, 'Memo', 'Content', ['home'])).body.uuid;
    await assign(alice, memoUuid, bob.uuid, 'MOD');

    const res = await getMemo(bob, memoUuid);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      memoUuid,
      userUuid: bob.uuid,
      assignedByUuid: alice.uuid,
      role: 'MOD',
      memo: {
        uuid: memoUuid,
        title: 'Memo',
        content: 'Content',
        authorUuid: alice.uuid,
        authorUsername: 'alice',
        tags: ['home'],
      },
    });
  });

  it('forbids reading a memo the caller is not assigned to', async () => {
    const memoUuid = await memoBy(alice);

    const res = await getMemo(bob, memoUuid);

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ message: 'Memo not found or you do not have access to it' });
  });

  it('returns 403 for a memo that does not exist, without revealing that', async () => {
    const res = await getMemo(alice, randomUUID());

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ message: 'Memo not found or you do not have access to it' });
  });
});

describe('PATCH /memos/{memoUuid}', () => {
  it('lets the author change the title, content and tags', async () => {
    const memoUuid = (await createMemo(alice, 'Memo', 'Content', ['old'])).body.uuid;

    const res = await patchMemo(alice, memoUuid, {
      title: 'Edited',
      content: 'New content',
      tags: ['New', 'new', 'other'],
    });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      uuid: memoUuid,
      title: 'Edited',
      content: 'New content',
      authorUuid: alice.uuid,
      tags: ['new', 'other'],
    });
    expect((await getMemo(alice, memoUuid)).body.memo).toMatchObject({
      title: 'Edited',
      content: 'New content',
      tags: ['new', 'other'],
    });
  });

  it('lets the author edit even with the USER role on the memo', async () => {
    const memoUuid = await memoBy(alice);
    setRole(alice, memoUuid, 'USER');

    const res = await patchMemo(alice, memoUuid, { title: 'Edited' });

    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Edited');
  });

  it.each(['ADMIN', 'MOD'] as const)('lets a %s edit someone else’s memo', async (role) => {
    const memoUuid = await memoBy(alice);
    await assign(alice, memoUuid, bob.uuid, role);

    const res = await patchMemo(bob, memoUuid, { content: 'Edited by Bob' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ content: 'Edited by Bob', authorUuid: alice.uuid });
  });

  it('changes only the given fields', async () => {
    const memoUuid = (await createMemo(alice, 'Memo', 'Content', ['home'])).body.uuid;

    const res = await patchMemo(alice, memoUuid, { title: 'Edited' });

    expect(res.body).toMatchObject({ title: 'Edited', content: 'Content', tags: ['home'] });
  });

  it('clears the tags when given an empty list', async () => {
    const memoUuid = (await createMemo(alice, 'Memo', 'Content', ['home'])).body.uuid;

    const res = await patchMemo(alice, memoUuid, { tags: [] });

    expect(res.body.tags).toEqual([]);
    expect(fakeDb.memosOnTags).toHaveLength(0);
  });

  it('returns the memo unchanged for an empty body', async () => {
    const created = (await createMemo(alice, 'Memo', 'Content', ['home'])).body;

    const res = await patchMemo(alice, created.uuid, {});

    expect(res.status).toBe(200);
    expect(res.body).toEqual(created);
  });

  it('forbids a USER on the memo who is not its author', async () => {
    const memoUuid = await memoBy(alice);
    await assign(alice, memoUuid, bob.uuid);

    const res = await patchMemo(bob, memoUuid, { title: 'Edited' });

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ message: "Only the memo's author, ADMINs and MODs can edit it" });
    expect((await getMemo(alice, memoUuid)).body.memo.title).toBe('Shopping');
  });

  it('forbids editing a memo the caller has no access to', async () => {
    const memoUuid = await memoBy(alice);

    const res = await patchMemo(bob, memoUuid, { title: 'Edited' });

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ message: 'Memo not found or you do not have access to it' });
  });

  it('returns 403 for a memo that does not exist, without revealing that', async () => {
    const res = await patchMemo(alice, randomUUID(), { title: 'Edited' });

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ message: 'Memo not found or you do not have access to it' });
  });
});

describe('DELETE /memos/{memoUuid}', () => {
  it('lets the author delete the memo, with its assignments and tag links', async () => {
    const memoUuid = (await createMemo(alice, 'Memo', 'Content', ['home', 'work'])).body.uuid;
    await assign(alice, memoUuid, bob.uuid, 'MOD');
    await assign(alice, memoUuid, carol.uuid);

    const res = await deleteMemo(alice, memoUuid);

    expect(res.status).toBe(204);
    expect(res.body).toEqual({});
    expect(fakeDb.memos).toHaveLength(0);
    expect(fakeDb.memosOnUsers).toHaveLength(0);
    expect(fakeDb.memosOnTags).toHaveLength(0);
    for (const user of [alice, bob, carol]) {
      expect((await listMemos(user)).body).toEqual([]);
      expect((await getMemo(user, memoUuid)).status).toBe(403);
    }
  });

  it('leaves other memos, their assignments and the tags themselves alone', async () => {
    const memoUuid = (await createMemo(alice, 'Memo A', 'Content', ['home'])).body.uuid;
    const other = (await createMemo(alice, 'Memo B', 'Content', ['home'])).body.uuid;
    await assign(alice, other, bob.uuid);

    await deleteMemo(alice, memoUuid);

    expect(await titles(alice, '?tags=home')).toEqual(['Memo B']);
    expect((await listMemos(bob)).body).toEqual([expect.objectContaining({ memoUuid: other })]);
    expect(fakeDb.tags.map((t) => t.name)).toEqual(['home']);
  });

  it('lets the author delete even with the USER role on the memo', async () => {
    const memoUuid = await memoBy(alice);
    setRole(alice, memoUuid, 'USER');

    expect((await deleteMemo(alice, memoUuid)).status).toBe(204);
    expect(fakeDb.memos).toHaveLength(0);
  });

  it('lets an ADMIN delete someone else’s memo', async () => {
    const memoUuid = await memoBy(alice);
    await assign(alice, memoUuid, bob.uuid, 'ADMIN');

    expect((await deleteMemo(bob, memoUuid)).status).toBe(204);
    expect((await listMemos(alice)).body).toEqual([]);
  });

  it.each(['MOD', 'USER'] as const)('forbids a %s who is not the author', async (role) => {
    const memoUuid = await memoBy(alice);
    await assign(alice, memoUuid, bob.uuid, role);

    const res = await deleteMemo(bob, memoUuid);

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ message: "Only the memo's author and ADMINs can delete it" });
    expect((await getMemo(alice, memoUuid)).status).toBe(200);
  });

  it('forbids deleting a memo the caller has no access to', async () => {
    const memoUuid = await memoBy(alice);

    const res = await deleteMemo(bob, memoUuid);

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ message: 'Memo not found or you do not have access to it' });
    expect(fakeDb.memos).toHaveLength(1);
  });

  it('returns 403 for a memo that does not exist, without revealing that', async () => {
    const res = await deleteMemo(alice, randomUUID());

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ message: 'Memo not found or you do not have access to it' });
  });

  it('answers a second delete of the same memo with 403', async () => {
    const memoUuid = await memoBy(alice);
    await deleteMemo(alice, memoUuid);

    expect((await deleteMemo(alice, memoUuid)).status).toBe(403);
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

  it('PATCH /memos/{memoUuid} returns only public memo fields', async () => {
    const res = await patchMemo(alice, await memoBy(alice), { title: 'Edited', tags: ['home'] });

    expect(Object.keys(res.body).sort()).toEqual(MEMO_FIELDS);
    expectNoNumbers(res.body);
  });

  it('GET /memos/{memoUuid} returns only public assignment and memo fields', async () => {
    const res = await getMemo(
      alice,
      (await createMemo(alice, 'Memo', 'Content', ['home'])).body.uuid,
    );

    expect(Object.keys(res.body).sort()).toEqual([...MEMO_ON_USER_FIELDS, 'memo'].sort());
    expect(Object.keys(res.body.memo).sort()).toEqual(MEMO_FIELDS);
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
