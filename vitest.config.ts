import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // src/config/env.ts throws on import if any of these are missing.
    env: {
      NODE_ENV: 'test',
      PORT: '3000',
      CORS_ORIGIN: 'http://localhost:3000',
      JWT_SECRET: 'test-secret',
      JWT_REFRESH_SECRET: 'test-refresh-secret',
      JWT_REFRESH_HASH_SECRET: 'test-refresh-hash-secret',
      JWT_ACCESS_TOKEN_EXPIRES_IN_MINUTES: '5',
      JWT_REFRESH_TOKEN_EXPIRES_IN_DAYS: '7',
      DATABASE_USER: 'test',
      DATABASE_PASSWORD: 'test',
      DATABASE_NAME: 'test',
      DATABASE_HOST: 'localhost',
      DATABASE_PORT: '3306',
      SHADOW_DATABASE_NAME: 'test_shadow',
    },
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // Generated code (Prisma client, tsoa routes) and the tests themselves.
      exclude: ['src/generated/**', 'src/routes/**', 'src/__test__/**'],
      reporter: ['text', 'html'],
      reportsDirectory: './coverage',
    },
  },
});
