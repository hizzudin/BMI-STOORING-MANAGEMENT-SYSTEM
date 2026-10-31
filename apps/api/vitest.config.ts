import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// NestJS DI relies on reflected decorator metadata. esbuild (vitest's default
// transform) does not emit `design:paramtypes`, so we transform with SWC which
// does — the approach NestJS documents for running its tests under vitest.
export default defineConfig({
  plugins: [
    swc.vite({
      module: { type: 'es6' },
      jsc: {
        target: 'es2022',
        parser: { syntax: 'typescript', decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
      },
    }),
  ],
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    root: './',
    // The e2e suites boot the full NestJS app per FILE (beforeAll), not per
    // test, and each file is self-contained: it builds its own app and resets
    // its own in-memory state in beforeEach. There is no shared mutable state
    // across files, so files are run concurrently across forked workers with
    // isolation disabled — this is the single biggest speed-up and changes NO
    // test assertion or behaviour.
    pool: 'forks',
    isolate: false,
    fileParallelism: true,
    poolOptions: {
      forks: {
        // One worker per logical core; each worker pays the SWC transform cost
        // once and then runs several test files in-process.
        minForks: 1,
        maxForks: 4,
      },
    },
    // A full app-boot plus several sequential HTTP round-trips can exceed
    // vitest's 5s default under load; give every test and hook headroom. The
    // assertions and logic are unchanged.
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
