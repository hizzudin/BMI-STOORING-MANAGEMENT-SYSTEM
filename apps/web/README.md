# @bmi/web — BMI Stooring System web app

Next.js (App Router) desktop client for the office roles. It reaches data **only
through the API** (`/api/v1`, NFR-18, DEC-66): every call runs in a Server
Component or Server Action via the single server-side client (`src/lib/api.ts`),
so the API base URL and the opaque session token stay server-side.

## Run locally (Phase 1, dummy gateway)

Two processes — the API on `:3000` and the web app on `:3100` — against the
in-memory dummy `DataGateway` (no real DB, no cloud).

```bash
# 1. Install workspace deps (once)
pnpm install

# 2. Start the API (serves the dummy-gateway data on http://localhost:3000)
pnpm --filter @bmi/api start

# 3. In a second terminal, start the web app on http://localhost:3100
#    Point it at the API with BMI_API_URL.
#    (next dev picks the port from -p; set BMI_API_URL in the environment.)
BMI_API_URL=http://localhost:3000/api/v1 pnpm --filter @bmi/web exec next dev -p 3100
```

Then open <http://localhost:3100>. An unauthenticated protected route (e.g.
`/dashboard`) 307-redirects to `/login`.

> PowerShell equivalent for step 3:
> ```powershell
> $env:BMI_API_URL='http://localhost:3000/api/v1'; pnpm --filter @bmi/web exec next dev -p 3100
> ```

### Signing in (dummy seed)

The seed boots the API in **Setup mode**, so at first only the System Admin and
the Access Manager can sign in (AC-IAM-006). Sign in as the System Admin and flip
the one-way **Go live** switch to enable the other roles.

| Role | Email | Password |
|---|---|---|
| System Admin | `sysadmin@bmi.test` | `Bmi12345` |
| Access Manager | `access@bmi.test` | `Bmi12345` |
| Planner | `planner@bmi.test` | `Bmi12345` |
| Supervisor | `supervisor@bmi.test` | `Bmi12345` |
| GM | `gm@bmi.test` | `Bmi12345` |
| Mechanic | `mechanic@bmi.test` | `Bmi12345` |
| Warehouse Manager | `warehouse@bmi.test` | `Bmi12345` |
| Field Coordinator | `fc@bmi.test` | `Bmi12345` |
| Accounting | `accounting@bmi.test` | `Bmi12345` |
| Driver | `driver@bmi.test` | `Bmi12345` |

(All ten PRD §2.1 roles are seeded so every dashboard/permission is reachable.)

## Commands

```bash
pnpm --filter @bmi/web dev         # dev server (default :3000 unless -p given)
pnpm --filter @bmi/web build       # production build
pnpm --filter @bmi/web test        # unit/interaction tests (vitest + testing-library)
```

## Notes

- Design tokens come from the repo-root `DESIGN.md`. Status is always carried as a
  **text label** (never colour alone) per WCAG 2.2 AA / "The Words First Rule".
- UI strings are bilingual (Indonesian default, English toggle).
- The design artboards under `Design Artifact/` are **references, not a
  pixel-for-pixel contract**; build UI to satisfy `requirements.md` + `DESIGN.md`.
- The full PRD §7.3 screen inventory is built out by TASK-124..128; this shell
  covers sign-in, dashboards and the core WO/inventory/approval flows.
