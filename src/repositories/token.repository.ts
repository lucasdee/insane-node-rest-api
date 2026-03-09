import { prisma } from '../config/db';
import { RefreshToken } from 'src/generated/prisma/client';

export class TokenRepository {
  async saveRefreshToken(userId: number, tokenHash: string, expiresAt: Date): Promise<RefreshToken> {
    return prisma.refreshToken.create({
      data: {
        userId,
        tokenHash,
        expiresAt,
      },
    });
  }

  async findRefreshToken(tokenHash: string): Promise<RefreshToken | null> {
    return prisma.refreshToken.findUnique({
      where: { tokenHash },
    });
  }

  async revokeRefreshToken(tokenHash: string): Promise<RefreshToken | null> {
    return prisma.refreshToken.delete({
      where: { tokenHash },
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
