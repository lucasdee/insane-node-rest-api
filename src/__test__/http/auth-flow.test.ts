import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../../app';
import { fakeDb, resetFakeDb } from '../helpers/fake-prisma';

vi.mock('../../config/db', async () => ({
  prisma: (await import('../helpers/fake-prisma')).fakePrisma,
}));

const refreshCookieOf = (res: request.Response) =>
  (res.headers['set-cookie'] as unknown as string[])[0].split(';')[0];

beforeEach(() => {
  resetFakeDb();
});

describe('auth flow', () => {
  it('register → login → profile → refresh → logout', async () => {
    // Register
    const registered = await request(app).post('/auth/register').send({
      username: 'alice',
      password: 'secret123',
      email: 'alice@example.com',
      displayName: 'Alice',
    });
    expect(registered.status).toBe(200);
    expect(registered.body).toMatchObject({ username: 'alice', role: 'USER' });

    // Registering the same username again conflicts
    const duplicate = await request(app).post('/auth/register').send({
      username: 'alice',
      password: 'secret123',
      email: 'other@example.com',
    });
    expect(duplicate.status).toBe(409);

    // Log in
    const loggedIn = await request(app)
      .post('/auth/login')
      .send({ username: 'alice', password: 'secret123' });
    expect(loggedIn.status).toBe(200);
    const firstCookie = refreshCookieOf(loggedIn);
    expect(fakeDb.refreshTokens).toHaveLength(1);

    // Read the profile with the access token
    const profile = await request(app)
      .get('/users/me')
      .set('Authorization', `Bearer ${loggedIn.body.accessToken}`);
    expect(profile.status).toBe(200);
    expect(profile.body).toMatchObject({ uuid: registered.body.uuid, email: 'alice@example.com' });

    // Refresh: the cookie is rotated and the new access token works
    const refreshed = await request(app).post('/auth/refresh').set('Cookie', firstCookie);
    expect(refreshed.status).toBe(200);
    const secondCookie = refreshCookieOf(refreshed);
    expect(secondCookie).not.toBe(firstCookie);
    // The rotated-out token is kept, marked as revoked, in the same family
    expect(fakeDb.refreshTokens).toEqual([
      expect.objectContaining({ revoked: true }),
      expect.objectContaining({ revoked: false, familyId: fakeDb.refreshTokens[0].familyId }),
    ]);

    const profileAgain = await request(app)
      .get('/users/me')
      .set('Authorization', `Bearer ${refreshed.body.accessToken}`);
    expect(profileAgain.status).toBe(200);

    // Log out: the whole session is revoked and the cookie cleared
    const loggedOut = await request(app).post('/auth/logout').set('Cookie', secondCookie);
    expect(loggedOut.status).toBe(204);
    expect(refreshCookieOf(loggedOut)).toBe('refreshToken=');
    expect(fakeDb.refreshTokens).toHaveLength(0);

    for (const cookie of [firstCookie, secondCookie]) {
      const afterLogout = await request(app).post('/auth/refresh').set('Cookie', cookie);
      expect(afterLogout.status).toBe(401);
    }
  });

  it('ends only the affected session when a rotated refresh token is reused', async () => {
    await request(app)
      .post('/auth/register')
      .send({ username: 'alice', password: 'secret123', email: 'alice@example.com' });
    const login = () =>
      request(app).post('/auth/login').send({ username: 'alice', password: 'secret123' });
    const laptop = await login();
    const phone = await login();

    // The laptop refreshes as usual; an attacker kept a copy of its first token.
    const stolenCookie = refreshCookieOf(laptop);
    const rotated = await request(app).post('/auth/refresh').set('Cookie', stolenCookie);
    expect(rotated.status).toBe(200);

    const reuse = await request(app).post('/auth/refresh').set('Cookie', stolenCookie);
    expect(reuse.status).toBe(401);

    // The laptop's session is over: its latest token no longer works...
    const laptopAgain = await request(app)
      .post('/auth/refresh')
      .set('Cookie', refreshCookieOf(rotated));
    expect(laptopAgain.status).toBe(401);

    // ...while the phone's session is unaffected.
    const phoneRefresh = await request(app)
      .post('/auth/refresh')
      .set('Cookie', refreshCookieOf(phone));
    expect(phoneRefresh.status).toBe(200);
  });

  it('keeps sessions on different devices independent', async () => {
    await request(app)
      .post('/auth/register')
      .send({ username: 'alice', password: 'secret123', email: 'alice@example.com' });

    const login = () =>
      request(app).post('/auth/login').send({ username: 'alice', password: 'secret123' });
    const laptop = await login();
    const phone = await login();
    expect(fakeDb.refreshTokens).toHaveLength(2);
    expect(fakeDb.refreshTokens[0].familyId).not.toBe(fakeDb.refreshTokens[1].familyId);

    await request(app).post('/auth/logout').set('Cookie', refreshCookieOf(laptop));

    const phoneRefresh = await request(app)
      .post('/auth/refresh')
      .set('Cookie', refreshCookieOf(phone));
    expect(phoneRefresh.status).toBe(200);
  });
});
