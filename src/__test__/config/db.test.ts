import { describe, it, expect, vi } from 'vitest';

const { PrismaClient } = vi.hoisted(() => ({
  // `function` (not an arrow) so it can be called with `new`.
  PrismaClient: vi.fn(function FakePrismaClient() {}),
}));

vi.mock('../../generated/prisma/client', () => ({ PrismaClient }));
vi.mock('@prisma/adapter-mariadb', () => ({
  PrismaMariaDb: vi.fn(function FakeAdapter() {}),
}));

describe('prisma client config', () => {
  it('omits user password hashes globally', async () => {
    await import('../../config/db.js');

    expect(PrismaClient).toHaveBeenCalledOnce();
    expect(PrismaClient).toHaveBeenCalledWith(
      expect.objectContaining({ omit: { user: { password: true } } }),
    );
  });
});
