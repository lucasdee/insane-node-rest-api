import { prisma } from '../config/db';
import { UserCreateInput, UserGetPayload, UserSelect } from '../generated/prisma/models';

/**
 * Allowlist of user fields that may be returned to API clients.
 * New columns stay private until they are explicitly added here.
 */
export const publicUserSelect = {
  uuid: true,
  username: true,
  email: true,
  displayName: true,
  role: true,
  createdAt: true,
} satisfies UserSelect;

export type PublicUser = UserGetPayload<{ select: typeof publicUserSelect }>;

export type UserCredentials = { id: number; password: string };

export class UserRepository {
  async findById(id: number): Promise<PublicUser | null> {
    return prisma.user.findUnique({
      where: { id },
      select: publicUserSelect,
    });
  }

  async createUser(data: UserCreateInput): Promise<PublicUser> {
    return prisma.user.create({
      data,
      select: publicUserSelect,
    });
  }

  async existsByUsername(username: string): Promise<boolean> {
    const user = await prisma.user.findUnique({
      where: { username },
      select: { id: true },
    });
    return user !== null;
  }

  /** Resolves a public uuid to the internal id used for relations. */
  async findIdByUuid(uuid: string): Promise<number | null> {
    const user = await prisma.user.findUnique({
      where: { uuid },
      select: { id: true },
    });
    return user?.id ?? null;
  }

  /**
   * For credential checks only (login). The result contains the password hash
   * and must never be returned to a client.
   */
  async findCredentialsByUsername(username: string): Promise<UserCredentials | null> {
    return prisma.user.findUnique({
      where: { username },
      select: { id: true, password: true },
    });
  }
}

export const userRepository = new UserRepository();
