import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import bcrypt from 'bcryptjs';
import { ValidateError } from '@tsoa/runtime';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import {
  BCRYPT_COST,
  DUMMY_PASSWORD_HASH,
  USER_SEARCH_DEFAULT_LIMIT,
  userService,
} from '../../services/user.service';
import { userRepository } from '../../repositories/user.repository';
import { tokenRepository } from '../../repositories/token.repository';
import { AuthError, ConflictError, ForbiddenError } from '../../errors';
import { hashRefreshToken, refreshTokenFor } from '../helpers/tokens';

vi.mock('../../repositories/user.repository', () => ({
  userRepository: {
    existsByUsername: vi.fn(),
    createUser: vi.fn(),
    findCredentialsByUsername: vi.fn(),
    findById: vi.fn(),
    searchUsers: vi.fn(),
  },
}));

vi.mock('../../repositories/token.repository', () => ({
  tokenRepository: {
    saveRefreshToken: vi.fn(),
    findRefreshToken: vi.fn(),
    markRefreshTokenRotated: vi.fn(),
    revokeRefreshToken: vi.fn(),
    revokeTokenFamily: vi.fn(),
    revokeExpiredTokens: vi.fn(),
  },
}));

const users = vi.mocked(userRepository);
const tokens = vi.mocked(tokenRepository);

const NOW = new Date('2026-01-01T12:00:00.000Z');
const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const storedToken = (
  token: string,
  userId: number,
  { expiresAt = new Date(NOW.getTime() + DAY), revoked = false } = {},
) => ({
  id: 1n,
  tokenHash: hashRefreshToken(token),
  userId,
  expiresAt,
  createdAt: NOW,
  revoked,
  familyId: 'family-a',
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('UserService.register', () => {
  const input = {
    username: 'alice',
    password: 'secret123',
    email: 'alice@example.com',
    displayName: 'Alice',
  };

  it('rejects a taken username with a ConflictError', async () => {
    users.existsByUsername.mockResolvedValue(true);

    await expect(userService.register(input)).rejects.toThrow(ConflictError);
    expect(users.createUser).not.toHaveBeenCalled();
  });

  it('rejects a password longer than 72 bytes before touching the repository', async () => {
    await expect(userService.register({ ...input, password: 'ł'.repeat(37) })).rejects.toThrow(
      ValidateError,
    );
    expect(users.existsByUsername).not.toHaveBeenCalled();
    expect(users.createUser).not.toHaveBeenCalled();
  });

  it('stores a bcrypt hash and returns the created user', async () => {
    const created = { uuid: 'u-1', username: 'alice' };
    users.existsByUsername.mockResolvedValue(false);
    users.createUser.mockResolvedValue(created as never);

    const result = await userService.register(input);

    expect(result).toBe(created);
    const data = users.createUser.mock.calls[0][0];
    expect(data).toMatchObject({
      username: 'alice',
      email: 'alice@example.com',
      displayName: 'Alice',
    });
    expect(data.password).not.toBe('secret123');
    expect(await bcrypt.compare('secret123', data.password)).toBe(true);
    expect(bcrypt.getRounds(data.password)).toBe(BCRYPT_COST);
  });
});

describe('UserService.login', () => {
  const credentials = async () => ({ id: 7, password: await bcrypt.hash('secret123', 4) });

  it('rejects an unknown user', async () => {
    users.findCredentialsByUsername.mockResolvedValue(null);

    await expect(userService.login({ username: 'ghost', password: 'x' })).rejects.toThrow(
      new AuthError('Invalid credentials'),
    );
    expect(tokens.saveRefreshToken).not.toHaveBeenCalled();
  });

  it('still runs bcrypt for an unknown user, so it takes as long as a wrong password', async () => {
    users.findCredentialsByUsername.mockResolvedValue(null);
    const compare = vi.spyOn(bcrypt, 'compare');

    try {
      await expect(userService.login({ username: 'ghost', password: 'x' })).rejects.toThrow(
        AuthError,
      );
      expect(compare).toHaveBeenCalledWith('x', DUMMY_PASSWORD_HASH);
    } finally {
      compare.mockRestore();
    }
  });

  it('uses a dummy hash that is valid and as costly as a stored password hash', () => {
    expect(bcrypt.getRounds(DUMMY_PASSWORD_HASH)).toBe(BCRYPT_COST);
  });

  it('rejects a password longer than 72 bytes before looking up the user', async () => {
    await expect(
      userService.login({ username: 'alice', password: 'ł'.repeat(37) }),
    ).rejects.toThrow(ValidateError);
    expect(users.findCredentialsByUsername).not.toHaveBeenCalled();
  });

  it('rejects a wrong password with the same message as an unknown user', async () => {
    users.findCredentialsByUsername.mockResolvedValue(await credentials());

    await expect(userService.login({ username: 'alice', password: 'wrong' })).rejects.toThrow(
      new AuthError('Invalid credentials'),
    );
    expect(tokens.saveRefreshToken).not.toHaveBeenCalled();
  });

  it('issues tokens and stores only the refresh token hash', async () => {
    users.findCredentialsByUsername.mockResolvedValue(await credentials());

    const result = await userService.login({ username: 'alice', password: 'secret123' });

    const access = jwt.verify(result.accessToken, process.env.JWT_SECRET!) as JwtPayload;
    const refresh = jwt.verify(result.refreshToken, process.env.JWT_REFRESH_SECRET!) as JwtPayload;
    expect(access.sub).toBe('7');
    expect(refresh.sub).toBe('7');
    expect(access.jti).toEqual(expect.any(String));
    expect(refresh.jti).toEqual(expect.any(String));
    expect(jwt.decode(result.accessToken, { complete: true })?.header.alg).toBe('HS256');
    expect(jwt.decode(result.refreshToken, { complete: true })?.header.alg).toBe('HS256');

    expect(result.accessTokenExpiresOn).toBe(NOW.getTime() + 5 * MINUTE);
    expect(result.refreshTokenExpiresOn).toBe(NOW.getTime() + 7 * DAY);

    expect(tokens.saveRefreshToken).toHaveBeenCalledWith(
      7,
      hashRefreshToken(result.refreshToken),
      new Date(NOW.getTime() + 7 * DAY),
      expect.stringMatching(UUID),
    );
  });

  it('starts a new token family for every login', async () => {
    users.findCredentialsByUsername.mockResolvedValue(await credentials());

    await userService.login({ username: 'alice', password: 'secret123' });
    await userService.login({ username: 'alice', password: 'secret123' });

    const [first, second] = tokens.saveRefreshToken.mock.calls.map((call) => call[3]);
    expect(first).not.toBe(second);
  });
});

describe('UserService.refreshAccessToken', () => {
  it('rejects a token that fails verification without touching storage', async () => {
    await expect(userService.refreshAccessToken('not-a-jwt')).rejects.toThrow(AuthError);
    expect(tokens.findRefreshToken).not.toHaveBeenCalled();
  });

  it('rejects a correctly signed token without a subject', async () => {
    const token = jwt.sign({ purpose: 'refresh' }, process.env.JWT_REFRESH_SECRET!);

    await expect(userService.refreshAccessToken(token)).rejects.toThrow(
      new AuthError('Invalid or expired refresh token'),
    );
    expect(tokens.findRefreshToken).not.toHaveBeenCalled();
  });

  it('rejects a token that is not stored', async () => {
    tokens.findRefreshToken.mockResolvedValue(null);

    await expect(userService.refreshAccessToken(refreshTokenFor(1))).rejects.toThrow(AuthError);
    expect(tokens.revokeRefreshToken).not.toHaveBeenCalled();
  });

  it('revokes and rejects a token stored for a different user', async () => {
    const token = refreshTokenFor(1);
    tokens.findRefreshToken.mockResolvedValue(storedToken(token, 2));

    await expect(userService.refreshAccessToken(token)).rejects.toThrow(
      new AuthError('Refresh token does not belong to the user'),
    );
    expect(tokens.revokeRefreshToken).toHaveBeenCalledWith(hashRefreshToken(token));
    expect(tokens.saveRefreshToken).not.toHaveBeenCalled();
  });

  it('revokes and rejects a token whose stored expiry has passed', async () => {
    const token = refreshTokenFor(1);
    tokens.findRefreshToken.mockResolvedValue(
      storedToken(token, 1, { expiresAt: new Date(NOW.getTime() - 1) }),
    );

    await expect(userService.refreshAccessToken(token)).rejects.toThrow(
      new AuthError('Refresh token expired'),
    );
    expect(tokens.revokeRefreshToken).toHaveBeenCalledWith(hashRefreshToken(token));
    expect(tokens.saveRefreshToken).not.toHaveBeenCalled();
  });

  it('revokes the whole family and rejects a token that was already rotated', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const token = refreshTokenFor(1);
    tokens.findRefreshToken.mockResolvedValue(storedToken(token, 1, { revoked: true }));
    tokens.revokeTokenFamily.mockResolvedValue({ count: 3 });

    await expect(userService.refreshAccessToken(token)).rejects.toThrow(
      new AuthError('Refresh token has already been used'),
    );
    expect(tokens.revokeTokenFamily).toHaveBeenCalledWith('family-a');
    expect(tokens.markRefreshTokenRotated).not.toHaveBeenCalled();
    expect(tokens.saveRefreshToken).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('reuse detected for user 1'));
  });

  it('rejects, without revoking the family, a token that a concurrent request already rotated', async () => {
    const token = refreshTokenFor(1);
    tokens.findRefreshToken.mockResolvedValue(storedToken(token, 1));
    tokens.markRefreshTokenRotated.mockResolvedValue(false);

    await expect(userService.refreshAccessToken(token)).rejects.toThrow(
      new AuthError('Refresh token has already been used'),
    );
    expect(tokens.revokeTokenFamily).not.toHaveBeenCalled();
    expect(tokens.saveRefreshToken).not.toHaveBeenCalled();
  });

  it('marks the old token as rotated and issues a new pair in the same family', async () => {
    const token = refreshTokenFor(1);
    tokens.findRefreshToken.mockResolvedValue(storedToken(token, 1));
    tokens.markRefreshTokenRotated.mockResolvedValue(true);

    const result = await userService.refreshAccessToken(token);

    expect(tokens.findRefreshToken).toHaveBeenCalledWith(hashRefreshToken(token));
    expect(tokens.markRefreshTokenRotated).toHaveBeenCalledWith(hashRefreshToken(token));
    expect(tokens.revokeRefreshToken).not.toHaveBeenCalled();
    expect(result.refreshToken).not.toBe(token);
    expect(tokens.saveRefreshToken).toHaveBeenCalledWith(
      1,
      hashRefreshToken(result.refreshToken),
      expect.any(Date),
      'family-a',
    );
  });
});

describe('UserService.logout', () => {
  it('rejects an invalid token without touching storage', async () => {
    await expect(userService.logout('not-a-jwt')).rejects.toThrow(AuthError);
    expect(tokens.findRefreshToken).not.toHaveBeenCalled();
    expect(tokens.revokeTokenFamily).not.toHaveBeenCalled();
  });

  it('revokes the whole family of the token', async () => {
    const token = refreshTokenFor(1);
    tokens.findRefreshToken.mockResolvedValue(storedToken(token, 1));
    tokens.revokeTokenFamily.mockResolvedValue({ count: 2 });

    await userService.logout(token);

    expect(tokens.findRefreshToken).toHaveBeenCalledWith(hashRefreshToken(token));
    expect(tokens.revokeTokenFamily).toHaveBeenCalledWith('family-a');
  });

  it('succeeds when the token was already revoked', async () => {
    tokens.findRefreshToken.mockResolvedValue(null);

    await expect(userService.logout(refreshTokenFor(1))).resolves.toBeUndefined();
    expect(tokens.revokeTokenFamily).not.toHaveBeenCalled();
  });
});

describe('UserService.revokeExpiredTokens', () => {
  it('revokes expired tokens for an admin', async () => {
    users.findById.mockResolvedValue({ role: 'ADMIN' } as never);

    await userService.revokeExpiredTokens(1);

    expect(users.findById).toHaveBeenCalledWith(1);
    expect(tokens.revokeExpiredTokens).toHaveBeenCalledOnce();
  });

  it.each([
    ['a USER', { role: 'USER' }],
    ['a MOD', { role: 'MOD' }],
    ['a deleted user', null],
  ])('forbids %s', async (_label, user) => {
    users.findById.mockResolvedValue(user as never);

    await expect(userService.revokeExpiredTokens(1)).rejects.toThrow(ForbiddenError);
    expect(tokens.revokeExpiredTokens).not.toHaveBeenCalled();
  });
});

describe('UserService.getUser', () => {
  it('returns the public user from the repository', async () => {
    const user = { uuid: 'u-1', username: 'alice' };
    users.findById.mockResolvedValue(user as never);

    expect(await userService.getUser(1)).toBe(user);
    expect(users.findById).toHaveBeenCalledWith(1);
  });
});

describe('UserService.searchUsers', () => {
  it('excludes the caller and applies the default limit and offset', async () => {
    const found = [{ uuid: 'u-2', username: 'bob', displayName: null }];
    users.searchUsers.mockResolvedValue(found);

    expect(await userService.searchUsers(1)).toBe(found);
    expect(users.searchUsers).toHaveBeenCalledWith({
      excludeId: 1,
      search: undefined,
      limit: USER_SEARCH_DEFAULT_LIMIT,
      offset: 0,
    });
    expect(USER_SEARCH_DEFAULT_LIMIT).toBe(20);
  });

  it('passes the search, limit and offset through', async () => {
    users.searchUsers.mockResolvedValue([]);

    await userService.searchUsers(7, { search: 'bo', limit: 5, offset: 15 });

    expect(users.searchUsers).toHaveBeenCalledWith({
      excludeId: 7,
      search: 'bo',
      limit: 5,
      offset: 15,
    });
  });
});
