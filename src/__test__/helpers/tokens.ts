import crypto from 'crypto';
import jwt from 'jsonwebtoken';

/** A valid access token, as the API would issue it. */
export const accessTokenFor = (userId: number, options: jwt.SignOptions = { expiresIn: '5m' }) =>
  jwt.sign({ sub: String(userId) }, process.env.JWT_SECRET!, options);

/** A validly signed refresh token. It is only accepted if its hash is also stored. */
export const refreshTokenFor = (userId: number, secret = process.env.JWT_REFRESH_SECRET!) =>
  jwt.sign({ sub: String(userId) }, secret, { expiresIn: '7d', jwtid: crypto.randomUUID() });

/**
 * A token with `alg: none` and an empty signature, which a verifier must never
 * accept: anyone can make one for any subject.
 */
export const unsignedTokenFor = (sub: string | number) => {
  const part = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  return `${part({ alg: 'none', typ: 'JWT' })}.${part({ sub, iat: now, exp: now + 300 })}.`;
};

/** The hash under which the API stores a refresh token. */
export const hashRefreshToken = (token: string) =>
  crypto.createHmac('sha512', process.env.JWT_REFRESH_HASH_SECRET!).update(token).digest('hex');

export const bearer = (userId: number) => `Bearer ${accessTokenFor(userId)}`;
