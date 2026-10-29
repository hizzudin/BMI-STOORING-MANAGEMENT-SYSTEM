# BMI Stooring System

Fleet maintenance / work-order ("stooring") management system for BMI. A monorepo
containing the backend API, the web console, the mobile field app, and the shared
packages that tie them together.

> The authoritative references for this project are `PRD.md`, `PRODUCT.md`, and
> `DESIGN.md` at the repo root, plus the spec files in
> `.kiro/specs/bmi-stooring-system/` (`requirements.md`, `design.md`, `tasks.md`).
> All work is governed by those documents.

## Monorepo layout

```
BMI Stooring System/
├─ apps/
│  ├─ api/        # NestJS API — modules per functional group, state machines, DataGateway
│  ├─ web/        # Next.js (App Router) web console
│  └─ mobile/     # Expo React Native (Android) field app
├─ packages/
│  ├─ shared/        # types, DTOs, branded IDs, design tokens, enums
│  ├─ data-gateway/  # DataGateway interface + dummy / postgres implementations
│  └─ config/        # numbering, money, time, format helpers (NFR-14..16)
├─ db/      # migrations (PRD §9 schema) + seed data
├─ docs/    # OpenAPI + generated docs
└─ infra/   # Docker Compose (dev/setup) + Cloud Run / Cloud SQL IaC (go-live)
```

Tooling: [pnpm](https://pnpm.io) workspaces + [Turborepo](https://turbo.build) for
task orchestration.

## Implementation phases

The product owner defined three phases (see `tasks.md`):

1. **Phase 1 — Dev (local MVP, dummy database).** Prove the system works end-to-end
   against the in-memory `DataGateway`; no real DB, no cloud.
2. **Phase 2 — Setup (P0 complete, real schema, test & debug).** All P0 requirements
   finished against a real local/staging PostgreSQL; integration tests, debugging, UAT.
3. **Phase 3 — Go live (deploy-ready).** Production DB (Cloud SQL), backup/restore
   drill, full stack deployed; fixes only.

## Quickstart

```bash
pnpm install          # resolve the workspace
pnpm -w run build     # build all packages (currently no-op placeholders)
```

Other workspace scripts delegate to Turborepo:

```bash
pnpm -w run lint
pnpm -w run test
pnpm -w run dev
```

## Status

Phase 0 scaffold. The workspace packages are placeholders; real framework setup
(NestJS, Next.js, Expo) and the cross-cutting `packages/config` / `packages/shared`
/ `packages/data-gateway` implementations land in later tasks (TASK-003, TASK-101+).
