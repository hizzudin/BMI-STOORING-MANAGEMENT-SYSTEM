import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * Unit + property-style tests for the mobile app's **pure logic** (API client,
 * role routing, breakdown / FC-draft validation, mechanic today-list ordering).
 * These run with the monorepo's existing Vitest toolchain and need no Expo /
 * React Native install, so `pnpm -w run test` stays green offline. The React
 * Native screens are verified by the Expo toolchain (typecheck:app) when the
 * native deps are installed.
 */
export default defineConfig({
  resolve: {
    alias: {
      // Resolve the read-only shared package to its built output so the logic
      // tests run even when the mobile workspace's node_modules is not installed
      // (keeps `pnpm -w run test` green offline without a lockfile-mutating
      // install). The real Expo build resolves `@bmi/shared` via the workspace.
      '@bmi/shared': fileURLToPath(new URL('../../packages/shared/dist/index.js', import.meta.url)),
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    globals: false,
  },
});
