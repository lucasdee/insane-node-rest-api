import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  memoRepository,
  publicMemoOnUserSelect,
  publicMemoOnUserWithMemoSelect,
  publicMemoSelect,
} from '../../repositories/memo.repository';

const { prisma } = vi.hoisted(() => ({
  prisma: {
    memo: { create: vi.fn(), findUnique: vi.fn() },
    memoOnUser: { create: vi.fn(), findMany: vi.fn() },
  },
}));

vi.mock('../../config/db', () => ({ prisma }));

beforeEach(() => {
  vi.resetAllMocks();
});

describe('public memo selects', () => {
  it('select only uuids for related records, never numeric ids', () => {
    expect(publicMemoSelect).toEqual({
      uuid: true,
      title: true,
      content: true,
      createdAt: true,
      author: { select: { uuid: true } },
    });
    expect(publicMemoOnUserSelect).toEqual({
      role: true,
      assignedAt: true,
      memo: { select: { uuid: true } },
      user: { select: { uuid: true } },
      assignedBy: { select: { uuid: true } },
    });
    expect(publicMemoOnUserWithMemoSelect).toEqual({
      ...publicMemoOnUserSelect,
      memo: { select: publicMemoSelect },
    });
  });
});

describe('MemoRepository', () => {
  it('listUserMemos returns the user’s assignments with their public memos', async () => {
    prisma.memoOnUser.findMany.mockResolvedValue([]);

    await memoRepository.listUserMemos(1);

    expect(prisma.memoOnUser.findMany).toHaveBeenCalledWith({
      where: { userId: 1 },
      select: publicMemoOnUserWithMemoSelect,
    });
  });

  it('findMemoAccess looks the memo up by uuid with only the given user’s role', async () => {
    const access = { id: 10, users: [{ role: 'ADMIN' }] };
    prisma.memo.findUnique.mockResolvedValue(access);

    expect(await memoRepository.findMemoAccess('n-uuid', 1)).toBe(access);
    expect(prisma.memo.findUnique).toHaveBeenCalledWith({
      where: { uuid: 'n-uuid' },
      select: { id: true, users: { where: { userId: 1 }, select: { role: true } } },
    });
  });

  it('createMemo makes the author an ADMIN and returns only public fields', async () => {
    prisma.memo.create.mockResolvedValue({ uuid: 'n-uuid' });

    await memoRepository.createMemo('Title', 'Content', 1);

    expect(prisma.memo.create).toHaveBeenCalledWith({
      data: {
        title: 'Title',
        content: 'Content',
        authorId: 1,
        users: { create: { userId: 1, assignedById: 1, role: 'ADMIN' } },
      },
      select: publicMemoSelect,
    });
  });

  it('assignMemoToUser records who made the assignment and the role, and returns only public fields', async () => {
    prisma.memoOnUser.create.mockResolvedValue({});

    await memoRepository.assignMemoToUser(10, 2, 1, 'MOD');

    expect(prisma.memoOnUser.create).toHaveBeenCalledWith({
      data: { memoId: 10, userId: 2, assignedById: 1, role: 'MOD' },
      select: publicMemoOnUserSelect,
    });
  });
});
