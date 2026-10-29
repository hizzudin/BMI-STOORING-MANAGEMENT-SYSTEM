# tasks.md
> BMI Stooring System — Version 1.0 — 2026-10-30

## Legend
- [ ] Not started · [~] In progress · [x] Complete · [!] Blocked (reason inline)

## How to use this plan
- Governed by `requirements.md` and `design.md` (this folder) and the authoritative root `PRD.md`.
- **Three implementation phases** (as the product owner defined them):
  - **Phase 1 — Dev (local MVP, dummy database).** Prove the system works end-to-end against the in-memory `DataGateway`; no real DB, no cloud.
  - **Phase 2 — Setup (P0 complete, real schema, test & debug).** All P0 requirements finished against a real local/staging PostgreSQL; integration tests, debugging and UAT; minor adjustments still allowed.
  - **Phase 3 — Go live (deploy-ready).** Production DB (Cloud SQL), backups/restore drill, full stack deployed and perfectly working; fixes only.
- **Skills**: each task names the `.kiro/skills/` skill to load before doing it (e.g. _Skill_: `typescript-pro`). Load the skill, then do the task.
- **Git discipline (every task)**: work on a short-lived branch `type/phaseN-taskNNN-slug`, commit with a Conventional-Commit message referencing the TASK and REQ IDs, then open/merge a PR to `develop` (Phase 1–2) or `main` (Phase 3). The explicit `git` steps are written into each task's _Git_ line. Never commit secrets; `db/seed` dummy data only.
- **Task-closing protocol (spec-driven-development skill)**: before marking `[x]`, run _Verify_; if the implementation diverged from `design.md`, update `design.md` first, then close. Record the session in `CONTEXT.md`.

---

## Phase 0: Repository & spec foundation (precedes all)
*Goal*: a version-controlled monorepo skeleton and the AI/spec guardrails, so every later task is documented in git.

- [-] **TASK-001** [NFR-SECURITY, DEC-66]: Initialize git and the monorepo skeleton (pnpm + turbo workspaces: `apps/api`, `apps/web`, `apps/mobile`, `packages/shared`, `packages/data-gateway`, `packages/config`, `db`, `docs`, `infra`), with `.gitignore` (node_modules, .env, build output, R2 keys), `.editorconfig`, and root `README.md`.
  - _Skill_: `spec-driven-development`, `typescript-pro`.
  - _Output_: repo tree per design.md "File Structure"; `pnpm install` resolves.
  - _Verify_: `git status` clean after commit; `pnpm -w run build` runs (even if no-op); `.env` is git-ignored.
  - _Git_: `git init` → `git checkout -b chore/phase0-task001-scaffold` → `git add` named files → `git commit -m "chore(repo): scaffold monorepo [TASK-001]"` → create `develop` and `main` branches → push with `-u`.
- [ ] **TASK-002** [all]: Generate `CLAUDE.md` (AI constitution) and `CONTEXT.md` (session journal) from the SDD templates; add tooling config (tsconfig base, eslint, prettier, commitlint + Conventional Commits, husky pre-commit running lint+typecheck).
  - _Skill_: `spec-driven-development`, `typescript-pro`.
  - _Output_: `CLAUDE.md`, `CONTEXT.md`, lint/format/commit hooks.
  - _Verify_: a deliberate bad commit message is rejected by commitlint; `pnpm lint` passes on the skeleton.
  - _Git_: branch `chore/phase0-task002-tooling` → commit `chore(tooling): CLAUDE.md, CONTEXT.md, lint/commit hooks [TASK-002]` → PR to `develop`.
- [ ] **TASK-003** [NFR-FORMAT, NFR-TIME, NFR-NUMBERING, NFR-MONEY]: Build `packages/config` cross-cutting helpers: Indonesian number/date/time formatting (NFR-09), UTC↔WIB and WIB-day helpers (NFR-14), never-reused running-number generator with configurable formats (NFR-15), money rounding half-up (NFR-16).
  - _Skill_: `typescript-pro`, `test-master`.
  - _Output_: `packages/config` with unit tests.
  - _Verify_: unit tests assert `48.210 km`, `Rp 1.240.000`, `2,4 mm`, WIB-day boundaries, and AC-BIL-005 rounding.
  - _Git_: `feat(config): format/time/number/money helpers [TASK-003]`.

---

## Phase 1 — Dev (local MVP, dummy database)
*Goal*: Every functional group works end-to-end locally against the in-memory `DataGateway`, so the team can click through each flow and confirm the state machines behave — with no real database and no cloud. Exit criterion: each FG's happy-path + key `AC-*` run green against dummy data, and the web/mobile shells render the core flows.

- [ ] **TASK-101** [FG-1..FG-18, PR-6]: Define `packages/shared` domain types, DTOs, branded IDs and the enums/discriminated unions for every state machine (SM-WO, SM-STEP, SM-VEH, SM-DOC, SM-TYRE, SM-GR/SA/TR/RD/CR/SCH/INV/TC) from PRD §3.
  - _Skill_: `typescript-pro`.
  - _Output_: shared types; a `transition()` helper per machine that refuses unlisted transitions.
  - _Verify_: unit tests reject every transition not in the PRD §3 tables.
  - _Git_: `feat(shared): domain types + state-machine guards [TASK-101]`.
- [ ] **TASK-102** [NFR-INTEGRITY, NFR-CONCURRENCY]: Define the `DataGateway` interface in `packages/data-gateway` (repository per aggregate, transactional `unitOfWork`, optimistic `version`) and an **in-memory dummy implementation** seeded with the PRD's example data (WO-0142, B 1234 ABC, tyres TY-01xx, etc.).
  - _Skill_: `typescript-pro`, `fullstack-guardian`.
  - _Output_: `DataGateway` + `DummyDataGateway` + seed.
  - _Verify_: a unit-of-work test proves all-or-nothing writes; a concurrent-save test rejects the stale `version`.
  - _Git_: `feat(data-gateway): interface + dummy impl + seed [TASK-102]`.
- [ ] **TASK-103** [NFR-SECURITY, DEC-66]: Scaffold the NestJS API with module-per-functional-group, dependency-injected `DataGateway` (bound to dummy in dev), a global role-guard reading the PRD §2.2 matrix, request validation, idempotency middleware and an audit interceptor (writes to the dummy `audit_logs`).
  - _Skill_: `nestjs-expert`, `api-designer`, `fullstack-guardian`, `typescript-pro`.
  - _Output_: running API; `/health`; guard+audit cross-cutting.
  - _Verify_: an unauthorized role is refused with a server-side 403 in a test; every mutating call writes an audit record.
  - _Git_: `feat(api): Nest scaffold, role guard, audit, idempotency [TASK-103]`.
- [ ] **TASK-104** [FG-13, REQ-IAM, NFR-AUTH, §7.11 DQ-02]: IAM module — login, first-sign-in change, lockout, sessions (web 30 min idle / mobile 30 d), email password reset (DQ-02), one-role-per-user and one-System-Admin invariants (BR-14), permission-matrix read, Planner-approval switch, audit log.
  - _Skill_: `nestjs-expert`, `fullstack-guardian`, `security-reviewer`, `typescript-pro`.
  - _Output_: auth + accounts endpoints against dummy data.
  - _Verify_: AC-IAM-001..007 pass against dummy; NFR-AUTH five rules tested.
  - _Git_: `feat(iam): auth, accounts, permissions, audit [TASK-104]`.
- [ ] **TASK-105** [FG-14, REQ-SETUP, ASM-64]: Setup mode & Go-live switch — only System Admin + Access Manager sign in, no approvals, bulk import (Setup-mode only), opening balance, one-way Go-live flag.
  - _Skill_: `nestjs-expert`, `fullstack-guardian`, `typescript-pro`.
  - _Output_: Setup-mode gating + Go-live endpoint against dummy.
  - _Verify_: AC-IAM-006, AC-INV-006; a non-admin login is refused while in Setup mode.
  - _Git_: `feat(setup): setup mode, bulk import, go-live switch [TASK-105]`.
- [ ] **TASK-106** [FG-7, REQ-VEH, REQ-DOC, SM-VEH, SM-DOC]: Vehicles, classes, chassis layouts, documents (first entry/correction/renewal, status machine) and odometer (manual/driver, void, jump warning).
  - _Skill_: `nestjs-expert`, `fullstack-guardian`, `typescript-pro`.
  - _Output_: VEH/DOC endpoints + derived vehicle status.
  - _Verify_: AC-VEH-001..004, AC-DOC-001..006; SM-VEH precedence and SM-DOC transitions.
  - _Git_: `feat(vehicles): vehicles, documents, odometer [TASK-106]`.
- [ ] **TASK-107** [FG-3, REQ-REG, PR-6, DEC-85, DEC-88]: Module registry (6 modules), step composer data model, WO presets (versioned), PM packages; live composer checks (REQ-REG-004); no module hard-coded.
  - _Skill_: `nestjs-expert`, `typescript-pro`, `fullstack-guardian`.
  - _Output_: registry + preset + composer-check services.
  - _Verify_: AC-REG-001..005; adding a 7th dummy module appears in the designer with no engine edit.
  - _Git_: `feat(registry): modules, presets, composer checks [TASK-107]`.
- [ ] **TASK-108** [FG-1, FG-2, REQ-WO, REQ-ENG, SM-WO, SM-STEP, DEC-87]: WO lifecycle + assignment engine — create/submit/approve/reject/cancel/amend; step open-on-submit, claim/assign/reassign/release, Start/Pause/Resume time events, verify/return, completion gate. Four-eyes (BR-03), scope lock (BR-02).
  - _Skill_: `nestjs-expert`, `fullstack-guardian`, `typescript-pro`.
  - _Output_: WO + engine endpoints against dummy.
  - _Verify_: AC-WO-001..006, AC-ENG-001..009; every SM-WO/SM-STEP transition.
  - _Git_: `feat(wo): lifecycle + assignment engine + timing [TASK-108]`.
- [ ] **TASK-109** [FG-4, REQ-STK, REQ-PUR, BR-01, BR-06, DEC-60]: Stock step (atomic goods issue + stock card + moving-average cost; shortfall; verified reversal) and Part Purchase step (typed qty/price, totals, receipt photo, no stock change).
  - _Skill_: `nestjs-expert`, `fullstack-guardian`, `typescript-pro`.
  - _Output_: STK/PUR submit handlers against dummy (transaction simulated in unit-of-work).
  - _Verify_: AC-STK-001..006, AC-PUR-001..006.
  - _Git_: `feat(stock): stock step + part purchase [TASK-109]`.
- [ ] **TASK-110** [FG-5, REQ-MEC, REQ-CHK, DEC-52, DEC-88, DEC-89]: Mechanic Action (internal/external, labor, photos), Part Check (Good/Repair/Replace → follow-up Draft WO on verify), one-time position capture at submit, stooring fee once per WO/region/day.
  - _Skill_: `nestjs-expert`, `fullstack-guardian`, `typescript-pro`.
  - _Output_: MEC/CHK handlers + stooring calc.
  - _Verify_: AC-MEC-001..005, AC-CHK-001..004.
  - _Git_: `feat(mechanic): mechanic action, part check, stooring [TASK-110]`.
- [ ] **TASK-111** [FG-6, REQ-PLC, BR-11, SM-TYRE, DEC-68, DEC-73]: Part Replacement + data-generated chassis map (replace/rotate/demount within scope lock), placement history, trailer/spare layouts, placement snapshot.
  - _Skill_: `nestjs-expert`, `fullstack-guardian`, `typescript-pro`.
  - _Output_: PLC endpoints + map model.
  - _Verify_: AC-PLC-001..010 (incl. generated 1–6 axle layouts).
  - _Git_: `feat(placement): part replacement + chassis map [TASK-111]`.
- [ ] **TASK-112** [FG-8, REQ-BSL, REQ-INV, REQ-TYR, BR-06, BR-11]: Parts baseline, parts catalog, Goods Receipts & corrections, stock card, stock opname (approval), and tyres end-to-end (receive/issue/mount/rotate/demount/retread/worn-out/scrap/count) with codes/events.
  - _Skill_: `nestjs-expert`, `fullstack-guardian`, `postgres-pro`, `typescript-pro`.
  - _Output_: BSL/INV/TYR endpoints against dummy.
  - _Verify_: AC-BSL-001..005, AC-INV-001..005, AC-TYR-001..007.
  - _Git_: `feat(inventory): baseline, parts, tyres, opname [TASK-112]`.
- [ ] **TASK-113** [FG-9, FG-10, REQ-CR, REQ-APR, SM-CR, DQ-07]: Change requests & amendments (executor raises, WO creator decides) and approvals inbox (creation/amendment/completion/warehouse counts) with part-age/early-failure on review.
  - _Skill_: `nestjs-expert`, `fullstack-guardian`, `typescript-pro`.
  - _Output_: CR/APR endpoints.
  - _Verify_: AC-CR-001..005, AC-APR-001..005.
  - _Git_: `feat(approvals): change requests + approvals inbox [TASK-113]`.
- [ ] **TASK-114** [FG-12, REQ-PM, REQ-SCH, REQ-NTF, REQ-DSH, SM-SCH, DEC-86]: PM/alert engine (alert rules → draft WO), maintenance schedule (plan-only), in-app notifications, role dashboards (data), simulated daily job.
  - _Skill_: `nestjs-expert`, `fullstack-guardian`, `typescript-pro`.
  - _Output_: PM/SCH/NTF/DSH endpoints + a runnable daily-job function.
  - _Verify_: AC-PM-001..003, AC-SCH-001..004; daily job idempotent on re-run.
  - _Git_: `feat(pm): alerts, schedule, notifications, dashboards [TASK-114]`.
- [ ] **TASK-115** [FG-11, REQ-WOD, REQ-BIL, SM-INV, BR-15]: WO document renderer (approval block, execution-time table, B/W placement snapshot) and invoices (daily per vehicle, markup/PPN, numbering, Draft→Issued→Paid→Void).
  - _Skill_: `nestjs-expert`, `fullstack-guardian`, `typescript-pro`, `code-documenter`.
  - _Output_: WO-doc + invoice services; PDF generation stub.
  - _Verify_: AC-WOD-008, AC-BIL-001..005 (arithmetic exact per NFR-MONEY).
  - _Git_: `feat(billing): WO document + invoices [TASK-115]`.
- [ ] **TASK-116** [FG-16, REQ-FUP, NFR-FILES]: File upload pipeline against a **local/dummy object store** (device-side compress stub, signed-link issue, server re-check/compress worker, three states, append-only).
  - _Skill_: `nestjs-expert`, `fullstack-guardian`, `typescript-pro`.
  - _Output_: FUP endpoints + worker against a local store.
  - _Verify_: AC-FUP-001..006 (an MP4 renamed .jpg is rejected; a 4 MB photo → <1 MB, no EXIF GPS).
  - _Git_: `feat(files): upload/compress pipeline (local) [TASK-116]`.
- [ ] **TASK-117** [FG-1..FG-14, DESIGN.md, NFR-A11Y]: Web app shell (Next.js) + core desktop flows (sign-in, dashboards, WO list/detail/create composer, step screens, approvals, inventory, vehicles) wired to the API, using `DESIGN.md` tokens. Design artifacts used as **examples only**.
  - _Skill_: `nextjs-developer`, `impeccable`, `frontend-design-direction`, `typescript-pro`.
  - _Output_: clickable web flows against dummy-backed API.
  - _Verify_: core flows navigable; status carries text; a11y scan clean on built screens.
  - _Git_: `feat(web): app shell + core WO/inventory/approval flows [TASK-117]`.
- [ ] **TASK-118** [FG-15, REQ-MOB, §7.11, NFR-A11Y]: Mobile app shell (Expo RN) + R1 field flows (MobileLogin role menu, Driver inspection/odometer/breakdown/history, Field Coordinator requests/purchase, System Admin field menu, shared MobileProfile with notification settings DQ-01) against the API.
  - _Skill_: `react-native-expert`, `impeccable`, `typescript-pro`.
  - _Output_: Android app running in Expo against dummy-backed API.
  - _Verify_: AC-MOB-001..004 happy paths; 48px targets; menu follows role.
  - _Git_: `feat(mobile): Expo shell + R1 field flows [TASK-118]`.
- [ ] **TASK-119** [all P0 FGs]: Dev-phase E2E smoke suite — one scripted end-to-end per functional group against the dummy gateway (create→approve→execute→verify→complete→invoice).
  - _Skill_: `test-master`.
  - _Output_: Playwright/API E2E smoke suite; CI job on `develop`.
  - _Verify_: all smoke E2E green; coverage report produced.
  - _Git_: `test(e2e): dev-phase smoke suite [TASK-119]` → tag `v0.1.0-dev-mvp` on `develop`.

---

## Phase 2 — Setup (P0 complete, real PostgreSQL, test & debug)
*Goal*: Swap the dummy gateway for the real PostgreSQL schema and finish every P0 requirement on a local/staging database; harden, integration-test, security-review, debug, and run UAT. Minor schema/UX adjustments allowed. Exit criterion: all P0 `AC-*` pass against real Postgres, security review clean, UAT signed off per release step (DEC-77).

- [ ] **TASK-201** [PRD §9, NFR-INTEGRITY]: Author the real PostgreSQL schema and migrations from PRD §9 (dependency order, enums, constraints, the BR-* DB guards and §9.13 circular keys), plus `db/seed` for local/staging.
  - _Skill_: `postgres-pro`, `database-optimizer`.
  - _Output_: `db/migrations/*`, applies clean on a fresh Postgres.
  - _Verify_: `migrate up` then `down` is reversible; BR-01/06/11/14 enforced by DB constraints (negative tests fail at DB level).
  - _Git_: `feat(db): PRD §9 schema + migrations [TASK-201]`.
- [ ] **TASK-202** [NFR-INTEGRITY, NFR-CONCURRENCY, DEC-66]: Implement `PostgresDataGateway` (real unit-of-work transactions, optimistic locking) and bind it in Setup config; stand up Docker Compose (Postgres + Redis + MinIO/R2-compatible).
  - _Skill_: `postgres-pro`, `nestjs-expert`, `fullstack-guardian`, `typescript-pro`.
  - _Output_: real gateway + `infra/docker-compose.yml`.
  - _Verify_: the full Phase-1 smoke suite now passes against real Postgres with zero code change in services (gateway swap only).
  - _Git_: `feat(data-gateway): postgres impl + compose [TASK-202]`.
- [ ] **TASK-203** [NFR-INTEGRITY, BR-06, BR-07]: Make every multi-table write truly transactional and idempotent on the real DB (goods issue+stock card+cost; invoice issue; cancellation reversals; tyre status writes), per PRD §9.13 and the TX-* rules.
  - _Skill_: `postgres-pro`, `debugging-wizard`, `test-master`.
  - _Output_: transactional service paths + integration tests.
  - _Verify_: forced mid-transaction failure leaves zero partial rows; replay causes no duplicate.
  - _Git_: `fix(tx): transactional integrity on real DB [TASK-203]`.
- [ ] **TASK-204** [FG-16, REQ-FUP, NFR-FILES]: Wire file upload to the S3-compatible store (MinIO locally / R2 staging): direct signed-link upload, worker finalize, expiring links, retention/IA job.
  - _Skill_: `nestjs-expert`, `fullstack-guardian`, `typescript-pro`.
  - _Output_: real object-store integration.
  - _Verify_: AC-FUP-001..006 against the real store; link expiry enforced.
  - _Git_: `feat(files): S3-compatible storage integration [TASK-204]`.
- [ ] **TASK-205** [FG-12, NFR-TIME]: Real scheduled daily job (00:30 WIB) via a worker/queue (Redis): document status, PM/part-item/tyre alerts, schedule Missed marks, Today lists — idempotent and logged.
  - _Skill_: `nestjs-expert`, `fullstack-guardian`, `typescript-pro`.
  - _Output_: scheduled worker.
  - _Verify_: running the job twice on the same day yields identical state; log entries present.
  - _Git_: `feat(jobs): scheduled daily job [TASK-205]`.
- [ ] **TASK-206** [all P0 FGs]: Complete/adjust any P0 behaviour that was stubbed in Phase 1 (PDF rendering for WO doc & invoice, push device registration, notification matrix REQ-NTF-005, export of stock card & audit log DEC-74).
  - _Skill_: `nestjs-expert`, `nextjs-developer`, `fullstack-guardian`, `code-documenter`, `typescript-pro`.
  - _Output_: all P0 endpoints production-complete on real DB.
  - _Verify_: every P0 `AC-*` passes against Postgres.
  - _Git_: `feat(p0): complete remaining P0 behaviour [TASK-206]`.
- [ ] **TASK-207** [NFR-FILES, NFR-SECURITY, DB]: Database & query hardening — indexes for the hot queries (WO lists, approvals inbox, stock card, tyre register, schedule), EXPLAIN/ANALYZE tuning, JSONB where PRD uses it.
  - _Skill_: `database-optimizer`, `postgres-pro`.
  - _Output_: index migrations + tuning notes.
  - _Verify_: p95 of the listed queries within target at NFR-CAPACITY 1× load; EXPLAIN shows index use.
  - _Git_: `perf(db): indexes + query tuning [TASK-207]`.
- [ ] **TASK-208** [all P0 FGs, AC-*]: Full integration test suite — one or more tests per `AC-*` and per state-machine transition, running against Dockerized Postgres in CI.
  - _Skill_: `test-master`.
  - _Output_: integration suite + CI gate on `develop`.
  - _Verify_: 100% of P0 `AC-*` covered and green; task-link rate 100%.
  - _Git_: `test(integration): AC + state-machine coverage [TASK-208]`.
- [ ] **TASK-209** [NFR-SECURITY, NFR-AUDIT, RSK-09]: Security review gate — run the security-reviewer audit across API+web+mobile (authz on every mutating endpoint, input validation, parameterized queries, secret handling, signed links, position-capture privacy), fix findings.
  - _Skill_: `security-reviewer`, `fullstack-guardian`.
  - _Output_: security audit report in `docs/`; findings resolved.
  - _Verify_: zero High/Critical findings; every mutating endpoint has a role-guard test.
  - _Git_: `fix(security): resolve audit findings [TASK-209]`.
- [ ] **TASK-210** [NFR-A11Y, DESIGN.md]: UI completion & polish pass for all P0 web + R1 mobile screens against `DESIGN.md` and WCAG 2.2 AA (status-as-text, 48px/44px targets, reduced-motion, bilingual-ready strings). Design artifacts remain examples only.
  - _Skill_: `nextjs-developer`, `impeccable`, `frontend-design-direction`, `react-native-expert`.
  - _Output_: all P0 screens complete and accessible.
  - _Verify_: a11y scan clean; manual sunlight/contrast and tap-target check.
  - _Git_: `feat(ui): P0 screen completion + a11y [TASK-210]`.
- [ ] **TASK-211** [all P0 FGs, NFR-INTEGRITY, NFR-SECURITY]: Systematic debugging pass on issues found in integration/UAT — triage, root-cause, fix, regression test (no incremental patching of the same failure twice).
  - _Skill_: `debugging-wizard`, `test-master`.
  - _Output_: resolved defect list in `docs/`; regression tests added.
  - _Verify_: previously failing scenarios now pass; no reopened defects.
  - _Git_: `fix(bugs): setup-phase defect resolution [TASK-211]`.
- [ ] **TASK-212** [DEC-77]: UAT on staging per Release-1 steps (product owner / System Admin), capturing minor-adjustment requests; apply approved minor adjustments (update requirements/design first if scope changes).
  - _Skill_: `spec-driven-development`, `code-documenter`.
  - _Output_: UAT sign-off notes; applied adjustments; updated specs if diverged.
  - _Verify_: UAT sign-off recorded; `CONTEXT.md` divergences cleared.
  - _Git_: `chore(uat): sign-off + minor adjustments [TASK-212]` → tag `v0.9.0-setup-complete` on `develop`.

---

## Phase 3 — Go live (deploy-ready, production DB)
*Goal*: Production deployment on Google Cloud (Jakarta) with Cloud SQL, backups/PITR and a passed restore drill, secrets in Secret Manager, R2 + Cloudflare, signed Android APK. All functionality — back end, database, web, mobile — must be perfectly working; only fixes, no new behaviour. **Blocked until Q-03 (account/domain ownership) is answered.**

- [ ] **TASK-301** [!][Q-03, DEC-67, NFR-18]: Provision production infrastructure as code — Cloud Run (API/workers/web), Cloud SQL PostgreSQL (Jakarta), Memorystore Redis, Secret Manager, Cloudflare R2 bucket + DNS/TLS/WAF. _Blocked: needs Q-03 (who owns the cloud/Cloudflare/Firebase/Expo accounts and the domain)._
  - _Skill_: `fullstack-guardian`, `postgres-pro`.
  - _Output_: `infra/` IaC; reproducible environment.
  - _Verify_: `terraform plan/apply` (or chosen IaC) creates the environment; API `/health` green on Cloud Run.
  - _Git_: `feat(infra): production IaC on GCP [TASK-301]` → PR to `main`.
- [ ] **TASK-302** [PRD §9, NFR-INTEGRITY]: Apply migrations to Cloud SQL, load master data via the Setup-mode bulk import (ASM-64), and lock the migration baseline.
  - _Skill_: `postgres-pro`, `database-optimizer`.
  - _Output_: production schema + imported master data in Setup mode.
  - _Verify_: schema matches `db/migrations`; import rejects any invalid row; DB in Setup mode.
  - _Git_: `chore(db): production migrate + master-data import [TASK-302]`.
- [ ] **TASK-303** [NFR-BACKUP]: Configure daily backup (1-year retention), 7-day PITR, the monthly audit-archive job, and **run a restore drill** before go-live.
  - _Skill_: `postgres-pro`, `database-optimizer`.
  - _Output_: backup/PITR config + a documented successful restore.
  - _Verify_: a point-in-time restore to a scratch instance succeeds; archive job exports + checksums audit rows.
  - _Git_: `chore(db): backups, PITR, restore drill [TASK-303]`.
- [ ] **TASK-304** [NFR-SECURITY, NFR-AUTH]: Production security hardening — secrets only in Secret Manager, TLS/WAF via Cloudflare, AI assistant read-only DB account, rate limits, locked CORS; re-run the security-reviewer gate on production config.
  - _Skill_: `security-reviewer`, `fullstack-guardian`.
  - _Output_: hardened prod config; second audit report.
  - _Verify_: no secrets in repo or images; audit shows zero High/Critical on prod.
  - _Git_: `fix(security): production hardening [TASK-304]`.
- [ ] **TASK-305** [NFR-PLATFORM, FG-15]: Build and sign the Android APK (Expo EAS), verify on Android 8.0+, push notifications working through the prod provider.
  - _Skill_: `react-native-expert`.
  - _Output_: signed APK + install guide.
  - _Verify_: APK installs and runs on an Android 8 device/emulator; push received.
  - _Git_: `build(mobile): signed production APK [TASK-305]`.
- [ ] **TASK-306** [all, NFR-CAPACITY]: Production CI/CD pipeline (build → test → migrate → deploy to Cloud Run), plus a 3× load test and end-to-end production smoke of every functional group.
  - _Skill_: `test-master`, `nestjs-expert`, `nextjs-developer`, `fullstack-guardian`, `debugging-wizard`.
  - _Output_: CI/CD on `main`; load + smoke reports.
  - _Verify_: pipeline deploys from `main`; p95 within target at 3× load; all FG prod-smoke green.
  - _Git_: `ci(deploy): production pipeline + load/smoke [TASK-306]`.
- [ ] **TASK-307** [DEC-77, §10 go-live steps]: Execute the Go-live checklist (go-live steps 1–8: accounts → master data → vehicles → tyres → baseline → opening balance → restore test → **Go live** switch), with final product-owner sign-off.
  - _Skill_: `spec-driven-development`, `code-documenter`.
  - _Output_: completed go-live checklist; operations runbook in `docs/`.
  - _Verify_: system flips out of Setup mode; a real WO runs create→complete→invoice in production.
  - _Git_: `chore(release): go-live checklist + runbook [TASK-307]` → tag `v1.0.0` on `main`; merge `develop`→`main`.
- [ ] **TASK-308** [all FGs, NFR-FORMAT, REQ-IAM]: Final documentation — OpenAPI published, user guides per role, admin/runbook, and a maintenance README; update `CONTEXT.md` to "released".
  - _Skill_: `code-documenter`.
  - _Output_: `docs/` complete; OpenAPI served.
  - _Verify_: docs build; every public endpoint documented; role guides reviewed.
  - _Git_: `docs(release): API + user/admin guides [TASK-308]`.

---

## Completed Tasks Archive
<!-- Move [x] tasks here at the end of each phase to keep the active list clean. -->
