import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  publicUserSelect,
  userRepository,
  userSummarySelect,
} from '../../repositories/user.repository';

const { prisma } = vi.hoisted(() => ({
  prisma: { user: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn() } },
}));

vi.mock('../../config/db', () => ({ prisma }));

beforeEach(() => {
  vi.resetAllMocks();
});

describe('publicUserSelect', () => {
  it('selects only fields that are safe to return to clients', () => {
    expect(Object.keys(publicUserSelect).sort()).toEqual([
      'createdAt',
      'displayName',
      'email',
      'role',
      'username',
      'uuid',
    ]);
  });
});

describe('userSummarySelect', () => {
  it('selects only fields that any signed-in user may see of others', () => {
    expect(Object.keys(userSummarySelect).sort()).toEqual(['displayName', 'username', 'uuid']);
  });
});

describe('UserRepository', () => {
  it('searchUsers excludes the caller, matches username or display name, and pages', async () => {
    const found = [{ uuid: 'u-2' }];
    prisma.user.findMany.mockResolvedValue(found);

    expect(
      await userRepository.searchUsers({ excludeId: 1, search: 'ali', limit: 5, offset: 10 }),
    ).toBe(found);
    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: {
        id: { not: 1 },
        OR: [{ username: { contains: 'ali' } }, { displayName: { contains: 'ali' } }],
      },
      orderBy: { username: 'asc' },
      take: 5,
      skip: 10,
      select: userSummarySelect,
    });
  });

  it('searchUsers without a search only excludes the caller', async () => {
    prisma.user.findMany.mockResolvedValue([]);

    await userRepository.searchUsers({ excludeId: 1, limit: 20, offset: 0 });

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { not: 1 } } }),
    );
  });

  it('findById selects only public fields', async () => {
    const user = { uuid: 'u-1' };
    prisma.user.findUnique.mockResolvedValue(user);

    expect(await userRepository.findById(1)).toBe(user);
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 1 },
      select: publicUserSelect,
    });
  });

  it('createUser returns only public fields', async () => {
    const data = { username: 'alice', password: 'hash', email: 'a@example.com' };
    prisma.user.create.mockResolvedValue({ uuid: 'u-1' });

    await userRepository.createUser(data);

    expect(prisma.user.create).toHaveBeenCalledWith({ data, select: publicUserSelect });
  });

  it.each([
    [{ id: 1 }, true],
    [null, false],
  ])('existsByUsername returns %s → %s', async (row, expected) => {
    prisma.user.findUnique.mockResolvedValue(row);

    expect(await userRepository.existsByUsername('alice')).toBe(expected);
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { username: 'alice' },
      select: { id: true },
    });
  });

  it.each([
    [{ id: 7 }, 7],
    [null, null],
  ])('findIdByUuid returns %s → %s', async (row, expected) => {
    prisma.user.findUnique.mockResolvedValue(row);

    expect(await userRepository.findIdByUuid('u-7')).toBe(expected);
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { uuid: 'u-7' },
      select: { id: true },
    });
  });

  it('findCredentialsByUsername selects only id and password', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 1, password: 'hash' });

    expect(await userRepository.findCredentialsByUsername('alice')).toEqual({
      id: 1,
      password: 'hash',
    });
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { username: 'alice' },
      select: { id: true, password: true },
    });
  });
});
