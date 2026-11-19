import { describe, it, expect } from 'vitest';
import type { Request } from 'express';
import jwt from 'jsonwebtoken';
import { expressAuthentication } from '../../middlewares/tsoaAuth';
import { AuthError } from '../../errors';
import { accessTokenFor, refreshTokenFor, unsignedTokenFor } from '../helpers/tokens';

const requestWith = (authorization?: string) =>
  ({ headers: authorization === undefined ? {} : { authorization } }) as Request;

const signedWithSubject = (sub: unknown) =>
  jwt.sign(sub === undefined ? {} : { sub }, process.env.JWT_SECRET!, { expiresIn: '5m' });

describe('expressAuthentication', () => {
  it('returns the user id for a valid bearer token', async () => {
    const user = await expressAuthentication(requestWith(`Bearer ${accessTokenFor(5)}`), 'jwt');

    expect(user).toEqual({ userId: 5 });
  });

  it('accepts a numeric subject, as in tokens issued before subjects were strings', async () => {
    const token = jwt.sign({ sub: 5 }, process.env.JWT_SECRET!, { expiresIn: '5m' });

    await expect(expressAuthentication(requestWith(`Bearer ${token}`), 'jwt')).resolves.toEqual({
      userId: 5,
    });
  });

  it('rejects unsupported security schemes', async () => {
    await expect(
      expressAuthentication(requestWith(`Bearer ${accessTokenFor(5)}`), 'api_key'),
    ).rejects.toThrow(new AuthError('Unsupported security type'));
  });

  it.each([
    ['no Authorization header', undefined],
    ['an empty header', ''],
    ['a non-Bearer scheme', `Basic ${Buffer.from('a:b').toString('base64')}`],
    ['a lowercase scheme', `bearer ${accessTokenFor(5)}`],
  ])('rejects %s', async (_label, header) => {
    await expect(expressAuthentication(requestWith(header), 'jwt')).rejects.toThrow(
      new AuthError('No token provided'),
    );
  });

  it.each([
    ['a malformed token', () => 'not-a-jwt'],
    ['an expired token', () => accessTokenFor(5, { expiresIn: -10 })],
    [
      'a token signed with the wrong secret',
      () => jwt.sign({ sub: '5' }, 'wrong-secret', { expiresIn: '5m' }),
    ],
    ['a refresh token', () => refreshTokenFor(5)],
    // The right secret, but not the algorithm the API signs with.
    [
      'a token signed with HS512',
      () =>
        jwt.sign({ sub: '5' }, process.env.JWT_SECRET!, { algorithm: 'HS512', expiresIn: '5m' }),
    ],
    ['an unsigned token (alg none)', () => unsignedTokenFor('5')],
    // Validly signed, but without a usable user id.
    ['a token without a subject', () => signedWithSubject(undefined)],
    ['a non-numeric subject', () => signedWithSubject('abc')],
    ['a zero subject', () => signedWithSubject('0')],
    ['a decimal subject', () => signedWithSubject(1.5)],
  ])('rejects %s', async (_label, makeToken) => {
    await expect(
      expressAuthentication(requestWith(`Bearer ${makeToken()}`), 'jwt'),
    ).rejects.toThrow(new AuthError('Invalid token'));
  });
});
