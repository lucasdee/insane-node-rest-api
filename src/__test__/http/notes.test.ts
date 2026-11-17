import { describe, it, expect, vi, beforeEach } from 'vitest';
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

const listNotes = (user: UserRow) =>
  request(app).get('/notes').set('Authorization', bearer(user.id));

const createNote = (user: UserRow, title = 'Shopping', content = 'Milk, eggs') =>
  request(app).post('/notes/create').set('Authorization', bearer(user.id)).send({ title, content });

const assign = (by: UserRow, noteId: number, userId: number) =>
  request(app).post('/notes/assign').set('Authorization', bearer(by.id)).send({ noteId, userId });

/** Creates a note as `author` and returns its id. */
const noteBy = async (author: UserRow) => {
  await createNote(author);
  return fakeDb.notes[fakeDb.notes.length - 1].id;
};

beforeEach(() => {
  resetFakeDb();
  alice = seedUser({ username: 'alice' });
  bob = seedUser({ username: 'bob' });
  carol = seedUser({ username: 'carol' });
});

describe('authentication', () => {
  it.each([
    ['GET', '/notes'],
    ['POST', '/notes/create'],
    ['POST', '/notes/assign'],
  ])('%s %s returns 401 without a token', async (method, path) => {
    const res = await request(app)[method === 'GET' ? 'get' : 'post'](path);

    expect(res.status).toBe(401);
  });
});

describe('GET /notes', () => {
  it('returns an empty list for a user without notes', async () => {
    const res = await listNotes(alice);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns only the caller’s notes', async () => {
    await createNote(alice, 'Alice note');
    await createNote(bob, 'Bob note');

    const res = await listNotes(alice);

    expect(res.body).toHaveLength(1);
    expect(res.body[0].note.title).toBe('Alice note');
  });
});

describe('POST /notes/create', () => {
  it('creates the note and makes the author its ADMIN', async () => {
    const res = await createNote(alice, 'Shopping', 'Milk, eggs');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      title: 'Shopping',
      content: 'Milk, eggs',
      authorId: alice.id,
    });
    expect(res.body.uuid).toEqual(expect.any(String));

    const list = await listNotes(alice);
    expect(list.body).toEqual([
      expect.objectContaining({
        userId: alice.id,
        assignedById: alice.id,
        role: 'ADMIN',
        note: expect.objectContaining({ title: 'Shopping' }),
      }),
    ]);
  });
});

describe('POST /notes/assign', () => {
  it('lets the note’s ADMIN share it, and the assignee sees it as USER', async () => {
    const noteId = await noteBy(alice);

    const res = await assign(alice, noteId, bob.id);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      noteId,
      userId: bob.id,
      assignedById: alice.id,
      role: 'USER',
    });

    const bobsNotes = await listNotes(bob);
    expect(bobsNotes.body).toEqual([
      expect.objectContaining({
        noteId,
        role: 'USER',
        note: expect.objectContaining({ id: noteId }),
      }),
    ]);
  });

  it('lets a MOD on the note share it', async () => {
    const noteId = await noteBy(alice);
    fakeDb.notesOnUsers.push({
      noteId,
      userId: bob.id,
      assignedById: alice.id,
      assignedAt: new Date(),
      role: 'MOD',
    });

    const res = await assign(bob, noteId, carol.id);

    expect(res.status).toBe(200);
  });

  it('forbids a USER on the note from sharing it', async () => {
    const noteId = await noteBy(alice);
    await assign(alice, noteId, bob.id);

    const res = await assign(bob, noteId, carol.id);

    expect(res.status).toBe(403);
    expect(await listNotes(carol).then((r) => r.body)).toEqual([]);
  });

  it('forbids sharing a note the caller has no access to', async () => {
    const noteId = await noteBy(alice);

    const res = await assign(bob, noteId, carol.id);

    expect(res.status).toBe(403);
  });

  it('returns 403 for a note that does not exist, without revealing that', async () => {
    const res = await assign(alice, 9999, bob.id);

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ message: 'Note not found or you do not have access to it' });
  });

  it('returns 409 when the user is already assigned', async () => {
    const noteId = await noteBy(alice);
    await assign(alice, noteId, bob.id);

    const res = await assign(alice, noteId, bob.id);

    expect(res.status).toBe(409);
  });

  it('returns 400 when the target user does not exist', async () => {
    const noteId = await noteBy(alice);

    const res = await assign(alice, noteId, 9999);

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: 'A referenced resource does not exist' });
  });
});
