# requirements.md
> BMI Stooring System — Version 1.0 — 2026-10-30

> **Source of truth.** This file is the spec-level index of *what the system must do*. The exhaustive, ID-level statements live in the root **`PRD.md`** (SDD Spec v2) and its state machines (§3), business rules (§5), data model (§9) and NFRs (§8). Every requirement below carries the authoritative PRD IDs it consolidates; when detail is needed, read the named PRD IDs. Where this file and `PRD.md` ever disagree, **`PRD.md` wins** (PRD §0.1). No requirement here is invented — each maps to existing PRD IDs.
>
> **Design artifacts are examples, not law.** The 153 screens in `Design Artifact/` (indexed in PRD §7.3) are *reference mockups that show how the system behaves*, not a binding front-end specification. Build the UI to satisfy the requirements and the design system in `DESIGN.md`; treat each artboard as an illustrative example of layout and flow, free to improve.

## Overview

BMI Stooring System is a Work Order–driven preventive-maintenance platform for BMI's logistics fleet (~100 units, ~15 users, 10 roles). Its central invariant: **no action that changes stock, tyres, cost or part age happens on a vehicle unless an approved Work Order (WO) authorizes it, executed through ordered, verified steps** (PR-1…PR-6, BR-01…BR-16). It runs as a desktop web app plus an Android field app, backed by one API and one database.

## Actors

- **Planner (R-PLN)**: designs WO steps, plans/checks WOs, verifies steps, maintains presets and part-item normal life.
- **System Admin (R-SA)**: one account; passes every operational role check, self-approves/verifies (marked), owns master data, vehicles, documents, baseline, odometer voids, Setup/Go-live. Cannot manage accounts.
- **Mechanic (R-MEC)**: executes Mechanic Action, Part Replacement, Part Check; drafts WOs.
- **Warehouse Manager (R-WHM)**: Goods Receipts, Stock step, tyres, opname, counts.
- **Field Coordinator / Korlap (R-FC)**: drafts WOs from field, executes Part Purchase, sets vehicle driver; read-only elsewhere.
- **Supervisor (R-SUP)** and **GM (R-GM)**: approvers; GM is director with fleet-wide data.
- **Accounting (R-ACC)**: customers and invoices.
- **Access Manager (R-AM)**: accounts, roles, permissions, Planner-approval switch, System-Admin handover. No operational work.
- **Driver (R-DRV)**: mobile daily inspection, odometer, breakdown, repair request.

Role rules and the full permission matrix: PRD §2 (RL-1…RL-10, BR-03, BR-04, BR-14).

## Functional Requirements

> Each group names its PRD requirement range. Acceptance criteria are the PRD's `AC-*` rows and the state-machine transitions in PRD §3. "Done" for a group means its `REQ-*` are implemented and its `AC-*` pass.

### FG-1 Work Order lifecycle
- **REQ-WO**: The system shall let a Planner/System Admin create a WO (and a Mechanic/Field Coordinator a review draft) for one vehicle with title, category, workshop flag, priority, steps and part/tyre lines, and move it through Draft → Pending_Approval → Active → In_Progress → Pending_Verification → Completed, with Rejected/Pending_Amendment/Cancelled side paths.
  - _PRD_: REQ-WO-001…017; SM-WO (T1–T15); BR-01, BR-03, BR-04, BR-05, BR-16.
  - _Acceptance_: AC-WO-001…006, and every SM-WO transition behaves as tabled.

### FG-2 Assignment engine & step lifecycle
- **REQ-ENG**: The system shall run a WO's steps in built order, open the next step on submit without waiting for verification, enforce executor/verifier identity rules, support claim/assign/reassign/release, and record Open/Start/Pause/Resume/Submit/Return/Verify time events per attempt (Start is the executor pressing Start, not step open).
  - _PRD_: REQ-ENG-001…016; SM-STEP; BR-03, BR-05; DEC-87.
  - _Acceptance_: AC-ENG-001…009.

### FG-3 Module registry, step composer & WO presets
- **REQ-REG**: The system shall offer step modules only from an active registry (Stock, Part_Purchase, Mechanic_Action, Part_Replacement, Document, Part_Check), let Planner/System Admin compose a WO's steps in Create WO via a module palette, save/version presets and PM packages, run live composer checks, and add a new module with no engine change.
  - _PRD_: REQ-REG-001…007; PR-6; DEC-85, DEC-88.
  - _Acceptance_: AC-REG-001…005.

### FG-4 Stock step & Part Purchase step
- **REQ-STK**: The system shall record warehouse-issued parts/tyres in the Stock step (cutting stock atomically with Goods Issue, stock card and moving-average cost), handle shortfalls and verified reversals; and record parts bought outside in a separate Part Purchase step that never touches warehouse stock, with typed quantity/price, receipt photo and line/grand totals.
  - _PRD_: REQ-STK-001…012; REQ-PUR-001…009; BR-01, BR-02, BR-06, BR-07; DEC-60…64.
  - _Acceptance_: AC-STK-001…006; AC-PUR-001…006.

### FG-5 Mechanic Action, Part Check & stooring
- **REQ-MEC**: The system shall run Mechanic Action (internal catalog services or external workshop, repair photos, labor) and Part Check (per-part Good/Repair/Replace with photos that generate a follow-up Draft WO on verification), capture device position once at submit, and charge one stooring fee per WO per region per day from the stooring rates master.
  - _PRD_: REQ-MEC-001…010; REQ-CHK-001…007; DEC-40, DEC-52, DEC-53, DEC-71, DEC-88, DEC-89.
  - _Acceptance_: AC-MEC-001…005; AC-CHK-001…004.

### FG-6 Part Replacement & chassis map
- **REQ-PLC**: The system shall draw a data-generated chassis map per unit type, replace/rotate/demount tyres by position within scope lock, track placement history, and support towed (trailer) layouts with spares counted in days.
  - _PRD_: REQ-PLC-001…020; BR-01, BR-11; SM-TYRE; DEC-68, DEC-69, DEC-73.
  - _Acceptance_: AC-PLC-001…010.

### FG-7 Vehicles, documents & odometer
- **REQ-VEH / REQ-DOC**: The system shall manage vehicles (class, layout, derived status), documents (first entry, correction, renewal via Document WO, Missing/Valid/Warning/Expired), and odometer readings (manual/driver, void with reason, jump warning).
  - _PRD_: REQ-VEH-001…010; REQ-DOC-001…013; SM-VEH, SM-DOC; BR-08, BR-09, BR-10.
  - _Acceptance_: AC-VEH-001…004; AC-DOC-001…006.

### FG-8 Parts baseline, inventory & tyres
- **REQ-BSL / REQ-INV / REQ-TYR**: The system shall record a parts baseline per vehicle; manage the parts catalog, Goods Receipts & corrections, stock cards & export, low/dead-stock alerts and approved stock opname; and manage tyres end-to-end (receive, issue, mount, rotate, demount, retread, worn-out, scrap, approved tyre count) with codes and events.
  - _PRD_: REQ-BSL-001…009; REQ-INV-001…014; REQ-TYR-001…015; BR-06, BR-11, BR-12; SM-GR, SM-SA, SM-TR, SM-RD, SM-TC.
  - _Acceptance_: AC-BSL-001…005; AC-INV-001…005; AC-TYR-001…007.

### FG-9 Change requests & amendments
- **REQ-CR**: The system shall let the open step's executor raise a change request (→ Pending_Amendment), and the WO creator decide the amendment; only not-yet-submitted steps may change (submitted steps are corrected by return, posted stock by reversal).
  - _PRD_: REQ-CR-001…008; SM-CR, SM-WO T8–T10; DQ-07, DQ-72, §7.11.
  - _Acceptance_: AC-CR-001…005.

### FG-10 Approvals
- **REQ-APR**: The system shall provide an approvals inbox (creation, amendment, completion, warehouse counts), enforce four-eyes (creator≠approver unless System Admin, marked), show part age/early-failure on review, and record stamps.
  - _PRD_: REQ-APR-001…011; BR-03, BR-04; RL-7; DEC-35, DEC-48.
  - _Acceptance_: AC-APR-001…005.

### FG-11 WO document & invoices
- **REQ-WOD / REQ-BIL**: The system shall render a print-ready WO document (approval block, execution-time table, black-and-white placement snapshot) and daily customer invoices (one per vehicle per day, part markup +50%, services at cost, stooring at cost, PPN 11%, running number NNNN/BMI/dd-mm-yy, Draft→Issued→Paid→Void).
  - _PRD_: REQ-WOD-001…008; REQ-BIL-001…012; SM-INV; BR-15; DEC-42…46, DEC-50, DEC-89.
  - _Acceptance_: AC-WOD-008; AC-BIL-001…005.

### FG-12 PM engine, schedule, dashboards & notifications
- **REQ-PM / REQ-SCH / REQ-DSH / REQ-NTF**: The system shall generate PM/part-item/tyre/document alerts (per Alert rules) that can draft WOs, provide the Planner maintenance schedule (plan only, never blocking), role dashboards, and in-app + push notifications.
  - _PRD_: REQ-PM-001…010; REQ-SCH-001…007; REQ-DSH-001…010; REQ-NTF-001…005; BR-13; SM-SCH; DEC-86.
  - _Acceptance_: AC-PM-001…003; AC-SCH-001…004.

### FG-13 Accounts, access & audit
- **REQ-IAM**: The system shall manage accounts (exactly one role each, exactly one System Admin), the editable-but-locked permission matrix, the Planner-approval switch, System-Admin handover, password/session rules, email password reset (DQ-02), and an append-only audit log.
  - _PRD_: REQ-IAM-001…011; BR-03, BR-10, BR-14; RL-1…RL-5; NFR-02, NFR-05; §7.11 (DQ-02).
  - _Acceptance_: AC-IAM-001…007.

### FG-14 Setup mode & Go live
- **REQ-SETUP**: The system shall run a Setup mode (only System Admin + Access Manager sign in, no approvals, bulk import of master data — Setup mode only per ASM-64), an opening balance, and a one-way Go-live switch.
  - _PRD_: REQ-IAM-010, REQ-IAM-011, REQ-INV-013, REQ-DOC-013, REQ-BSL-008; DEC-55, DEC-75; ASM-64 (Setup-mode only); §10 go-live steps.
  - _Acceptance_: AC-IAM-006; AC-INV-006.

### FG-15 Mobile app (Android, R1 step 7)
- **REQ-MOB**: The system shall ship one Android app whose menu follows the role (Driver, Field Coordinator, System Admin field menu in R1; Mechanic, Supervisor/GM in R2), with offline drafts/photos, push, GPS work location, and a shared Profile/history (MobileProfile, MechanicMobileHistory, SupervisorMobileHistory, FCDraftCancel per §7.11 DQ-01/03/04/11).
  - _PRD_: REQ-MOB-001…009; RL-6; NFR-18; DEC-41, DEC-66; §7.11.
  - _Acceptance_: AC-MOB-001…004.

### FG-16 File upload & compression
- **REQ-FUP**: The system shall compress images on device, upload directly to object storage via signed links, re-check/compress server-side, show three states, keep files append-only, and serve through expiring signed links.
  - _PRD_: REQ-FUP-001…016; NFR-06, NFR-13; DEC-31, DEC-32; §8.1.
  - _Acceptance_: AC-FUP-001…006.

### FG-17 Settings & integrations (deferred/P1 parts flagged)
- **REQ-SET**: The system shall provide all Settings masters (WO presets, service catalog, vehicle classes & chassis layouts, document types, part item types, PM packages, alert rules/thresholds, tyre statuses, stooring rates, vendors, invoices & tax) and a Settings: Integrations screen to connect WhatsApp, Protrack/Cartrack odometer API and other external tools (DQ-05, P1).
  - _PRD_: REQ-REG-007, REQ-MEC-005/010, REQ-INV-014, REQ-TYR-003, REQ-PM-006…010, REQ-BIL-004/007, REQ-DOC-002, REQ-PLC-013; §7.11 (DQ-05).
  - _Acceptance_: per each named REQ.

### FG-18 Reports & AI assistant (deferred to R2)
- **REQ-RPT / REQ-AI**: Reports (Cost, Tyres, Maintenance, Inventory, Step time) and the AI assistant are Release 2 / deferred (Q-04). R1 ships only the stock-card and audit-log exports (DEC-74).
  - _PRD_: REQ-RPT-001…005; REQ-AI-001…004; DEC-74; §11.3 Q-04.
  - _Acceptance_: deferred; not a go-live gate.

## Non-Functional Requirements

- **NFR-INTEGRITY** (PRD NFR-01): Multi-table writes (goods issue + stock decrement + stock card + WO line, and every write in §9.13) commit or roll back together; submit/approve/post/issue are idempotent.
  - _Measurement_: a forced mid-transaction failure leaves zero partial rows; replaying a request produces no duplicate effect.
- **NFR-AUDIT** (NFR-02): Every state change writes an append-only audit record (user, role, time, before/after); System-Admin self-decisions flagged.
  - _Measurement_: each `AC-*` that changes state has a matching `audit_logs` row.
- **NFR-CONCURRENCY** (NFR-03): Optimistic lock on `version`; the second concurrent save is refused with a clear message.
  - _Measurement_: two concurrent saves → exactly one succeeds.
- **NFR-SECURITY** (NFR-04): Server-side role checks on every action, server-side input validation, parameterized queries, secrets encrypted at rest, AI uses a read-only DB account.
  - _Measurement_: security review (security-reviewer skill) finds no OWASP-Top-10 high findings; every mutating endpoint has a server-side role guard test.
- **NFR-AUTH** (NFR-05): Hashed passwords ≥8 chars letters+digits, first-sign-in change, 5-fail lock 15 min, web idle 30 min, mobile 30 days.
  - _Measurement_: auth test suite passes all five rules.
- **NFR-FILES** (NFR-06, NFR-13): JPG/PNG/HEIC/PDF only; images compressed (Photo 1600px / Doc 2400px); private storage; signed links expire ~5 min; ~1 GB/month budget with 80% alert.
  - _Measurement_: AC-FUP-001…006 pass; a 4 MB photo stores <1 MB without EXIF GPS.
- **NFR-FORMAT** (NFR-08, NFR-09): One fact per sortable/filterable column; Indonesian number format (48.210 km, Rp 1.240.000, 2,4 mm); dates YYYY-MM-DD, times HH:MM:SS; UI translatable (ID default, EN).
  - _Measurement_: format unit tests; every table column independently sortable.
- **NFR-TIME** (NFR-14): Store UTC, show WIB; a "day" = WIB calendar day; daily job 00:30 WIB; idempotent, logged.
  - _Measurement_: daily job re-run produces identical state.
- **NFR-NUMBERING** (NFR-15): Never-reused running numbers (WO-, GR-, GI-, SA-, TC-, TY-, invoice NNNN/BMI/dd-mm-yy), config-driven.
  - _Measurement_: cancel/void never reuses a number; format editable without code change.
- **NFR-MONEY** (NFR-16): Amounts 2 dp, average cost 4 dp; markup rounded half-up per unit before multiply; PPN on subtotal half-up.
  - _Measurement_: AC-BIL-005 arithmetic exact.
- **NFR-BACKUP** (NFR-17): Daily backup kept 1 year, 7-day PITR; audit >1 year archived to storage then deleted; restore tested before go-live.
  - _Measurement_: a restore drill succeeds in the Go-live phase.
- **NFR-PLATFORM** (NFR-18): Web = current Chrome/Edge; mobile = Android 8.0+ signed APK (Expo SDK supporting 8.0); web & mobile reach data only through the API.
  - _Measurement_: smoke test on Android 8 emulator; no direct DB access from clients.
- **NFR-CAPACITY** (NFR-19): Sized for ~100 vehicles/15 users/100–500 WOs per month, holding targets at 3× load.
  - _Measurement_: load test at 3× keeps p95 within target.
- **NFR-A11Y** (PRODUCT.md): WCAG 2.2 AA; status never by colour alone; mobile targets ≥48 px, Pass/Fail ≥44 px; sunlight-readable contrast.
  - _Measurement_: automated a11y scan + manual check of status pills and tap targets.

## Out of Scope (v1.0 / Release 1)

- Reports and cost analytics, tyre CPK, dead-stock/min-per-size reports (R2; DEC-74, except stock-card & audit-log exports).
- AI assistant and its settings (deferred; Q-04).
- Indonesian UI translation delivery (deferred; Q-05 — strings are translatable now, default ID on delivery).
- iPhone/iOS build; Mechanic and Supervisor/GM mobile menus (R2; DEC-41, DEC-66).
- Protrack/Cartrack live odometer adapter (R2; manual + driver cover the gap; DEC-76).
- WhatsApp and email notifications, invoice email, parallel steps, mechanic shift schedule (P2).
- Procurement/PO beyond a PO number; cash advances/reimbursement; payroll, tax filing, accounting ledger; video upload (DEC-31); branches (RL-10, DEC-55).
- Bulk import after go-live (Setup-mode only; ASM-64).

## Open Questions (owner: product owner)

- **Q-03**: ownership of Google Cloud / Cloudflare / Firebase / Expo (EAS) accounts and the production domain — **required before the Go-live phase deploy and the first APK build**.
- **Q-01**: numeric targets for G-2 (PM on time), G-6 (opname variance), G-7 (WO cycle time) — set ~3 months post-launch; not a build blocker.

## Changelog
| Version | Date | Change |
|---|---|---|
| 1.0 | 2026-10-30 | Initial spec, consolidating PRD.md SDD Spec v2 (incl. §7.11 DQ decisions and new mobile/dialog artifacts). |
