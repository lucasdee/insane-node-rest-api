import { prisma } from '../config/db';
import { Role } from '../generated/prisma/enums';
import {
  MemoGetPayload,
  MemoOnUserGetPayload,
  MemoOnUserSelect,
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
  author: { select: { uuid: true } },
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

/** A memo's internal id and the given user's role on it, if they have one. */
export type MemoAccess = { id: number; users: { role: Role }[] };

export class MemoRepository {
  async listUserMemos(userId: number): Promise<PublicMemoOnUserWithMemo[]> {
    return prisma.memoOnUser.findMany({
      where: { userId },
      select: publicMemoOnUserWithMemoSelect,
    });
  }

  /** For permission checks only. The result contains the memo's internal id. */
  async findMemoAccess(memoUuid: string, userId: number): Promise<MemoAccess | null> {
    return prisma.memo.findUnique({
      where: { uuid: memoUuid },
      select: {
        id: true,
        users: {
          where: { userId },
          select: { role: true },
        },
      },
    });
  }

  async createMemo(title: string, content: string, createdById: number): Promise<PublicMemo> {
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
      },
      select: publicMemoSelect,
    });
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
