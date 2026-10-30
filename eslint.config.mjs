// @ts-check
// Flat ESLint config for the BMI Stooring System monorepo (ESLint v9+).
// TypeScript-aware, Prettier-friendly. Per-workspace configs (apps/*, packages/*)
// extend this base and add framework plugins (Nest, Next, React Native) in their tasks.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    // Nothing here is linted directly at the root today; workspaces own their source.
    // These globs keep ESLint from walking build output or vendored artifacts.
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '**/.next/**',
      '**/.turbo/**',
      '**/.expo/**',
      '**/out/**',
      '.kiro/**',
      '.husky/**',
      'Design Artifact/**',
      'db/**',
      'docs/**',
      'infra/**',
      'pnpm-lock.yaml',
      // Root config files are CommonJS / tool-authored and not part of app source.
      '*.config.cjs',
      '*.config.mjs',
      '*.config.js',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx,mts,cts}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always'],
    },
  },
  {
    // NestJS (apps/api) DI relies on reflected decorator metadata
    // (`emitDecoratorMetadata`): a constructor parameter's type must be a *value*
    // import so `design:paramtypes` is emitted. `consistent-type-imports` would
    // rewrite those to `import type` and erase the metadata, breaking DI — so it
    // is disabled for API source only. Every other rule still applies.
    files: ['apps/api/**/*.ts'],
    rules: {
      '@typescript-eslint/consistent-type-imports': 'off',
    },
  },
  // Keep ESLint and Prettier from fighting over formatting — must be last.
  prettier,
);
