import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Provide an inline tsconfig so esbuild does not try to resolve the workspace
  // tsconfig `extends` chain (tsconfck fails on paths containing spaces). Tests are
  // plain ES modules; no special compiler options are needed to run them.
  esbuild: {
    tsconfigRaw: {
      compilerOptions: {
        target: 'es2022',
        useDefineForClassFields: true,
      },
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
