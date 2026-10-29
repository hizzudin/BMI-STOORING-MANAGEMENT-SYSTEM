# CONTEXT.md
> BMI Stooring System — Live session journal
> Last updated: 2026-10-30 — Session 1

## ⚡ Resume from here

**Active task:** TASK-001 — Initialize git and the monorepo skeleton
**Phase:** Phase 0 (Repository & spec foundation), preceding Phase 1 (Dev / dummy DB)
**Status:** ready to start
**Blocker (if any):** none for Phase 0–2. Phase 3 (TASK-301) is blocked on open question Q-03 (cloud/domain/account ownership).

> On session start: read this file first, then PRD.md (authoritative), then
> requirements.md, design.md, and tasks.md. Do not ask what to work on —
> resume the active task above unless the user says otherwise. Load the skill
> named on the task's _Skill_ line before implementing.

---

## Session log

| # | Date | What was done | Files changed |
|---|---|---|---|
| 1 | 2026-10-30 | Authored the spec set (requirements.md, design.md, tasks.md, CONTEXT.md) from PRD.md SDD Spec v2 + DESIGN.md + PRODUCT.md; integrated the installed skills (incl. `nestjs-expert` for the API and `nextjs-developer` for the web app); split tasks into Dev/Setup/Go-live with git discipline per task. No code yet. | `.kiro/specs/bmi-stooring-system/*`, root `CLAUDE.md` |

*(most recent first — add a row at the start of each session)*

---

## Key decisions

| Decision | Rationale | Session |
|---|---|---|
| requirements.md indexes PRD IDs instead of restating ~150 REQs verbatim | PRD.md is already the exhaustive, ID-level source of truth (§0.1); duplicating it would create drift. The spec stays unambiguous by pointing to exact REQ/BR/NFR/AC IDs. | 1 |
| A `DataGateway` interface is the seam for the 3 phases | Lets dummy DB (Dev) → local Postgres (Setup) → Cloud SQL (Go live) swap without touching business logic; also enforces "no DB driver in services". | 1 |
| Design Artifacts treated as examples, not a binding FE contract | Per the product owner and PRD §0.1 (canvas is layout reference only). | 1 |
| Skills referenced per task on a `_Skill_` line | Makes the implementation phase load the right expertise (e.g. postgres-pro for §9 schema, react-native-expert for the APK, security-reviewer as a gate). | 1 |

---

## Open questions

Move to design.md / PRD once decided.

- [ ] Q-03 (product owner): who owns the Google Cloud / Cloudflare / Firebase / Expo (EAS) accounts and the production domain — **blocks Phase 3 TASK-301**.
- [ ] Repo host (GitHub/GitLab) and CI provider — confirm at TASK-001 so branch/PR/pipeline tasks target the right platform.
- [ ] Q-01 (product owner): KPI numeric targets (G-2/G-6/G-7) — set ~3 months post-launch; not a build blocker.

---

## Divergences from design.md

None yet (no code written).

---

## Changelog

| Session | Date | Summary |
|---|---|---|
| 1 | 2026-10-30 | Spec set created; project ready to begin Phase 0 / TASK-001. |
