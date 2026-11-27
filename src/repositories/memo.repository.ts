import { prisma } from '../config/db';
import { Role } from '../generated/prisma/enums';
import {
  MemoGetPayload,
  MemoOnUserGetPayload,
  MemoOnUserSelect,
  MemoOnUserWhereInput,
  MemoSelect,
} from '../generated/prisma/models';

/**
 * Allowlists of memo fields that may be returned to API clients. Related users
 * and memos are identified by their uuid only; numeric ids stay internal.
 */
export const publicMemoSelect = {
  uuid: true,
  title: true,
  content: true,
  createdAt: true,
  author: { select: { uuid: true, username: true, displayName: true } },
  tags: { select: { tag: { select: { name: true } } } },
} satisfies MemoSelect;

export const publicMemoOnUserSelect = {
  role: true,
  assignedAt: true,
  memo: { select: { uuid: true } },
  user: { select: { uuid: true } },
  assignedBy: { select: { uuid: true } },
} satisfies MemoOnUserSelect;

export const publicMemoOnUserWithMemoSelect = {
  ...publicMemoOnUserSelect,
  memo: { select: publicMemoSelect },
} satisfies MemoOnUserSelect;

export type PublicMemo = MemoGetPayload<{ select: typeof publicMemoSelect }>;
export type PublicMemoOnUser = MemoOnUserGetPayload<{ select: typeof publicMemoOnUserSelect }>;
export type PublicMemoOnUserWithMemo = MemoOnUserGetPayload<{
  select: typeof publicMemoOnUserWithMemoSelect;
}>;

/** A memo's internal id, its author's id and the given user's role on it, if they have one. */
export type MemoAccess = { id: number; authorId: number; users: { role: Role }[] };

/** Fields of a memo to change. Undefined ones are left as they are. */
export type MemoChanges = { title?: string; content?: string; tagNames?: string[] };

/**
 * Restricts a memo list to memos carrying the given tags: `all` of them, or `any`
 * one of them. Tag names must already be normalized.
 */
export type TagFilter = { tags: string[]; match: 'all' | 'any' };

/** A tag on the user's memos, with how many of them carry it. */
export type UserTagCount = { name: string; _count: { memos: number } };

/** Creates the tags that don't exist yet. INSERT IGNORE makes concurrent calls safe. */
const ensureTags = async (names: string[]) => {
  if (names.length > 0) {
    await prisma.tag.createMany({ data: names.map((name) => ({ name })), skipDuplicates: true });
  }
};

/** Nested writes linking a memo to existing tags. */
const connectTags = (names: string[]) => names.map((name) => ({ tag: { connect: { name } } }));

const tagWhere = (filter?: TagFilter): MemoOnUserWhereInput => {
  if (!filter || filter.tags.length === 0) return {};
  if (filter.match === 'any') {
    return { memo: { tags: { some: { tag: { name: { in: filter.tags } } } } } };
  }
  return { memo: { AND: filter.tags.map((name) => ({ tags: { some: { tag: { name } } } })) } };
};

export class MemoRepository {
  async listUserMemos(userId: number, filter?: TagFilter): Promise<PublicMemoOnUserWithMemo[]> {
    return prisma.memoOnUser.findMany({
      where: { userId, ...tagWhere(filter) },
      select: publicMemoOnUserWithMemoSelect,
    });
  }

  /** Tags on memos the user is assigned to, counting only those memos. */
  async listUserTags(userId: number): Promise<UserTagCount[]> {
    const onUsersMemos = { memo: { users: { some: { userId } } } };
    return prisma.tag.findMany({
      where: { memos: { some: onUsersMemos } },
      select: { name: true, _count: { select: { memos: { where: onUsersMemos } } } },
    });
  }

  /** For permission checks only. The result contains the memo's internal id. */
  async findMemoAccess(memoUuid: string, userId: number): Promise<MemoAccess | null> {
    return prisma.memo.findUnique({
      where: { uuid: memoUuid },
      select: {
        id: true,
        authorId: true,
        users: {
          where: { userId },
          select: { role: true },
        },
      },
    });
  }

  /** The user's assignment to the memo, with the memo, or null if they are not assigned. */
  async findUserMemo(memoUuid: string, userId: number): Promise<PublicMemoOnUserWithMemo | null> {
    return prisma.memoOnUser.findFirst({
      where: { userId, memo: { uuid: memoUuid } },
      select: publicMemoOnUserWithMemoSelect,
    });
  }

  /** `tagNames` must already be normalized. */
  async createMemo(
    title: string,
    content: string,
    createdById: number,
    tagNames: string[] = [],
  ): Promise<PublicMemo> {
    await ensureTags(tagNames);
    return prisma.memo.create({
      data: {
        title,
        content,
        authorId: createdById,
        users: {
          create: {
            userId: createdById,
            assignedById: createdById,
            role: Role.ADMIN,
          },
        },
        tags: { create: connectTags(tagNames) },
      },
      select: publicMemoSelect,
    });
  }

  /**
   * Changes a memo's title and content. Given `tagNames` replace all of its tags; Prisma
   * runs the nested delete and create in one transaction. `tagNames` must already be
   * normalized.
   */
  async updateMemo(memoId: number, { title, content, tagNames }: MemoChanges): Promise<PublicMemo> {
    if (tagNames) await ensureTags(tagNames);
    return prisma.memo.update({
      where: { id: memoId },
      data: {
        title,
        content,
        ...(tagNames && { tags: { deleteMany: {}, create: connectTags(tagNames) } }),
      },
      select: publicMemoSelect,
    });
  }

  /**
   * Deletes a memo. The foreign keys cascade to its assignments and tag links; the
   * tags themselves stay, as other memos may use them.
   */
  async deleteMemo(memoId: number): Promise<void> {
    await prisma.memo.delete({ where: { id: memoId }, select: { id: true } });
  }

  async assignMemoToUser(
    memoId: number,
    userId: number,
    assignedById: number,
    role: Role,
  ): Promise<PublicMemoOnUser> {
    return prisma.memoOnUser.create({
      data: {
        memoId,
        userId,
        assignedById,
        role,
      },
      select: publicMemoOnUserSelect,
    });
  }
}

export const memoRepository = new MemoRepository();
