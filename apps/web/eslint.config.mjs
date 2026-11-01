// @ts-check
// Web-package ESLint flat config (TASK-117): a focused accessibility pass over
// the App Router TSX using eslint-plugin-jsx-a11y's recommended ruleset
// (WCAG-aligned static checks, NFR-A11Y). Correctness/type linting for the web
// source is covered by the repo-root `pnpm lint` (eslint apps packages) and by
// `pnpm --filter @bmi/web typecheck`; this config is the lightweight a11y scan
// the task's Verify step calls for. Run via `pnpm --filter @bmi/web lint:eslint`.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: ['**/node_modules/**', '.next/**', 'dist/**', 'coverage/**', '*.config.*'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.tsx'],
    plugins: { 'jsx-a11y': jsxA11y },
    rules: {
      ...jsxA11y.flatConfigs.recommended.rules,
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      // Match the repo-root conventions so this pass does not contradict it.
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always'],
    },
  },
  prettier,
);
