import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import app from '../../app';
import { bearer } from '../helpers/tokens';

// Validation runs before any controller code, so the database is never reached.
vi.mock('../../config/db', () => ({ prisma: {} }));

const validRegister = { username: 'alice', password: 'secret123', email: 'alice@example.com' };
const validLogin = { username: 'alice', password: 'secret123' };
const validNote = { title: 'Title', content: 'Content' };
const validAssign = { noteId: 1, userId: 2 };

type Case = [label: string, body: object, field: string];

const post = (path: string, body: object, auth: boolean) => {
  const req = request(app).post(path);
  if (auth) req.set('Authorization', bearer(1));
  return req.send(body);
};

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
      ['a non-string username', { ...validRegister, username: 123 }, 'body.username'],
      [
        'a password shorter than 6 characters',
        { ...validRegister, password: '12345' },
        'body.password',
      ],
      ['a missing email', { ...validRegister, email: undefined }, 'body.email'],
      ['an invalid email', { ...validRegister, email: 'not-an-email' }, 'body.email'],
      ['a non-string display name', { ...validRegister, displayName: 42 }, 'body.displayName'],
      ['an unknown property', { ...validRegister, role: 'ADMIN' }, 'body.role'],
    ] as Case[],
  ],
  [
    '/auth/login',
    false,
    [
      ['an empty username', { ...validLogin, username: '' }, 'body.username'],
      ['an empty password', { ...validLogin, password: '' }, 'body.password'],
      ['a missing password', { username: 'alice' }, 'body.password'],
      ['an unknown property', { ...validLogin, remember: true }, 'body.remember'],
    ] as Case[],
  ],
  [
    '/notes/create',
    true,
    [
      ['a title shorter than 3 characters', { ...validNote, title: 'ab' }, 'body.title'],
      ['content shorter than 3 characters', { ...validNote, content: 'ab' }, 'body.content'],
      ['a missing title', { content: 'Content' }, 'body.title'],
      ['an unknown property', { ...validNote, authorId: 99 }, 'body.authorId'],
    ] as Case[],
  ],
  [
    '/notes/assign',
    true,
    [
      ['a non-integer noteId', { ...validAssign, noteId: 1.5 }, 'body.noteId'],
      ['a string userId', { ...validAssign, userId: 'two' }, 'body.userId'],
      ['a missing userId', { noteId: 1 }, 'body.userId'],
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
