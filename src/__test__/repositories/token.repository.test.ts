import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { tokenRepository } from '../../repositories/token.repository';

const { prisma } = vi.hoisted(() => ({
  prisma: {
    refreshToken: {
      create: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

vi.mock('../../config/db', () => ({ prisma }));

const NOW = new Date('2026-01-01T12:00:00.000Z');

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('TokenRepository', () => {
  it('saveRefreshToken stores the hash, owner, expiry and family', async () => {
    const expiresAt = new Date('2026-01-08T12:00:00.000Z');

    await tokenRepository.saveRefreshToken(1, 'hash', expiresAt, 'family-a');

    expect(prisma.refreshToken.create).toHaveBeenCalledWith({
      data: { userId: 1, tokenHash: 'hash', expiresAt, familyId: 'family-a' },
    });
  });

  it.each([
    [1, true],
    [0, false],
  ])(
    'markRefreshTokenRotated revokes only an active token: %s updated → %s',
    async (count, expected) => {
      prisma.refreshToken.updateMany.mockResolvedValue({ count });

      expect(await tokenRepository.markRefreshTokenRotated('hash')).toBe(expected);
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { tokenHash: 'hash', revoked: false },
        data: { revoked: true },
      });
    },
  );

  it('revokeTokenFamily deletes every token of the family', async () => {
    prisma.refreshToken.deleteMany.mockResolvedValue({ count: 4 });

    expect(await tokenRepository.revokeTokenFamily('family-a')).toEqual({ count: 4 });
    expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({
      where: { familyId: 'family-a' },
    });
  });

  it('findRefreshToken looks the token up by hash', async () => {
    const row = { tokenHash: 'hash' };
    prisma.refreshToken.findUnique.mockResolvedValue(row);

    expect(await tokenRepository.findRefreshToken('hash')).toBe(row);
    expect(prisma.refreshToken.findUnique).toHaveBeenCalledWith({ where: { tokenHash: 'hash' } });
  });

  it.each([
    [1, true],
    [0, false],
  ])('revokeRefreshToken returns %s deleted → %s', async (count, expected) => {
    prisma.refreshToken.deleteMany.mockResolvedValue({ count });

    expect(await tokenRepository.revokeRefreshToken('hash')).toBe(expected);
    expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({ where: { tokenHash: 'hash' } });
  });

  it('revokeAllUserRefreshTokens deletes every token of the user', async () => {
    prisma.refreshToken.deleteMany.mockResolvedValue({ count: 3 });

    expect(await tokenRepository.revokeAllUserRefreshTokens(1)).toEqual({ count: 3 });
    expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({ where: { userId: 1 } });
  });

  it('revokeExpiredTokens deletes tokens that expired before now', async () => {
    prisma.refreshToken.deleteMany.mockResolvedValue({ count: 2 });

    expect(await tokenRepository.revokeExpiredTokens()).toEqual({ count: 2 });
    expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({
      where: { expiresAt: { lt: NOW } },
    });
  });
});
