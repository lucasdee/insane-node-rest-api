import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../../app';
import { bearer } from '../helpers/tokens';
import { resetFakeDb, seedUser } from '../helpers/fake-prisma';

// Invalid requests fail before reaching the database; valid ones at the limits
// go through to the in-memory fake.
vi.mock('../../config/db', async () => ({
  prisma: (await import('../helpers/fake-prisma.js')).fakePrisma,
}));

const validRegister = { username: 'alice', password: 'secret123', email: 'alice@example.com' };
const validLogin = { username: 'alice', password: 'secret123' };
const validNote = { title: 'Title', content: 'Content' };
const validAssign = {
  noteUuid: '123e4567-e89b-12d3-a456-426614174000',
  userUuid: '9b2d7c1e-4f3a-4b6c-9d8e-7f6a5b4c3d2e',
};

/** A syntactically valid email address of exactly `length` characters. */
const emailOfLength = (length: number) =>
  `${'a'.repeat(64)}@${'b'.repeat(length - 64 - 1 - '.com'.length)}.com`;

type Case = [label: string, body: object, field: string];

const post = (path: string, body: object, auth: boolean) => {
  const req = request(app).post(path);
  if (auth) req.set('Authorization', bearer(1));
  return req.send(body);
};

beforeEach(() => {
  resetFakeDb();
});

describe.each([
  [
    '/auth/register',
    false,
    [
      ['a missing username', { ...validRegister, username: undefined }, 'body.username'],
      [
        'a username shorter than 3 characters',
        { ...validRegister, username: 'al' },
        'body.username',
      ],
      [
        'a username longer than 64 characters',
        { ...validRegister, username: 'a'.repeat(65) },
        'body.username',
      ],
      ['a non-string username', { ...validRegister, username: 123 }, 'body.username'],
      [
        'a password shorter than 6 characters',
        { ...validRegister, password: '12345' },
        'body.password',
      ],
      [
        'a password longer than 72 characters',
        { ...validRegister, password: 'p'.repeat(73) },
        'body.password',
      ],
      ['a missing email', { ...validRegister, email: undefined }, 'body.email'],
      ['an invalid email', { ...validRegister, email: 'not-an-email' }, 'body.email'],
      [
        'an email longer than 128 characters',
        { ...validRegister, email: emailOfLength(129) },
        'body.email',
      ],
      ['a non-string display name', { ...validRegister, displayName: 42 }, 'body.displayName'],
      [
        'a display name longer than 64 characters',
        { ...validRegister, displayName: 'a'.repeat(65) },
        'body.displayName',
      ],
      ['an unknown property', { ...validRegister, role: 'ADMIN' }, 'body.role'],
    ] as Case[],
  ],
  [
    '/auth/login',
    false,
    [
      ['an empty username', { ...validLogin, username: '' }, 'body.username'],
      [
        'a username longer than 64 characters',
        { ...validLogin, username: 'a'.repeat(65) },
        'body.username',
      ],
      ['an empty password', { ...validLogin, password: '' }, 'body.password'],
      [
        'a password longer than 72 characters',
        { ...validLogin, password: 'p'.repeat(73) },
        'body.password',
      ],
      ['a missing password', { username: 'alice' }, 'body.password'],
      ['an unknown property', { ...validLogin, remember: true }, 'body.remember'],
    ] as Case[],
  ],
  [
    '/notes/create',
    true,
    [
      ['a title shorter than 3 characters', { ...validNote, title: 'ab' }, 'body.title'],
      [
        'a title longer than 128 characters',
        { ...validNote, title: 'a'.repeat(129) },
        'body.title',
      ],
      ['content shorter than 3 characters', { ...validNote, content: 'ab' }, 'body.content'],
      [
        'content longer than 10000 characters',
        { ...validNote, content: 'a'.repeat(10_001) },
        'body.content',
      ],
      ['a missing title', { content: 'Content' }, 'body.title'],
      ['an unknown property', { ...validNote, authorId: 99 }, 'body.authorId'],
    ] as Case[],
  ],
  [
    '/notes/assign',
    true,
    [
      [
        'a noteUuid that is not a uuid',
        { ...validAssign, noteUuid: 'not-a-uuid' },
        'body.noteUuid',
      ],
      ['a numeric noteUuid', { ...validAssign, noteUuid: 1 }, 'body.noteUuid'],
      [
        'a userUuid with trailing characters',
        { ...validAssign, userUuid: `${validAssign.userUuid}x` },
        'body.userUuid',
      ],
      ['a missing userUuid', { noteUuid: validAssign.noteUuid }, 'body.userUuid'],
      [
        'the old numeric userId field',
        { noteUuid: validAssign.noteUuid, userId: 2 },
        'body.userId',
      ],
      ['an unknown property', { ...validAssign, role: 'ADMIN' }, 'body.role'],
    ] as Case[],
  ],
])('POST %s', (path, auth, cases) => {
  it.each(cases)('returns 422 for %s', async (_label, body, field) => {
    const res = await post(path, body, auth);

    expect(res.status).toBe(422);
    expect(res.body.message).toBe('Validation failed');
    expect(Object.keys(res.body.details)).toContain(field);
  });
});

describe('maximum lengths', () => {
  it('explains which limit was exceeded', async () => {
    const res = await post('/notes/create', { ...validNote, title: 'a'.repeat(129) }, true);

    expect(res.body.details['body.title'].message).toBe(
      'Please provide a title that is at most 128 characters long',
    );
  });

  it('accepts a registration with every field at its limit', async () => {
    const res = await post(
      '/auth/register',
      {
        username: 'u'.repeat(64),
        password: 'p'.repeat(72),
        email: emailOfLength(128),
        displayName: 'd'.repeat(64),
      },
      false,
    );

    expect(res.status).toBe(201);
    expect(res.body.email).toHaveLength(128);
  });

  it('lets a 64-character username and 72-character password through to the credential check', async () => {
    const res = await post(
      '/auth/login',
      { username: 'u'.repeat(64), password: 'p'.repeat(72) },
      false,
    );

    expect(res.status).toBe(401);
  });

  it.each([
    ['/auth/register', validRegister],
    ['/auth/login', validLogin],
  ])('rejects a password within 72 characters but over 72 bytes on %s', async (path, body) => {
    const res = await post(path, { ...body, password: 'ł'.repeat(37) }, false);

    expect(res.status).toBe(422);
    expect(res.body.message).toBe('Validation failed');
    expect(Object.keys(res.body.details)).toEqual(['body.password']);
  });

  it('registers and logs in with a multi-byte password of exactly 72 bytes', async () => {
    const password = 'ł'.repeat(36);

    const registered = await post('/auth/register', { ...validRegister, password }, false);
    const loggedIn = await post('/auth/login', { username: 'alice', password }, false);

    expect(registered.status).toBe(201);
    expect(loggedIn.status).toBe(200);
  });

  it('accepts a note with title and content at their limits', async () => {
    const author = seedUser();

    const res = await request(app)
      .post('/notes/create')
      .set('Authorization', bearer(author.id))
      .send({ title: 't'.repeat(128), content: 'c'.repeat(10_000) });

    expect(res.status).toBe(201);
    expect(res.body.content).toHaveLength(10_000);
  });
});
