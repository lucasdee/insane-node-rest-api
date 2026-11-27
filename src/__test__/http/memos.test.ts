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

const listAssignments = (user: UserRow, memoUuid: string) =>
  request(app).get(`/memos/${memoUuid}/assignments`).set('Authorization', bearer(user.id));

const removeAssignment = (by: UserRow, memoUuid: string, userUuid: string) =>
  request(app)
    .delete(`/memos/${memoUuid}/assignments/${userUuid}`)
    .set('Authorization', bearer(by.id));

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

describe('GET /memos/{memoUuid}/assignments', () => {
  /** Moves the user's assignment to the memo to the given time. */
  const setAssignedAt = (user: UserRow, memoUuid: string, iso: string) => {
    const memo = fakeDb.memos.find((m) => m.uuid === memoUuid)!;
    fakeDb.memosOnUsers.find((l) => l.memoId === memo.id && l.userId === user.id)!.assignedAt =
      new Date(iso);
  };

  it('lists every assignee with names, roles and who assigned them, oldest first', async () => {
    const memoUuid = await memoBy(alice);
    await assign(alice, memoUuid, carol.uuid, 'MOD');
    await assign(carol, memoUuid, bob.uuid);
    setAssignedAt(alice, memoUuid, '2026-01-01T00:00:00.000Z');
    setAssignedAt(carol, memoUuid, '2026-01-02T00:00:00.000Z');
    setAssignedAt(bob, memoUuid, '2026-01-03T00:00:00.000Z');

    const res = await listAssignments(alice, memoUuid);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      {
        userUuid: alice.uuid,
        username: 'alice',
        displayName: 'Alice',
        role: 'ADMIN',
        assignedAt: '2026-01-01T00:00:00.000Z',
        assignedByUuid: alice.uuid,
        assignedByUsername: 'alice',
        assignedByDisplayName: 'Alice',
      },
      {
        userUuid: carol.uuid,
        username: 'carol',
        displayName: null,
        role: 'MOD',
        assignedAt: '2026-01-02T00:00:00.000Z',
        assignedByUuid: alice.uuid,
        assignedByUsername: 'alice',
        assignedByDisplayName: 'Alice',
      },
      {
        userUuid: bob.uuid,
        username: 'bob',
        displayName: null,
        role: 'USER',
        assignedAt: '2026-01-03T00:00:00.000Z',
        assignedByUuid: carol.uuid,
        assignedByUsername: 'carol',
        assignedByDisplayName: null,
      },
    ]);
  });

  it('orders assignments made at the same time by username', async () => {
    const memoUuid = await memoBy(alice);
    await assign(alice, memoUuid, carol.uuid);
    await assign(alice, memoUuid, bob.uuid);
    for (const user of [alice, bob, carol]) setAssignedAt(user, memoUuid, '2026-01-01T00:00:00Z');

    const res = await listAssignments(alice, memoUuid);

    expect(res.body.map((a: { username: string }) => a.username)).toEqual([
      'alice',
      'bob',
      'carol',
    ]);
  });

  it('lets a USER on the memo see who else it is shared with', async () => {
    const memoUuid = await memoBy(alice);
    await assign(alice, memoUuid, bob.uuid);
    await assign(alice, memoUuid, carol.uuid, 'MOD');

    const res = await listAssignments(bob, memoUuid);

    expect(res.status).toBe(200);
    expect(res.body.map((a: { userUuid: string }) => a.userUuid).sort()).toEqual(
      [alice.uuid, bob.uuid, carol.uuid].sort(),
    );
  });

  it('lets the author see the list even without an assignment of their own', async () => {
    const memoUuid = await memoBy(alice);
    await assign(alice, memoUuid, bob.uuid, 'ADMIN');
    const memo = fakeDb.memos.find((m) => m.uuid === memoUuid)!;
    const own = fakeDb.memosOnUsers.findIndex((l) => l.memoId === memo.id && l.userId === alice.id);
    fakeDb.memosOnUsers.splice(own, 1);

    const res = await listAssignments(alice, memoUuid);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([expect.objectContaining({ userUuid: bob.uuid, role: 'ADMIN' })]);
  });

  it('lists only the given memo’s assignees', async () => {
    const memoUuid = await memoBy(alice);
    await assign(alice, await memoBy(alice), bob.uuid);

    const res = await listAssignments(alice, memoUuid);

    expect(res.body).toEqual([expect.objectContaining({ userUuid: alice.uuid })]);
  });

  it('forbids listing the assignees of a memo the caller has no access to', async () => {
    const memoUuid = await memoBy(alice);

    const res = await listAssignments(bob, memoUuid);

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ message: 'Memo not found or you do not have access to it' });
  });

  it('returns 403 for a memo that does not exist, without revealing that', async () => {
    const res = await listAssignments(alice, randomUUID());

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ message: 'Memo not found or you do not have access to it' });
  });
});

describe('DELETE /memos/{memoUuid}/assignments/{userUuid}', () => {
  const NOT_ALLOWED =
    "Only the memo's ADMINs, its MODs (for USERs) and whoever assigned the user, with a role at least as high, can remove this assignment";
  const AUTHOR_STAYS = { message: "The memo's author can't be removed from it" };

  /** The uuids of the memo's assignees, as its author sees them, sorted. */
  const assignees = async (memoUuid: string) =>
    (await listAssignments(alice, memoUuid)).body
      .map((a: { userUuid: string }) => a.userUuid)
      .sort();

  it.each(['USER', 'MOD', 'ADMIN'] as const)(
    'lets an ADMIN remove a %s, who then no longer has access',
    async (role) => {
      const memoUuid = await memoBy(alice);
      await assign(alice, memoUuid, bob.uuid, 'ADMIN');
      await assign(alice, memoUuid, carol.uuid, role);

      const res = await removeAssignment(bob, memoUuid, carol.uuid);

      expect(res.status).toBe(204);
      expect(res.body).toEqual({});
      expect(await listMemos(carol).then((r) => r.body)).toEqual([]);
      expect((await getMemo(carol, memoUuid)).status).toBe(403);
    },
  );

  it('lets a MOD remove a USER someone else assigned', async () => {
    const memoUuid = await memoBy(alice);
    await assign(alice, memoUuid, bob.uuid, 'MOD');
    await assign(alice, memoUuid, carol.uuid);

    expect((await removeAssignment(bob, memoUuid, carol.uuid)).status).toBe(204);
    expect(await assignees(memoUuid)).toEqual([alice.uuid, bob.uuid].sort());
  });

  it.each(['MOD', 'ADMIN'] as const)(
    'forbids a MOD from removing a %s someone else assigned',
    async (role) => {
      const memoUuid = await memoBy(alice);
      await assign(alice, memoUuid, bob.uuid, 'MOD');
      await assign(alice, memoUuid, carol.uuid, role);

      const res = await removeAssignment(bob, memoUuid, carol.uuid);

      expect(res.status).toBe(403);
      expect(res.body).toEqual({ message: NOT_ALLOWED });
      expect(await assignees(memoUuid)).toContain(carol.uuid);
    },
  );

  it('forbids a USER from removing someone else', async () => {
    const memoUuid = await memoBy(alice);
    await assign(alice, memoUuid, bob.uuid);
    await assign(alice, memoUuid, carol.uuid);

    const res = await removeAssignment(bob, memoUuid, carol.uuid);

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ message: NOT_ALLOWED });
  });

  it.each(['USER', 'MOD', 'ADMIN'] as const)('lets a %s leave the memo', async (role) => {
    const memoUuid = await memoBy(alice);
    await assign(alice, memoUuid, bob.uuid, role);

    expect((await removeAssignment(bob, memoUuid, bob.uuid)).status).toBe(204);
    expect(await listMemos(bob).then((r) => r.body)).toEqual([]);
    expect(await assignees(memoUuid)).toEqual([alice.uuid]);
  });

  it('lets whoever made an assignment remove it when their role is as high as the assignee’s', async () => {
    const memoUuid = await memoBy(alice);
    await assign(alice, memoUuid, bob.uuid, 'ADMIN');
    await assign(bob, memoUuid, carol.uuid, 'MOD');
    // As a MOD, bob could not remove a MOD someone else assigned.
    setRole(bob, memoUuid, 'MOD');

    expect((await removeAssignment(bob, memoUuid, carol.uuid)).status).toBe(204);
    expect(await assignees(memoUuid)).toEqual([alice.uuid, bob.uuid].sort());
  });

  it('forbids whoever made an assignment from removing it when their role is now lower', async () => {
    const memoUuid = await memoBy(alice);
    await assign(alice, memoUuid, bob.uuid, 'ADMIN');
    await assign(bob, memoUuid, carol.uuid, 'ADMIN');
    setRole(bob, memoUuid, 'MOD');

    const res = await removeAssignment(bob, memoUuid, carol.uuid);

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ message: NOT_ALLOWED });
    expect(await assignees(memoUuid)).toContain(carol.uuid);
  });

  it('forbids an ADMIN from removing the author', async () => {
    const memoUuid = await memoBy(alice);
    await assign(alice, memoUuid, bob.uuid, 'ADMIN');

    const res = await removeAssignment(bob, memoUuid, alice.uuid);

    expect(res.status).toBe(403);
    expect(res.body).toEqual(AUTHOR_STAYS);
    expect(await assignees(memoUuid)).toContain(alice.uuid);
  });

  it.each(['USER', 'MOD', 'ADMIN'] as const)(
    'forbids the author from leaving their own memo, even with the %s role on it',
    async (role) => {
      const memoUuid = await memoBy(alice);
      setRole(alice, memoUuid, role);

      const res = await removeAssignment(alice, memoUuid, alice.uuid);

      expect(res.status).toBe(403);
      expect(res.body).toEqual(AUTHOR_STAYS);
      expect(await listMemos(alice).then((r) => r.body)).toHaveLength(1);
    },
  );

  it('gives the author no say over others’ assignments beyond their role', async () => {
    const memoUuid = await memoBy(alice);
    await assign(alice, memoUuid, bob.uuid, 'ADMIN');
    await assign(bob, memoUuid, carol.uuid);
    setRole(alice, memoUuid, 'USER');

    expect((await removeAssignment(alice, memoUuid, carol.uuid)).status).toBe(403);
  });

  it('leaves the user’s other memos and the memo’s other assignees alone', async () => {
    const memoUuid = await memoBy(alice);
    const otherUuid = await memoBy(alice);
    await assign(alice, memoUuid, bob.uuid);
    await assign(alice, memoUuid, carol.uuid);
    await assign(alice, otherUuid, bob.uuid);

    await removeAssignment(alice, memoUuid, bob.uuid);

    expect(
      await listMemos(bob).then((r) => r.body.map((l: { memoUuid: string }) => l.memoUuid)),
    ).toEqual([otherUuid]);
    expect(await assignees(memoUuid)).toEqual([alice.uuid, carol.uuid].sort());
  });

  it.each([
    ['a user who is not assigned', () => carol.uuid],
    ['a user who does not exist', () => randomUUID()],
  ])('returns 404 for %s', async (_label, target) => {
    const memoUuid = await memoBy(alice);

    const res = await removeAssignment(alice, memoUuid, target());

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ message: 'The user is not assigned to the memo' });
  });

  it('answers a second removal of the same assignment with 404', async () => {
    const memoUuid = await memoBy(alice);
    await assign(alice, memoUuid, bob.uuid);
    await removeAssignment(alice, memoUuid, bob.uuid);

    expect((await removeAssignment(alice, memoUuid, bob.uuid)).status).toBe(404);
  });

  it('forbids removing assignments of a memo the caller has no access to', async () => {
    const memoUuid = await memoBy(alice);
    await assign(alice, memoUuid, bob.uuid);

    const res = await removeAssignment(carol, memoUuid, bob.uuid);

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ message: 'Memo not found or you do not have access to it' });
    expect(await assignees(memoUuid)).toContain(bob.uuid);
  });

  it('checks access to the memo before looking up the assignment', async () => {
    const memoUuid = await memoBy(alice);

    const res = await removeAssignment(carol, memoUuid, randomUUID());

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ message: 'Memo not found or you do not have access to it' });
  });

  it('returns 403 for a memo that does not exist, without revealing that', async () => {
    const res = await removeAssignment(alice, randomUUID(), alice.uuid);

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ message: 'Memo not found or you do not have access to it' });
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

  it('GET /memos/{memoUuid}/assignments returns only what other users may see', async () => {
    const memoUuid = await memoBy(alice);
    await assign(alice, memoUuid, bob.uuid, 'MOD');

    const res = await listAssignments(bob, memoUuid);

    for (const assignment of res.body) {
      expect(Object.keys(assignment).sort()).toEqual([
        'assignedAt',
        'assignedByDisplayName',
        'assignedByUsername',
        'assignedByUuid',
        'displayName',
        'role',
        'userUuid',
        'username',
      ]);
    }
    expect(JSON.stringify(res.body)).not.toContain(alice.email);
    expect(JSON.stringify(res.body)).not.toContain(bob.email);
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
