import { randomUUID } from 'crypto';
import { Prisma } from '../../generated/prisma/client';

/**
 * In-memory stand-in for the Prisma client, covering only the queries the
 * repositories make. It mirrors the Prisma behaviour the app relies on:
 * - `select` returns only the selected fields, including nested relation selects
 * - without `select`, user.password is omitted (the global `omit` in config/db)
 * - unique violations throw P2002, missing foreign keys throw P2003, failed connects P2025
 * - `where` can filter on relations (`some`, nested to-one filters), `in` and `AND`
 * - `_count` in a select counts related rows, optionally filtered by `where`
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

export type MemoRow = {
  id: number;
  uuid: string;
  title: string;
  content: string;
  authorId: number;
  createdAt: Date;
};

export type MemoOnUserRow = {
  memoId: number;
  userId: number;
  assignedById: number;
  assignedAt: Date;
  role: Role;
};

export type TagRow = {
  id: number;
  name: string;
};

export type MemoOnTagRow = {
  memoId: number;
  tagId: number;
};

type Where = Record<string, unknown>;
type Select = Record<string, boolean | undefined>;
/**
 * A select that may also pick fields of related rows, `{ author: { select: { uuid: true } } }`,
 * or count them, `{ _count: { select: { memos: { where: {...} } } } }`.
 */
type RelationSelect = {
  [key: string]: boolean | { select?: RelationSelect; where?: Where } | undefined;
};

export const fakeDb = {
  users: [] as UserRow[],
  refreshTokens: [] as RefreshTokenRow[],
  memos: [] as MemoRow[],
  memosOnUsers: [] as MemoOnUserRow[],
  tags: [] as TagRow[],
  memosOnTags: [] as MemoOnTagRow[],
};

let nextId = 1;

export const resetFakeDb = () => {
  fakeDb.users.length = 0;
  fakeDb.refreshTokens.length = 0;
  fakeDb.memos.length = 0;
  fakeDb.memosOnUsers.length = 0;
  fakeDb.tags.length = 0;
  fakeDb.memosOnTags.length = 0;
  nextId = 1;
};

const knownError = (code: string, message: string) =>
  new Prisma.PrismaClientKnownRequestError(message, { code, clientVersion: 'fake' });

/**
 * Whether a row satisfies a Prisma `where`. Pass the row's model to allow filters
 * on its relations: `{ memo: {...} }` for a to-one, `{ tags: { some: {...} } }` for
 * a to-many.
 */
const matches = (row: object, where: Where = {}, model?: Model): boolean =>
  Object.entries(where).every(([key, condition]) => {
    if (key === 'AND') {
      return (condition as Where[]).every((w) => matches(row, w, model));
    }
    if (model && relations[model][key]) {
      const { model: relModel, related } = resolveRelation(model, row, key);
      const filter = condition as Where;
      if (Array.isArray(related)) {
        if (!('some' in filter)) throw new Error(`fake-prisma: unsupported filter on ${key}`);
        return related.some((r) => matches(r, filter.some as Where, relModel));
      }
      return related !== undefined && matches(related, filter, relModel);
    }
    const value = (row as Record<string, unknown>)[key];
    if (condition && typeof condition === 'object' && 'lt' in condition) {
      return (value as Date) < (condition as { lt: Date }).lt;
    }
    if (condition && typeof condition === 'object' && 'in' in condition) {
      return (condition as { in: unknown[] }).in.includes(value);
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

type Model = 'user' | 'memo' | 'memoOnUser' | 'tag' | 'memoOnTag';

/** How each relation field resolves: the related model and its row(s). */
const relations: Record<
  Model,
  Record<string, { model: Model; resolve: (row: never) => object | object[] | undefined }>
> = {
  user: {},
  memo: {
    author: {
      model: 'user',
      resolve: (n: MemoRow) => fakeDb.users.find((u) => u.id === n.authorId),
    },
    users: {
      model: 'memoOnUser',
      resolve: (n: MemoRow) => fakeDb.memosOnUsers.filter((l) => l.memoId === n.id),
    },
    tags: {
      model: 'memoOnTag',
      resolve: (n: MemoRow) => fakeDb.memosOnTags.filter((l) => l.memoId === n.id),
    },
  },
  memoOnUser: {
    memo: {
      model: 'memo',
      resolve: (l: MemoOnUserRow) => fakeDb.memos.find((n) => n.id === l.memoId),
    },
    user: {
      model: 'user',
      resolve: (l: MemoOnUserRow) => fakeDb.users.find((u) => u.id === l.userId),
    },
    assignedBy: {
      model: 'user',
      resolve: (l: MemoOnUserRow) => fakeDb.users.find((u) => u.id === l.assignedById),
    },
  },
  tag: {
    memos: {
      model: 'memoOnTag',
      resolve: (t: TagRow) => fakeDb.memosOnTags.filter((l) => l.tagId === t.id),
    },
  },
  memoOnTag: {
    memo: {
      model: 'memo',
      resolve: (l: MemoOnTagRow) => fakeDb.memos.find((n) => n.id === l.memoId),
    },
    tag: {
      model: 'tag',
      resolve: (l: MemoOnTagRow) => fakeDb.tags.find((t) => t.id === l.tagId),
    },
  },
};

/** Resolves a relation of `row`, failing loudly if the fake doesn't know it. */
const resolveRelation = (model: Model, row: object, key: string) => {
  const relation = relations[model][key];
  if (!relation) throw new Error(`fake-prisma: unknown relation ${model}.${key}`);
  return { model: relation.model, related: relation.resolve(row as never) };
};

/** `_count: { select: { rel: true | { where } } }`: the number of matching related rows. */
const countRelations = (model: Model, row: object, select: RelationSelect) =>
  Object.fromEntries(
    Object.entries(select).map(([key, value]) => {
      const { model: relModel, related } = resolveRelation(model, row, key);
      const where = value && typeof value === 'object' ? value.where : undefined;
      return [key, (related as object[]).filter((r) => matches(r, where, relModel)).length];
    }),
  );

/** Applies a select, following relations like Prisma does. Without one, returns a copy. */
const selectRow = (model: Model, row: object, select?: RelationSelect): Record<string, unknown> => {
  if (!select) return { ...row };
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(select)) {
    if (value === true) {
      result[key] = (row as Record<string, unknown>)[key];
    } else if (key === '_count' && value && typeof value === 'object') {
      result[key] = countRelations(model, row, value.select ?? {});
    } else if (value && typeof value === 'object') {
      const { model: relModel, related } = resolveRelation(model, row, key);
      result[key] = Array.isArray(related)
        ? related
            .filter((r) => matches(r, value.where, relModel))
            .map((r) => selectRow(relModel, r, value.select))
        : related && selectRow(relModel, related, value.select);
    }
  }
  return result;
};

type TagConnects = { tag: { connect: { name: string } } }[];

/** Links a memo to existing tags by name, like a nested `tags: { create: [...] }`. */
const linkTags = (memoId: number, creates: TagConnects = []) => {
  const tagIds = creates.map(({ tag }) => {
    const row = fakeDb.tags.find((t) => t.name === tag.connect.name);
    if (!row) throw knownError('P2025', `No Tag found to connect: ${tag.connect.name}`);
    return row.id;
  });
  for (const tagId of tagIds) {
    if (fakeDb.memosOnTags.some((l) => l.memoId === memoId && l.tagId === tagId)) {
      throw knownError('P2002', 'Unique constraint failed on memos_on_tags PRIMARY');
    }
    fakeDb.memosOnTags.push({ memoId, tagId });
  }
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

  memo: {
    create: async ({
      data,
      select,
    }: {
      data: Pick<MemoRow, 'title' | 'content' | 'authorId'> & {
        users: { create: Pick<MemoOnUserRow, 'userId' | 'assignedById' | 'role'> };
        tags?: { create: TagConnects };
      };
      select?: RelationSelect;
    }) => {
      if (!userExists(data.authorId)) {
        throw knownError('P2003', 'Foreign key constraint violated on memos_authorId_fkey');
      }
      const { users, tags, ...fields } = data;
      const memo: MemoRow = { id: nextId++, uuid: randomUUID(), createdAt: new Date(), ...fields };
      fakeDb.memos.push(memo);
      fakeDb.memosOnUsers.push({ memoId: memo.id, assignedAt: new Date(), ...users.create });
      linkTags(memo.id, tags?.create);
      return selectRow('memo', memo, select);
    },
    findUnique: async ({ where, select }: { where: Where; select?: RelationSelect }) => {
      const memo = fakeDb.memos.find((n) => matches(n, where));
      return memo ? selectRow('memo', memo, select) : null;
    },
    /** Supports replacing tags only: `data: { tags: { deleteMany: {}, create: [...] } }`. */
    update: async ({
      where,
      data,
      select,
    }: {
      where: Where;
      data: { tags: { deleteMany: Record<string, never>; create: TagConnects } };
      select?: RelationSelect;
    }) => {
      const memo = fakeDb.memos.find((n) => matches(n, where));
      if (!memo) throw knownError('P2025', 'No Memo found to update');
      deleteWhere(fakeDb.memosOnTags, { memoId: memo.id });
      linkTags(memo.id, data.tags.create);
      return selectRow('memo', memo, select);
    },
  },

  tag: {
    createMany: async ({
      data,
      skipDuplicates,
    }: {
      data: Pick<TagRow, 'name'>[];
      skipDuplicates?: boolean;
    }) => {
      let count = 0;
      for (const { name } of data) {
        if (fakeDb.tags.some((t) => t.name === name)) {
          if (skipDuplicates) continue;
          throw knownError('P2002', 'Unique constraint failed on tags_name_key');
        }
        fakeDb.tags.push({ id: nextId++, name });
        count++;
      }
      return { count };
    },
    findMany: async ({ where, select }: { where: Where; select?: RelationSelect }) =>
      fakeDb.tags
        .filter((tag) => matches(tag, where, 'tag'))
        .map((tag) => selectRow('tag', tag, select)),
  },

  memoOnUser: {
    findMany: async ({ where, select }: { where: Where; select?: RelationSelect }) =>
      fakeDb.memosOnUsers
        .filter((link) => matches(link, where, 'memoOnUser'))
        .map((link) => selectRow('memoOnUser', link, select)),
    create: async ({
      data,
      select,
    }: {
      data: Pick<MemoOnUserRow, 'memoId' | 'userId' | 'assignedById'> & { role?: Role };
      select?: RelationSelect;
    }) => {
      if (fakeDb.memosOnUsers.some((l) => l.memoId === data.memoId && l.userId === data.userId)) {
        throw knownError('P2002', 'Unique constraint failed on memos_on_users PRIMARY');
      }
      if (
        !fakeDb.memos.some((n) => n.id === data.memoId) ||
        !userExists(data.userId) ||
        !userExists(data.assignedById)
      ) {
        throw knownError('P2003', 'Foreign key constraint violated on memos_on_users_fkey');
      }
      const row: MemoOnUserRow = { role: 'USER', assignedAt: new Date(), ...data };
      fakeDb.memosOnUsers.push(row);
      return selectRow('memoOnUser', row, select);
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
