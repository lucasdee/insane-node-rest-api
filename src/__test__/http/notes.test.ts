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

const listNotes = (user: UserRow) =>
  request(app).get('/notes').set('Authorization', bearer(user.id));

const createNote = (user: UserRow, title = 'Shopping', content = 'Milk, eggs') =>
  request(app).post('/notes/create').set('Authorization', bearer(user.id)).send({ title, content });

const assign = (by: UserRow, noteUuid: string, userUuid: string) =>
  request(app)
    .post('/notes/assign')
    .set('Authorization', bearer(by.id))
    .send({ noteUuid, userUuid });

/** Creates a note as `author` and returns its uuid. */
const noteBy = async (author: UserRow): Promise<string> => (await createNote(author)).body.uuid;

const internalNoteId = (uuid: string) => fakeDb.notes.find((n) => n.uuid === uuid)!.id;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

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

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      uuid: expect.stringMatching(UUID),
      title: 'Shopping',
      content: 'Milk, eggs',
      authorUuid: alice.uuid,
    });

    const list = await listNotes(alice);
    expect(list.body).toEqual([
      expect.objectContaining({
        noteUuid: res.body.uuid,
        userUuid: alice.uuid,
        assignedByUuid: alice.uuid,
        role: 'ADMIN',
        note: expect.objectContaining({ title: 'Shopping' }),
      }),
    ]);
  });
});

describe('POST /notes/assign', () => {
  it('lets the note’s ADMIN share it, and the assignee sees it as USER', async () => {
    const noteUuid = await noteBy(alice);

    const res = await assign(alice, noteUuid, bob.uuid);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      noteUuid,
      userUuid: bob.uuid,
      assignedByUuid: alice.uuid,
      role: 'USER',
    });

    const bobsNotes = await listNotes(bob);
    expect(bobsNotes.body).toEqual([
      expect.objectContaining({
        noteUuid,
        role: 'USER',
        note: expect.objectContaining({ uuid: noteUuid, authorUuid: alice.uuid }),
      }),
    ]);
  });

  it('lets a MOD on the note share it', async () => {
    const noteUuid = await noteBy(alice);
    fakeDb.notesOnUsers.push({
      noteId: internalNoteId(noteUuid),
      userId: bob.id,
      assignedById: alice.id,
      assignedAt: new Date(),
      role: 'MOD',
    });

    const res = await assign(bob, noteUuid, carol.uuid);

    expect(res.status).toBe(201);
  });

  it('forbids a USER on the note from sharing it', async () => {
    const noteUuid = await noteBy(alice);
    await assign(alice, noteUuid, bob.uuid);

    const res = await assign(bob, noteUuid, carol.uuid);

    expect(res.status).toBe(403);
    expect(await listNotes(carol).then((r) => r.body)).toEqual([]);
  });

  it('forbids sharing a note the caller has no access to', async () => {
    const noteUuid = await noteBy(alice);

    const res = await assign(bob, noteUuid, carol.uuid);

    expect(res.status).toBe(403);
  });

  it('returns 403 for a note that does not exist, without revealing that', async () => {
    const res = await assign(alice, randomUUID(), bob.uuid);

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ message: 'Note not found or you do not have access to it' });
  });

  it('returns 409 when the user is already assigned', async () => {
    const noteUuid = await noteBy(alice);
    await assign(alice, noteUuid, bob.uuid);

    const res = await assign(alice, noteUuid, bob.uuid);

    expect(res.status).toBe(409);
  });

  it('returns 404 when the target user does not exist', async () => {
    const noteUuid = await noteBy(alice);

    const res = await assign(alice, noteUuid, randomUUID());

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ message: 'User not found' });
    expect(fakeDb.notesOnUsers).toHaveLength(1);
  });

  it('checks access to the note before looking up the target user', async () => {
    const noteUuid = await noteBy(alice);

    const res = await assign(bob, noteUuid, randomUUID());

    expect(res.status).toBe(403);
  });
});

describe('note data exposure', () => {
  const NOTE_FIELDS = ['authorUuid', 'content', 'createdAt', 'title', 'uuid'];
  const NOTE_ON_USER_FIELDS = ['assignedAt', 'assignedByUuid', 'noteUuid', 'role', 'userUuid'];

  /** Fails if any numeric value, such as an internal id, appears anywhere in the body. */
  const expectNoNumbers = (body: unknown) => {
    JSON.stringify(body, (_key, value: unknown) => {
      expect(typeof value).not.toBe('number');
      return value;
    });
  };

  it('POST /notes/create returns only public note fields', async () => {
    const res = await createNote(alice);

    expect(Object.keys(res.body).sort()).toEqual(NOTE_FIELDS);
    expectNoNumbers(res.body);
  });

  it('POST /notes/assign returns only public assignment fields', async () => {
    const res = await assign(alice, await noteBy(alice), bob.uuid);

    expect(Object.keys(res.body).sort()).toEqual(NOTE_ON_USER_FIELDS);
    expectNoNumbers(res.body);
  });

  it('GET /notes returns only public assignment and note fields', async () => {
    await createNote(alice);

    const res = await listNotes(alice);

    expect(Object.keys(res.body[0]).sort()).toEqual([...NOTE_ON_USER_FIELDS, 'note'].sort());
    expect(Object.keys(res.body[0].note).sort()).toEqual(NOTE_FIELDS);
    expectNoNumbers(res.body);
  });
});
