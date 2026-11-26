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

/**
 * Allowlist of user fields that any signed-in user may see of others, for example
 * to pick an assignee. Leaves out the email address and the role.
 */
export const userSummarySelect = {
  uuid: true,
  username: true,
  displayName: true,
} satisfies UserSelect;

export type UserSummaryRow = UserGetPayload<{ select: typeof userSummarySelect }>;

export type UserSearch = {
  /** Left out of the results: the user who searches. */
  excludeId: number;
  /** A substring of the username or the display name. Case-insensitive under the table's collation. */
  search?: string;
  limit: number;
  offset: number;
};

export type UserCredentials = { id: number; password: string };

export class UserRepository {
  async findById(id: number): Promise<PublicUser | null> {
    return prisma.user.findUnique({
      where: { id },
      select: publicUserSelect,
    });
  }

  /** Users other than `excludeId`, optionally filtered by `search`, ordered by username. */
  async searchUsers({ excludeId, search, limit, offset }: UserSearch): Promise<UserSummaryRow[]> {
    return prisma.user.findMany({
      where: {
        id: { not: excludeId },
        ...(search && {
          OR: [{ username: { contains: search } }, { displayName: { contains: search } }],
        }),
      },
      orderBy: { username: 'asc' },
      take: limit,
      skip: offset,
      select: userSummarySelect,
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
