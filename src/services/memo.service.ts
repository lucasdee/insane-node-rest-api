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
  authorUsername: memo.author.username,
  authorDisplayName: memo.author.displayName,
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

const NO_ACCESS = 'Memo not found or you do not have access to it';

/** What the caller may do with a memo: its internal id, their role on it, and authorship. */
type CallerAccess = { id: number; role?: Role; isAuthor: boolean };

/** A memo's author and its MODs and ADMINs may change its title, content and tags. */
const canEdit = ({ role, isAuthor }: CallerAccess) =>
  isAuthor || role === Role.MOD || role === Role.ADMIN;

export class MemoService {
  /**
   * Looks up the caller's access to a memo. Callers who are neither assigned to it nor
   * its author get the same answer as for a missing memo, so the API doesn't reveal
   * which memo uuids exist.
   */
  private async requireAccess(memoUuid: string, userId: number): Promise<CallerAccess> {
    const memo = await memoRepository.findMemoAccess(memoUuid, userId);
    const role = memo?.users[0]?.role;
    const isAuthor = memo?.authorId === userId;
    if (!memo || (!role && !isAuthor)) {
      throw new ForbiddenError(NO_ACCESS);
    }
    return { id: memo.id, role, isAuthor };
  }

  /** The caller's assignment to a memo, with the memo. */
  async getMemo(memoUuid: string, userId: number): Promise<MemoOnUser> {
    const link = await memoRepository.findUserMemo(memoUuid, userId);
    if (!link) {
      throw new ForbiddenError(NO_ACCESS);
    }
    return toMemoOnUserWithMemo(link);
  }

  /**
   * Changes a memo's title, content and tags; fields left out stay as they are, and
   * given tags replace all current ones. Only the memo's author, MODs and ADMINs may
   * do this.
   */
  async updateMemo(
    memoUuid: string,
    changes: { title?: string; content?: string; tags?: string[] },
    userId: number,
  ): Promise<Memo> {
    const access = await this.requireAccess(memoUuid, userId);
    if (!canEdit(access)) {
      throw new ForbiddenError("Only the memo's author, ADMINs and MODs can edit it");
    }

    const { title, content, tags } = changes;
    return toMemo(
      await memoRepository.updateMemo(access.id, {
        title,
        content,
        // Undefined keeps the tags, while an empty list removes them all.
        tagNames: tags === undefined ? undefined : normalizeTags(tags),
      }),
    );
  }

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

  /** Replaces a memo's tags. Only the memo's author, ADMINs and MODs may do this. */
  async replaceMemoTags(memoUuid: string, tags: string[], userId: number): Promise<Memo> {
    const access = await this.requireAccess(memoUuid, userId);
    if (!canEdit(access)) {
      throw new ForbiddenError("Only the memo's author, ADMINs and MODs can change its tags");
    }

    return toMemo(await memoRepository.updateMemo(access.id, { tagNames: normalizeTags(tags) }));
  }

  /**
   * Deletes a memo, with its assignments and tag links. Only the memo's author and
   * ADMINs may do this.
   */
  async deleteMemo(memoUuid: string, userId: number): Promise<void> {
    const access = await this.requireAccess(memoUuid, userId);
    if (!access.isAuthor && access.role !== Role.ADMIN) {
      throw new ForbiddenError("Only the memo's author and ADMINs can delete it");
    }

    await memoRepository.deleteMemo(access.id);
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
      throw new ForbiddenError(NO_ACCESS);
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
