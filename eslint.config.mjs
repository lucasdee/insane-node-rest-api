import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default [
  {
    // Build output, generated code (Prisma client, API types) and coverage reports.
    ignores: [
      'dist',
      'coverage',
      'generated',
      'src/generated',
      'vitest.config.ts',
      'prisma.config.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: ['./tsconfig.main.json'],
      },
    },
    rules: {
      'no-console': 'off',
      'no-explicit-any': 'off',
    },
  },
  prettier,
];
