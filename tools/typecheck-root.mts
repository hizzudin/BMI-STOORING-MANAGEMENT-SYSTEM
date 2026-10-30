/**
 * Root-level TypeScript anchor for `tsc -p tsconfig.json --noEmit`.
 *
 * The monorepo's real type-checking lives per workspace (apps/*, packages/*) and is
 * driven by `turbo run typecheck`. This file gives the root `tsconfig.json` at least
 * one input so the strict base config is exercised on every `pnpm typecheck` run
 * (and in the husky pre-commit hook) even before any app/package has TypeScript source.
 *
 * Replace or extend `tools/` with real build/CI scripts as the monorepo grows.
 */
export const ROOT_TSCONFIG_ANCHOR = 'bmi-stooring-system' as const;
