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

---

## 9. Visual/layout audit vs §7.3 artboards (TASK-120a)

> TASK-120 reconciled **behaviour** but did not run the visual/layout audit.
> This section closes that: each already-built web + mobile screen was compared
> **code-to-code** against its PRD §7.3 `.dc.html` artboard (inline styles +
> `<helmet><style>`), its §7.4 "Key screen layouts" row and its §7.9 action-map
> rows. Artboards are an illustrative reference (PRD §7.1/§7.7) — the audit
> matches **region structure + control set + DESIGN.md brand tokens +
> status-as-text (NFR-A11Y)**, not pixel-for-pixel. Each screen is classified
> CONFORMANT (left untouched) or the specific divergences fixed are listed.

Date: 2026-11-01 · Branch: `fix/phase1-task120-visual-audit`

### 9.1 Divergences fixed

#### DIV-1 — App-shell header had no notification bell (§7.2 / §7.9 C-03 / REQ-NTF-001)
**Artboards:** `AppShellCollapsed.dc.html`, `DashboardPlanner.dc.html` (header
pattern). **§7.4/§7.2:** "The page header holds the title (left), the user and
role (right), the bell (NotificationCenter) and the primary action." **§7.9
C-03:** "Bell in the page header … the badge shows the unread count."

**Divergence (TASK-117 output):** the `Topbar` held the role chip + language
toggle + sign-out but **no notification bell** — the §7.2-required header control
was absent. **Fix:** added the bell to `Topbar` (`IconBell`, `Topbar.module.css`
`.bell`/`.badge`) with an unread-count badge; the count is read in the `(app)`
layout from the dashboard endpoint's `unreadNotifications` and passed to the
Topbar. The bell carries an accessible label (count included) and only shows the
numeric badge when > 0. Phase-1 note: the dedicated NotificationCenter panel is a
later screen (TASK-124+); the bell links to the dashboard where notifications
surface, so the header control + badge exist now per §7.2. Contract test added
(`Topbar.test.tsx`, 2 cases).

#### DIV-2 — Sidebar had no collapsible icon rail (§7.2 / §7.9 C-02 / DEC-82)
**Artboard:** `AppShellCollapsed.dc.html` (the 64px rail with the `Collapse
menu` toggle at the foot). **§7.4/§7.2:** "A toggle at the foot of the navigation
(Collapse menu) shrinks it to a 64px icon rail and back … the choice is saved
per user, the toggle works by keyboard, and the main area takes the freed
width." **§7.9 C-02:** "Collapse menu — toggles the icon rail; saved per user;
no navigation."

**Divergence (TASK-117 output):** the `Sidebar` rendered a fixed 200px nav with
no collapse affordance — the DEC-82 rail was missing (even though `nav.collapse`
/ `nav.expand` strings already existed in the dictionary). **Fix:** added the
`Collapse menu` toggle at the foot of `Sidebar`, a `toggleSidebarAction` Server
Action that saves the per-user preference in the `bmi_nav_collapsed` cookie, and
`sidebarCollapsed()` read server-side in the layout so the first paint already
honours the choice (no flash). Collapsed → 64px rail: labels hide, icons centre,
each item keeps its name as a `title` tooltip + an `sr-only` label, the active
item stays highlighted, and the main area takes the freed width. The toggle is a
form button (keyboard-operable, works without client JS). `IconCollapse` added;
`Logo` renders tile-only in the rail. Contract test added (`Sidebar.test.tsx`,
2 cases). Live-verified: the `bmi_nav_collapsed=1` cookie renders
`data-collapsed="true"` and the toggle flips to "Expand menu".

#### DIV-3 — Web sign-in used a single stacked card, not the split brand layout (§7.3 WebLogin)
**Artboard:** `WebLogin.dc.html` — a two-panel split: a petrol-ink (`#14262E`)
brand panel on the left (logo on its white tile + the product promise "…for the
fleet" / "Every action is tied to an approved Work Order") and the sign-in card
on the right.

**Divergence (TASK-117 output):** `login/page.tsx` rendered a single narrow
400px card with a thin brand bar on top — the artboard's left/right region split
and the brand promise copy were absent. **Fix:** rebuilt the login region layout
to the split (`login.module.css`): left `.brandPanel` (petrol-ink, logo on the
white tile via the shared `Logo`, lead + foot promise lines) and right
`.formPane` centring the sign-in card; stacks vertically under 720px (tablet).
Added the `login.brandLead` / `login.brandFoot` bilingual strings. The logo
stays on its mandatory white tile (brand rule). Live-verified: `/login` → 200
with the brand panel present.

### 9.2 Screens audited CONFORMANT (left untouched)

Each already matched its artboard's region structure + control set + tokens +
status-as-text; no taste-only rewrites were made.

| Screen | Artboard | §7.4 / §7.9 item | Verdict |
| --- | --- | --- | --- |
| Dashboard (`dashboard/page.tsx`) | `DashboardPlanner` + the 6 role dashboards | §7.4 dashboards; REQ-DSH-001..006/009 | CONFORMANT on the summary-card grid + role identity line + unread count. Residual: the "Needs my action" wider-left + status/work-list right split is **owned by TASK-126** (it needs dashboard list payloads the P0 count-card API doesn't yet return; the shell may not change the API). |
| Work Orders list (`work-orders/page.tsx`) | `WOList` | §7.2 List page; §7.4; REQ-WO-010/015 | CONFORMANT — header + primary **Create** button, table, urgency **and** status pills each carrying their word (NFR-A11Y), Urgent→Low ordering. |
| WO detail (`work-orders/[id]/page.tsx`) | `WorkOrder` | §7.2 Master-detail; §7.4; REQ-WO-011/016 | CONFORMANT — master-detail (`layout-split`: step cards left, context card right), urgency/status pills with text, finding note read-only (DEC-91). |
| WO composer (`work-orders/new/page.tsx`) | `CreateWO` | §7.4; REQ-WO-001/004/016/017 | CONFORMANT — form page in data-entry order, read-only finding note carried verbatim (REQ-WO-016, unit-proved), urgency select labelled. |
| Step screen (`…/steps/[stepId]/page.tsx`) | `StepVerify` / `StepLocked` / `StepReturned` | §7.4 Step screen | CONFORMANT on the context banner + step detail + status-as-text. Residual: the **bottom action bar (Save draft / Submit step)** and the verify/return controls are part of the **full step screens owned by TASK-124+** (engine-mutation wiring is out of this task's scope). |
| Approvals (`approvals/page.tsx`) | `Approvals` | §7.4; REQ-APR, REQ-WO-015 | CONFORMANT — header + waiting-count + inbox table, urgency pills with text, Urgent/High-first ordering. |
| Inventory (`inventory/page.tsx`) | `Inventory` | §7.2 One field per column; REQ-INV | CONFORMANT — table, one fact per column, tabular numerals, Rupiah formatting via `@bmi/config` conventions. |
| Requests (`requests/page.tsx`) | `FCRequests` | §7.4; REQ-WO-016 | CONFORMANT — header + subtitle, table with urgency pills + read-only finding note + "Compose Work Order" seeding the composer. |
| Schedule (`schedule/page.tsx`) | `MaintenanceSchedule` | §7.4; REQ-SCH-003, DEC-92 | CONFORMANT — calendar/list cards; the rolled-over/late flag is a **pill with its text label** (never colour alone). |
| Vehicles (`vehicles/page.tsx`) | `Vehicles` / `VehicleOverview` | §7.2 One field per column; REQ-VEH, DEC-92 | CONFORMANT — table, derived status (incl. OFF) as a pill with text, Indonesian km grouping. |
| Shared `Pill` | all status/urgency pills | NFR-A11Y "Words First" | CONFORMANT — always renders the label; variant colours copied verbatim from the artboards' `.g/.a/.r/.n/.b` palette. |
| Shared `Logo` | brand rule (§7.8) | logo on a white tile | CONFORMANT — wordmark always on the mandatory white tile, never on brand red. |
| **Mobile** MobileLogin (`index.tsx`) | `MobileLogin` | REQ-IAM-001, §7.11 | CONFORMANT — brand tile, field-first form, one red primary action, role-routed menu; office-only role told to use web. |
| **Mobile** Driver home + inspection/odometer/breakdown/history | `DashboardDriver`, Driver-menu artboards | §7.11; REQ-MOB, REQ-DRV | CONFORMANT on tokens/brand/status-as-text/48px targets/one-task-per-screen. See residual note below on the bottom tab bar. |
| **Mobile** Field Coordinator requests/purchase | `FCMobileRequests`, `FCMobilePurchase` | §7.9 C-05; REQ-MOB, REQ-PUR | CONFORMANT — field-first list/step, calculated totals, status-as-text. |
| **Mobile** System Admin field menu (`system-admin.tsx`) | `SAMobileHome` | §7.9 C-05 | CONFORMANT — open-steps menu, field-first. |
| **Mobile** Mechanic today (`mechanic.tsx` + `mechanic/today.tsx`) | `MechanicMobileHome` | §7.9 C-05 (R1 subset) | CONFORMANT on tokens/field-first. |
| **Mobile** Profile (`profile.tsx`) | `MobileProfile` | §7.9 C-05 | CONFORMANT — profile + language + sign-out, field-first. |

**Mobile token sweep:** no hard-coded hex colour exists in any `apps/mobile/app`
screen — every screen consumes `src/theme/tokens.ts`, which transcribes the
DESIGN.md "Petrol Complement" palette verbatim (brand red `#AD2713`, petrol
`#1F4E5F`, ink `#14262E`, mist `#E6EFF1`, gold-light `#F2D98A`, danger `#B91C1C`).
All pills carry their text label (`pills.ts` "Words First").

**Mobile residual (documented, not a token/structure divergence):** §7.9 C-05
describes a persistent **bottom tab bar**; the R1 screens implement "one app
whose menu follows the role" as full-screen menu tiles (one task per screen,
48px+ targets, profile/sign-out footer) — a faithful field-first reading of
§7.2/§7.11. Converting to a persistent bottom-tab navigator is a navigation-shell
refinement left to the mobile build-out (MOB-002 / later mobile tasks), since it
touches the expo-router layout rather than any brand token or status rule.

### 9.3 Screens still owned by TASK-124..129 (out of scope here — not built)

These §7.3 artboards have no built screen today; they are **not** audited or
built by TASK-120a:

- **TASK-124** — full engine step screens + `WODetailVerify` verify/complete
  controls, `StepVerify`/`StepLocked`/`StepReturned` action bars, `CreateWOFromAlert`, `WORejected`.
- **TASK-125** — `ChassisMap` / Part-Replacement placement UI, tyre screens
  (`TyreCount`, retread), `PartPurchase` web step.
- **TASK-126** — the per-role dashboards as dedicated screens (the "Needs my
  action" split), Field Coordinator / Accounting / GM dashboards, Evidence &
  report-photo cards (APR-009/010), NotificationCenter panel.
- **TASK-127** — Invoices / Customers / WO-document screens.
- **TASK-128** — Settings home + master-data pages (`Settings`,
  `SettingsWOPresets`, `SettingsAlertRules`, …), Documents, Reports.
- **TASK-129** — Setup & Go-live screen (`SetupGoLive`), Access Manager
  navigation (Users & roles, Audit log).

### 9.4 Verification (TASK-120a)
- `pnpm -w run build` — 6/6 ✅ (all 13 web routes build)
- `pnpm -w run typecheck` — 9/9 ✅
- `pnpm -w run lint` — clean ✅
- `pnpm -w run test` — 9/9 tasks ✅ (web **25** = 21 prior + 4 new shell contract
  tests in `Sidebar.test.tsx` / `Topbar.test.tsx`; api 384, shared 43, config 50,
  data-gateway 14, mobile 20 all intact)
- Live local smoke (`@bmi/api` :3000 dummy gateway + `@bmi/web` `next start`
  :3100, fresh clean build): `/login` 200 with the split brand panel; protected
  `/dashboard` 307-redirects when unauthenticated; signed-in System Admin renders
  **every existing route** — `/dashboard`, `/work-orders`, `/work-orders/new`,
  `/work-orders/1`, `/approvals`, `/inventory`, `/requests`, `/schedule`,
  `/vehicles` all 200 — with the header **bell** and the sidebar **collapse
  toggle** present; the `bmi_nav_collapsed` preference renders the 64px rail
  (`data-collapsed="true"`) and flips the toggle to "Expand menu".

No API / `@bmi/shared` / `@bmi/config` / data-gateway change; no new screens
built; `tasks.md` / `tasks.meta.json` left untouched. No temporary files remain.
