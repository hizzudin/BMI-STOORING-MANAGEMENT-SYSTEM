import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

/**
 * Vitest config for the web package. Component/logic tests run in a jsdom
 * environment with React Testing Library; the `@/` alias mirrors tsconfig.
 */
export default defineConfig({
  // Use the automatic JSX runtime so test/component TSX needs no `import React`.
  esbuild: {
    jsx: 'automatic',
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    css: false,
  },
});
