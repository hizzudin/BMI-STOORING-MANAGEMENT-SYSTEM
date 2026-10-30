# CONTEXT.md
> BMI Stooring System — Live session journal
> Last updated: 2026-10-31 — Session 3

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
| 3 | 2026-10-31 | **tasks.md brought in line with the Mobilisasi change (resolves the "tasks.md still pending" note).** Surgical edits only, preserving the exact existing format (title, Legend, "How to use this plan", phase headers, every `**TASK-NNN** [refs]:` line and its `_Skill_/_Output_/_Verify_/_Git_` sub-bullets) and all TASK IDs + checkbox states (TASK-001 stays `[x]`; all others stay `[ ]`). Changes: **TASK-110** (Mechanic Action) dropped "one-time position capture" + "stooring fee" from scope, refs now `[FG-5, REQ-MEC, REQ-CHK, DEC-88, DEC-89, DEC-90]` (DEC-52 dropped, DEC-90 added), Git message no longer says "stooring", Verify reflects AC-MEC-004/005 asserting no location / Rp 0 stooring. **New TASK-110a** (FG-5a Mobilisasi) inserted between TASK-110 and TASK-111 under Phase 1. **TASK-108** (WO lifecycle) added breakdown→auto-draft-with-one-Mobilisasi-step + draft-only discipline + REQ-MBL-001. **TASK-114** (PM/alert) added breakdown auto-draft coverage + REQ-MBL-002. **TASK-118** (mobile) clarified driver one-time breakdown location vs In_Progress-only mechanic GPS trail + REQ-MBL-002. **TASK-209** (security gate) replaced "position-capture privacy" with the Mobilisasi In_Progress trail privacy (RSK-09 / UU-PDP, active-step-scoped, Planner/SA-only, access-logged). No reorder/renumber; three-phase structure + Archive preserved. Spec-only change, no code. | `.kiro/specs/bmi-stooring-system/tasks.md`, `.kiro/specs/bmi-stooring-system/CONTEXT.md` |
| 2 | 2026-10-31 | **Approved spec change (product owner, Indonesian): Mobilisasi module.** Moved the stooring/mobilisation capability out of the Mechanic Action step into a new data-driven assignment module **Mobilisasi** (PRD §4.5a, new `REQ-MBL-001…006` + `AC-MBL-001…004`; area code `MBL` added to §0.2; glossary §1.5; permission row §2.2; SM-STEP module-contract note §3.3). Retired Mechanic Action position capture and stooring (`REQ-MEC-007…009` now "Retired" rows, IDs kept; `AC-MEC-004/005` repurposed). Breakdown now captures driver location once and auto-drafts a WO pre-seeded with one Mobilisasi step (`REQ-WO-003`, `REQ-WO-014`, `REQ-MOB-003`, `REQ-PM-005`). Added `DEC-90`; updated `DEC-40/52/53/71/88/89` and `RSK-09`. Data model §9: added `breakdown_reports.location_lat/lng/captured_at`, new table `mobilisation_location_trail`, updated `work_order_assignments.location_*`/`stooring_*` and `work_orders.stooring_cost` comments. requirements.md: FG-1, FG-3, FG-5 updated; **FG-5a** added; FG-15 updated. Spec-only change, no code. | `PRD.md`, `.kiro/specs/bmi-stooring-system/requirements.md`, `.kiro/specs/bmi-stooring-system/CONTEXT.md` |
| 1 | 2026-10-30 | Authored the spec set (requirements.md, design.md, tasks.md, CONTEXT.md) from PRD.md SDD Spec v2 + DESIGN.md + PRODUCT.md; integrated the installed skills (incl. `nestjs-expert` for the API and `nextjs-developer` for the web app); split tasks into Dev/Setup/Go-live with git discipline per task. No code yet. | `.kiro/specs/bmi-stooring-system/*`, root `CLAUDE.md` |

*(most recent first — add a row at the start of each session)*

---

## Key decisions

| Decision | Rationale | Session |
|---|---|---|
| requirements.md indexes PRD IDs instead of restating ~150 REQs verbatim | PRD.md is already the exhaustive, ID-level source of truth (§0.1); duplicating it would create drift. The spec stays unambiguous by pointing to exact REQ/BR/NFR/AC IDs. | 1 |
| A `DataGateway` interface is the seam for the 3 phases | Lets dummy DB (Dev) → local Postgres (Setup) → Cloud SQL (Go live) swap without touching business logic; also enforces "no DB driver in services". | 1 |
| Design Artifacts treated as examples, not a binding FE contract | Per the product owner and PRD §0.1 (canvas is layout reference only). | 1 |
| Stooring becomes its own Mobilisasi module; Mechanic Action drops GPS | Product owner approved (Indonesian). Keeps "data, not code" (PR-6): adding/moving a module is master data, no engine change. Stooring stays (one per WO per region per day, billed at cost) but is produced by the module that actually models the mobilisation trip. | 2 |
| **PRIVACY (RSK-09 / UU PDP 27/2022):** Mobilisasi records a *continuous* mechanic location trail while the step is In_Progress — broader than the retired one-time capture | Scope the trail strictly to the active-step duration (stop at submit); keep it for verification only; visible to Planner + System Admin only; log every access; cover it in the app privacy notice and employment policy. Captured in PRD RSK-09 and DEC-90, and in requirements.md FG-5a. | 2 |
| Skills referenced per task on a `_Skill_` line | Makes the implementation phase load the right expertise (e.g. postgres-pro for §9 schema, react-native-expert for the APK, security-reviewer as a gate). | 1 |

---

## Open questions

Move to design.md / PRD once decided.

- [ ] Q-03 (product owner): who owns the Google Cloud / Cloudflare / Firebase / Expo (EAS) accounts and the production domain — **blocks Phase 3 TASK-301**.
- [ ] Repo host (GitHub/GitLab) and CI provider — confirm at TASK-001 so branch/PR/pipeline tasks target the right platform.
- [ ] Q-01 (product owner): KPI numeric targets (G-2/G-6/G-7) — set ~3 months post-launch; not a build blocker.

---

## Divergences from design.md

- **Session 2 — approved divergence (Mobilisasi module).** The previously-written spec placed stooring and one-time GPS capture on the Mechanic Action step. Per the product owner's approved change, stooring and location move to a new Mobilisasi assignment module, and Mechanic Action drops GPS. Reflected in PRD.md first (highest source of truth: §0.2, §1.5, §2.2, §3.3, §4.5/§4.5a, §4.1, §4.20, §8, §9, §11 DEC-90, §12) and then requirements.md (FG-1/3/5/5a/15). **design.md and tasks.md are intentionally NOT edited in this phase** — they are the next phases; when design.md is revised, add the Mobilisasi module contract, the `mobilisation_location_trail` table, and the breakdown→auto-draft flow there, and note it here.
  - **Resolved 2026-10-31 — design.md now brought in line (v1.1).** The Mobilisasi change is reflected in design.md: the data-driven-engine paragraph lists Mobilisasi as a registered module (no engine change, PR-6); the Data Models table adds `mobilisation_location_trail` under the Step aggregate and notes the `breakdown_reports` location fields under Alerts & PM; the state-machines line gains the Mobilisasi SM-STEP contract (auto-submit-on-arrival + manual Finish, In_Progress-only trail); the API table adds a Mobilisasi resource row and the breakdown→auto-draft-with-one-Mobilisasi-step flow; and the Security Design location sentence is corrected (continuous In_Progress trail, Planner/System-Admin scoped, access-logged, RSK-09/UU-PDP; Mechanic Action no longer captures position). Changelog v1.1 added.
  - **Resolved 2026-10-31 (Session 3) — tasks.md now brought in line.** TASK-110 descoped (no GPS/stooring), new TASK-110a (FG-5a Mobilisasi) inserted between TASK-110 and TASK-111, and TASK-108/114/118/209 updated for the breakdown→auto-draft-with-one-Mobilisasi-step flow and the In_Progress trail privacy. Surgical edits only; all existing TASK IDs and checkbox states preserved (TASK-001 remains `[x]`). The entire Mobilisasi divergence is now reflected across PRD.md, requirements.md, design.md and tasks.md — nothing pending.

---

## Changelog

| Session | Date | Summary |
|---|---|---|
| 1 | 2026-10-30 | Spec set created; project ready to begin Phase 0 / TASK-001. |
| 2 | 2026-10-31 | Approved Mobilisasi module change applied to PRD.md + requirements.md + CONTEXT.md (design.md/tasks.md untouched by design). Privacy implication (continuous mechanic trail) captured under RSK-09 / DEC-90 and in Key decisions. |
| 3 | 2026-10-31 | Mobilisasi change applied to tasks.md (surgical, format-preserving): TASK-110 descoped, new TASK-110a added, TASK-108/114/118/209 updated; all IDs + checkbox states preserved. "tasks.md still pending" note resolved — the change is now consistent across all four documents. |
