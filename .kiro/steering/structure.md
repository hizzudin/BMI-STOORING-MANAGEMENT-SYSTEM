# Structure

## Target layout (per design.md "File Structure")

```
BMI Stooring System/
├─ PRD.md, PRODUCT.md, DESIGN.md   # authoritative references (root)
├─ CLAUDE.md                       # AI constitution (spec-driven development)
├─ Design Artifact/                # 153 example screen mockups — REFERENCE ONLY
├─ .kiro/
│  ├─ specs/bmi-stooring-system/   # requirements.md, design.md, tasks.md, CONTEXT.md
│  ├─ skills/                      # installed skills (each task names one to load)
│  └─ steering/                    # these steering docs
├─ apps/
│  ├─ api/                         # NestJS: modules per functional group, state machines
│  ├─ web/                         # Next.js App Router (web screens)
│  └─ mobile/                      # Expo React Native (Android)
├─ packages/
│  ├─ shared/                      # types, DTOs, branded IDs, enums, design tokens
│  ├─ data-gateway/                # DataGateway interface + dummy / postgres impls
│  └─ config/                      # numbering, money, time, format helpers
├─ db/                             # migrations (PRD §9 schema), seed data
├─ docs/                           # OpenAPI, generated docs
└─ infra/                          # Docker Compose (dev/setup), Cloud Run/Cloud SQL IaC
```

Note: `apps/`, `packages/`, `db/`, `docs/`, `infra/` are created in Phase 0 (TASK-001). The repo currently holds the spec/reference docs and the design artifacts only.

## Source-of-truth precedence

When sources disagree, higher wins:

1. `PRD.md` (root) — SDD Spec v2: every REQ/BR/NFR, state machines (§3), data model (§9), NFRs (§8), decisions (§11).
2. `DESIGN.md` (root) — binding visual design system.
3. `.kiro/specs/bmi-stooring-system/requirements.md` — WHAT (maps to PRD IDs).
4. `.kiro/specs/bmi-stooring-system/design.md` — HOW (architecture, DataGateway phasing, skill map).
5. `.kiro/specs/bmi-stooring-system/tasks.md` — the ordered 3-phase plan.

`Design Artifact/` holds 153 screen mockups — these are **illustrative references, not a front-end contract**. Build UI to satisfy `requirements.md` + `DESIGN.md`.

## Working discipline (from CLAUDE.md)

- **Read first:** `CONTEXT.md` (session journal), then `requirements.md`, `design.md`, and the next incomplete `[ ]` task in `tasks.md`. Load the skill named on that task's `_Skill_` line.
- Never implement requirements not traceable to `PRD.md` / `requirements.md`.
- Never alter the data model (PRD §9) or a state machine (§3) without updating `design.md` first and noting it in `CONTEXT.md`.
- Never create files not listed or implied in design.md "File Structure".
- Never mark a task `[x]` without running its `_Verify_` step.
- **Git per task:** branch `type/phaseN-taskNNN-slug`; Conventional Commit referencing TASK + REQ IDs; stage specific files (never `git add -A`); PR to `develop` (Phase 1–2) or `main` (Phase 3). No force-push, no secrets.
- **Divergence protocol:** if implementation must deviate from design/PRD, stop, describe the conflict, wait for approval, update the spec before writing code.
