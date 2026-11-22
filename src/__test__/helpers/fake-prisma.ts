import { randomUUID } from 'crypto';
import { Prisma } from '../../generated/prisma/client';

/**
 * In-memory stand-in for the Prisma client, covering only the queries the
 * repositories make. It mirrors the Prisma behaviour the app relies on:
 * - `select` returns only the selected fields, including nested relation selects
 * - without `select`, user.password is omitted (the global `omit` in config/db)
 * - unique violations throw P2002, missing foreign keys throw P2003
 * - updateMany and deleteMany return a count and never throw
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
  familyId: string;
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
/** A select that may also pick fields of related rows: `{ author: { select: { uuid: true } } }`. */
type RelationSelect = {
  [key: string]: boolean | { select: RelationSelect; where?: Where } | undefined;
};

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

type Model = 'user' | 'note' | 'noteOnUser';

/** How each relation field resolves: the related model and its row(s). */
const relations: Record<
  Model,
  Record<string, { model: Model; resolve: (row: never) => object | object[] | undefined }>
> = {
  user: {},
  note: {
    author: {
      model: 'user',
      resolve: (n: NoteRow) => fakeDb.users.find((u) => u.id === n.authorId),
    },
    users: {
      model: 'noteOnUser',
      resolve: (n: NoteRow) => fakeDb.notesOnUsers.filter((l) => l.noteId === n.id),
    },
  },
  noteOnUser: {
    note: {
      model: 'note',
      resolve: (l: NoteOnUserRow) => fakeDb.notes.find((n) => n.id === l.noteId),
    },
    user: {
      model: 'user',
      resolve: (l: NoteOnUserRow) => fakeDb.users.find((u) => u.id === l.userId),
    },
    assignedBy: {
      model: 'user',
      resolve: (l: NoteOnUserRow) => fakeDb.users.find((u) => u.id === l.assignedById),
    },
  },
};

/** Applies a select, following relations like Prisma does. Without one, returns a copy. */
const selectRow = (model: Model, row: object, select?: RelationSelect): Record<string, unknown> => {
  if (!select) return { ...row };
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(select)) {
    if (value === true) {
      result[key] = (row as Record<string, unknown>)[key];
    } else if (value && typeof value === 'object') {
      const relation = relations[model][key];
      if (!relation) throw new Error(`fake-prisma: unknown relation ${model}.${key}`);
      const related = relation.resolve(row as never);
      result[key] = Array.isArray(related)
        ? related
            .filter((r) => matches(r, value.where))
            .map((r) => selectRow(relation.model, r, value.select))
        : related && selectRow(relation.model, related, value.select);
    }
  }
  return result;
};

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
      data: Pick<RefreshTokenRow, 'userId' | 'tokenHash' | 'expiresAt' | 'familyId'>;
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
    updateMany: async ({ where, data }: { where: Where; data: Partial<RefreshTokenRow> }) => {
      const rows = fakeDb.refreshTokens.filter((t) => matches(t, where));
      rows.forEach((row) => Object.assign(row, data));
      return { count: rows.length };
    },
    deleteMany: async ({ where }: { where: Where }) => deleteWhere(fakeDb.refreshTokens, where),
  },

  note: {
    create: async ({
      data,
      select,
    }: {
      data: Pick<NoteRow, 'title' | 'content' | 'authorId'> & {
        users: { create: Pick<NoteOnUserRow, 'userId' | 'assignedById' | 'role'> };
      };
      select?: RelationSelect;
    }) => {
      if (!userExists(data.authorId)) {
        throw knownError('P2003', 'Foreign key constraint violated on notes_authorId_fkey');
      }
      const { users, ...fields } = data;
      const note: NoteRow = { id: nextId++, uuid: randomUUID(), createdAt: new Date(), ...fields };
      fakeDb.notes.push(note);
      fakeDb.notesOnUsers.push({ noteId: note.id, assignedAt: new Date(), ...users.create });
      return selectRow('note', note, select);
    },
    findUnique: async ({ where, select }: { where: Where; select?: RelationSelect }) => {
      const note = fakeDb.notes.find((n) => matches(n, where));
      return note ? selectRow('note', note, select) : null;
    },
  },

  noteOnUser: {
    findMany: async ({ where, select }: { where: Where; select?: RelationSelect }) =>
      fakeDb.notesOnUsers
        .filter((link) => matches(link, where))
        .map((link) => selectRow('noteOnUser', link, select)),
    create: async ({
      data,
      select,
    }: {
      data: Pick<NoteOnUserRow, 'noteId' | 'userId' | 'assignedById'> & { role?: Role };
      select?: RelationSelect;
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
      return selectRow('noteOnUser', row, select);
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
