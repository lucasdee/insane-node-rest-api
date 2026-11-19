import type { env } from './env';

/**
 * A mysql:// connection URL for the Prisma CLI (see prisma.config.ts). User and password
 * are encoded so that characters such as @ : / # % in them can't break the URL.
 */
export const databaseUrl = (db: typeof env.db, name: string): string =>
  `mysql://${encodeURIComponent(db.user)}:${encodeURIComponent(db.password)}` +
  `@${db.host}:${db.port}/${name}`;
