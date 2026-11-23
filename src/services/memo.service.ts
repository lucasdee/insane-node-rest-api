import {
  memoRepository,
  type PublicMemo,
  type PublicMemoOnUser,
  type PublicMemoOnUserWithMemo,
} from '../repositories/memo.repository';
import { userRepository } from '../repositories/user.repository';
import { Memo, MemoOnUser } from '../dtos/memo.dto';
import { Prisma } from '../generated/prisma/client';
import { Role } from '../generated/prisma/enums';
import { ConflictError, ForbiddenError, NotFoundError } from '../errors';

const toMemo = (memo: PublicMemo): Memo => ({
  uuid: memo.uuid,
  title: memo.title,
  content: memo.content,
  authorUuid: memo.author.uuid,
  createdAt: memo.createdAt,
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

export class MemoService {
  async listUserMemos(userId: number): Promise<MemoOnUser[]> {
    const links = await memoRepository.listUserMemos(userId);
    return links.map(toMemoOnUserWithMemo);
  }

  async createMemo(title: string, content: string, createdById: number): Promise<Memo> {
    return toMemo(await memoRepository.createMemo(title, content, createdById));
  }

  async assignMemoToUser(
    memoUuid: string,
    userUuid: string,
    assignedById: number,
    role: Role = Role.USER,
  ): Promise<MemoOnUser> {
    const memo = await memoRepository.findMemoAccess(memoUuid, assignedById);
    if (!memo) {
      throw new ForbiddenError('Memo not found or you do not have access to it');
    }

    // A memo's ADMINs can share it with any role, its MODs only as USER.
    const callerRole = memo.users[0]?.role;
    if (!callerRole || callerRole === Role.USER) {
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
