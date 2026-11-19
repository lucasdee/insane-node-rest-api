import { env } from '../config/env';
import { JWT_ALGORITHM } from '../config/jwt';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt, { JwtPayload } from 'jsonwebtoken';
import { userRepository } from '../repositories/user.repository';
import { tokenRepository } from '../repositories/token.repository';
import { LoginRequest, RegisterRequest } from '../dtos/auth.dto';
import { AuthError, ConflictError, ForbiddenError } from '../errors';
import { AuthTokens } from './types';
import { User } from '../dtos/user.dto';
import { Role } from '../generated/prisma/enums';
import { assertPasswordFitsBcrypt } from '../utils/password';
import { subjectFor, userIdFromSubject } from '../utils/jwtSubject';

const {
  secret,
  refreshSecret,
  refreshHashSecret,
  accessTokenExpiresInMinutes,
  refreshTokenExpiresInDays,
} = env.jwt;

/** bcrypt cost for stored passwords. */
export const BCRYPT_COST = 12;

/**
 * A bcrypt hash of a random value nobody knows, at the same cost as real password
 * hashes. Login compares against it when the username doesn't exist, so that an
 * unknown username takes as long to reject as a wrong password and response times
 * don't reveal which usernames are registered. Fixed rather than generated at
 * startup, which would add a cost-12 hash to every start.
 */
export const DUMMY_PASSWORD_HASH = '$2b$12$iyEVqvY7RZ7iz/x65Ek6..nnmrbCXoGyfwMi//.54YBx0XGSyhDku';

const createRefreshTokenHash = (refreshToken: string): string => {
  return crypto.createHmac('sha512', refreshHashSecret).update(refreshToken).digest('hex');
};

/**
 * Verifies a refresh token's signature and expiry and returns the user id in it.
 * Any failure is reported as an AuthError (401), never as a raw jsonwebtoken error.
 */
const verifyRefreshToken = (refreshToken: string): number => {
  let payload: string | JwtPayload;
  try {
    payload = jwt.verify(refreshToken, refreshSecret, { algorithms: [JWT_ALGORITHM] });
  } catch {
    throw new AuthError('Invalid or expired refresh token');
  }

  const userId = typeof payload === 'string' ? null : userIdFromSubject(payload.sub);
  if (userId === null) throw new AuthError('Invalid or expired refresh token');

  return userId;
};

/**
 * Issues an access token and a refresh token. `familyId` ties the refresh token to
 * the login it was rotated from, so that its whole chain can be revoked on reuse.
 */
const createTokens = async (userId: number, familyId: string): Promise<AuthTokens> => {
  // A random `jti` makes every token unique. Without it, tokens issued for the same
  // user within the same second are identical, and the refresh token hash collides
  // with the unique constraint on refresh_tokens.tokenHash.
  const accessToken = jwt.sign({ sub: subjectFor(userId) }, secret, {
    algorithm: JWT_ALGORITHM,
    expiresIn: `${accessTokenExpiresInMinutes}m`,
    jwtid: crypto.randomUUID(),
  });
  const accessTokenExpiresOn = new Date(Date.now() + accessTokenExpiresInMinutes * 60 * 1000);
  const refreshToken = jwt.sign({ sub: subjectFor(userId) }, refreshSecret, {
    algorithm: JWT_ALGORITHM,
    expiresIn: `${refreshTokenExpiresInDays}d`,
    jwtid: crypto.randomUUID(),
  });
  const refreshTokenExpiresOn = new Date(
    Date.now() + refreshTokenExpiresInDays * 24 * 60 * 60 * 1000,
  );
  const refreshTokenHash = createRefreshTokenHash(refreshToken);

  await tokenRepository.saveRefreshToken(userId, refreshTokenHash, refreshTokenExpiresOn, familyId);

  return {
    accessToken,
    accessTokenExpiresOn: accessTokenExpiresOn.getTime(),
    refreshToken,
    refreshTokenExpiresOn: refreshTokenExpiresOn.getTime(),
  };
};

export class UserService {
  async register({ username, password, email, displayName }: RegisterRequest): Promise<User> {
    assertPasswordFitsBcrypt(password);

    if (await userRepository.existsByUsername(username)) {
      throw new ConflictError('Username is already taken');
    }

    const hashed = await bcrypt.hash(password, BCRYPT_COST);
    return userRepository.createUser({ username, password: hashed, email, displayName });
  }

  async login({ username, password }: LoginRequest): Promise<AuthTokens> {
    assertPasswordFitsBcrypt(password);

    const user = await userRepository.findCredentialsByUsername(username);

    // Run bcrypt even for an unknown username (see DUMMY_PASSWORD_HASH).
    const match = await bcrypt.compare(password, user?.password ?? DUMMY_PASSWORD_HASH);
    if (!user || !match) throw new AuthError('Invalid credentials');

    // Every login starts a new family: one per device or session.
    const authResponse = await createTokens(user.id, crypto.randomUUID());

    return authResponse;
  }

  async refreshAccessToken(currentRefreshToken: string): Promise<AuthTokens> {
    const userId = verifyRefreshToken(currentRefreshToken);

    const currentRefreshTokenHash = createRefreshTokenHash(currentRefreshToken);

    const storedToken = await tokenRepository.findRefreshToken(currentRefreshTokenHash);
    if (!storedToken)
      throw new AuthError('Could not find refresh token in database, it might have been revoked');

    if (storedToken.userId !== userId) {
      await tokenRepository.revokeRefreshToken(currentRefreshTokenHash);
      throw new AuthError('Refresh token does not belong to the user');
    }

    // A token that was already rotated is being used again. Either the client or an
    // attacker holds a stolen copy, and there is no telling which, so end the whole
    // session: the attacker's tokens are revoked, and the user has to log in again.
    if (storedToken.revoked) {
      const { count } = await tokenRepository.revokeTokenFamily(storedToken.familyId);
      console.warn(
        `Refresh token reuse detected for user ${userId}: revoked ${count} token(s) of its family`,
      );
      throw new AuthError('Refresh token has already been used');
    }

    if (storedToken.expiresAt < new Date()) {
      await tokenRepository.revokeRefreshToken(currentRefreshTokenHash);
      throw new AuthError('Refresh token expired');
    }

    // Only the request that actually marks the token as rotated may issue new tokens.
    // A request that loses this race is not treated as reuse: it is most likely the
    // same client refreshing twice at once, e.g. from two tabs.
    const rotated = await tokenRepository.markRefreshTokenRotated(currentRefreshTokenHash);
    if (!rotated) throw new AuthError('Refresh token has already been used');

    const authResponse = await createTokens(userId, storedToken.familyId);

    return authResponse;
  }

  async logout(refreshToken: string): Promise<void> {
    verifyRefreshToken(refreshToken);

    const refreshTokenHash = createRefreshTokenHash(refreshToken);

    // Ends the whole session, including the rows kept for rotated tokens.
    // Idempotent: logging out with a token that is already gone still succeeds.
    const storedToken = await tokenRepository.findRefreshToken(refreshTokenHash);
    if (storedToken) {
      await tokenRepository.revokeTokenFamily(storedToken.familyId);
    }
  }

  async revokeExpiredTokens(userId: number): Promise<void> {
    const user = await userRepository.findById(userId);
    if (user?.role !== Role.ADMIN) {
      throw new ForbiddenError('Only admins can revoke expired tokens');
    }

    await tokenRepository.revokeExpiredTokens();
  }

  async getUser(id: number): Promise<User | null> {
    return userRepository.findById(id);
  }
}

export const userService = new UserService();
