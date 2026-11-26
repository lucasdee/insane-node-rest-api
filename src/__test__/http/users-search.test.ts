import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../../app';
import { resetFakeDb, seedUser, type UserRow } from '../helpers/fake-prisma';
import { bearer } from '../helpers/tokens';

vi.mock('../../config/db', async () => ({
  prisma: (await import('../helpers/fake-prisma')).fakePrisma,
}));

let me: UserRow;

const search = (query = '', user: UserRow = me) =>
  request(app).get(`/users${query}`).set('Authorization', bearer(user.id));

const usernames = async (query = '') =>
  (await search(query)).body.map((u: { username: string }) => u.username);

beforeEach(() => {
  resetFakeDb();
  me = seedUser({ username: 'me', displayName: 'Myself' });
});

describe('GET /users', () => {
  it('returns 401 without a token', async () => {
    const res = await request(app).get('/users');

    expect(res.status).toBe(401);
  });

  it('returns only uuid, username and display name', async () => {
    const alice = seedUser({ username: 'alice', displayName: 'Alice A', role: 'ADMIN' });

    const res = await search();

    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ uuid: alice.uuid, username: 'alice', displayName: 'Alice A' }]);
  });

  it('never lists the caller', async () => {
    expect(await usernames()).toEqual([]);

    expect(await usernames('?search=me')).toEqual([]);
  });

  it('orders users by username', async () => {
    seedUser({ username: 'carol' });
    seedUser({ username: 'alice' });
    seedUser({ username: 'bob' });

    expect(await usernames()).toEqual(['alice', 'bob', 'carol']);
  });

  it('matches a substring of the username or the display name, ignoring case', async () => {
    seedUser({ username: 'alice', displayName: 'Alice Smith' });
    seedUser({ username: 'bob', displayName: 'Robert SMITHERS' });
    seedUser({ username: 'smitty' });
    seedUser({ username: 'carol', displayName: 'Carol' });

    expect(await usernames('?search=smith')).toEqual(['alice', 'bob']);
    expect(await usernames('?search=SMI')).toEqual(['alice', 'bob', 'smitty']);
    expect(await usernames('?search=ALI')).toEqual(['alice']);
    expect(await usernames('?search=nobody')).toEqual([]);
  });

  it('returns 20 users by default and pages with limit and offset', async () => {
    for (let i = 10; i < 35; i++) seedUser({ username: `user${i}` });

    const all = await usernames();
    expect(all).toHaveLength(20);
    expect(all[0]).toBe('user10');

    expect(await usernames('?limit=3')).toEqual(['user10', 'user11', 'user12']);
    expect(await usernames('?limit=3&offset=3')).toEqual(['user13', 'user14', 'user15']);
    expect(await usernames('?limit=50&offset=24')).toEqual(['user34']);
    expect(await usernames('?offset=25')).toEqual([]);
  });

  it.each([
    ['limit=0', 'limit'],
    ['limit=51', 'limit'],
    ['limit=1.5', 'limit'],
    ['limit=abc', 'limit'],
    ['offset=-1', 'offset'],
    ['offset=0.5', 'offset'],
    ['search=', 'search'],
    [`search=${'a'.repeat(65)}`, 'search'],
  ])('returns 422 for %s', async (query, field) => {
    const res = await search(`?${query}`);

    expect(res.status).toBe(422);
    expect(res.body.message).toBe('Validation failed');
    expect(res.body.details).toHaveProperty([field]);
  });

  it('accepts a 64-character search and the limit bounds', async () => {
    expect((await search(`?search=${'a'.repeat(64)}`)).status).toBe(200);
    expect((await search('?limit=1')).status).toBe(200);
    expect((await search('?limit=50&offset=0')).status).toBe(200);
  });
});
