import { describe, it, expect, vi, beforeEach } from 'vitest';
import { publicUserSelect, userRepository } from '../../repositories/user.repository';

const { prisma } = vi.hoisted(() => ({
  prisma: { user: { findUnique: vi.fn(), create: vi.fn() } },
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

describe('UserRepository', () => {
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
