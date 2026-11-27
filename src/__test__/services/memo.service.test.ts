import { describe, it, expect, vi, beforeEach } from 'vitest';
import { memoService, normalizeTags } from '../../services/memo.service';
import { memoRepository } from '../../repositories/memo.repository';
import { userRepository } from '../../repositories/user.repository';
import { ConflictError, ForbiddenError, NotFoundError } from '../../errors';
import { Prisma } from '../../generated/prisma/client';

vi.mock('../../repositories/memo.repository', () => ({
  memoRepository: {
    listUserMemos: vi.fn(),
    listUserTags: vi.fn(),
    createMemo: vi.fn(),
    updateMemo: vi.fn(),
    deleteMemo: vi.fn(),
    findMemoAccess: vi.fn(),
    findUserMemo: vi.fn(),
    listMemoAssignments: vi.fn(),
    assignMemoToUser: vi.fn(),
  },
}));

vi.mock('../../repositories/user.repository', () => ({
  userRepository: { findIdByUuid: vi.fn() },
}));

const memos = vi.mocked(memoRepository);
const users = vi.mocked(userRepository);

const createdAt = new Date('2026-01-01T00:00:00.000Z');
const assignedAt = new Date('2026-01-02T00:00:00.000Z');

/** A memo as the repository returns it (Prisma's nested select shape). */
const publicMemo = {
  uuid: 'memo-uuid',
  title: 'Title',
  content: 'Content',
  createdAt,
  author: { uuid: 'alice-uuid', username: 'alice', displayName: 'Alice' },
  tags: [] as { tag: { name: string } }[],
};

/** The memo as the API returns it. */
const memoDto = {
  uuid: 'memo-uuid',
  title: 'Title',
  content: 'Content',
  authorUuid: 'alice-uuid',
  authorUsername: 'alice',
  authorDisplayName: 'Alice',
  createdAt,
  tags: [] as string[],
};

const withTags = (...names: string[]) => ({
  ...publicMemo,
  tags: names.map((name) => ({ tag: { name } })),
});

const publicLink = {
  role: 'USER' as const,
  assignedAt,
  memo: { uuid: 'memo-uuid' },
  user: { uuid: 'bob-uuid' },
  assignedBy: { uuid: 'alice-uuid' },
};

const linkDto = {
  memoUuid: 'memo-uuid',
  userUuid: 'bob-uuid',
  assignedByUuid: 'alice-uuid',
  assignedAt,
  role: 'USER',
};

/** Access to memo 10, written by user 99, for caller 1 with the given role on it. */
const accessWithCallerRole = (role: 'USER' | 'MOD' | 'ADMIN' | null) => ({
  id: 10,
  authorId: 99,
  users: role ? [{ role }] : [],
});

/** Access to memo 10 for caller 1 as its author, with the given role on it. */
const authorAccess = (role: 'USER' | 'MOD' | 'ADMIN' | null) => ({
  ...accessWithCallerRole(role),
  authorId: 1,
});

beforeEach(() => {
  vi.resetAllMocks();
});

describe('MemoService.listUserMemos', () => {
  it('returns the user’s memos with related records flattened to uuids', async () => {
    memos.listUserMemos.mockResolvedValue([{ ...publicLink, memo: publicMemo }]);

    expect(await memoService.listUserMemos(1)).toEqual([{ ...linkDto, memo: memoDto }]);
    expect(memos.listUserMemos).toHaveBeenCalledWith(1, { tags: [], match: 'all' });
  });

  it('normalizes the tag filter and passes the match mode through', async () => {
    memos.listUserMemos.mockResolvedValue([]);

    await memoService.listUserMemos(1, ['Home', ' home', 'WORK'], 'any');

    expect(memos.listUserMemos).toHaveBeenCalledWith(1, { tags: ['home', 'work'], match: 'any' });
  });

  it('returns each memo’s tags as sorted names', async () => {
    memos.listUserMemos.mockResolvedValue([{ ...publicLink, memo: withTags('work', 'home') }]);

    const [link] = await memoService.listUserMemos(1);

    expect(link.memo?.tags).toEqual(['home', 'work']);
  });
});

describe('normalizeTags', () => {
  it('trims, lowercases and de-duplicates, keeping the first occurrence order', () => {
    expect(normalizeTags([' Work', 'home', 'WORK', 'Home '])).toEqual(['work', 'home']);
  });

  it('treats missing tags as none', () => {
    expect(normalizeTags()).toEqual([]);
  });
});

describe('MemoService.listUserTags', () => {
  it('flattens the counts and sorts the tags by name', async () => {
    memos.listUserTags.mockResolvedValue([
      { name: 'work', _count: { memos: 1 } },
      { name: 'home', _count: { memos: 2 } },
    ]);

    expect(await memoService.listUserTags(1)).toEqual([
      { name: 'home', memoCount: 2 },
      { name: 'work', memoCount: 1 },
    ]);
    expect(memos.listUserTags).toHaveBeenCalledWith(1);
  });
});

describe('MemoService.createMemo', () => {
  it('creates the memo for its author and returns it with the author’s uuid', async () => {
    memos.createMemo.mockResolvedValue(publicMemo);

    expect(await memoService.createMemo('Title', 'Content', 1)).toEqual(memoDto);
    expect(memos.createMemo).toHaveBeenCalledWith('Title', 'Content', 1, []);
  });

  it('normalizes the tags before creating the memo', async () => {
    memos.createMemo.mockResolvedValue(withTags('home'));

    expect(await memoService.createMemo('Title', 'Content', 1, ['Home', 'home'])).toEqual({
      ...memoDto,
      tags: ['home'],
    });
    expect(memos.createMemo).toHaveBeenCalledWith('Title', 'Content', 1, ['home']);
  });
});

describe('MemoService.getMemo', () => {
  it('returns the caller’s assignment with the memo', async () => {
    memos.findUserMemo.mockResolvedValue({ ...publicLink, memo: publicMemo });

    expect(await memoService.getMemo('memo-uuid', 1)).toEqual({ ...linkDto, memo: memoDto });
    expect(memos.findUserMemo).toHaveBeenCalledWith('memo-uuid', 1);
  });

  it('answers a memo the caller is not assigned to as if it did not exist', async () => {
    memos.findUserMemo.mockResolvedValue(null);

    await expect(memoService.getMemo('memo-uuid', 1)).rejects.toThrow(
      new ForbiddenError('Memo not found or you do not have access to it'),
    );
  });
});

describe('MemoService.updateMemo', () => {
  it.each(['MOD', 'ADMIN'] as const)(
    'lets a %s change the title, content and normalized tags',
    async (role) => {
      memos.findMemoAccess.mockResolvedValue(accessWithCallerRole(role));
      memos.updateMemo.mockResolvedValue(withTags('home'));

      const changes = { title: 'New', content: 'Changed', tags: ['HOME', 'home'] };
      expect(await memoService.updateMemo('memo-uuid', changes, 1)).toEqual({
        ...memoDto,
        tags: ['home'],
      });
      expect(memos.findMemoAccess).toHaveBeenCalledWith('memo-uuid', 1);
      expect(memos.updateMemo).toHaveBeenCalledWith(10, {
        title: 'New',
        content: 'Changed',
        tagNames: ['home'],
      });
    },
  );

  it.each(['USER', null] as const)(
    'lets the author edit, even with role %s on the memo',
    async (role) => {
      memos.findMemoAccess.mockResolvedValue(authorAccess(role));
      memos.updateMemo.mockResolvedValue(publicMemo);

      expect(await memoService.updateMemo('memo-uuid', { title: 'New' }, 1)).toEqual(memoDto);
    },
  );

  it('keeps the tags when none are given', async () => {
    memos.findMemoAccess.mockResolvedValue(accessWithCallerRole('ADMIN'));
    memos.updateMemo.mockResolvedValue(publicMemo);

    await memoService.updateMemo('memo-uuid', { content: 'Changed' }, 1);

    expect(memos.updateMemo).toHaveBeenCalledWith(10, {
      title: undefined,
      content: 'Changed',
      tagNames: undefined,
    });
  });

  it('removes all tags when given an empty list', async () => {
    memos.findMemoAccess.mockResolvedValue(accessWithCallerRole('ADMIN'));
    memos.updateMemo.mockResolvedValue(publicMemo);

    await memoService.updateMemo('memo-uuid', { tags: [] }, 1);

    expect(memos.updateMemo).toHaveBeenCalledWith(10, expect.objectContaining({ tagNames: [] }));
  });

  it.each([
    ['does not exist', null],
    ['is not shared with the caller', accessWithCallerRole(null)],
  ])('forbids editing a memo that %s, without telling which', async (_l, access) => {
    memos.findMemoAccess.mockResolvedValue(access);

    await expect(memoService.updateMemo('memo-uuid', { title: 'New' }, 1)).rejects.toThrow(
      new ForbiddenError('Memo not found or you do not have access to it'),
    );
    expect(memos.updateMemo).not.toHaveBeenCalled();
  });

  it('forbids a caller with the USER role who is not the author', async () => {
    memos.findMemoAccess.mockResolvedValue(accessWithCallerRole('USER'));

    await expect(memoService.updateMemo('memo-uuid', { title: 'New' }, 1)).rejects.toThrow(
      new ForbiddenError("Only the memo's author, ADMINs and MODs can edit it"),
    );
    expect(memos.updateMemo).not.toHaveBeenCalled();
  });
});

describe('MemoService.replaceMemoTags', () => {
  it.each(['MOD', 'ADMIN'] as const)(
    'lets a %s replace the tags with normalized ones',
    async (role) => {
      memos.findMemoAccess.mockResolvedValue(accessWithCallerRole(role));
      memos.updateMemo.mockResolvedValue(withTags('home'));

      expect(await memoService.replaceMemoTags('memo-uuid', ['HOME'], 1)).toEqual({
        ...memoDto,
        tags: ['home'],
      });
      expect(memos.findMemoAccess).toHaveBeenCalledWith('memo-uuid', 1);
      expect(memos.updateMemo).toHaveBeenCalledWith(10, { tagNames: ['home'] });
    },
  );

  it('lets the author replace the tags, even with the USER role on the memo', async () => {
    memos.findMemoAccess.mockResolvedValue(authorAccess('USER'));
    memos.updateMemo.mockResolvedValue(publicMemo);

    expect(await memoService.replaceMemoTags('memo-uuid', [], 1)).toEqual(memoDto);
    expect(memos.updateMemo).toHaveBeenCalledWith(10, { tagNames: [] });
  });

  it.each([
    ['does not exist', null],
    ['is not shared with the caller', accessWithCallerRole(null)],
  ])('forbids changing the tags of a memo that %s, without telling which', async (_l, access) => {
    memos.findMemoAccess.mockResolvedValue(access);

    await expect(memoService.replaceMemoTags('memo-uuid', ['home'], 1)).rejects.toThrow(
      new ForbiddenError('Memo not found or you do not have access to it'),
    );
    expect(memos.updateMemo).not.toHaveBeenCalled();
  });

  it('forbids a caller with the USER role who is not the author', async () => {
    memos.findMemoAccess.mockResolvedValue(accessWithCallerRole('USER'));

    await expect(memoService.replaceMemoTags('memo-uuid', ['home'], 1)).rejects.toThrow(
      new ForbiddenError("Only the memo's author, ADMINs and MODs can change its tags"),
    );
    expect(memos.updateMemo).not.toHaveBeenCalled();
  });
});

describe('MemoService.listMemoAssignments', () => {
  /** An assignment as the repository returns it. */
  const row = (username: string, at: string, role: 'USER' | 'MOD' | 'ADMIN' = 'USER') => ({
    role,
    assignedAt: new Date(at),
    user: { uuid: `${username}-uuid`, username, displayName: null },
    assignedBy: { uuid: 'alice-uuid', username: 'alice', displayName: 'Alice' },
  });

  it('returns the assignees flattened, oldest first and then by username', async () => {
    memos.findMemoAccess.mockResolvedValue(accessWithCallerRole('USER'));
    memos.listMemoAssignments.mockResolvedValue([
      row('carol', '2026-01-02T00:00:00Z'),
      row('bob', '2026-01-02T00:00:00Z'),
      row('alice', '2026-01-01T00:00:00Z', 'ADMIN'),
    ]);

    const result = await memoService.listMemoAssignments('memo-uuid', 1);

    expect(memos.findMemoAccess).toHaveBeenCalledWith('memo-uuid', 1);
    expect(memos.listMemoAssignments).toHaveBeenCalledWith(10);
    expect(result.map((a) => a.username)).toEqual(['alice', 'bob', 'carol']);
    expect(result[0]).toEqual({
      userUuid: 'alice-uuid',
      username: 'alice',
      displayName: null,
      role: 'ADMIN',
      assignedAt: new Date('2026-01-01T00:00:00Z'),
      assignedByUuid: 'alice-uuid',
      assignedByUsername: 'alice',
      assignedByDisplayName: 'Alice',
    });
  });

  it('lets the author list the assignees without a role on the memo', async () => {
    memos.findMemoAccess.mockResolvedValue(authorAccess(null));
    memos.listMemoAssignments.mockResolvedValue([]);

    expect(await memoService.listMemoAssignments('memo-uuid', 1)).toEqual([]);
  });

  it.each([
    ['does not exist', null],
    ['is not shared with the caller', accessWithCallerRole(null)],
  ])('forbids listing a memo that %s, without telling which', async (_l, access) => {
    memos.findMemoAccess.mockResolvedValue(access);

    await expect(memoService.listMemoAssignments('memo-uuid', 1)).rejects.toThrow(
      new ForbiddenError('Memo not found or you do not have access to it'),
    );
    expect(memos.listMemoAssignments).not.toHaveBeenCalled();
  });
});

describe('MemoService.deleteMemo', () => {
  it('lets an ADMIN delete the memo', async () => {
    memos.findMemoAccess.mockResolvedValue(accessWithCallerRole('ADMIN'));

    await memoService.deleteMemo('memo-uuid', 1);

    expect(memos.findMemoAccess).toHaveBeenCalledWith('memo-uuid', 1);
    expect(memos.deleteMemo).toHaveBeenCalledWith(10);
  });

  it.each(['USER', 'MOD', null] as const)(
    'lets the author delete the memo, even with role %s on it',
    async (role) => {
      memos.findMemoAccess.mockResolvedValue(authorAccess(role));

      await memoService.deleteMemo('memo-uuid', 1);

      expect(memos.deleteMemo).toHaveBeenCalledWith(10);
    },
  );

  it.each(['USER', 'MOD'] as const)('forbids a %s who is not the author', async (role) => {
    memos.findMemoAccess.mockResolvedValue(accessWithCallerRole(role));

    await expect(memoService.deleteMemo('memo-uuid', 1)).rejects.toThrow(
      new ForbiddenError("Only the memo's author and ADMINs can delete it"),
    );
    expect(memos.deleteMemo).not.toHaveBeenCalled();
  });

  it.each([
    ['does not exist', null],
    ['is not shared with the caller', accessWithCallerRole(null)],
  ])('forbids deleting a memo that %s, without telling which', async (_l, access) => {
    memos.findMemoAccess.mockResolvedValue(access);

    await expect(memoService.deleteMemo('memo-uuid', 1)).rejects.toThrow(
      new ForbiddenError('Memo not found or you do not have access to it'),
    );
    expect(memos.deleteMemo).not.toHaveBeenCalled();
  });
});

describe('MemoService.assignMemoToUser', () => {
  it('looks up the memo by uuid together with the caller’s own role', async () => {
    memos.findMemoAccess.mockResolvedValue(accessWithCallerRole('ADMIN'));
    users.findIdByUuid.mockResolvedValue(2);
    memos.assignMemoToUser.mockResolvedValue(publicLink);

    await memoService.assignMemoToUser('memo-uuid', 'bob-uuid', 1);

    expect(memos.findMemoAccess).toHaveBeenCalledWith('memo-uuid', 1);
  });

  it('forbids assigning a memo that does not exist', async () => {
    memos.findMemoAccess.mockResolvedValue(null);

    await expect(memoService.assignMemoToUser('memo-uuid', 'bob-uuid', 1)).rejects.toThrow(
      new ForbiddenError('Memo not found or you do not have access to it'),
    );
    expect(memos.assignMemoToUser).not.toHaveBeenCalled();
  });

  it('answers a caller who is not assigned to the memo as if it did not exist', async () => {
    memos.findMemoAccess.mockResolvedValue(accessWithCallerRole(null));

    await expect(memoService.assignMemoToUser('memo-uuid', 'bob-uuid', 1)).rejects.toThrow(
      new ForbiddenError('Memo not found or you do not have access to it'),
    );
    expect(users.findIdByUuid).not.toHaveBeenCalled();
    expect(memos.assignMemoToUser).not.toHaveBeenCalled();
  });

  it('forbids a caller with the USER role on the memo before looking up the target', async () => {
    memos.findMemoAccess.mockResolvedValue(accessWithCallerRole('USER'));

    await expect(memoService.assignMemoToUser('memo-uuid', 'bob-uuid', 1)).rejects.toThrow(
      new ForbiddenError('Only users with sufficient permissions can assign memos to other users'),
    );
    expect(users.findIdByUuid).not.toHaveBeenCalled();
    expect(memos.assignMemoToUser).not.toHaveBeenCalled();
  });

  it('returns 404 when the target user does not exist', async () => {
    memos.findMemoAccess.mockResolvedValue(accessWithCallerRole('ADMIN'));
    users.findIdByUuid.mockResolvedValue(null);

    await expect(memoService.assignMemoToUser('memo-uuid', 'missing', 1)).rejects.toThrow(
      new NotFoundError('User not found'),
    );
    expect(memos.assignMemoToUser).not.toHaveBeenCalled();
  });

  it('reports a user who is already assigned as a conflict', async () => {
    memos.findMemoAccess.mockResolvedValue(accessWithCallerRole('ADMIN'));
    users.findIdByUuid.mockResolvedValue(2);
    memos.assignMemoToUser.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed on PRIMARY', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );

    await expect(memoService.assignMemoToUser('memo-uuid', 'bob-uuid', 1)).rejects.toThrow(
      new ConflictError('The user is already assigned to the memo'),
    );
  });

  it('passes other database errors through unchanged', async () => {
    const fkError = new Prisma.PrismaClientKnownRequestError('Foreign key constraint violated', {
      code: 'P2003',
      clientVersion: 'test',
    });
    memos.findMemoAccess.mockResolvedValue(accessWithCallerRole('ADMIN'));
    users.findIdByUuid.mockResolvedValue(2);
    memos.assignMemoToUser.mockRejectedValue(fkError);

    await expect(memoService.assignMemoToUser('memo-uuid', 'bob-uuid', 1)).rejects.toBe(fkError);
  });

  it.each(['MOD', 'ADMIN'] as const)(
    'allows a caller with the %s role to assign as USER by default',
    async (role) => {
      memos.findMemoAccess.mockResolvedValue(accessWithCallerRole(role));
      users.findIdByUuid.mockResolvedValue(2);
      memos.assignMemoToUser.mockResolvedValue(publicLink);

      expect(await memoService.assignMemoToUser('memo-uuid', 'bob-uuid', 1)).toEqual(linkDto);
      expect(users.findIdByUuid).toHaveBeenCalledWith('bob-uuid');
      expect(memos.assignMemoToUser).toHaveBeenCalledWith(10, 2, 1, 'USER');
    },
  );

  it.each(['USER', 'MOD', 'ADMIN'] as const)('lets an ADMIN assign the %s role', async (role) => {
    memos.findMemoAccess.mockResolvedValue(accessWithCallerRole('ADMIN'));
    users.findIdByUuid.mockResolvedValue(2);
    memos.assignMemoToUser.mockResolvedValue({ ...publicLink, role });

    expect(await memoService.assignMemoToUser('memo-uuid', 'bob-uuid', 1, role)).toEqual({
      ...linkDto,
      role,
    });
    expect(memos.assignMemoToUser).toHaveBeenCalledWith(10, 2, 1, role);
  });

  it('lets a MOD assign the USER role explicitly', async () => {
    memos.findMemoAccess.mockResolvedValue(accessWithCallerRole('MOD'));
    users.findIdByUuid.mockResolvedValue(2);
    memos.assignMemoToUser.mockResolvedValue(publicLink);

    await memoService.assignMemoToUser('memo-uuid', 'bob-uuid', 1, 'USER');

    expect(memos.assignMemoToUser).toHaveBeenCalledWith(10, 2, 1, 'USER');
  });

  it.each(['MOD', 'ADMIN'] as const)(
    'forbids a MOD from assigning the %s role before looking up the target',
    async (role) => {
      memos.findMemoAccess.mockResolvedValue(accessWithCallerRole('MOD'));

      await expect(memoService.assignMemoToUser('memo-uuid', 'bob-uuid', 1, role)).rejects.toThrow(
        new ForbiddenError(`Only the memo's ADMINs can assign the ${role} role`),
      );
      expect(users.findIdByUuid).not.toHaveBeenCalled();
      expect(memos.assignMemoToUser).not.toHaveBeenCalled();
    },
  );

  it('forbids a USER on the memo even when assigning the USER role', async () => {
    memos.findMemoAccess.mockResolvedValue(accessWithCallerRole('USER'));

    await expect(memoService.assignMemoToUser('memo-uuid', 'bob-uuid', 1, 'USER')).rejects.toThrow(
      new ForbiddenError('Only users with sufficient permissions can assign memos to other users'),
    );
    expect(memos.assignMemoToUser).not.toHaveBeenCalled();
  });
});
