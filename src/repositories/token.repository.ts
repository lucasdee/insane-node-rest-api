import { prisma } from '../config/db';
import type { RefreshToken } from '../generated/prisma/client';

export class TokenRepository {
  async saveRefreshToken(
    userId: number,
    tokenHash: string,
    expiresAt: Date,
    familyId: string,
  ): Promise<RefreshToken> {
    return prisma.refreshToken.create({
      data: {
        userId,
        tokenHash,
        expiresAt,
        familyId,
      },
    });
  }

  async findRefreshToken(tokenHash: string): Promise<RefreshToken | null> {
    return prisma.refreshToken.findUnique({
      where: { tokenHash },
    });
  }

  /**
   * Marks an active token as rotated. The row is kept so that a later reuse can be
   * detected. Returns true only for the one caller that made the change, so that
   * concurrent requests cannot both rotate the same token.
   */
  async markRefreshTokenRotated(tokenHash: string): Promise<boolean> {
    const { count } = await prisma.refreshToken.updateMany({
      where: { tokenHash, revoked: false },
      data: { revoked: true },
    });
    return count > 0;
  }

  /**
   * Idempotent: revoking a token that is already gone is not an error.
   * Returns true only if this call removed the token.
   */
  async revokeRefreshToken(tokenHash: string): Promise<boolean> {
    const { count } = await prisma.refreshToken.deleteMany({
      where: { tokenHash },
    });
    return count > 0;
  }

  /** Deletes every token rotated from the same login, ending that session. */
  async revokeTokenFamily(familyId: string): Promise<{ count: number }> {
    return prisma.refreshToken.deleteMany({
      where: { familyId },
    });
  }

  async revokeAllUserRefreshTokens(userId: number): Promise<{ count: number }> {
    return prisma.refreshToken.deleteMany({
      where: { userId },
    });
  }

  async revokeExpiredTokens(): Promise<{ count: number }> {
    return prisma.refreshToken.deleteMany({
      where: {
        expiresAt: {
          lt: new Date(),
        },
      },
    });
  }
}

export const tokenRepository = new TokenRepository();
