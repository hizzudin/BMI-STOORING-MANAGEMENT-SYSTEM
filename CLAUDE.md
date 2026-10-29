═══════════════════════════════════════════════════════════
SPEC DRIVEN DEVELOPMENT — PROJECT CONSTITUTION
Project: BMI Stooring System
Version: 1.0
═══════════════════════════════════════════════════════════

This project uses Spec Driven Development. All work is governed by
source-of-truth files, in this precedence:

  PRD.md (root)                         — authoritative SDD Spec v2: every REQ/BR/NFR,
                                          state machine (§3), data model (§9), NFRs (§8),
                                          decisions (§11). When anything disagrees, PRD.md wins.
  DESIGN.md (root)                      — binding visual design system (Petrol Complement).
  .kiro/specs/bmi-stooring-system/
    requirements.md                     — spec-level index of WHAT (maps to PRD IDs)
    design.md                           — HOW: architecture, DataGateway phasing, skill map
    tasks.md                            — the ordered 3-phase plan (Dev → Setup → Go live)
    CONTEXT.md                          — live session journal (read FIRST)

Design Artifact/ holds 153 example screen mockups. They are REFERENCE
EXAMPLES of behaviour, NOT a strict front-end contract. Build the UI to
satisfy requirements.md + DESIGN.md; treat artboards as illustrations.

MANDATORY BEFORE ANY ACTION:
  0. Read .kiro/specs/bmi-stooring-system/CONTEXT.md — it has session state
  1. Read requirements.md in full
  2. Read design.md in full
  3. Read tasks.md — identify the next incomplete [ ] task in the current phase
  4. Load the skill named on that task's _Skill_ line (from .kiro/skills/)

HARD CONSTRAINTS:
  ✗ Never implement requirements not traceable to PRD.md / requirements.md
  ✗ Never alter the data model (PRD §9) or a state machine (§3) without
    updating design.md first and flagging it in CONTEXT.md
  ✗ Never let business logic import a concrete DB driver — depend on the
    DataGateway interface (dummy → postgres → Cloud SQL per phase)
  ✗ Never create files not listed or implied in design.md "File Structure"
  ✗ Never mark a task [x] without running its _Verify_ step (its AC-* / check)
  ✗ Never guess when a requirement is ambiguous — consult PRD.md; if still
    unresolved, ask (see PRD §7.11 and §11.3 for the open items)
  ✗ Never commit secrets, .env, or cloud keys

PHASES (tasks.md):
  Phase 1 Dev    — local MVP on the in-memory dummy DataGateway; no cloud
  Phase 2 Setup  — real PostgreSQL (local/staging); all P0 done; test & debug
  Phase 3 Go live— Cloud SQL production; deploy-ready; fixes only
  The DataGateway interface is the seam: only its implementation changes
  between phases; services and rules are written once.

GIT DISCIPLINE (every task):
  1. Branch: type/phaseN-taskNNN-slug  (feat/fix/chore/test/perf/ci/docs/build)
  2. Commit with Conventional Commits referencing the TASK + REQ IDs,
     e.g.  feat(wo): lifecycle + assignment engine [TASK-108]
  3. Stage specific files (never `git add -A`); keep PRs small and reviewable
  4. PR to `develop` in Phase 1–2, to `main` in Phase 3; tag phase milestones
  5. Never force-push, reset --hard, or skip hooks unless explicitly asked

AFTER COMPLETING A TASK:
  1. Run the _Verify_ step in tasks.md (the AC-* / test / metric)
  2. If implementation diverged from design.md → update design.md FIRST
  3. Mark the task [x] in tasks.md
  4. Add a session row + next active task to CONTEXT.md
  5. Report what was done and which REQ/NFR it satisfies

DIVERGENCE PROTOCOL:
  If implementation must deviate from design.md or the PRD:
    → Stop · describe the conflict · wait for approval · update the spec
      BEFORE writing code.
═══════════════════════════════════════════════════════════
