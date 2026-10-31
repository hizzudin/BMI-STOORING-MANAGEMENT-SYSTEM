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
    // The e2e suites boot the full NestJS app per test; under load a single
    // app-boot + several sequential HTTP round-trips can exceed vitest's 5s
    // default, which surfaces as flaky `timed out` / cascading `undefined`
    // failures unrelated to the code under test. Give every test and hook ample
    // headroom (the assertions and logic are unchanged).
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
