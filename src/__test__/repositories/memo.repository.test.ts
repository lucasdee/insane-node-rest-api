import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  memoRepository,
  publicMemoAssignmentSelect,
  publicMemoOnUserSelect,
  publicMemoOnUserWithMemoSelect,
  publicMemoSelect,
} from '../../repositories/memo.repository';

const { prisma } = vi.hoisted(() => ({
  prisma: {
    memo: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
    memoOnUser: { create: vi.fn(), findMany: vi.fn(), findFirst: vi.fn(), deleteMany: vi.fn() },
    tag: { createMany: vi.fn(), findMany: vi.fn() },
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
      author: { select: { uuid: true, username: true, displayName: true } },
      tags: { select: { tag: { select: { name: true } } } },
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

  it('select only user summaries for a memo’s assignees, never emails or roles', () => {
    const summary = { select: { uuid: true, username: true, displayName: true } };
    expect(publicMemoAssignmentSelect).toEqual({
      role: true,
      assignedAt: true,
      user: summary,
      assignedBy: summary,
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

  it('listUserMemos without tags does not filter by tag', async () => {
    prisma.memoOnUser.findMany.mockResolvedValue([]);

    await memoRepository.listUserMemos(1, { tags: [], match: 'any' });

    expect(prisma.memoOnUser.findMany).toHaveBeenCalledWith({
      where: { userId: 1 },
      select: publicMemoOnUserWithMemoSelect,
    });
  });

  it('listUserMemos with match=all requires every tag on the memo', async () => {
    prisma.memoOnUser.findMany.mockResolvedValue([]);

    await memoRepository.listUserMemos(1, { tags: ['a', 'b'], match: 'all' });

    expect(prisma.memoOnUser.findMany).toHaveBeenCalledWith({
      where: {
        userId: 1,
        memo: {
          AND: [
            { tags: { some: { tag: { name: 'a' } } } },
            { tags: { some: { tag: { name: 'b' } } } },
          ],
        },
      },
      select: publicMemoOnUserWithMemoSelect,
    });
  });

  it('listUserMemos with match=any requires at least one of the tags', async () => {
    prisma.memoOnUser.findMany.mockResolvedValue([]);

    await memoRepository.listUserMemos(1, { tags: ['a', 'b'], match: 'any' });

    expect(prisma.memoOnUser.findMany).toHaveBeenCalledWith({
      where: { userId: 1, memo: { tags: { some: { tag: { name: { in: ['a', 'b'] } } } } } },
      select: publicMemoOnUserWithMemoSelect,
    });
  });

  it('listMemoAssignments returns the memo’s assignments with user summaries', async () => {
    prisma.memoOnUser.findMany.mockResolvedValue([]);

    await memoRepository.listMemoAssignments(10);

    expect(prisma.memoOnUser.findMany).toHaveBeenCalledWith({
      where: { memoId: 10 },
      select: publicMemoAssignmentSelect,
    });
  });

  it('findAssignment looks the assignment up by memo id and user uuid, with internal ids', async () => {
    const assignment = { userId: 2, assignedById: 1, role: 'USER' };
    prisma.memoOnUser.findFirst.mockResolvedValue(assignment);

    expect(await memoRepository.findAssignment(10, 'bob-uuid')).toBe(assignment);
    expect(prisma.memoOnUser.findFirst).toHaveBeenCalledWith({
      where: { memoId: 10, user: { uuid: 'bob-uuid' } },
      select: { userId: true, assignedById: true, role: true },
    });
  });

  it('removeAssignment deletes only that user’s assignment and returns the count', async () => {
    prisma.memoOnUser.deleteMany.mockResolvedValue({ count: 1 });

    expect(await memoRepository.removeAssignment(10, 2)).toBe(1);
    expect(prisma.memoOnUser.deleteMany).toHaveBeenCalledWith({ where: { memoId: 10, userId: 2 } });
  });

  it('listUserTags counts only the memos the user is assigned to', async () => {
    prisma.tag.findMany.mockResolvedValue([]);

    await memoRepository.listUserTags(1);

    const onUsersMemos = { memo: { users: { some: { userId: 1 } } } };
    expect(prisma.tag.findMany).toHaveBeenCalledWith({
      where: { memos: { some: onUsersMemos } },
      select: { name: true, _count: { select: { memos: { where: onUsersMemos } } } },
    });
  });

  it('findMemoAccess looks the memo up by uuid with its author and only the given user’s role', async () => {
    const access = { id: 10, authorId: 1, users: [{ role: 'ADMIN' }] };
    prisma.memo.findUnique.mockResolvedValue(access);

    expect(await memoRepository.findMemoAccess('n-uuid', 1)).toBe(access);
    expect(prisma.memo.findUnique).toHaveBeenCalledWith({
      where: { uuid: 'n-uuid' },
      select: {
        id: true,
        authorId: true,
        users: { where: { userId: 1 }, select: { role: true } },
      },
    });
  });

  it('findUserMemo looks up the user’s own assignment to the memo, with the public memo', async () => {
    const link = { role: 'MOD' };
    prisma.memoOnUser.findFirst.mockResolvedValue(link);

    expect(await memoRepository.findUserMemo('n-uuid', 1)).toBe(link);
    expect(prisma.memoOnUser.findFirst).toHaveBeenCalledWith({
      where: { userId: 1, memo: { uuid: 'n-uuid' } },
      select: publicMemoOnUserWithMemoSelect,
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
        tags: { create: [] },
      },
      select: publicMemoSelect,
    });
    expect(prisma.tag.createMany).not.toHaveBeenCalled();
  });

  it('createMemo creates missing tags, then links the memo to them by name', async () => {
    prisma.memo.create.mockResolvedValue({ uuid: 'n-uuid' });

    await memoRepository.createMemo('Title', 'Content', 1, ['home', 'work']);

    expect(prisma.tag.createMany).toHaveBeenCalledWith({
      data: [{ name: 'home' }, { name: 'work' }],
      skipDuplicates: true,
    });
    expect(prisma.memo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tags: {
            create: [
              { tag: { connect: { name: 'home' } } },
              { tag: { connect: { name: 'work' } } },
            ],
          },
        }),
      }),
    );
    expect(prisma.tag.createMany.mock.invocationCallOrder[0]).toBeLessThan(
      prisma.memo.create.mock.invocationCallOrder[0],
    );
  });

  it('updateMemo with tags removes all current tags and links the new ones', async () => {
    prisma.memo.update.mockResolvedValue({ uuid: 'n-uuid' });

    await memoRepository.updateMemo(10, { tagNames: ['home'] });

    expect(prisma.tag.createMany).toHaveBeenCalledWith({
      data: [{ name: 'home' }],
      skipDuplicates: true,
    });
    expect(prisma.memo.update).toHaveBeenCalledWith({
      where: { id: 10 },
      data: {
        title: undefined,
        content: undefined,
        tags: { deleteMany: {}, create: [{ tag: { connect: { name: 'home' } } }] },
      },
      select: publicMemoSelect,
    });
    expect(prisma.tag.createMany.mock.invocationCallOrder[0]).toBeLessThan(
      prisma.memo.update.mock.invocationCallOrder[0],
    );
  });

  it('updateMemo with an empty tag list removes all tags', async () => {
    prisma.memo.update.mockResolvedValue({ uuid: 'n-uuid' });

    await memoRepository.updateMemo(10, { tagNames: [] });

    expect(prisma.tag.createMany).not.toHaveBeenCalled();
    expect(prisma.memo.update.mock.calls[0][0].data).toHaveProperty('tags', {
      deleteMany: {},
      create: [],
    });
  });

  it('updateMemo without tags changes only the title and content', async () => {
    prisma.memo.update.mockResolvedValue({ uuid: 'n-uuid' });

    await memoRepository.updateMemo(10, { title: 'New title', content: 'New content' });

    expect(prisma.tag.createMany).not.toHaveBeenCalled();
    const { data } = prisma.memo.update.mock.calls[0][0];
    expect(data).toEqual({ title: 'New title', content: 'New content' });
    expect(data).not.toHaveProperty('tags');
  });

  it('deleteMemo deletes the memo by id, leaving assignments and tag links to the foreign keys', async () => {
    prisma.memo.delete.mockResolvedValue({ id: 10 });

    expect(await memoRepository.deleteMemo(10)).toBeUndefined();
    expect(prisma.memo.delete).toHaveBeenCalledWith({ where: { id: 10 }, select: { id: true } });
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
