import { env } from '../config/env';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt, { JwtPayload } from 'jsonwebtoken';
import { userRepository } from '../repositories/user.repository';
import { tokenRepository } from '../repositories/token.repository';
import { LoginRequest, RegisterRequest } from '../dtos/auth.dto';
import { AuthError } from '../errors';
import { AuthTokens } from './types';
import { User } from '../dtos/user.dto';
import { Role } from '../generated/prisma/enums';

const {
  secret,
  refreshSecret,
  refreshHashSecret,
  accessTokenExpiresInMinutes,
  refreshTokenExpiresInDays,
} = env.jwt;

const createRefreshTokenHash = (refreshToken: string): string => {
  return crypto.createHmac('sha512', refreshHashSecret).update(refreshToken).digest('hex');
};

/**
 * Verifies a refresh token's signature and expiry and returns its subject.
 * Any failure is reported as an AuthError (401), never as a raw jsonwebtoken error.
 */
const verifyRefreshToken = (refreshToken: string): string => {
  let payload: string | JwtPayload;
  try {
    payload = jwt.verify(refreshToken, refreshSecret);
  } catch {
    throw new AuthError('Invalid or expired refresh token');
  }

  if (typeof payload === 'string' || payload.sub === undefined) {
    throw new AuthError('Invalid or expired refresh token');
  }

  return String(payload.sub);
};

const createTokens = async (userId: number): Promise<AuthTokens> => {
  const accessToken = jwt.sign({ sub: userId }, secret, {
    expiresIn: `${accessTokenExpiresInMinutes}m`,
  });
  const accessTokenExpiresOn = new Date(Date.now() + accessTokenExpiresInMinutes * 60 * 1000);
  const refreshToken = jwt.sign({ sub: userId }, refreshSecret, {
    expiresIn: `${refreshTokenExpiresInDays}d`,
  });
  const refreshTokenExpiresOn = new Date(
    Date.now() + refreshTokenExpiresInDays * 24 * 60 * 60 * 1000,
  );
  const refreshTokenHash = createRefreshTokenHash(refreshToken);

  await tokenRepository.saveRefreshToken(userId, refreshTokenHash, refreshTokenExpiresOn);

  return {
    accessToken,
    accessTokenExpiresOn: accessTokenExpiresOn.getTime(),
    refreshToken,
    refreshTokenExpiresOn: refreshTokenExpiresOn.getTime(),
  };
};

export class UserService {
  async register({ username, password, email, displayName }: RegisterRequest): Promise<User> {
    if (await userRepository.existsByUsername(username)) throw new AuthError('User already exists');

    const hashed = await bcrypt.hash(password, 12);
    return userRepository.createUser({ username, password: hashed, email, displayName });
  }

  async login({ username, password }: LoginRequest): Promise<AuthTokens> {
    const user = await userRepository.findCredentialsByUsername(username);
    if (!user) throw new AuthError('Invalid credentials');

    const match = await bcrypt.compare(password, user.password);
    if (!match) throw new AuthError('Invalid credentials');

    const authResponse = await createTokens(user.id);

    return authResponse;
  }

  async refreshAccessToken(currentRefreshToken: string): Promise<AuthTokens> {
    const subject = verifyRefreshToken(currentRefreshToken);

    const currentRefreshTokenHash = createRefreshTokenHash(currentRefreshToken);

    const storedToken = await tokenRepository.findRefreshToken(currentRefreshTokenHash);
    if (!storedToken)
      throw new AuthError('Could not find refresh token in database, it might have been revoked');

    const userId = parseInt(subject, 10);

    if (storedToken.userId !== userId) {
      await tokenRepository.revokeRefreshToken(currentRefreshTokenHash);
      throw new AuthError('Refresh token does not belong to the user');
    }

    if (storedToken.expiresAt < new Date()) {
      await tokenRepository.revokeRefreshToken(currentRefreshTokenHash);
      throw new AuthError('Refresh token expired');
    }

    await tokenRepository.revokeRefreshToken(currentRefreshTokenHash);

    const authResponse = await createTokens(userId);

    return authResponse;
  }

  async logout(refreshToken: string): Promise<void> {
    verifyRefreshToken(refreshToken);

    const refreshTokenHash = createRefreshTokenHash(refreshToken);

    await tokenRepository.revokeRefreshToken(refreshTokenHash);
  }

  async revokeExpiredTokens(userId: number): Promise<void> {
    const user = await userRepository.findById(userId);
    if (user?.role !== Role.ADMIN) throw new AuthError('Unauthorized');

    await tokenRepository.revokeExpiredTokens();
  }

  async getUser(id: number): Promise<User | null> {
    return userRepository.findById(id);
  }
}

export const userService = new UserService();
