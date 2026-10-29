# Tech

## Stack

TypeScript monorepo (pnpm + turbo workspaces).

- **API:** NestJS — owns all business rules, state machines (PRD §3) and the database. Module-per-functional-group.
- **Web:** Next.js (App Router).
- **Mobile:** Expo / React Native (Android APK, distributed signed, outside the Play Store).
- **Database:** PostgreSQL (system of record; schema is PRD §9, authoritative — do not re-derive).
- **Cache/queues:** Redis (sessions, jobs).
- **Files:** Cloudflare R2 (S3-compatible), signed expiring links.
- **Deployment (go-live):** Google Cloud, Jakarta region — Cloud Run (API/workers/web), Cloud SQL, Memorystore, Secret Manager; Cloudflare DNS/TLS/WAF in front.

Web and mobile reach data **only through the API** — never the DB directly.

## Phased database strategy (the central architectural rule)

The `DataGateway` interface (`packages/data-gateway`) is the seam. Business rules depend on it, never on a concrete DB driver. Only its implementation changes across phases:

- **Phase 1 Dev** — in-memory seeded dummy gateway; local MVP, no cloud.
- **Phase 2 Setup** — real PostgreSQL (local/staging, Docker Compose or staging Cloud SQL); all P0 done; integration tests + UAT.
- **Phase 3 Go live** — Cloud SQL (Jakarta), migrations locked, backups/PITR, secrets in Secret Manager.

**Hard rule:** business logic must never import a concrete DB driver. Services and rules are written once against `DataGateway`.

## Conventions & invariants

- REST over HTTPS, versioned `/api/v1`, JSON.
- Every mutating endpoint: server-side role guard (PRD §2.2 matrix), optimistic-lock check (`version` column), idempotency-key support, and an audit write.
- Parameterized queries only; server-side validation; secrets never committed.
- State machines (SM-WO, SM-STEP, SM-VEH, SM-DOC, SM-TYRE, …): a transition not listed in PRD §3 is refused.
- Formatting/time/money helpers live in `packages/config`: Indonesian number/date format (e.g. `48.210 km`, `Rp 1.240.000`, `2,4 mm`), UTC↔WIB with WIB-day boundaries, never-reused running-number generator, money rounding half-up.
- Daily recomputation job runs 00:30 WIB (documents/PM/alerts/schedule); must be idempotent on re-run.

## Common commands

This repo is pre-scaffold (Phase 0). Once the monorepo exists the commands are:

```bash
pnpm install            # resolve workspace deps
pnpm -w run build       # build all workspaces
pnpm lint               # eslint
pnpm typecheck          # tsc
pnpm test               # unit/integration tests
```

Commits use Conventional Commits enforced by commitlint; husky runs lint + typecheck pre-commit.
