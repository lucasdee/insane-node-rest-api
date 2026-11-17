import crypto from 'crypto';
import jwt from 'jsonwebtoken';

/** A valid access token, as the API would issue it. */
export const accessTokenFor = (userId: number, options: jwt.SignOptions = { expiresIn: '5m' }) =>
  jwt.sign({ sub: String(userId) }, process.env.JWT_SECRET!, options);

/** A validly signed refresh token. It is only accepted if its hash is also stored. */
export const refreshTokenFor = (userId: number, secret = process.env.JWT_REFRESH_SECRET!) =>
  jwt.sign({ sub: userId }, secret, { expiresIn: '7d', jwtid: crypto.randomUUID() });

/** The hash under which the API stores a refresh token. */
export const hashRefreshToken = (token: string) =>
  crypto.createHmac('sha512', process.env.JWT_REFRESH_HASH_SECRET!).update(token).digest('hex');

export const bearer = (userId: number) => `Bearer ${accessTokenFor(userId)}`;
