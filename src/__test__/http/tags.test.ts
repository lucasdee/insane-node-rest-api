import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../../app';
import { resetFakeDb, seedUser, type UserRow } from '../helpers/fake-prisma';
import { bearer } from '../helpers/tokens';

vi.mock('../../config/db', async () => ({
  prisma: (await import('../helpers/fake-prisma')).fakePrisma,
}));

let alice: UserRow;
let bob: UserRow;

const listTags = (user: UserRow) => request(app).get('/tags').set('Authorization', bearer(user.id));

/** Creates a memo with the given tags as `author` and returns its uuid. */
const memoWithTags = async (author: UserRow, tags: string[]): Promise<string> =>
  (
    await request(app)
      .post('/memos/create')
      .set('Authorization', bearer(author.id))
      .send({ title: 'Title', content: 'Content', tags })
  ).body.uuid;

beforeEach(() => {
  resetFakeDb();
  alice = seedUser({ username: 'alice' });
  bob = seedUser({ username: 'bob' });
});

describe('GET /tags', () => {
  it('returns 401 without a token', async () => {
    expect((await request(app).get('/tags')).status).toBe(401);
  });

  it('returns an empty list for a user without memos', async () => {
    const res = await listTags(alice);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('lists the tags on the caller’s memos, sorted by name, with counts', async () => {
    await memoWithTags(alice, ['work', 'home']);
    await memoWithTags(alice, ['home']);

    expect((await listTags(alice)).body).toEqual([
      { name: 'home', memoCount: 2 },
      { name: 'work', memoCount: 1 },
    ]);
  });

  it('counts only the caller’s memos and hides tags used only by others', async () => {
    await memoWithTags(alice, ['home']);
    await memoWithTags(bob, ['home', 'secret']);

    expect((await listTags(alice)).body).toEqual([{ name: 'home', memoCount: 1 }]);
  });

  it('includes tags on memos shared with the caller', async () => {
    const memoUuid = await memoWithTags(alice, ['shared']);
    await request(app)
      .post('/memos/assign')
      .set('Authorization', bearer(alice.id))
      .send({ memoUuid, userUuid: bob.uuid });

    expect((await listTags(bob)).body).toEqual([{ name: 'shared', memoCount: 1 }]);
  });

  it('drops a tag once it is removed from the caller’s last memo carrying it', async () => {
    const memoUuid = await memoWithTags(alice, ['home']);

    await request(app)
      .patch(`/memos/${memoUuid}`)
      .set('Authorization', bearer(alice.id))
      .send({ tags: ['work'] });

    expect((await listTags(alice)).body).toEqual([{ name: 'work', memoCount: 1 }]);
  });

  it('stops counting a deleted memo, for everyone it was shared with', async () => {
    const memoUuid = await memoWithTags(alice, ['home', 'work']);
    await memoWithTags(alice, ['home']);
    await request(app)
      .post('/memos/assign')
      .set('Authorization', bearer(alice.id))
      .send({ memoUuid, userUuid: bob.uuid });

    await request(app).delete(`/memos/${memoUuid}`).set('Authorization', bearer(alice.id));

    expect((await listTags(alice)).body).toEqual([{ name: 'home', memoCount: 1 }]);
    expect((await listTags(bob)).body).toEqual([]);
  });
});
