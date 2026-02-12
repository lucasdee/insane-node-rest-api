import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default [
  {
    ignores: ['dist', 'vitest.config.ts', 'prisma.config.ts', 'src/generated'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: ['./tsconfig.json', './tests/tsconfig.json'],
      },
    },
    rules: {
      'no-console': 'off',
      'no-explicit-any': 'off',
    },
  },
  prettier,
];
