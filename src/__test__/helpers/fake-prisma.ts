import { randomUUID } from 'crypto';
import { Prisma } from '../../generated/prisma/client';

/**
 * In-memory stand-in for the Prisma client, covering only the queries the
 * repositories make. It mirrors the Prisma behaviour the app relies on:
 * - `select` returns only the selected fields
 * - without `select`, user.password is omitted (the global `omit` in config/db)
 * - unique violations throw P2002, missing foreign keys throw P2003
 * - deleteMany returns a count and never throws
 *
 * Use it from a test file with:
 *   vi.mock('../../config/db', async () => ({
 *     prisma: (await import('../helpers/fake-prisma')).fakePrisma,
 *   }));
 */

type Role = 'USER' | 'MOD' | 'ADMIN';

export type UserRow = {
  id: number;
  uuid: string;
  username: string;
  password: string;
  email: string;
  displayName: string | null;
  role: Role;
  createdAt: Date;
};

export type RefreshTokenRow = {
  id: bigint;
  tokenHash: string;
  userId: number;
  expiresAt: Date;
  createdAt: Date;
  revoked: boolean;
};

export type NoteRow = {
  id: number;
  uuid: string;
  title: string;
  content: string;
  authorId: number;
  createdAt: Date;
};

export type NoteOnUserRow = {
  noteId: number;
  userId: number;
  assignedById: number;
  assignedAt: Date;
  role: Role;
};

type Where = Record<string, unknown>;
type Select = Record<string, boolean | undefined>;

export const fakeDb = {
  users: [] as UserRow[],
  refreshTokens: [] as RefreshTokenRow[],
  notes: [] as NoteRow[],
  notesOnUsers: [] as NoteOnUserRow[],
};

let nextId = 1;

export const resetFakeDb = () => {
  fakeDb.users.length = 0;
  fakeDb.refreshTokens.length = 0;
  fakeDb.notes.length = 0;
  fakeDb.notesOnUsers.length = 0;
  nextId = 1;
};

const knownError = (code: string, message: string) =>
  new Prisma.PrismaClientKnownRequestError(message, { code, clientVersion: 'fake' });

const matches = (row: object, where: Where = {}) =>
  Object.entries(where).every(([key, condition]) => {
    const value = (row as Record<string, unknown>)[key];
    if (condition && typeof condition === 'object' && 'lt' in condition) {
      return (value as Date) < (condition as { lt: Date }).lt;
    }
    return value === condition;
  });

const project = (row: object, select?: Select, omit: string[] = []) =>
  Object.fromEntries(
    Object.entries(row).filter(([key]) => (select ? select[key] : !omit.includes(key))),
  );

const deleteWhere = <T extends object>(rows: T[], where: Where) => {
  const remaining = rows.filter((row) => !matches(row, where));
  const count = rows.length - remaining.length;
  rows.splice(0, rows.length, ...remaining);
  return { count };
};

const userExists = (id: number) => fakeDb.users.some((u) => u.id === id);

export const fakePrisma = {
  user: {
    findUnique: async ({ where, select }: { where: Where; select?: Select }) => {
      const row = fakeDb.users.find((u) => matches(u, where));
      return row ? project(row, select, ['password']) : null;
    },
    create: async ({ data, select }: { data: Partial<UserRow>; select?: Select }) => {
      if (fakeDb.users.some((u) => u.username === data.username || u.email === data.email)) {
        throw knownError('P2002', 'Unique constraint failed on users_username_key/users_email_key');
      }
      const row: UserRow = {
        id: nextId++,
        uuid: randomUUID(),
        username: '',
        password: '',
        email: '',
        displayName: null,
        role: 'USER',
        createdAt: new Date(),
        ...data,
      };
      fakeDb.users.push(row);
      return project(row, select, ['password']);
    },
  },

  refreshToken: {
    create: async ({
      data,
    }: {
      data: Pick<RefreshTokenRow, 'userId' | 'tokenHash' | 'expiresAt'>;
    }) => {
      if (fakeDb.refreshTokens.some((t) => t.tokenHash === data.tokenHash)) {
        throw knownError('P2002', 'Unique constraint failed on refresh_tokens_tokenHash_key');
      }
      if (!userExists(data.userId)) {
        throw knownError('P2003', 'Foreign key constraint violated on refresh_tokens_userId_fkey');
      }
      const row: RefreshTokenRow = {
        id: BigInt(nextId++),
        createdAt: new Date(),
        revoked: false,
        ...data,
      };
      fakeDb.refreshTokens.push(row);
      return { ...row };
    },
    findUnique: async ({ where }: { where: Where }) => {
      const row = fakeDb.refreshTokens.find((t) => matches(t, where));
      return row ? { ...row } : null;
    },
    deleteMany: async ({ where }: { where: Where }) => deleteWhere(fakeDb.refreshTokens, where),
  },

  note: {
    create: async ({
      data,
    }: {
      data: Pick<NoteRow, 'title' | 'content' | 'authorId'> & {
        users: { create: Pick<NoteOnUserRow, 'userId' | 'assignedById' | 'role'> };
      };
    }) => {
      if (!userExists(data.authorId)) {
        throw knownError('P2003', 'Foreign key constraint violated on notes_authorId_fkey');
      }
      const { users, ...fields } = data;
      const note: NoteRow = { id: nextId++, uuid: randomUUID(), createdAt: new Date(), ...fields };
      fakeDb.notes.push(note);
      fakeDb.notesOnUsers.push({ noteId: note.id, assignedAt: new Date(), ...users.create });
      return { ...note };
    },
    findUnique: async ({
      where,
      include,
    }: {
      where: Where;
      include?: { users?: { where?: Where } };
    }) => {
      const note = fakeDb.notes.find((n) => matches(n, where));
      if (!note) return null;
      if (!include?.users) return { ...note };
      const users = fakeDb.notesOnUsers
        .filter((link) => link.noteId === note.id && matches(link, include.users?.where))
        .map((link) => ({ ...link }));
      return { ...note, users };
    },
  },

  noteOnUser: {
    findMany: async ({ where, include }: { where: Where; include?: { note?: boolean } }) =>
      fakeDb.notesOnUsers
        .filter((link) => matches(link, where))
        .map((link) => {
          const note = fakeDb.notes.find((n) => n.id === link.noteId);
          return include?.note ? { ...link, note: { ...note } } : { ...link };
        }),
    create: async ({
      data,
    }: {
      data: Pick<NoteOnUserRow, 'noteId' | 'userId' | 'assignedById'> & { role?: Role };
    }) => {
      if (fakeDb.notesOnUsers.some((l) => l.noteId === data.noteId && l.userId === data.userId)) {
        throw knownError('P2002', 'Unique constraint failed on notes_on_users PRIMARY');
      }
      if (
        !fakeDb.notes.some((n) => n.id === data.noteId) ||
        !userExists(data.userId) ||
        !userExists(data.assignedById)
      ) {
        throw knownError('P2003', 'Foreign key constraint violated on notes_on_users_fkey');
      }
      const row: NoteOnUserRow = { role: 'USER', assignedAt: new Date(), ...data };
      fakeDb.notesOnUsers.push(row);
      return { ...row };
    },
  },
};

/** Inserts a user directly. `password` must already be a hash if login is needed. */
export const seedUser = (overrides: Partial<UserRow> = {}): UserRow => {
  const id = nextId++;
  const row: UserRow = {
    id,
    uuid: randomUUID(),
    username: `user${id}`,
    password: '',
    email: `user${id}@example.com`,
    displayName: null,
    role: 'USER',
    createdAt: new Date(),
    ...overrides,
  };
  fakeDb.users.push(row);
  return row;
};
