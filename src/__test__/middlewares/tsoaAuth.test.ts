import { describe, it, expect } from 'vitest';
import type { Request } from 'express';
import jwt from 'jsonwebtoken';
import { expressAuthentication } from '../../middlewares/tsoaAuth';
import { AuthError } from '../../errors';
import { accessTokenFor, refreshTokenFor } from '../helpers/tokens';

const requestWith = (authorization?: string) =>
  ({ headers: authorization === undefined ? {} : { authorization } }) as Request;

describe('expressAuthentication', () => {
  it('returns the token payload for a valid bearer token', async () => {
    const payload = await expressAuthentication(requestWith(`Bearer ${accessTokenFor(5)}`), 'jwt');

    expect(payload.sub).toBe('5');
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
  ])('rejects %s', async (_label, makeToken) => {
    await expect(
      expressAuthentication(requestWith(`Bearer ${makeToken()}`), 'jwt'),
    ).rejects.toThrow(new AuthError('Invalid token'));
  });
});
