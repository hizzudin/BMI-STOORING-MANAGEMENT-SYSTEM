# TASK-120 — Whole-PRD Phase-1 Conformance Reconciliation

> Reconciles the entire shipped Phase-1 implementation (TASK-101..119) to the
> original PRD intent. Full authority over every earlier task, exercised **only**
> where an implementation diverged from the PRD. Anything already faithful was
> left untouched. Phase-1 dummy-gateway discipline held throughout (no concrete
> DB driver, no cloud SDK).

Date: 2026-11-01 · Branch: `feat/phase1-task120-reconcile`

---

## 1. Method

A whole-PRD conformance audit was run module-by-module / REQ-area-by-area against
the authoritative sources: `PRD.md` (§2.2 permission matrix, §3 state machines,
§4 REQ/AC, §5 BR, §7.3/§7.4/§7.9 screens, §8 NFR, §9 data model), the spec's
`requirements.md` "PRD Coverage & Traceability" matrix, `design.md`
implementation notes, and the `CONTEXT.md` session journal. Each area was
classified **CONFORMANT** (left untouched) or **DIVERGENT** (fixed at source with
a test). The audit focused especially on the pockets the earlier audits flagged.

---

## 2. Confirmed divergences fixed (each mapped to its PRD item)

### FIX-1 — WO-driven tyre status transitions did not write `tyre_events` rows
**PRD item:** REQ-TYR-013 (P0) + SM-TYRE §3.6 ("Every transition writes one
`tyre_events` row with the document, user and time").

**Divergence (TASK-111 / TASK-112 output):** the warehouse-side tyre lifecycle
(`TyreRegisterService`, receive/retread/worn-out/scrap/count) wrote one
`tyre_events` row per transition, but the **chassis-side** transitions driven by
the Placement module (mount `Issued→Mounted`, rotate `Mounted→Mounted`, demount
`Mounted→Needs_Retread/Worn_Out/In_Stock`, scrap `Mounted→Scrapped`) changed the
tyre's status **without** recording a `tyre_events` row. A tyre that was received,
issued, mounted and then demounted showed only the `ReceiveNew` event in its
history — the WO-caused mount/demount were missing, breaching REQ-TYR-013 and the
§3.6 "every transition" guarantee.

**Fix (at source, no §9/§3 change — the statuses and transitions were already
correct; only the required history row was missing):**
- Added a dependency-free **`TyreEventLogService`** + `TyreEventLogModule`
  (`apps/api/src/modules/inventory/tyre-event-log.*`) that owns the append-only
  `tyre_events` log, so the two writer modules share **one** ordered history with
  no import cycle (NestJS gives both importers the same singleton).
- Refactored `TyreRegisterService` to delegate its event store to the shared log
  (behaviour identical; `historyOf` now reads the unified log).
- `PlacementService` now records one `tyre_events` row per SM-TYRE transition it
  drives (mount / rotate×(1–2 tyres) / demount / scrap), with the WO's running
  number as the causing document (BR-06), the actor and the time.
- Wired `TyreEventLogModule` into `InventoryModule` and `PlacementModule`.

**Tests added:** `placement.service.test.ts` — REQ-TYR-013 mount→rotate→demount
produces 3 ordered rows carrying `WO-0700`/actor/time with the true status chain,
and scrap-from-mounted produces a `ScrapFromMounted` row. Existing register event
tests still pass against the shared log.

**Not a §9/§3 change:** no new table, column, enum value or transition — the fix
makes the implementation satisfy an existing PRD requirement. No design.md /
requirements.md edit was required (divergence protocol applies only to §9/§3
*changes*).

### FIX-2 — Accounting role had no dashboard data
**PRD item:** REQ-DSH-009 (P0) — "Accounting: invoice drafts waiting, issued and
overdue invoices, billed this month, completed WOs that are not billable."

**Divergence (TASK-114 output):** `DashboardService.cardsForRole` had no
`Accounting` case, so the Accounting role fell through to `default → []` and
landed on an empty dashboard. REQ-DSH-008 (hide P1 cards) was already conformant;
REQ-DSH-009 was not implemented.

**Fix:** added the `Accounting` case + `accountingCards()` to `DashboardService`,
reading the live invoice list + Not-billable set from the existing
`InvoiceService` (FG-11). Cards: invoice drafts waiting, issued invoices, overdue
(Issued with `dueDate` < WIB-today), billed this month (sum of Issued/Paid totals
in the current WIB month), completed WOs not billable. Cost cards stay P1 and are
not emitted (REQ-DSH-008). Wired `BillingModule` into `MaintenanceModule`
(one-directional — Billing does not import Maintenance, so no cycle).

**Test added:** `maintenance.e2e.test.ts` — the Accounting role lands on an
`Accounting` dashboard carrying its five P0 card keys.

### FIX-3 — The dummy seed was missing three PRD §2.1 roles
**PRD item:** §2.1 role catalogue (10 roles) + REQ-DSH-006 (Field Coordinator) /
REQ-DSH-009 (Accounting), REQ-DSH-001 (GM).

**Divergence (TASK-102 output):** the dummy-gateway seed created accounts for only
7 of the 10 PRD roles (Planner, Supervisor, Mechanic, Driver, Warehouse Manager,
System Admin, Access Manager). **GM, Field Coordinator and Accounting had no
account**, so their permissions and P0 dashboards could not be exercised on the
Phase-1 dummy gateway at all.

**Fix:** appended three seed accounts at ids 8–10 — `gm@bmi.test` (GM),
`fc@bmi.test` (Field Coordinator), `accounting@bmi.test` (Accounting). Existing
accounts 1–7 are unchanged, so no prior test or the FG-13 System-Admin-move
behaviour is affected.

**Not a §9 schema change:** the `users` table and `role_t` enum are unchanged —
this is seed **data** faithful to §2.1, not a data-model change. No design.md edit
required.

---

## 3. Areas audited and found CONFORMANT (left untouched)

| Area | PRD items checked | Verdict |
|---|---|---|
| §2.2 permission matrix | Every cell vs `permission-matrix.ts` | **Conformant.** GM is `view` on invoices (REQ-BIL-010 GM read-only); SUP/SA/ACC `allow`. The `files.upload` (TASK-116) and `settings.manage` (TASK-115) additions do not contradict §2.2 (REQ-FUP-004 "a permission check"; REQ-BIL-012 SA-only). Planner `wo.approve`/`count.approve` are `switchable` (RL-7). |
| REQ-BIL-010 | Invoice + customer writes guarded `invoice.manage`; GM read-only; audit on every action | **Conformant.** Billing controller guards all invoice/customer mutations with `invoice.manage` and calls `enrichAudit` on every one; GM's `view` grant refuses mutations. |
| REQ-DSH-008 | Hide P1 cards until R2 | **Conformant.** Cost / tyre-min / bottleneck-median cards are simply not emitted. |
| REQ-TYR-013 (warehouse side) | receive/retread/worn-out/scrap/count events | **Conformant** (already wrote events); only the chassis side was missing (FIX-1). |
| SM-WO / SM-STEP / SM-VEH / SM-DOC / SM-TYRE / SM-INV / SM-CR / SM-SA/TC/GR/RD | Transition guards via `@bmi/shared` machines | **Conformant.** Services walk the shared guards; unlisted transitions refused. |
| REQ-WO-016 finding_note | FC/Mechanic draft refuse-when-empty; driver copy; preserved on Planner edit | **Conformant** (TASK-108). |
| REQ-APR-011 part-age / DQ-07 | Part-age signal on creation review | **Conformant** (TASK-113). |
| REQ-BIL-003 / DEC-92 Off_Unit line | off_days × rate at cost, in subtotal + PPN | **Conformant** (TASK-115). |
| NFR-02 audit / NFR-01 idempotency / NFR-04 guard | Global interceptors + guard | **Conformant** (TASK-103). |
| Mobilisasi trail RSK-09 | Trail only while In_Progress, Planner/SA only | **Conformant** (TASK-110a). |

---

## 4. Gaps correctly owned by a LATER task (not pre-built here)

TASK-120 reconciles **existing** output; it does not do the later gap tasks' work.
These remain open and are **not** divergences of TASK-101..119:

| Gap | Owning task |
|---|---|
| Audit-log read/query + audit/stock-card export | TASK-121 |
| Part-item master (`part_item_types` / `vehicle_part_items`) + reset-on-complete | TASK-122 |
| Settings masters controller (tyre statuses, thresholds, invoices & tax editor) | TASK-123 |
| Web shared components (ChassisMap, PhotoViewer, FileDrop, ApprovalBlock, PartAgeCard…) | TASK-124 |
| Create-WO composer + full step screens (web) | TASK-125 |
| Six role dashboards UI + approval review screens (REQ-APR-009/010 Evidence/report-photo cards) | TASK-126 |
| Inventory/Tyres, Vehicles, Documents, Schedule (web) | TASK-127 |
| Settings, Invoices/Customers, Setup/Go-live, Access Manager, shell (web) | TASK-128 |
| Mobile R1 completion (FC fleet/schedule/alerts, offline, profile) + Mechanic R2 parity (REQ-MOB-002) | TASK-129 |
| FLW-* behavioural suite | TASK-130 |

## 5. Deliberate Phase-1 choices (NOT divergences, left as-is)

PDF is a stub (real PDF = TASK-206); real S3/R2 = TASK-204; Postgres = TASK-201/202;
billable facts via `setWorkOrderBillables` until real cost rows (Phase 2);
in-memory module stores re-homed behind §9 tables by TASK-201/202.

## 6. Deferred P1/P2 items (stay deferred per PRD §10)

AI, Reports, iOS, Mechanic/Supervisor mobile menus, Protrack, WhatsApp/email,
amendment-history attachment, optional step skip, photo labels, GPS trail,
invoice email — none built here.

---

## 7. Audit summary

- **Confirmed divergences fixed:** 3 (FIX-1 REQ-TYR-013/§3.6, FIX-2 REQ-DSH-009,
  FIX-3 §2.1 seed roles).
- **Areas audited and found conformant (untouched):** the §2.2 matrix, the six
  additional flagged REQs (TYR-013 warehouse side, DSH-008, BIL-010, APR-009/010
  data, MOB-002 R2-deferred), all state machines, and the FG-1..FG-16 API
  behaviour claimed "✅" in the traceability matrix.
- **Gaps left to later tasks (121..130):** 10, each listed above with its owner.
- **Unresolved divergences across TASK-101..119:** 0.

## 8. Verification

- `pnpm -w run build` — 6/6 ✅
- `pnpm -w run typecheck` — 9/9 ✅
- `pnpm -w run lint` — clean ✅
- `pnpm -w run test` — 9/9 tasks ✅ (api **384** = 381 prior + 3 new; shared/config/
  data-gateway/web/mobile intact; data-gateway 14 incl. seed test)
- Live local smoke: `@bmi/api` on :3001 booted clean (no DI cycle from the new
  Billing→Maintenance wiring); the Accounting dashboard returned its five P0 cards
  over HTTP; `@bmi/web` dev rendered `/login` (200) and 307-redirected the
  protected `/dashboard` when unauthenticated.

No earlier task's completion status was changed; `tasks.md` / `tasks.meta.json`
were left untouched. No temporary files remain.
