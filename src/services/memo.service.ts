import {
  memoRepository,
  type PublicMemo,
  type PublicMemoOnUser,
  type PublicMemoOnUserWithMemo,
} from '../repositories/memo.repository';
import { userRepository } from '../repositories/user.repository';
import { Memo, MemoOnUser } from '../dtos/memo.dto';
import { TagCount } from '../dtos/tag.dto';
import { Prisma } from '../generated/prisma/client';
import { Role } from '../generated/prisma/enums';
import { ConflictError, ForbiddenError, NotFoundError } from '../errors';

const toMemo = (memo: PublicMemo): Memo => ({
  uuid: memo.uuid,
  title: memo.title,
  content: memo.content,
  authorUuid: memo.author.uuid,
  createdAt: memo.createdAt,
  tags: memo.tags.map((t) => t.tag.name).sort(),
});

const toMemoOnUser = (link: PublicMemoOnUser): MemoOnUser => ({
  memoUuid: link.memo.uuid,
  userUuid: link.user.uuid,
  assignedByUuid: link.assignedBy.uuid,
  assignedAt: link.assignedAt,
  role: link.role,
});

const toMemoOnUserWithMemo = (link: PublicMemoOnUserWithMemo): MemoOnUser => ({
  ...toMemoOnUser(link),
  memo: toMemo(link.memo),
});

/** Trims, lowercases and de-duplicates tag names. */
export const normalizeTags = (tags: string[] = []): string[] => [
  ...new Set(tags.map((tag) => tag.trim().toLowerCase())),
];

export class MemoService {
  /**
   * Lists the user's memos. With tags, only memos carrying `all` of them (the
   * default) or `any` one of them.
   */
  async listUserMemos(
    userId: number,
    tags?: string[],
    match: 'all' | 'any' = 'all',
  ): Promise<MemoOnUser[]> {
    const links = await memoRepository.listUserMemos(userId, {
      tags: normalizeTags(tags),
      match,
    });
    return links.map(toMemoOnUserWithMemo);
  }

  async listUserTags(userId: number): Promise<TagCount[]> {
    const tags = await memoRepository.listUserTags(userId);
    return tags
      .map((tag) => ({ name: tag.name, memoCount: tag._count.memos }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async createMemo(
    title: string,
    content: string,
    createdById: number,
    tags?: string[],
  ): Promise<Memo> {
    return toMemo(
      await memoRepository.createMemo(title, content, createdById, normalizeTags(tags)),
    );
  }

  /** Replaces a memo's tags. Only the memo's ADMINs and MODs may do this. */
  async replaceMemoTags(memoUuid: string, tags: string[], userId: number): Promise<Memo> {
    // Callers without any role on the memo get the same answer as for a missing one,
    // so the endpoint doesn't reveal which memo uuids exist.
    const memo = await memoRepository.findMemoAccess(memoUuid, userId);
    const callerRole = memo?.users[0]?.role;
    if (!memo || !callerRole) {
      throw new ForbiddenError('Memo not found or you do not have access to it');
    }
    if (callerRole === Role.USER) {
      throw new ForbiddenError("Only the memo's ADMINs and MODs can change its tags");
    }

    return toMemo(await memoRepository.replaceMemoTags(memo.id, normalizeTags(tags)));
  }

  async assignMemoToUser(
    memoUuid: string,
    userUuid: string,
    assignedById: number,
    role: Role = Role.USER,
  ): Promise<MemoOnUser> {
    // Callers without any role on the memo get the same answer as for a missing one,
    // so the endpoint doesn't reveal which memo uuids exist.
    const memo = await memoRepository.findMemoAccess(memoUuid, assignedById);
    const callerRole = memo?.users[0]?.role;
    if (!memo || !callerRole) {
      throw new ForbiddenError('Memo not found or you do not have access to it');
    }

    // A memo's ADMINs can share it with any role, its MODs only as USER.
    if (callerRole === Role.USER) {
      throw new ForbiddenError(
        'Only users with sufficient permissions can assign memos to other users',
      );
    }
    if (callerRole !== Role.ADMIN && role !== Role.USER) {
      throw new ForbiddenError(`Only the memo's ADMINs can assign the ${role} role`);
    }

    const userId = await userRepository.findIdByUuid(userUuid);
    if (userId === null) {
      throw new NotFoundError('User not found');
    }

    try {
      return toMemoOnUser(
        await memoRepository.assignMemoToUser(memo.id, userId, assignedById, role),
      );
    } catch (err) {
      // The (memoId, userId) primary key rejects a second assignment. Relying on it
      // instead of checking first also covers two identical requests at once.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictError('The user is already assigned to the memo');
      }
      throw err;
    }
  }
}

export const memoService = new MemoService();
