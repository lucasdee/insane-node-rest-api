import { defineConfig } from 'prisma/config';
import { env } from './src/config/env';
import { databaseUrl } from './src/config/databaseUrl';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: databaseUrl(env.db, env.db.name),
    // Used by `prisma migrate dev` to detect schema drift.
    shadowDatabaseUrl: databaseUrl(env.db, env.db.shadowName),
  },
});
