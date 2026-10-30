# BMI Stooring System: SDD Spec v2

Oct 26, 2026 · @rolling

This spec defines BMI Stooring System (formerly Fleet PM System, DEC-81), a web and mobile fleet preventive maintenance system in which no maintenance action happens on a vehicle unless an approved Work Order (WO) authorizes it. It is written for a spec-driven development (SDD) agent: every requirement has an ID, a priority, a testable statement and links to the screens, tables and rules it touches. It replaces the earlier PRD "Fleet PM System: Work Order–Driven Spec (SDD)" as of rev 228 of that document, with every later addition merged into the section where it belongs.

## 0. How to read this spec

### 0.1 Source of truth

| Concern | Wins | Notes |
| --- | --- | --- |
| Behaviour, rules, data, field lists | Sections 2 to 5 and 9 | The design canvas never overrides them |
| Placement of objects, paging, navigation | Section 7 and the [design canvas](https://claude.ai/artifact/LvDdr6ZffShqyddQUYHG4w) | The canvas is a layout reference only |
| Visual style (colour, type, spacing, icons) | Free at implementation, except the BMI brand of 7.8 | Status names and meanings stay binding |
| Something in the canvas but not in this spec | Not built | Raise it as a question |
| Something in this spec but not in the canvas | Built | Place it in the nearest matching region |

### 0.2 ID scheme

| Prefix | Meaning | Example |
| --- | --- | --- |
| `R-` | Role | `R-PLN` Planner |
| `SM-` | State machine | `SM-WO` Work Order lifecycle |
| `REQ-<area>-<nnn>` | Functional requirement | `REQ-WO-003` |
| `AC-<area>-<nnn>` | Acceptance criterion; names the REQ it verifies | `AC-WO-002` verifies `REQ-WO-003` |
| `BR-<nn>` | Business rule; an invariant no permission change can switch off | `BR-03` |
| `NFR-<nn>` | Non-functional requirement | `NFR-04` |
| `FLW-<role>-<nn>` | User flow | `FLW-PLN-01` |
| `DEC-`, `ASM-`, `Q-`, `RSK-` | Decision, assumption, open question, risk | `DEC-12` |
| Screen names in code | The artboard name in the design canvas | [`CreateWO`](<Design Artifact/Create Work Order step composer-html/CreateWO.dc.html>) |
| Table names in code | A table in section 9 | `work_orders` |

Area codes: `WO` Work Order lifecycle, `ENG` assignment engine, `REG` module registry and designer, `STK` Stock step, `MEC` Mechanic Action step, `MBL` Mobilisasi (mobilisation) step, `PLC` Part Replacement and map, `DOC` documents, `CR` change request and amendment, `WOD` WO document, `VEH` vehicles and odometer, `PM` maintenance and inspections, `BSL` parts baseline, `INV` parts inventory, `TYR` tyres and retread, `APR` approvals, `DSH` dashboards, `SCH` maintenance schedule, `IAM` accounts and access, `NTF` notifications, `MOB` mobile app, `RPT` reports, `AI` AI assistant, FUP file upload and compression.

### 0.3 Requirement syntax (EARS)

Every requirement and acceptance criterion uses one of these patterns. `THE SYSTEM SHALL` is a must; nothing in this spec is optional unless its priority says so.

| Pattern | Form |
| --- | --- |
| Ubiquitous | THE SYSTEM SHALL \<response>. |
| Event | WHEN \<trigger>, THE SYSTEM SHALL \<response>. |
| State | WHILE \<state>, THE SYSTEM SHALL \<response>. |
| Unwanted | IF \<condition>, THEN THE SYSTEM SHALL \<response>. |
| Optional | WHERE \<feature is included>, THE SYSTEM SHALL \<response>. |

### 0.4 Priorities and tags

| Tag | Meaning |
| --- | --- |
| P0 | Release 1 (the first release) |
| P1 | Release 2 |
| P2 | Later |
| \[A\] | Assumption the product owner has since confirmed (DEC-58); build it as written and keep it easy to change. Listed in 11.2 |

### 0.5 Conventions used everywhere

- "System Admin" (`R-SA`) passes every operational role check (`BR-03`). Wherever a requirement names an operational role, read "or the System Admin".
- "Approver" means a Supervisor, the GM or the System Admin; any one of them is enough (`BR-04`).
- "Verifier" means a Planner or the System Admin.
- Numbers use the Indonesian format (48.210 km, Rp 1.240.000, 2,4 mm); dates are `YYYY-MM-DD`, times `HH:MM:SS` (`NFR-09`).
- Build order for an agent: data model (section 9) and rules (section 5) first, then requirements by release step (section 10), then screens (section 7).

## 1. Overview and scope

### 1.1 Problem

The company runs light delivery vans, medium trucks and heavy trucks. Breakdowns interrupt deliveries, work and parts are not tied to a vehicle and an authorization, tyre history is unknown, legal documents (STNK, KIR, insurance) can lapse while a vehicle still operates, and nobody can prove who approved, did and checked a repair.

### 1.2 Product principles

| ID | Principle | Enforced by |
| --- | --- | --- |
| PR-1 | The WO is the only door: every module action needs an active WO and its open step | `BR-01` |
| PR-2 | Scope lock: a step touches only the vehicle and parts named in its WO | `BR-02` |
| PR-3 | Ordered, not blocked: steps run in sequence; verification runs in parallel and never holds the next step | `BR-05` |
| PR-4 | Everything leaves a trail: executor stamp, verifier stamp, timestamps and an audit record | `NFR-02` |
| PR-5 | Show, don't tell: tyre positions are shown on a vehicle map, not in a list | `REQ-PLC-*` |
| PR-6 | Data, not code: modules, steps, vehicle classes, chassis layouts, tyre statuses and document types are master data | `REQ-REG-*`, `REQ-PLC-*` |

### 1.3 Goals and success metrics

| ID | Goal | Metric | Target |
| --- | --- | --- | --- |
| G-1 | No unauthorized maintenance | Stock issues, part placements and service lines linked to an approved WO | 100% |
| G-2 | Fewer breakdowns through PM | PM completed on time (km or days, whichever first) | Set after baseline (Q-01) |
| G-3 | Legal compliance | Vehicles assigned to trips with an Expired or Missing document | 0 |
| G-4 | Full accountability | Completed WOs with executor, verifier and approver stamps | 100% |
| G-5 | Cost visibility | WOs with complete parts, labor and document cost; cost per vehicle and per km | 100% costed |
| G-6 | Inventory accuracy | Variance at stock opname | Set after baseline (Q-01) |
| G-7 | Speed | WO cycle time, Active to Completed | Set after baseline (Q-01) |

### 1.4 Out of scope

- A live WhatsApp gateway and email notifications (P2). Telematics is an adapter; Protrack is the first odometer provider (P1).
- Procurement and purchase orders beyond a PO number on a Goods Receipt; cash advances and reimbursement for parts bought by the Field Coordinator (the system records only price and receipt).
- Parallel steps inside one WO (P2).
- Driver payroll, tax filing and the accounting ledger (customer invoices are in scope, 4.23); video upload of any kind (DEC-31).

### 1.5 Glossary

| Term | Meaning |
| --- | --- |
| Work Order (WO) | The authorization for maintenance on one vehicle; holds an ordered list of steps |
| WO preset | A saved step sequence (steps, order, executor, verifier and step details) that a Planner or System Admin may start a WO from; the WO may change it freely and never follows later changes; versioned |
| Category | The kind of work of a WO: PM, Corrective, Tyre, Document or Other; used for lists, filters and reports |
| Part Check | A step module for troubleshooting: the mechanic reports the condition of each requested part, decides Good, Repair or Replace and adds photos; the not-good findings become a Draft WO for the Planner |
| Step (assignment) | One unit of work in a WO, run by one module (Stock, Part Purchase, Mechanic Action, Mobilisasi, Part Replacement, Document) |
| Module | A registered kind of step with a fixed contract (`REQ-REG-*`) |
| Mobilisasi (Mobilization) | A registered assignment module (master data, PR-6) for sending a mechanic to the driver's location; its executor is the Mechanic travelling there, and it produces the stooring fee of its region (`REQ-MBL-*`) |
| Executor | The user who fills and submits a step |
| Verifier | Planner or System Admin who checks a submitted step |
| Approver | Supervisor, GM or System Admin who approves WO creation, amendment, completion and warehouse counts; a Planner also approves WOs while the Access Manager has switched Planner approval on (REQ-IAM-008) |
| Change request | A request by a step executor to change WO content; puts the WO in Pending Amendment |
| Amendment | An approved revision of WO content; raises the amendment number |
| Scope lock | The rule that a step may change only its WO's vehicle and listed parts |
| Parts baseline | First entry of the tyres and service parts a vehicle already has, without a WO |
| Part item type | A tracked service part (oil filter, brake pads, battery) with a life in km and days |
| Chassis layout | Data that defines axles, tyre positions and spare positions of a unit (head, trailer tail, rigid truck); the map is drawn from it |
| Tyre code | System identifier of a tyre (TY-0101), generated, never reused |
| Serial number | The number printed on the tyre; unique per brand \[A\] |
| Goods Receipt (GR) | Parts into the warehouse from a supplier; posted without approval |
| Goods Issue (GI) | Parts out of the warehouse into a WO, written by the Stock step |
| Stock opname | Physical count of parts; one document, many SKU rows; needs approval |
| Tyre count | Physical count of tyres in the warehouse; needs approval |
| Retread dispatch | Tyres sent to a retread vendor (vulkanisir) |
| Maintenance schedule | The Planner's calendar of WO cards; a plan, never a rule on the WO |
| Self-approved / Self-verified | Mark on a stamp when the System Admin decides its own work |
| DVIR | Daily vehicle inspection report |
| CPK | Cost per km |
| SPK | Surat Perintah Kerja; the same thing as a WO |
| Purchase line | A line of the Part Purchase step: a part from the WO's part list (set by the Planner or System Admin) bought outside, with a typed quantity and price; never changes warehouse stock |
| Normal life | The km and days a part item type should last, set by the Planner |
| Early failure | A part replaced before the tolerance of its normal life; raises an alert, never blocks |
| Invoice | The bill to a vehicle's customer for the WOs completed on one day |
| Setup mode | The state before go-live: only the System Admin enters data, without approval; no WOs exist |
| Go live | The one-way switch from Setup mode to normal operation |
| Stooring | The mobilisation fee for work done outside the workshop, priced per area |
| Vendor | A supplier, workshop, retread vendor or shop picked from the vendor master |
| Claim | Taking an unassigned step by being the first executor to open it |

## 2. Roles and permissions

Ten roles exist, each account holds exactly one, and exactly one account holds System Admin (`BR-14`). The permission matrix in 2.2 is the default; the Access Manager may change it except for the cells marked locked (`REQ-IAM-005`).

### 2.1 Role catalogue

| ID | Role (`role_t`) | Channel | Purpose |
| --- | --- | --- | --- |
| `R-PLN` | Maintenance Planner (`Planner`), called "PM" | Web | Plans maintenance: creates WOs and builds their steps, maintains WO presets, plans the schedule, verifies steps, requests completion, sets the normal life of part item types. Agrees approval decisions with the Supervisor or GM; approves in the system only while Planner approval is switched on (`RL-7`) |
| `R-MEC` | Mechanic ([`Mechanic`](<Design Artifact/Step Mechanic Action-html/Mechanic.dc.html>)) | Web or tablet; mobile from P1 | Does repairs: Mechanic Action, Part Replacement and Part Check steps with the work location, change requests, field findings |
| `R-WHM` | Warehouse Manager (`Warehouse_Manager`), the only warehouse role | Web | Parts and tyres: Goods Receipts, Stock steps and Part Purchase steps, receive tyres, retread, stock opname, tyre count |
| `R-SUP` | Supervisor (`Supervisor`) | Web; mobile from P1 | Approver; owns customer invoices together with Accounting |
| `R-GM` | General Manager (`GM`), acts as director | Web; mobile from P1 | Approver with every right of `R-SUP`, plus wider data (`RL-8`) |
| `R-SA` | System Admin (`System_Admin`), exactly one account | Web; mobile field menu (R1 step 7) | Every operational permission of every other role, plus master data, vehicles, documents, baseline, odometer voids and AI settings. Covers the field admin work (admin lapangan): drafts WOs, records purchase lines, repairs, verifies. May self-approve and self-verify (marked). Cannot manage accounts, roles or permissions |
| `R-AM` | Access Manager (`Access_Manager`), one or more accounts | Web | Accounts, roles, permissions, the Planner approval switch, and moving the System Admin role. No operational work |
| `R-DRV` | Driver (`Driver`) | Mobile (R1 step 7) | Daily inspection, breakdown report, odometer, requests for repair. Until the mobile app ships, the System Admin enters this data for the driver |
| `R-FC` | Field Coordinator / Koordinator Lapangan (`Field_Coordinator`), merged with the former Dispatcher | Web; mobile (R1 step 7) | Fleet availability, schedule and alerts for trip planning; creates draft WOs from driver requests and field findings and sends them to the Planner for review; executes the Part Purchase step (`RL-6`) |
| `R-ACC` | Accounting (`Accounting`) | Web | Customers and invoices: reviews the daily invoice drafts, issues, prints, marks paid or void (4.23). Reads completed WO costs; no maintenance work |

### 2.2 Permission matrix

X = allowed, V = view only, blank = not allowed, L = locked by a business rule (the Access Manager cannot change it), S = switchable: off by default, the Access Manager switches it on or off (REQ-IAM-008).

| Capability | PLN | MEC | WHM | SUP | GM | SA | AM | DRV | FC | ACC | Ref |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Create, edit and submit a WO | X | X |  |  |  | X |  |  | X |  | REQ-WO-001 |
| Approve or reject WO creation, amendment, completion | S |  |  | X L | X L | X L |  |  |  |  | BR-04, REQ-IAM-008 |
| Cancel a WO |  |  |  | X | X | X |  |  |  |  | REQ-WO-008 |
| Stock step (cut stock from the warehouse) |  |  | X |  |  | X |  |  |  |  | REQ-STK-001 |
| Part Purchase step (bought outside) |  |  | X |  |  | X |  |  | X |  | REQ-PUR-001 |
| Execute Mechanic Action or Part Replacement |  | X |  |  |  | X |  |  |  |  | REQ-MEC-*, REQ-PLC-* |
| Execute a Mobilisasi step |  | X |  |  |  | X |  |  |  |  | REQ-MBL-* |
| Execute a Document step |  |  |  |  |  | X |  |  |  |  | REQ-DOC-007 |
| Verify or return a step | X |  |  |  |  | X |  |  |  |  | REQ-ENG-005 |
| Request completion approval | X |  |  |  |  | X |  |  |  |  | REQ-ENG-006 |
| Raise a change request (executor of the open step) |  | X | X |  |  | X |  |  | X |  | REQ-CR-001 |
| Build WO steps, maintain WO presets and PM packages | X |  |  |  |  | X |  |  |  |  | REQ-REG-001 |
| Part item types: normal life and early-failure tolerance | X |  |  |  |  | X |  |  |  |  | REQ-BSL-007 |
| Other master data (services, classes and layouts, document types, thresholds, tyre statuses, stooring rates, vendors) |  |  |  |  |  | X |  |  |  |  | 7.3 |
| Add, edit, deactivate vehicles; document first entry and correction; parts baseline and correction; odometer void |  |  |  |  |  | X |  |  |  |  | REQ-VEH-*, REQ-DOC-*, REQ-BSL-\* |
| Record a manual odometer reading \[A\] | X |  |  |  |  | X |  |  |  |  | REQ-VEH-006 |
| Inspection and breakdown for a driver (until the mobile app ships) |  |  |  |  |  | X |  |  |  |  | REQ-PM-004 |
| Inspection, breakdown, odometer, repair request on the phone |  |  |  |  |  |  |  | X |  |  | REQ-MOB-003 |
| Goods Receipt, GR correction, parts master, stock opname |  |  | X |  |  | X |  |  |  |  | REQ-INV-\* |
| Receive tyres, retread, worn out, scrap, tyre count |  |  | X |  |  | X |  |  |  |  | REQ-TYR-\* |
| Approve stock opname and tyre count | S |  |  | X L | X L | X L |  |  |  |  | BR-12 |
| Place and move schedule cards | X |  |  |  |  | X |  |  | V |  | REQ-SCH-002 |
| View the schedule | X | V | V | V | V | X |  |  | V |  | REQ-SCH-005 |
| View vehicles, documents and the placement map | V | V | V | V | V | X |  |  | V | V | REQ-PLC-012 |
| Part age and early-failure alerts | V |  |  | V | V | V |  |  |  |  | REQ-APR-011, REQ-BSL-009 |
| Customers and invoices |  |  |  | X | V \[A\] | X |  |  |  | X | REQ-BIL-\* |
| Reports (P1) | V |  | V (Inventory tab) \[A\] | V (no Cost tab) \[A\] | V (all tabs) | V |  |  |  | V (Billing tab) \[A\] | REQ-RPT-004 |
| Manage accounts, roles, permissions; move System Admin |  |  |  |  |  | L | X L |  |  |  | BR-14 |
| Switch Planner approval on or off |  |  |  |  |  | L | X L |  |  |  | REQ-IAM-008 |
| Audit log \[A\] |  |  |  |  | V | V | V |  |  |  | REQ-IAM-007 |
| AI assistant settings (P1) |  |  |  |  |  | X |  |  |  |  | REQ-AI-002 |
| Setup mode data entry without approval; Go live | - | - | - | - | - | X L | - | - | - | - | REQ-IAM-010 |
| Assign or reassign a step | X | - | - | - | - | X | - | - | - | - | REQ-ENG-011 |
| Set the driver of a vehicle | - | - | - | - | - | X | - | - | X | - | REQ-VEH-010 |

### 2.3 Role rules

| ID | Rule |
| --- | --- |
| RL-1 | Each account has exactly one role (`uq_one_role_per_user`). The mobile app therefore always shows one menu. |
| RL-2 | Exactly one account holds System Admin (`BR-14`). Only an Access Manager moves it, in one step with a reason. |
| RL-3 | The System Admin passes every operational role check (executor, verifier, approver) and every self-decision is marked Self-approved or Self-verified (`BR-03`). It also covers the field admin work, so no separate field admin role exists. |
| RL-4 | The System Admin never manages accounts, roles or permissions and never opens Users and roles. |
| RL-5 | The Access Manager does no operational work: no WOs, steps, stock, approvals or verifications. |
| RL-6 | The Field Coordinator creates draft WOs and sends them to the Planner for review (source `Manual_Field_Coordinator`), executes the Part Purchase step and sets the driver of a vehicle (REQ-VEH-010). Everything else is read only: it never issues from the warehouse, moves a schedule card, verifies or approves. |
| RL-7 | Planner approval is off by default. While an Access Manager has switched it on, every Planner is an Approver for the approval kinds the Access Manager ticked: WO creation, amendment, completion, stock opname, tyre count. `BR-03` still applies: a Planner never approves a WO it created. Every switch is written to the audit log and notified to Supervisors and GMs. |
| RL-8 | The GM is the director: every right of the Supervisor, plus fleet-wide cost figures, all report tabs including Cost, the early-failure report and the audit log \[A\]. |
| RL-9 | Accounting does no maintenance work; it sees completed WOs only through their invoices and the vehicles read only. |
| RL-10 | The company has no branches: there is no branch field, filter or data scope anywhere (DEC-55). |

## 3. Domain model and state machines

The WO is the root aggregate: every stock movement into a WO, service line, tyre placement and document renewal hangs off one WO step. A state not listed in a machine below cannot be entered; a transition not listed is refused.

### 3.1 Entities

| Entity | What it is | Main tables | Area |
| --- | --- | --- | --- |
| User and role | An account with exactly one role | `users`, `user_roles` | IAM |
| Vehicle | A fleet unit with class, chassis layout, odometer and derived status | `vehicles`, `vehicle_classes`, `chassis_layouts`, `odometer_logs` | VEH |
| Vehicle document | STNK, KIR, insurance and other types, one current row per type | `document_types`, `vehicle_documents`, `document_renewals`, `document_corrections` | DOC |
| WO preset | Saved step sequence; an optional starting point for a WO | `wo_presets`, `wo_preset_steps`, `assignment_modules` | REG |
| Work Order | The authorization with status, approvals and cost | `work_orders`, `work_order_approvals` | WO |
| Step | One assignment of a WO, built in Create WO and frozen at approval | `work_order_assignments` | ENG |
| WO content | Part lines, tyre lines, service lines, attachments | `work_order_parts`, `work_order_services`, `wo_attachments` | STK, MEC |
| Change request | Request to amend WO content | `wo_change_requests` | CR |
| Part | A catalog SKU with quantity and moving average cost | `parts_catalog`, `stock_cards` | INV |
| Warehouse document | Goods Receipt, GR correction, Goods Issue, stock opname | `goods_receipts`, `gr_corrections`, `goods_issues`, `stock_adjustments` | INV |
| Tyre | An individual asset with code, serial number and status | `tyres`, `tyre_statuses`, `tyre_events` | TYR |
| Tyre document | Receive tyres, retread dispatch, tyre count | `tyre_receipts`, `retread_orders`, `tyre_counts` | TYR |
| [Placement](<Design Artifact/Step Part Replacement map-html/Placement.dc.html>) | Which tyre sits at which position now, and its history | `part_positions`, `part_placements`, `part_placement_logs` | PLC |
| Part item | A tracked service part per vehicle, with last replacement and next due | `part_item_types`, `vehicle_part_items` | BSL |
| Alert | PM, part item, tyre or document alert that can draft a WO | `maintenance_alerts` | PM |
| Inspection and breakdown | Driver data, entered by the System Admin in release 1 | `dvir_logs`, `breakdown_reports` | PM |
| Schedule card | A WO placed on a planned day | `wo_schedule`, `wo_schedule_log`, `schedule_alerts` | SCH |
| Notification | An in-app notice, also pushed to the mobile app | `notifications`, `notification_deliveries` | NTF |
| Audit record | Append-only record of every change | `audit_logs` | NFR |
| Customer and invoice | The owner of a vehicle, and the daily bill for its completed WOs | customers, invoices, invoice\_lines, invoice\_payments | BIL |
| Early failure | A part item or tyre replaced before the tolerance of its normal life | early\_failure\_events | BSL |

### 3.2 SM-WO: Work Order lifecycle

&#91;embedded content: WO lifecycle · 9 states, transitions T1 to T15\]

Approval sits at both ends of the main row; Pending Amendment, Rejected and the return of a step are side loops, and only Completed and Cancelled are final.

| # | From | Event | Actor | Guard | To | Effect |
| --- | --- | --- | --- | --- | --- | --- |
| T1 | (new) | Create, or an alert, inspection, breakdown or field finding drafts it | Creator or system | Vehicle is not Inactive; the system is Live (REQ-IAM-010) | Draft | Number assigned |
| T2 | Draft | Submit | Planner or System Admin (a Mechanic or Field Coordinator only sends it for review, REQ-WO-016) | Every required creation section filled (`REQ-WO-004`) | Pending\_Approval | Approvers notified |
| T3 | Pending\_Approval | Approve | Approver | Approver is not the creator, unless System Admin (`BR-03`) | Active | Steps frozen; step 1 Open, others Locked; creation stamp |
| T4 | Pending\_Approval | Reject | Approver | Reason given | Rejected | Creator notified |
| T5 | Rejected | Edit and resubmit | Creator | As T2 | Pending\_Approval |  |
| T6 | Draft, Rejected | Cancel | Creator | Reason given | Cancelled |  |
| T7 | Active | First step started | System |  | In\_Progress | `started_at` set; downtime WO sets vehicle Repair |
| T8 | Active, In\_Progress | Change request submitted | Executor of the open step |  | Pending\_Amendment | `status_before_amendment` saved; open step frozen |
| T9 | Pending\_Amendment | Revision approved | Approver |  | status before | Content replaced; amendment number +1 |
| T10 | Pending\_Amendment | Revision rejected | Approver | Reason given | status before | Content unchanged |
| T11 | In\_Progress | Last step submitted | System | Every step Submitted, Verified or Skipped | Pending\_Verification |  |
| T12 | Pending\_Verification | A step is returned | Verifier | Note given | In\_Progress \[A\] | Step back to its executor |
| T13 | Pending\_Verification | Completion approved | Approver | Completion requested; every step Verified or Skipped (`BR-05`) | Completed | Completion stamp; vehicle status recalculated; part items reset; Issued tyres released |
| T14 | Pending\_Verification | Completion rejected | Approver | Reason given | Pending\_Verification | Planner notified |
| T15 | any open status | Cancel | Approver | Reason given; posted issues reversed first | Cancelled | Issued tyres return to In\_Stock; schedule card leaves open lists |

### 3.3 SM-STEP: step (assignment)

| From | Event | Actor | To | Effect |
| --- | --- | --- | --- | --- |
| Locked | WO approved (step 1) or previous step submitted | System | Open | Executor notified; opened\_at set, the waiting time starts |
| Open | Start, or Start from an earlier time with a reason (DEC-87) | Executor; Field Coordinator or System Admin for an external workshop | In\_Progress | `started_at` set by Start only, never by opening, viewing or Save draft; claims an unassigned step; the form becomes editable |
| In\_Progress, not paused | Submit | Executor | Submitted | Executor stamp; module submit behaviour runs; next step opens |
| In\_Progress | Pause with a reason | Executor; System for a change request | In\_Progress, shown as Paused | Work time stops; form read-only; Submit unavailable |
| In\_Progress, Paused | Resume | Executor; System when the change request is decided | In\_Progress | Work time runs again |
| Submitted | Verify | Verifier | Verified | Verifier stamp (Self-verified when System Admin verifies own step) |
| Submitted | Return with note | Verifier | Open, shown as Returned; the next attempt needs Start again | Later steps stay as they are |
| Open | Skip with reason (P1) | Executor, Approver consent \[A\] | Skipped | Only for an optional step |

WHILE the WO is Pending\_Amendment, THE SYSTEM SHALL refuse every edit and submit on its open step.

Module contract, Mobilisasi (`REQ-MBL-*`): the Mobilisasi step uses the standard SM-STEP lifecycle above with no new states. Its Start opens a map and route to the driver's captured location (`REQ-MBL-003`); WHEN the mechanic reaches that location THE SYSTEM SHALL auto-submit the step, and a manual Finish stooring control SHALL also submit it (`REQ-MBL-004`); WHILE the step is In\_Progress THE SYSTEM SHALL record the mechanic's location trail for the duration of the step only (`REQ-MBL-005`, RSK-09).

### 3.4 SM-VEH: vehicle status (derived)

| Status | Holds while | Precedence \[A\] |
| --- | --- | --- |
| Inactive | The System Admin deactivated it | 1 |
| Blocked | A required document is Missing or Expired | 2 |
| Repair | A WO of a downtime type is In\_Progress, Pending\_Verification or Pending\_Amendment | 3 |
| Active | None of the above | 4 |

THE SYSTEM SHALL recalculate the status whenever a WO, a document or the deactivation flag changes, and show the highest-precedence status.

### 3.5 SM-DOC: vehicle document status

| From | Event | To |
| --- | --- | --- |
| (none for a required type) | Vehicle saved without it | Missing |
| Missing | First entry saved | Valid, Warning or Expired by its dates |
| Valid | Daily job: today ≥ expiry − `document_types.warning_days` | Warning (one Draft Document WO created) |
| Warning | Daily job: today ≥ expiry date | Expired |
| Warning, Expired | Document step of the renewal WO verified | Valid |
| any | Correct entry by the System Admin, before the first renewal WO | Recalculated from the corrected dates |

### 3.6 SM-TYRE: tyre status

| From | Event | Document | To |
| --- | --- | --- | --- |
| (new) | Receive tyres confirmed, type New | `tyre_receipts` | In\_Stock |
| (new) | Tyre bought outside, recorded in the Part Purchase step | WO | Issued |
| In\_Stock | Chosen in a Stock step that is submitted | WO | Issued (`issued_wo_id` set) |
| Issued | WO cancelled, completed without mounting, or issue reversed | WO | In\_Stock (event Released) |
| Issued | Mount in the Part Replacement step of the same WO | WO | Mounted |
| In\_Stock | Mounted in the parts baseline | none | Mounted |
| Mounted | Rotate | WO | Mounted (new position) |
| Mounted | Demount, condition chosen | WO | Needs\_Retread, Worn\_Out or In\_Stock |
| Mounted | Scrap | WO | Scrapped |
| Needs\_Retread | Retread dispatch confirmed | `retread_orders` | On\_Retread |
| Needs\_Retread | Worn out dialog | none | Worn\_Out |
| Needs\_Retread, Worn\_Out | Scrap dialog | none | Scrapped |
| On\_Retread | Retread return, Accepted | `tyre_receipts` | In\_Stock (retread count +1) |
| On\_Retread | Retread return, Rejected | `tyre_receipts` | Scrapped |
| In\_Stock, Needs\_Retread, Worn\_Out | Tyre count approved with result Missing | `tyre_counts` | Lost |

Scrapped and Lost are final. Every transition writes one `tyre_events` row with the document, user and time.

### 3.7 Warehouse and tyre documents

| Machine | States and transitions |
| --- | --- |
| SM-GR Goods Receipt | Draft → Posted (Post, no approval). A posted receipt is changed only by a GR correction, which is posted directly. |
| SM-SA Stock opname, SM-TC Tyre count | Draft → Pending\_Approval (Submit) → Approved (Approver; stock or tyre status adjusted). Pending\_Approval → Draft with `returned_reason` (Reject; shown as Returned). |
| SM-TR Receive tyres | Draft → Confirmed. |
| SM-RD Retread dispatch | Draft → Sent (Confirm) → Partial (some tyres returned) → Closed (every tyre Accepted or Rejected). |
| SM-CR Change request | Submitted → In\_Revision (creator opens it) → Pending\_Approval (revision sent) → Approved or Rejected. |
| SM-SCH Schedule card | Not planned → Planned (placed) → Missed (daily job, day passed, WO not Completed) → Planned (moved). A Completed or Cancelled WO leaves the open lists and stays on its last day. |
| SM-INV Invoice | Draft (completed WOs added) → Issued (number given, lines locked) → Paid (payment recorded). Draft or Issued → Void (reason; its WOs return to a new Draft). Paid and Void are final. |

## 4. Functional requirements

Each area lists its requirements and then its acceptance criteria. Columns: **ID**, **P** (priority), **Requirement** (EARS), **Screens** (artboard names), **Data** (tables), **Rules**. Every requirement is written in EARS, so each one is directly testable as stated. The acceptance criteria add concrete examples for the behaviours most likely to be built wrong; each names the requirement it verifies. The state machines in section 3 are tested transition by transition.

### 4.1 WO: Work Order lifecycle (P0, risk: high)

Goal: every planned or unexpected job becomes a WO that an Approver authorizes before any work starts. States and transitions: `SM-WO` (3.2).

| ID | P | Requirement | Screens | Data | Rules |
| --- | --- | --- | --- | --- | --- |
| REQ-WO-001 | P0 | THE SYSTEM SHALL let a Planner or the System Admin create a WO (SPK), and a Mechanic or Field Coordinator create a Draft WO for review (REQ-WO-016), for one vehicle, with a title, a category (PM, Corrective, Tyre, Document, Other), whether the vehicle goes to the workshop, description, priority, its steps (REQ-WO-017), required part lines (SKU and quantity, issued in the Stock step), parts to buy (SKU only, no quantity, for the Part Purchase step, DEC-64) and tyre lines (size, quantity), each entered inside the step it belongs to (REQ-WO-017). | [`CreateWO`](<Design Artifact/Create Work Order step composer-html/CreateWO.dc.html>), [`WOList`](<Design Artifact/Work Orders tab-html/WOList.dc.html>) | `work_orders`, `work_order_parts` | BR-01 |
| REQ-WO-002 | P0 | THE SYSTEM SHALL record one source per WO: `System_PM`, `Tyre_Alert`, `Document_Alert`, `Driver_DVIR`, `Driver_Breakdown`, `Manual_Planner`, `Manual_Mechanic`, Manual\_Field\_Coordinator or `Manual_Admin`. | [`CreateWO`](<Design Artifact/Create Work Order step composer-html/CreateWO.dc.html>) | `work_orders.request_source` |  |
| REQ-WO-003 | P0 | WHEN a PM, part item, tyre or document alert, a failed inspection, a breakdown or a field finding drafts a WO, THE SYSTEM SHALL create it as Draft and never as Active. WHEN a Driver breakdown (source `Driver_Breakdown`) drafts a WO, THE SYSTEM SHALL pre-seed that Draft WO with exactly one Mobilisasi step (`REQ-MBL-001`) whose destination is the driver's location captured on the breakdown report (`REQ-MOB-003`); the Planner composes every other step. | [`CreateWOFromAlert`](<Design Artifact/Create WO from an alert-html/CreateWOFromAlert.dc.html>) | `work_orders`, `maintenance_alerts`, `work_order_assignments`, `breakdown_reports` | BR-04 |
| REQ-WO-004 | P0 | IF a required creation section of any step is empty (for example a Stock step with no part or tyre line, or a Document step with no document), THEN THE SYSTEM SHALL refuse Submit for approval and point to that section (REQ-WO-017). | [`CreateWO`](<Design Artifact/Create Work Order step composer-html/CreateWO.dc.html>) | `work_order_parts` |  |
| REQ-WO-005 | P0 | WHEN an Approver approves creation, THE SYSTEM SHALL set the WO Active, freeze its steps, open step 1, lock the other steps and write the creation stamp. | [`ApprovalReview`](<Design Artifact/Review approval creation-html/ApprovalReview.dc.html>) | `work_orders`, `work_order_assignments`, `work_order_approvals` | BR-04, BR-05 |
| REQ-WO-006 | P0 | IF the approver created the WO and is not the System Admin, THEN THE SYSTEM SHALL refuse the decision. WHEN the System Admin approves its own WO, THE SYSTEM SHALL mark the stamp and the audit record Self-approved. | [`ApprovalReview`](<Design Artifact/Review approval creation-html/ApprovalReview.dc.html>) | `work_order_approvals.self_approved` | BR-03 |
| REQ-WO-007 | P0 | WHEN an Approver rejects creation with a reason, THE SYSTEM SHALL set the WO Rejected and notify the creator, who can edit and resubmit it ([`CreateWO`](<Design Artifact/Create Work Order step composer-html/CreateWO.dc.html>) in edit mode) or cancel it. | [`WORejected`](<Design Artifact/Work Order rejected-html/WORejected.dc.html>), [`WOList`](<Design Artifact/Work Orders tab-html/WOList.dc.html>) | `work_order_approvals` |  |
| REQ-WO-008 | P0 | WHEN an Approver cancels a WO with a reason, THE SYSTEM SHALL first reverse its posted goods issues, return its Issued tyres to In\_Stock, then set it Cancelled. Items already bought in a Part Purchase step SHALL be listed for the Warehouse Manager, who maps each to a SKU (adding the part when needed) and receives it with a Goods Receipt of type From cancelled WO at its purchase price, or marks it as not kept with a reason; they are never billed. | [`CancelWO`](<Design Artifact/Cancel Work Order (dialog)-html/CancelWO.dc.html>), [`WorkOrder`](<Design Artifact/Work Order detail-html/WorkOrder.dc.html>) | `work_orders.cancel_reason`, `goods_issues`, `tyres` | BR-06 |
| REQ-WO-009 | P0 | WHILE a WO marked Vehicle goes to the workshop is In\_Progress, Pending\_Verification or Pending\_Amendment, THE SYSTEM SHALL show its vehicle as Repair (`SM-VEH`). | [`Vehicles`](<Design Artifact/Vehicles tab-html/Vehicles.dc.html>), dashboards | `vehicles.status`, `work_orders.requires_downtime` |  |
| REQ-WO-010 | P0 | THE SYSTEM SHALL list WOs in the tabs Active, My steps, Draft, Pending approval, Rejected, Completed, Cancelled and All (with counts), with search, type and vehicle filters and the columns WO, vehicle, type, status, current step, waiting on, action. | [`WOList`](<Design Artifact/Work Orders tab-html/WOList.dc.html>) | `work_orders` |  |
| REQ-WO-011 | P0 | THE SYSTEM SHALL show on the WO detail one card per step with its status, the cost so far, the timeline and the approval block, with the buttons WO document, Raise change request (open step executor), Cancel WO (Approvers only) and Reverse issue on a submitted Stock step (Warehouse Manager or System Admin). | [`WorkOrder`](<Design Artifact/Work Order detail-html/WorkOrder.dc.html>), [`WODetailVerify`](<Design Artifact/WO detail verification and completion-html/WODetailVerify.dc.html>) | `work_order_assignments` |  |
| REQ-WO-012 | P0 | WHEN a user creates a WO from an alert or from a vehicle, THE SYSTEM SHALL prefill the vehicle, and from an alert also the source and a preset with its steps: the PM package's preset for a PM alert, and for tyre, part item and document alerts the preset set in Settings, Alert rules (REQ-PM-007, REQ-PM-008). The user MAY change the steps. | [`CreateWOFromAlert`](<Design Artifact/Create WO from an alert-html/CreateWOFromAlert.dc.html>), [`VehicleOverview`](<Design Artifact/Vehicles Overview tab-html/VehicleOverview.dc.html>) | `maintenance_alerts` |  |
| REQ-WO-013 | P0 | IF the vehicle is Inactive, THEN THE SYSTEM SHALL refuse to create a WO for it. | [`CreateWO`](<Design Artifact/Create Work Order step composer-html/CreateWO.dc.html>) | `vehicles.status` |  |
| REQ-WO-014 | P0 | THE SYSTEM SHALL show the Planner, Field Coordinator and System Admin a Requests list of Draft WOs drafted from driver inspections, breakdowns and field findings (with the report photos), and let them complete the category, description and the parts needed and send it for review (Field Coordinator) or submit it for approval (Planner, System Admin, REQ-WO-016), or cancel it with a reason. A breakdown draft SHALL already carry its one pre-seeded Mobilisasi step (`REQ-WO-003`); the Planner composes the remaining steps. These actors create and complete Draft WOs only and never activate one: activation is the Planner's submit and approval is the Supervisor's (BR-03, BR-04, REQ-WO-016). | [FCRequests](<Design Artifact/Requests draft WOs from drivers (Field Coordinator)-html/FCRequests.dc.html>), [FCCreateWO](<Design Artifact/Complete and submit a draft WO (Field Coordinator)-html/FCCreateWO.dc.html>), [FCMobileRequests](<Design Artifact/Mobile Field Coordinator requests-html/FCMobileRequests.dc.html>), [FCMobileCreateWO](<Design Artifact/Mobile Field Coordinator completes a draft WO-html/FCMobileCreateWO.dc.html>) | work\_orders, dvir\_logs, breakdown\_reports, work\_order\_assignments | RL-6 |
| REQ-WO-015 | P0 | THE SYSTEM SHALL offer the priorities Low, Normal (default), High and Urgent; Urgent and High WOs SHALL sort first in every list and inbox, and WHEN an Urgent WO is submitted, THE SYSTEM SHALL notify every Approver at once by in-app and push; priority sets no deadline; late WOs are alerted by REQ-SCH-007. | [CreateWO](<Design Artifact/Create Work Order step composer-html/CreateWO.dc.html>), [WOList](<Design Artifact/Work Orders tab-html/WOList.dc.html>), [Approvals](<Design Artifact/Approvals (inbox)-html/Approvals.dc.html>) | work\_orders.priority | - |
| REQ-WO-016 | P0 | WHEN a Mechanic or Field Coordinator sends a Draft WO, THE SYSTEM SHALL keep it Draft, mark it Sent for review, list it for the Planners and the System Admin and notify them; a Planner or the System Admin SHALL check it, SHALL build its steps in Create WO (REQ-WO-017), turning the parts needed into Stock or Part Purchase lines, MAY change any field, and submits it for approval. A draft from a Mechanic or Field Coordinator carries no steps; it MAY list the parts needed (work\_order\_part\_requests). The sender SHALL see every change in the WO history and SHALL NOT submit it for approval (DEC-64). | [FCRequests](<Design Artifact/Requests draft WOs from drivers (Field Coordinator)-html/FCRequests.dc.html>), [FCCreateWO](<Design Artifact/Complete and submit a draft WO (Field Coordinator)-html/FCCreateWO.dc.html>), [CreateWO](<Design Artifact/Create Work Order step composer-html/CreateWO.dc.html>) | work\_orders.sent\_for\_review\_at | RL-6 |
| REQ-WO-017 | P0 | THE SYSTEM SHALL let a Planner or the System Admin build the steps of a WO directly in Create WO, on one screen: the common fields (title, vehicle, category, priority, Vehicle goes to the workshop, description) and a step list. The user adds a step by dragging a module from the palette onto a drop zone between steps, or with Add step; reorders steps by dragging or with Move up and Move down; removes a step; and sets for each step its executor role, verifier, optional flag and details, rendered from the module's creation section (part lines with quantity for Stock, parts to buy for Part Purchase, work to do and assignee for Mechanic Action, positions for Part Replacement, the document for Document). The details move with their step. The user MAY start from a WO preset, which fills the steps and the common fields, and MAY save the current steps as a preset (REQ-REG-003). A Checks panel shows the rules of REQ-REG-004 live. The form SHALL NOT hard-code any module (REQ-REG-006, DEC-85). Drafts from a Mechanic or Field Coordinator show no step section (REQ-WO-016). | [CreateWO](<Design Artifact/Create Work Order step composer-html/CreateWO.dc.html>), [FCCreateWO](<Design Artifact/Complete and submit a draft WO (Field Coordinator)-html/FCCreateWO.dc.html>), [FCMobileCreateWO](<Design Artifact/Mobile Field Coordinator completes a draft WO-html/FCMobileCreateWO.dc.html>) | assignment\_modules.creation\_schema | REQ-REG-006 |

| ID | Verifies | Acceptance criterion |
| --- | --- | --- |
| AC-WO-001 | REQ-WO-006 | WHEN the Planner who created and submitted WO-0142 opens its approval, THE SYSTEM SHALL refuse the decision; WHEN a Supervisor approves it, THE SYSTEM SHALL accept. |
| AC-WO-002 | REQ-WO-005 | WHEN a WO with three steps is approved, THE SYSTEM SHALL show step 1 Open and steps 2 and 3 Locked. |
| AC-WO-003 | REQ-WO-004 | IF a WO with a Stock step has no part line, THEN Submit for approval SHALL be refused with a message. |
| AC-WO-004 | REQ-WO-008 | WHEN a WO with one Issued tyre and one posted goods issue is cancelled, THE SYSTEM SHALL reverse the issue, set the tyre In\_Stock and the WO Cancelled, in that order. |
| AC-WO-005 | REQ-WO-007 | IF a rejection has no reason, THEN it SHALL be refused; WHEN it has one, the WO SHALL appear in the creator's Rejected tab with the reason. |
| AC-WO-006 | REQ-WO-006 | WHEN the System Admin approves a WO it created, the stamp SHALL read Self-approved and the audit record SHALL carry the flag. |

### 4.2 ENG: assignment engine (P0, risk: critical)

Goal: run the steps of a WO in order while verification happens in parallel. States: `SM-STEP` (3.3).

| ID | P | Requirement | Screens | Data | Rules |
| --- | --- | --- | --- | --- | --- |
| REQ-ENG-001 | P0 | THE SYSTEM SHALL run the steps of a WO in the order its steps were built in Create WO and frozen at approval; one WO may hold several steps of the same module. | [`WorkOrder`](<Design Artifact/Work Order detail-html/WorkOrder.dc.html>) | `work_order_assignments` | BR-05 |
| REQ-ENG-002 | P0 | WHEN a step is submitted, THE SYSTEM SHALL open the next step at once, without waiting for verification. | [`WorkOrder`](<Design Artifact/Work Order detail-html/WorkOrder.dc.html>) | `work_order_assignments.submitted_at` | BR-05 |
| REQ-ENG-003 | P0 | THE SYSTEM SHALL let only a user whose role is one of the step's executor roles (or the System Admin) open, edit and submit that step. | step screens | `executor_role` | BR-03 |
| REQ-ENG-004 | P0 | WHEN a WO preset is changed, THE SYSTEM SHALL save a new version; a WO never follows a preset after it is created, because it keeps its own steps. | [`SettingsWOPresets`](<Design Artifact/Settings WO presets-html/SettingsWOPresets.dc.html>) | `wo_presets.version` |  |
| REQ-ENG-005 | P0 | THE SYSTEM SHALL let a Planner or the System Admin verify a submitted step, or return it to its executor with a required note; returning a step SHALL NOT re-lock later steps. | [`WODetailVerify`](<Design Artifact/WO detail verification and completion-html/WODetailVerify.dc.html>), [`StepVerify`](<Design Artifact/Verify a step-html/StepVerify.dc.html>), [`StepReturned`](<Design Artifact/Step state returned-html/StepReturned.dc.html>) | `verified_by`, `return_note` |  |
| REQ-ENG-006 | P0 | THE SYSTEM SHALL enable Request completion approval only when every step is Verified or Skipped, and show why it is disabled otherwise. | [`WODetailVerify`](<Design Artifact/WO detail verification and completion-html/WODetailVerify.dc.html>) | `completion_requested_at` | BR-05 |
| REQ-ENG-007 | P0 | IF the verifier executed the step and is not the System Admin, THEN THE SYSTEM SHALL refuse the verification; a System Admin self-verification SHALL be marked Self-verified. | [`StepVerify`](<Design Artifact/Verify a step-html/StepVerify.dc.html>) | `self_verified` | BR-03 |
| REQ-ENG-008 | P0 | THE SYSTEM SHALL show every step screen with a banner (WO number, plate, "Step n of N", module), the step form and a bottom action bar (Save draft, Submit step); a Locked step shows when it opens, a Returned step shows the verifier's note. | [`Stock`](<Design Artifact/Step Stock-html/Stock.dc.html>), [`Mechanic`](<Design Artifact/Step Mechanic Action-html/Mechanic.dc.html>), [`Placement`](<Design Artifact/Step Part Replacement map-html/Placement.dc.html>), [`DocStep`](<Design Artifact/Step Document renewal-html/DocStep.dc.html>), [`StepLocked`](<Design Artifact/Step state locked-html/StepLocked.dc.html>), [`StepReturned`](<Design Artifact/Step state returned-html/StepReturned.dc.html>) |  |  |
| REQ-ENG-009 | P1 | WHERE a step is optional, THE SYSTEM SHALL let it be skipped with a reason and Approver consent \[A\]. | [`WorkOrder`](<Design Artifact/Work Order detail-html/WorkOrder.dc.html>) | `skip_reason` |  |
| REQ-ENG-010 | P0 | THE SYSTEM SHALL show on the verification screen every photo and invoice of the step as a thumbnail that opens the shared viewer (REQ-FUP-016), grouped by slot. | [StepVerify](<Design Artifact/Verify a step-html/StepVerify.dc.html>), [PhotoViewer](<Design Artifact/Component photo and file viewer (dialog)-html/PhotoViewer.dc.html>) | wo\_attachments, stored\_files | BR-05 |
| REQ-ENG-011 | P0 | THE SYSTEM SHALL let a Planner or the System Admin assign a step to one named user who holds one of its executor roles, and reassign it with a reason; WHILE a step has no assignee, the first executor who opens it for editing SHALL claim it. Other users SHALL see a claimed step read only, with the name of the assignee. On a reassign the step's draft (lines, photos, chosen area) SHALL move with the step to the new assignee. The assignee MAY release the step with a reason, which notifies the Planners and makes the step unassigned again (DEC-59). A Stock step with Purchase lines is the exception: its lines are claimed one by one (REQ-STK-010). | [WorkOrder](<Design Artifact/Work Order detail-html/WorkOrder.dc.html>), [MechanicMobileHome](<Design Artifact/Mobile app, Mechanic menu my steps (P1)-html/MechanicMobileHome.dc.html>) | work\_order\_assignments.assigned\_to, claimed\_at | BR-03 |
| REQ-ENG-012 | P0 | THE SYSTEM SHALL record when each step opens and SHALL set its start time only when the executor presses Start; until then the step's form SHALL be read-only and Submit unavailable. Opening, viewing or Save draft SHALL NOT start the clock. Start SHALL claim an unassigned step (REQ-ENG-011). | [`Mechanic`](<Design Artifact/Step Mechanic Action-html/Mechanic.dc.html>), [`Stock`](<Design Artifact/Step Stock-html/Stock.dc.html>), [`PartPurchase`](<Design Artifact/Step Part Purchase (bought outside)-html/PartPurchase.dc.html>), [`Placement`](<Design Artifact/Step Part Replacement map-html/Placement.dc.html>), [`DocStep`](<Design Artifact/Step Document renewal-html/DocStep.dc.html>), [`MechanicMobileStep`](<Design Artifact/Mobile app, Mechanic menu Mechanic Action step (P1)-html/MechanicMobileStep.dc.html>) | `work_order_assignments`, `step_time_events` | DEC-87 |
| REQ-ENG-013 | P0 | THE SYSTEM SHALL let the executor Pause a started step with a reason (Waiting for parts, Waiting for the vehicle, Waiting for vendor or agency, Break or shift ended, Other with a note) and Resume it; work time SHALL stop while paused and Submit SHALL need the step resumed. WHILE the WO waits for a change request decision, THE SYSTEM SHALL pause the open step with reason Change request and resume it at the decision. | Step screens, [`MechanicMobileStep`](<Design Artifact/Mobile app, Mechanic menu Mechanic Action step (P1)-html/MechanicMobileStep.dc.html>) | `step_time_events` | DEC-87 |
| REQ-ENG-014 | P0 | IF the executor forgot to press Start, THEN THE SYSTEM SHALL let them start from an earlier time, at most 2 hours back and never before the step opened, with a reason, and SHALL mark the start as entered. Any other change to a Start, Pause, Resume or Submit time SHALL be made only by a System Admin with a reason, SHALL keep the original time and SHALL be written to the audit log. | [`MechanicMobileStep`](<Design Artifact/Mobile app, Mechanic menu Mechanic Action step (P1)-html/MechanicMobileStep.dc.html>), [`WorkOrder`](<Design Artifact/Work Order detail-html/WorkOrder.dc.html>) | `step_time_corrections`, `audit_logs` | DEC-87 |
| REQ-ENG-015 | P0 | WHEN a verifier returns a step, THE SYSTEM SHALL start a new attempt that needs Start again; the time from the return to the new Start SHALL count as waiting to start, and each step SHALL keep its number of returns. | [`StepReturned`](<Design Artifact/Step state returned-html/StepReturned.dc.html>) | `step_time_events` | DEC-87 |
| REQ-ENG-016 | P0 | For work by an external workshop, the Field Coordinator or System Admin SHALL press Start when the vehicle is handed over and Submit when it is collected, and the event SHALL record the workshop name. On a phone without signal, Start, Pause and Resume SHALL keep the phone time and be checked against the server time on sync; a difference of more than 10 minutes SHALL be flagged on the step and in the report. | [`MechanicExternal`](<Design Artifact/Mechanic Action external team-html/MechanicExternal.dc.html>), mobile step screens | `step_time_events` | REQ-MOB-009 |

| ID | Verifies | Acceptance criterion |
| --- | --- | --- |
| AC-ENG-001 | REQ-ENG-002 | WHEN step 1 is submitted, step 2 SHALL be Open and step 3 SHALL stay Locked. |
| AC-ENG-002 | REQ-ENG-006 | IF step 2 is not verified, THEN Request completion approval SHALL be refused with a clear message. |
| AC-ENG-003 | REQ-ENG-004 | WHEN PM-1 is saved as version 4, a WO started on version 3 SHALL keep its own steps. |
| AC-ENG-004 | REQ-ENG-007 | IF a Mechanic who executed a step tries to verify it, THEN THE SYSTEM SHALL refuse. |
| AC-ENG-005 | REQ-ENG-005 | IF a step is returned without a note, THEN THE SYSTEM SHALL refuse; WHEN it is returned with a note, the executor SHALL see the note on [`StepReturned`](<Design Artifact/Step state returned-html/StepReturned.dc.html>). |
| AC-ENG-006 | REQ-ENG-011 | WHEN mechanic Agus opens an unassigned step first, it SHALL be assigned to Agus and mechanic Dedi SHALL see it read only with Agus as assignee; WHEN the Planner reassigns it to Dedi with a reason, both SHALL be notified. |
| AC-ENG-007 | REQ-ENG-012 | WHEN step 1 of WO-0142 is submitted at 10:40 and Agus presses Start on step 2 at 11:25, THE SYSTEM SHALL record waited to start 45 min; WHEN Agus opens step 2 at 11:00 without pressing Start, its form SHALL stay read-only and no start time SHALL be set. |
| AC-ENG-008 | REQ-ENG-013 | WHEN a step started at 11:25 is paused at 12:00 for Break or shift ended, resumed at 13:00 and submitted at 14:20, THE SYSTEM SHALL record worked 1 h 55 min and paused 1 h 00 min, and SHALL refuse Submit while it is paused. |
| AC-ENG-009 | REQ-ENG-014 | WHEN at 14:40 Agus starts step 3 from 14:22 with reason Forgot to press Start, THE SYSTEM SHALL accept it and mark the start as entered; WHEN he tries 3 hours back, or earlier than the step opened at 14:20, THE SYSTEM SHALL refuse. |
| AC-WOD-008 | REQ-WOD-008 | WHEN WO-0142 is completed and invoiced, its WO document SHALL show the Execution time table with step 2 waiting 18 h 11 min for verification marked as the longest phase, and its invoice SHALL show no step time. |
| AC-CHK-001 | REQ-CHK-002 | WHEN Agus has written the condition and chosen Repair for Air brake hose, axle 2 but added no photo, THE SYSTEM SHALL refuse Submit and name that part. |
| AC-CHK-002 | REQ-CHK-003 | WHEN Rina verifies Part Check WO-0181 with front pads Replace and Unsafe, the hose Repair and the chamber boot Repair, THE SYSTEM SHALL create Draft WO-0182, Urgent, with a Stock step for the pads (in stock), a Part Purchase step for the hose and boot (not in stock) and a Mechanic Action step listing the three jobs; WHEN every part is Good, no draft SHALL be made. |
| AC-CHK-003 | REQ-CHK-004 | WHEN Rina activates WO-0182, it SHALL go to Pending approval, not Active; WHEN she discards it with a reason, verifying the check again SHALL NOT make a new draft. |
| AC-CHK-004 | REQ-CHK-007 | WHEN Agus submits Part Check WO-0181 with SVC-095 Brake system check at Rp 175.000 in Workshop Cikarang, the invoice of WO-0181 SHALL show one service line of Rp 175.000 and no stooring; WHEN he tries to submit with no service line, THE SYSTEM SHALL refuse. |

### 4.3 REG: module registry, step composer and WO presets (P0, risk: critical)

Goal: the Planner and System Admin build the steps of each WO in Create WO and reuse good sequences as presets, and new modules can be added later without changing the engine.

| ID | P | Requirement | Screens | Data | Rules |
| --- | --- | --- | --- | --- | --- |
| REQ-REG-001 | P0 | THE SYSTEM SHALL let only a Planner or the System Admin add, remove and reorder the steps of a WO in Create WO (REQ-WO-017), each step with module, executor role, verifier role (Planner or System Admin), optional flag and step details; every drag action SHALL also be possible without dragging (Add step, Move up, Move down) for keyboard and touch. | [`CreateWO`](<Design Artifact/Create Work Order step composer-html/CreateWO.dc.html>), [`CreateWOFromAlert`](<Design Artifact/Create WO from an alert-html/CreateWOFromAlert.dc.html>) | `work_orders`, `work_order_assignments`, `assignment_modules` |  |
| REQ-REG-002 | P0 | THE SYSTEM SHALL offer as modules only the active rows of the module registry; the first five are Stock, Part\_Purchase, Mechanic\_Action, Part\_Replacement and Document. | [`CreateWO`](<Design Artifact/Create Work Order step composer-html/CreateWO.dc.html>) | `assignment_modules` | PR-6 |
| REQ-REG-003 | P0 | WHEN a Planner or System Admin chooses Save as preset in Create WO, THE SYSTEM SHALL store the steps (module, order, roles, optional flag and details), the category and the workshop flag as a WO preset; IF a preset with that name exists, THEN it SHALL become its new version (`REQ-ENG-004`). | [`CreateWO`](<Design Artifact/Create Work Order step composer-html/CreateWO.dc.html>), [`SettingsWOPresets`](<Design Artifact/Settings WO presets-html/SettingsWOPresets.dc.html>) | `wo_presets`, `wo_preset_steps` |  |
| REQ-REG-004 | P0 | IF a WO has no step, THEN THE SYSTEM SHALL refuse Submit for approval. Besides the creation sections of REQ-WO-004, the only checks are: at most one Document step per WO, and a warning (never a block) when a Part Replacement step comes before any Stock step, because new tyres must be issued to the WO first. THE SYSTEM SHALL add no other rule about which modules may be combined or in which order. | [`CreateWO`](<Design Artifact/Create Work Order step composer-html/CreateWO.dc.html>) |  |  |
| REQ-REG-005 | P0 | WHEN a WO preset or a module is deactivated, THE SYSTEM SHALL stop new use and keep old WOs readable. | [`SettingsWOPresets`](<Design Artifact/Settings WO presets-html/SettingsWOPresets.dc.html>) | `is_active` | BR-10 |
| REQ-REG-006 | P0 | WHEN a module is registered, THE SYSTEM SHALL make it available in the designer, the WO workspace, the WO document and the scope lock without any change to the engine, sequencing, verification, approval, WO document renderer or scope lock code. | all | `assignment_modules` | PR-6 |
| REQ-REG-007 | P0 | THE SYSTEM SHALL let a Planner or System Admin maintain PM packages per vehicle class, each with code, name, interval in km and days (days only for a Towed class, REQ-PLC-018), preset drafted, task list and suggested parts; a class MAY have several packages and each package belongs to one class (DEC-70). | [`SettingsPMPackages`](<Design Artifact/Settings PM packages and tasks-html/SettingsPMPackages.dc.html>) | `pm_packages`, `pm_tasks` |  |

**Module contract.** Every module, the five current ones and any future one, provides exactly these items through its registry row:

| Item | Meaning | Column |
| --- | --- | --- |
| Code and name | Identity in the designer | `code`, `name` |
| Allowed executor roles | Who may run a step of this module (the System Admin always may) | `executor_roles` |
| Step options | Settings the designer may give each step | `config_schema` |
| Creation section | What the WO creator fills for a step of this module in Create WO, and whether it is required (Stock: parts and tyre sizes with quantities, required; Part Purchase: parts to buy without quantity, optional; Mechanic Action and Part Replacement: nothing; Part Check: parts to check with what to check, required; Document: the vehicle document to renew, required). Empty means the step only shows its name | creation\_schema |
| Step screen | The front-end component opened in the WO workspace | `ui_component` |
| Scope rules | What data of the WO's vehicle and which master data the module may read or change | `scope_rules` |
| Completion section | What the WO document prints for the step | `completion_section` |
| Submit behaviour | What happens on submit (Stock cuts stock, Document updates the document) | service handler keyed by `code` |
| Cost contribution | Parts, Labor, Document or None | `cost_kind` |

**Build note.** Do not hard-code the five modules in the engine, the designer, the WO document, the permission checks or database enums. Build them as the first five registry rows using the same contract a future module will use.

| ID | Verifies | Acceptance criterion |
| --- | --- | --- |
| AC-REG-001 | REQ-REG-004 | IF a WO with no step is submitted for approval, THEN THE SYSTEM SHALL refuse. |
| AC-REG-002 | REQ-REG-001 | WHEN a type holds the Stock module in two steps, THE SYSTEM SHALL save it. |
| AC-REG-003 | REQ-REG-006 | WHEN a new module row is registered and activated, it SHALL appear in the designer and in the WO document with no engine change. |
| AC-REG-004 | REQ-WO-017 | WHEN a step is dragged, or moved with Move up or Move down, to a new place, THE SYSTEM SHALL renumber the steps in the new order and keep each step's details with it. |
| AC-REG-005 | REQ-REG-003 | WHEN a WO started from a preset has its steps changed, THE SYSTEM SHALL leave the preset unchanged; WHEN the preset is later saved as a new version, WOs already created SHALL keep their own steps. |

### 4.4 STK: Stock step (P0, risk: high)

Goal: record the parts, tyres and prices a WO uses, and cut warehouse stock when they come from the warehouse.

| ID | P | Requirement | Screens | Data | Rules |
| --- | --- | --- | --- | --- | --- |
| REQ-STK-001 | P0 | THE SYSTEM SHALL record in the Stock step only parts and tyres issued from the warehouse (cut stock); anything bought outside, from a shop or a workshop, is recorded in the separate Part Purchase step (4.4a, DEC-60). | [`Stock`](<Design Artifact/Step Stock-html/Stock.dc.html>), [`PartPurchase`](<Design Artifact/Step Part Purchase (bought outside)-html/PartPurchase.dc.html>) | `work_order_parts.source` |  |
| REQ-STK-002 | P0 | THE SYSTEM SHALL let the executor choose only parts and tyre sizes on the WO's required list; IF the list is wrong, THEN the executor SHALL raise a change request (`REQ-CR-001`) and cannot edit the list. | [`Stock`](<Design Artifact/Step Stock-html/Stock.dc.html>), [`ChangeRequest`](<Design Artifact/Raise a change request-html/ChangeRequest.dc.html>) | `work_order_parts.planned_qty` | BR-02 |
| REQ-STK-003 | P0 | WHEN a Stock step with Warehouse lines is submitted, THE SYSTEM SHALL, in one transaction, write the Goods Issue, reduce stock, write the stock card, and save each line at the moving average cost; IF any part fails, THEN nothing SHALL change. | [`Stock`](<Design Artifact/Step Stock-html/Stock.dc.html>) | `goods_issues`, `goods_issue_items`, `parts_catalog`, `stock_cards`, `work_order_parts` | BR-06, BR-07, NFR-01 |
| REQ-STK-004 | P0 | IF the quantity to issue is more than the stock on hand, THEN THE SYSTEM SHALL refuse the missing quantity and let the Warehouse Manager confirm a shortfall, which adds a Part Purchase step to the WO (REQ-PUR-008) without a change request. | [`Stock`](<Design Artifact/Step Stock-html/Stock.dc.html>) | `parts_catalog.stock_qty` |  |
| REQ-STK-005 | P0 | Retired (DEC-60): parts bought outside are recorded in the Part Purchase step (REQ-PUR-002 to 006). | [`Stock`](<Design Artifact/Step Stock-html/Stock.dc.html>), [`PartPurchase`](<Design Artifact/Step Part Purchase (bought outside)-html/PartPurchase.dc.html>) | `work_order_parts`, `wo_attachments` | BR-06 |
| REQ-STK-006 | P0 | THE SYSTEM SHALL require, for each tyre line from the warehouse, the choice of one tyre per unit by code and serial number from tyres In\_Stock, and WHEN the step is submitted, set each chosen tyre Issued to this WO. | [`Stock`](<Design Artifact/Step Stock-html/Stock.dc.html>) | `tyres.issued_wo_id`, `work_order_parts.tyre_id`, `tyre_events` | BR-11 |
| REQ-STK-007 | P0 | Retired (DEC-60): a tyre bought outside is recorded in the Part Purchase step (REQ-PUR-005). | [`Stock`](<Design Artifact/Step Stock-html/Stock.dc.html>), [`PartPurchase`](<Design Artifact/Step Part Purchase (bought outside)-html/PartPurchase.dc.html>) | `tyres`, `tyre_attachments` |  |
| REQ-STK-008 | P0 | WHEN the Warehouse Manager submits a reversal of a posted line with a reason, THE SYSTEM SHALL hold it until a Planner or System Admin verifies it, then return the stock at the original unit cost (and Issued tyres to In\_Stock). | [`StockReversal`](<Design Artifact/Stock step reversal after submit-html/StockReversal.dc.html>), [`StepVerify`](<Design Artifact/Verify a step-html/StepVerify.dc.html>) | `goods_issues.reverses_gi_id`, `work_order_parts.reverses_line_id` | BR-06 |
| REQ-STK-009 | P0 | THE SYSTEM SHALL accept invoice images on every Stock step transaction. | [`Stock`](<Design Artifact/Step Stock-html/Stock.dc.html>) | `wo_attachments` | NFR-06 |
| REQ-STK-010 | P0 | Retired (DEC-60): the Stock step is executed by the Warehouse Manager or the System Admin and cuts stock only; buying is the Part Purchase step (REQ-PUR-001). | [`Stock`](<Design Artifact/Step Stock-html/Stock.dc.html>), [`FCMobilePurchase`](<Design Artifact/Mobile Field Coordinator Part Purchase step-html/FCMobilePurchase.dc.html>) | `work_order_parts.done_by`, `done_at`, `work_order_assignments.executor_roles` | BR-03 |
| REQ-STK-011 | P0 | WHEN a Stock step opens, THE SYSTEM SHALL notify the Warehouse Manager; WHEN a Part Purchase step opens, THE SYSTEM SHALL send a purchase alert to the Field Coordinators and the System Admin with the suggested items. | [`NotificationCenter`](<Design Artifact/Notification center-html/NotificationCenter.dc.html>) | `notifications` |  |
| REQ-STK-012 | P0 | Retired (DEC-60): there is no Cut stock or Purchase mode per line; the steps built in Create WO decide which steps exist, and the required part list holds only warehouse parts. | [CreateWO](<Design Artifact/Create Work Order step composer-html/CreateWO.dc.html>), [FCCreateWO](<Design Artifact/Complete and submit a draft WO (Field Coordinator)-html/FCCreateWO.dc.html>), [Stock](<Design Artifact/Step Stock-html/Stock.dc.html>) | work\_order\_parts.- | BR-02 |

| ID | Verifies | Acceptance criterion |
| --- | --- | --- |
| AC-STK-001 | REQ-STK-004 | IF a WO needs 8 units and 5 are in stock, THEN submit SHALL be refused, stock SHALL stay 5 and no Goods Issue SHALL exist. |
| AC-STK-002 | REQ-STK-005 | IF an external line has no invoice image, THEN it SHALL be refused; WHEN it has one, it SHALL save and warehouse stock SHALL be unchanged. |
| AC-STK-003 | REQ-STK-002 | A part not on the WO list SHALL NOT be selectable. |
| AC-STK-004 | REQ-STK-006 | WHEN a tyre TY-0110 is chosen and the step submitted, TY-0110 SHALL be Issued with `issued_wo_id` = this WO. |
| AC-STK-005 | REQ-STK-008 | WHEN a reversal is submitted, stock SHALL stay unchanged until the reversal is verified. |
| AC-STK-006 | REQ-STK-010 | WHEN a WO needs 8 L of engine oil and 5 L are in stock, the Warehouse Manager issues 5 L and confirms a shortfall of 3 L, THE SYSTEM SHALL write one Goods Issue for 5 L, add a Part Purchase step after the Stock step with "Engine oil 15W-40, 3 L" suggested, and alert the Field Coordinators. |

### 4.4a PUR: Part Purchase step (P0)

Goal: record parts bought outside for one WO as they appear on the shop's receipt, so the buyer can check the receipt line by line (DEC-60). The step never touches warehouse stock.

| ID | P | Requirement | Screens | Data | Rules |
| --- | --- | --- | --- | --- | --- |
| REQ-PUR-001 | P0 | THE SYSTEM SHALL register Part Purchase as its own module, executed by a Field Coordinator, Warehouse Manager or System Admin; a WO MAY hold it after a Stock step or without one. | [`CreateWO`](<Design Artifact/Create Work Order step composer-html/CreateWO.dc.html>), [`PartPurchase`](<Design Artifact/Step Part Purchase (bought outside)-html/PartPurchase.dc.html>), [`FCMobilePurchase`](<Design Artifact/Mobile Field Coordinator Part Purchase step-html/FCMobilePurchase.dc.html>) | `assignment_modules`, `work_order_purchases` | REQ-REG-002 |
| REQ-PUR-002 | P0 | THE SYSTEM SHALL fill the step's lines with the parts to buy that the Planner or System Admin listed on the WO (part only, no quantity) and the shortfall parts of the Stock step (the missing quantity shown as a hint). The executor SHALL type the quantity actually bought, which MAY be more than the hint, and the unit price of each line, and SHALL NOT add, remove or change parts; a wrong or missing part needs a change request (DEC-63, DEC-64). | [`PartPurchase`](<Design Artifact/Step Part Purchase (bought outside)-html/PartPurchase.dc.html>), [`FCMobilePurchase`](<Design Artifact/Mobile Field Coordinator Part Purchase step-html/FCMobilePurchase.dc.html>) | `work_order_purchase_lines` | BR-02 |
| REQ-PUR-003 | P0 | THE SYSTEM SHALL show each line total (quantity x unit price) and a large calculated total that update as the executor types, so the buyer can check each line against the receipt; there is no receipt total field and no match check (DEC-61). The step verifier SHALL compare the lines and the total with the receipt photo and, IF they do not match, THEN return the step to the executor with a note (REQ-ENG-005). | [`PartPurchase`](<Design Artifact/Step Part Purchase (bought outside)-html/PartPurchase.dc.html>), [`FCMobilePurchase`](<Design Artifact/Mobile Field Coordinator Part Purchase step-html/FCMobilePurchase.dc.html>) | `work_order_purchases.calculated_total` | NFR-16 |
| REQ-PUR-004 | P0 | THE SYSTEM SHALL require a vendor (from the vendor master, or typed by hand as Other), the receipt date and at least one receipt photo; the receipt number is optional. | [`PartPurchase`](<Design Artifact/Step Part Purchase (bought outside)-html/PartPurchase.dc.html>) | `work_order_purchases`, `wo_attachments` | NFR-06 |
| REQ-PUR-005 | P0 | WHERE a line is a Tyre, THE SYSTEM SHALL also require serial number, brand, size, type and tread, and on submit create a new tyre with a generated code and status Issued to this WO, so it can be mounted in Part Replacement. | [`PartPurchase`](<Design Artifact/Step Part Purchase (bought outside)-html/PartPurchase.dc.html>) | `tyres`, `work_order_purchase_lines.tyre_id` | BR-11 |
| REQ-PUR-006 | P0 | WHEN the step is submitted, THE SYSTEM SHALL add the calculated total to the WO parts cost and never change warehouse stock or the stock card; the lines are billed with the part markup (REQ-BIL-003). | [`PartPurchase`](<Design Artifact/Step Part Purchase (bought outside)-html/PartPurchase.dc.html>) | `work_orders.parts_cost` | BR-06, TX-21 |
| REQ-PUR-007 | P0 | IF nothing had to be bought, THEN THE SYSTEM SHALL let the executor submit the step with no lines and a reason. | [`PartPurchase`](<Design Artifact/Step Part Purchase (bought outside)-html/PartPurchase.dc.html>) | `work_order_purchases.nothing_bought_reason` | - |
| REQ-PUR-008 | P0 | WHEN the Warehouse Manager confirms a shortfall in a Stock step and the WO has no open Part Purchase step after it, THE SYSTEM SHALL add one right after the Stock step, with the shortfall quantities as its lines, and send the purchase alert. | [`Stock`](<Design Artifact/Step Stock-html/Stock.dc.html>), [`PartPurchase`](<Design Artifact/Step Part Purchase (bought outside)-html/PartPurchase.dc.html>) | `work_order_assignments` | REQ-STK-004 |
| REQ-PUR-009 | P0 | THE SYSTEM SHALL treat each purchased line like an issued part of the same SKU: WHEN the WO completes, it resets the linked part items (REQ-BSL-006) and computes life used and the early failure flag (REQ-BSL-009) from the catalog's normal life (DEC-62). | - | - | REQ-BSL-006 |

| ID | Verifies | Acceptance criterion |
| --- | --- | --- |
| AC-PUR-001 | REQ-PUR-003 | WHEN the step lists SKU-1029 Engine oil 15W-40 (shortfall 3 L) and SKU-4410 Wiper blade (to buy) and the buyer types 3 L x Rp 82.000 and 2 x Rp 45.000, THE SYSTEM SHALL show Rp 246.000 and Rp 90.000 and a total of Rp 336.000. |
| AC-PUR-002 | REQ-PUR-003 | WHEN the buyer changes the engine oil unit price from 82.000 to 85.000, THE SYSTEM SHALL show its line total Rp 255.000 and the total Rp 345.000 at once, without saving first. |
| AC-PUR-003 | REQ-PUR-006 | WHEN the step is submitted, warehouse stock and the stock card SHALL be unchanged and the WO parts cost SHALL rise by the calculated total. |
| AC-PUR-004 | REQ-PUR-009 | WHEN a WO with a submitted Part Purchase line for SKU-4410 Wiper blade completes, THE SYSTEM SHALL reset the vehicle's Wiper blade part item (last replaced date and odometer, next due) and show its life used on the completion review. |
| AC-PUR-005 | REQ-PUR-003 | WHEN the receipt photo shows Rp 340.000 and the step total is Rp 336.000, the verifier returns the step with the note "Receipt total 340.000", THE SYSTEM SHALL reopen the step for the executor with that note and keep its lines as a draft. |
| AC-PUR-006 | REQ-PUR-002 | WHEN the shop sells only a 5 L can and the buyer types 5 L on the engine oil line with a 3 L shortfall, THE SYSTEM SHALL accept it; the step SHALL offer no way to add a part that is not on the WO. |

### 4.5 MEC: Mechanic Action step (P0)

Goal: record the services performed, with proof and price.

| ID | P | Requirement | Screens | Data | Rules |
| --- | --- | --- | --- | --- | --- |
| REQ-MEC-001 | P0 | THE SYSTEM SHALL require the executor to choose the team, Internal or External, before filling the step. | [`Mechanic`](<Design Artifact/Step Mechanic Action-html/Mechanic.dc.html>) | `work_order_assignments.team` |  |
| REQ-MEC-002 | P0 | WHILE the team is Internal, THE SYSTEM SHALL take service and price only from the service catalog (price read only) and require at least one repair photo. | [`Mechanic`](<Design Artifact/Step Mechanic Action-html/Mechanic.dc.html>) | `work_order_services`, `service_catalog`, `wo_attachments` | BR-07 |
| REQ-MEC-003 | P0 | WHILE the team is External, THE SYSTEM SHALL take vendor, description and a free price, and require at least one invoice image. | [`MechanicExternal`](<Design Artifact/Mechanic Action external team-html/MechanicExternal.dc.html>) | `work_order_services` |  |
| REQ-MEC-004 | P0 | THE SYSTEM SHALL compute labor cost as the sum of service lines and WO total cost as labor + parts + document renewal cost + stooring cost (REQ-MBL-006). | [`WorkOrder`](<Design Artifact/Work Order detail-html/WorkOrder.dc.html>) | `work_orders.labor_cost`, `parts_cost`, `document_cost` |  |
| REQ-MEC-005 | P0 | THE SYSTEM SHALL let a System Admin maintain the service catalog (code, name, standard price, active, optional part item type). | [`SettingsServiceCatalog`](<Design Artifact/Settings Service catalog-html/SettingsServiceCatalog.dc.html>) | `service_catalog` |  |
| REQ-MEC-006 | P1 | THE SYSTEM SHALL let photos be labelled Before or After. | [`Mechanic`](<Design Artifact/Step Mechanic Action-html/Mechanic.dc.html>) | `wo_attachments` |  |
| REQ-MEC-007 | P0 | Retired: the stooring area is no longer picked on a Mechanic Action step. The stooring (mobilisation) fee is produced by the Mobilisasi module (`REQ-MBL-*`), which carries the stooring area; a Mechanic Action step neither asks a location nor charges stooring. | [`Mechanic`](<Design Artifact/Step Mechanic Action-html/Mechanic.dc.html>), [`MechanicExternal`](<Design Artifact/Mechanic Action external team-html/MechanicExternal.dc.html>) |  | REQ-MBL-002 |
| REQ-MEC-008 | P0 | Retired: a Mechanic Action step no longer captures the device position at submit. The work location for a field job is captured once from the Driver's breakdown report (`REQ-MOB-003`) and verified through the Mobilisasi step's location trail (`REQ-MBL-005`). | [`MechanicMobileStep`](<Design Artifact/Mobile app, Mechanic menu Mechanic Action step (P1)-html/MechanicMobileStep.dc.html>), [`StepVerify`](<Design Artifact/Verify a step-html/StepVerify.dc.html>) |  | REQ-MBL-005 |
| REQ-MEC-009 | P0 | Retired: a Mechanic Action step no longer charges the stooring (mobilisation) fee. The stooring fee is now produced by the Mobilisasi module (`REQ-MBL-006`); the WO stooring cost and its WO-document and WO-cost lines are unchanged in meaning, only their source step changes. | [WorkOrder](<Design Artifact/Work Order detail-html/WorkOrder.dc.html>), [WODocument](<Design Artifact/WO document-html/WODocument.dc.html>) | work\_orders.stooring\_cost | REQ-MBL-006, BR-07 |
| REQ-MEC-010 | P0 | THE SYSTEM SHALL let the System Admin maintain the stooring rates in Settings > Stooring rates: code, region name, price, active. A price change applies only to Mobilisasi steps submitted after it (`REQ-MBL-006`). | [SettingsStooringRates](<Design Artifact/Settings Stooring rates (System Admin)-html/SettingsStooringRates.dc.html>) | stooring\_rates | BR-07 |
| REQ-CHK-001 | P0 | THE SYSTEM SHALL offer a Part Check module (troubleshooting) in Create WO: the Planner or System Admin lists at least one part to check (catalog part, part item type, tyre position or a described part) with what to check. Executed by a Mechanic or the System Admin, internal or external; its cost is the check service (REQ-CHK-007). | [`CreateWO`](<Design Artifact/Create Work Order step composer-html/CreateWO.dc.html>) | `work_order_check_items` | DEC-88 |
| REQ-CHK-002 | P0 | For every listed part the executor SHALL write its condition, decide Good, Repair or Replace, and add at least one photo; a part marked Repair or Replace MAY be marked Unsafe to drive. The executor MAY add parts that were not listed, shown as Added by mechanic, under the same rules. Submit SHALL be refused until every part is complete. | [`PartCheck`](<Design Artifact/Step Part Check (troubleshooting)-html/PartCheck.dc.html>), [`MechanicMobileCheck`](<Design Artifact/Mobile app, Mechanic menu Part Check step (P1)-html/MechanicMobileCheck.dc.html>) | `work_order_check_items`, `wo_attachments` | REQ-FUP rules for photos |
| REQ-CHK-003 | P0 | WHEN a Part Check step is verified and at least one part is Repair or Replace, THE SYSTEM SHALL create one Draft WO (source Part\_Check, linked to the step) for the same vehicle with the not-good findings and links to their photos: category Corrective (Tyre when only tyres), the workshop flag of the check WO, priority Urgent when a part is Unsafe to drive, otherwise the check WO's priority; steps built from the findings: a Replace part is a Stock line when in stock or a Part Purchase line when not, a tyre to replace adds a Part Replacement step for its position, and each Repair is a line of work in a Mechanic Action step. No draft is made when every part is Good; a returned step makes no draft. | [`PartCheckVerify`](<Design Artifact/Verify a Part Check step-html/PartCheckVerify.dc.html>), [`CreateWOFromCheck`](<Design Artifact/Draft WO from a Part Check activate or discard-html/CreateWOFromCheck.dc.html>) | `work_orders`, `work_order_assignments` | REQ-WO-001: never Active |
| REQ-CHK-004 | P0 | THE SYSTEM SHALL show the follow-up draft to the Planner and System Admin with the findings carried over; they MAY change its steps as in any WO, then Activate it (submit for approval, so it becomes Active only after a Supervisor or GM approves) or Discard it with a reason. A discarded draft SHALL keep its link to the check and SHALL NOT be made again for the same step. | [`CreateWOFromCheck`](<Design Artifact/Draft WO from a Part Check activate or discard-html/CreateWOFromCheck.dc.html>), [`DashboardPlanner`](<Design Artifact/Dashboard (Planner)-html/DashboardPlanner.dc.html>) | `work_orders` | BR-03 applies |
| REQ-CHK-005 | P0 | WHEN a Part Check step with a part marked Unsafe to drive is submitted, THE SYSTEM SHALL notify the Planner, Supervisor and Field Coordinators and show an Unsafe to drive warning on the vehicle and in the schedule until the follow-up WO is completed or discarded; it SHALL NOT block the vehicle on its own. | [`Vehicles`](<Design Artifact/Vehicles tab-html/Vehicles.dc.html>), [`NotificationCenter`](<Design Artifact/Notification center-html/NotificationCenter.dc.html>) | `work_order_check_items` | DEC-88 |
| REQ-CHK-006 | P0 | THE WO document SHALL print a Part Check section with each part, what was checked, the condition, the decision, the Unsafe to drive mark and the photo file names (photos are not printed), the check service (the stooring of a field check is printed with the WO's Mobilisasi step, REQ-MBL-006), the stamps and the execution time, and the number and status of the follow-up WO for reference only. The check WO SHALL stand alone: it is approved, completed, documented and invoiced on its own whatever happens to the follow-up WO, and its document and invoice SHALL show no line of the follow-up WO. The follow-up WO's document SHALL name the check it came from. | [`WODocument`](<Design Artifact/WO document-html/WODocument.dc.html>) | `work_order_check_items` | REQ-WOD-002 |
| REQ-CHK-007 | P0 | THE Part Check step SHALL carry its check service as labor, billed to the customer with the check WO: for an internal team, at least one service from the catalog at its fixed price (category Diagnosis, for example SVC-095 Brake system check); for an external workshop, vendor, description, price and the invoice image. Its stooring area and fee are produced by the Mobilisasi module of the same WO when the check is done in the field (`REQ-MBL-006`), not by the Part Check step. Repairs found by the check are billed with the follow-up WO, never with the check. | [`PartCheck`](<Design Artifact/Step Part Check (troubleshooting)-html/PartCheck.dc.html>), [`SettingsServiceCatalog`](<Design Artifact/Settings Service catalog-html/SettingsServiceCatalog.dc.html>), [`InvoiceDetail`](<Design Artifact/Invoice detail (Accounting, Supervisor)-html/InvoiceDetail.dc.html>) | `work_order_services`, `service_catalog` | DEC-89, BR-07 |

| ID | Verifies | Acceptance criterion |
| --- | --- | --- |
| AC-MEC-001 | REQ-MEC-002 | WHILE the team is Internal, the price field SHALL be read only and equal the catalog price. |
| AC-MEC-002 | REQ-MEC-003 | IF an External service has no invoice image, THEN it SHALL NOT save. |
| AC-MEC-003 | BR-07 | WHEN a catalog price changes later, a saved WO line SHALL keep its old price. |
| AC-MEC-004 | REQ-MEC-008 | WHEN a Mechanic Action step is submitted, THE SYSTEM SHALL ask for no location and record no device position on the step, on the web or in the mobile app; the work location is held on the WO's Mobilisasi step instead (`AC-MBL-003`). |
| AC-MEC-005 | REQ-MEC-009 | WHEN a Mechanic Action step is submitted, it SHALL add Rp 0 stooring to the WO; the stooring fee is charged by the Mobilisasi step (`AC-MBL-004`). |

### 4.5a MBL: Mobilisasi (mobilisation) step (P0, risk: high)

Goal: send a mechanic to the driver's location and charge the stooring (mobilisation) fee, with proof that the mechanic travelled there. Mobilisasi is a registered assignment module (master data, PR-6), not code; it uses the standard step lifecycle `SM-STEP` (3.3) with the module contract noted there. It replaces the stooring behaviour that used to live on the Mechanic Action step (`REQ-MEC-007` to `REQ-MEC-009`, retired).

| ID | P | Requirement | Screens | Data | Rules |
| --- | --- | --- | --- | --- | --- |
| REQ-MBL-001 | P0 | THE SYSTEM SHALL register Mobilisasi as an assignment module in the module registry (`REQ-REG-002`), offered in Create WO like any other module, with its executor role Mechanic (or the System Admin) and no change to the engine, sequencing, verification, approval, WO document renderer or scope lock (`PR-6`, `REQ-REG-006`). | [`CreateWO`](<Design Artifact/Create Work Order step composer-html/CreateWO.dc.html>) | `assignment_modules` | PR-6, REQ-REG-002 |
| REQ-MBL-002 | P0 | THE SYSTEM SHALL let a Mechanic, or the System Admin, execute a Mobilisasi step; its destination SHALL be the driver's location captured on the breakdown report that seeded the WO (`REQ-MOB-003`), and the step SHALL carry the stooring area of that destination from the active stooring rates. | [`MechanicMobileStep`](<Design Artifact/Mobile app, Mechanic menu Mechanic Action step (P1)-html/MechanicMobileStep.dc.html>) | `work_order_assignments`, `breakdown_reports`, `stooring_rates` | BR-01, BR-02 |
| REQ-MBL-003 | P0 | WHEN the executor opens a Mobilisasi step and presses Start, THE SYSTEM SHALL show a Start control and a map and route to the driver's captured destination. | [`MechanicMobileStep`](<Design Artifact/Mobile app, Mechanic menu Mechanic Action step (P1)-html/MechanicMobileStep.dc.html>) | `work_order_assignments`, `breakdown_reports` | SM-STEP |
| REQ-MBL-004 | P0 | WHEN the mechanic reaches the destination, THE SYSTEM SHALL auto-submit the Mobilisasi step; THE SYSTEM SHALL also offer a manual Finish stooring control that submits the step. | [`MechanicMobileStep`](<Design Artifact/Mobile app, Mechanic menu Mechanic Action step (P1)-html/MechanicMobileStep.dc.html>) | `work_order_assignments`, `step_time_events` | SM-STEP |
| REQ-MBL-005 | P0 | WHILE a Mobilisasi step is In\_Progress, THE SYSTEM SHALL record the mechanic's location trail for the duration of the step only, and SHALL stop recording when the step is submitted; THE SYSTEM SHALL show the trail and the stooring duration only to Planners and the System Admin on the verify screen and the WO detail, never on the WO document or the invoice, and SHALL log every access to it (RSK-09). The verifier judges the stooring duration and the location trail against the destination; there is no automatic check. | [`StepVerify`](<Design Artifact/Verify a step-html/StepVerify.dc.html>), [`MechanicMobileStep`](<Design Artifact/Mobile app, Mechanic menu Mechanic Action step (P1)-html/MechanicMobileStep.dc.html>) | `mobilisation_location_trail`, `work_order_assignments` | RSK-09, NFR-04 |
| REQ-MBL-006 | P0 | WHEN a Mobilisasi step is submitted, THE SYSTEM SHALL charge the stooring (mobilisation) fee of its region as a snapshot on the step, add it to the WO stooring cost and show it on the step, the verify screen, the WO cost and the WO document; the workshop region costs Rp 0. Mobilisasi steps of one WO at the same area on the same day are charged once (one charge per WO per region per day). | [`MechanicMobileStep`](<Design Artifact/Mobile app, Mechanic menu Mechanic Action step (P1)-html/MechanicMobileStep.dc.html>), [`StepVerify`](<Design Artifact/Verify a step-html/StepVerify.dc.html>), [`WorkOrder`](<Design Artifact/Work Order detail-html/WorkOrder.dc.html>), [`WODocument`](<Design Artifact/WO document-html/WODocument.dc.html>) | `work_order_assignments.stooring_fee`, `work_orders.stooring_cost` | BR-07 |

| ID | Verifies | Acceptance criterion |
| --- | --- | --- |
| AC-MBL-001 | REQ-MBL-001 | WHEN a Planner composes a WO in Create WO, Mobilisasi SHALL appear in the module palette and SHALL add a step with executor role Mechanic without any engine change. |
| AC-MBL-002 | REQ-MBL-004 | WHEN the mechanic reaches the destination, the step SHALL auto-submit; WHEN the mechanic presses Finish stooring before arrival, the step SHALL also submit. |
| AC-MBL-003 | REQ-MBL-005 | WHILE the step is In\_Progress the mechanic's location trail SHALL be recorded, and WHEN the step is submitted the recording SHALL stop; the trail SHALL be visible only to a Planner or the System Admin, and every view SHALL be written to the access log. |
| AC-MBL-004 | REQ-MBL-006 | WHEN a Mobilisasi step with stooring area Bekasi (Rp 250.000) is submitted, the WO total SHALL rise by Rp 250.000 and the WO document SHALL show Stooring Bekasi Rp 250.000; a Mobilisasi step at the workshop SHALL add Rp 0; a second Mobilisasi step of the same WO at Bekasi on the same day SHALL add Rp 0. |

### 4.6 PLC: Part Replacement step and chassis map (P0, risk: high)

Goal: record where each tyre is mounted and show the condition of every position at a glance. Part Replacement covers tyres only \[A\]; other parts are tracked as part items (4.12). Tyre states: `SM-TYRE` (3.6).

| ID | P | Requirement | Screens | Data | Rules |
| --- | --- | --- | --- | --- | --- |
| REQ-PLC-001 | P0 | THE SYSTEM SHALL allow placement changes only through the open Part Replacement step of an active WO, only for that WO's vehicle; which WOs include the step is decided only by the steps built in Create WO. | [`Placement`](<Design Artifact/Step Part Replacement map-html/Placement.dc.html>) | `part_placements`, `part_placement_logs` | BR-01, BR-02 |
| REQ-PLC-002 | P0 | THE SYSTEM SHALL offer Mount, Rotate, Demount and Scrap, and log each against the WO with odometer and accumulated km. | [`Placement`](<Design Artifact/Step Part Replacement map-html/Placement.dc.html>), [`PlacementReplace`](<Design Artifact/Part Replacement replace-html/PlacementReplace.dc.html>), [`PlacementRotate`](<Design Artifact/Part Replacement rotate-html/PlacementRotate.dc.html>) | `part_placement_logs` |  |
| REQ-PLC-003 | P0 | IF a tyre is not Issued to this WO, THEN THE SYSTEM SHALL refuse to mount it. | [`PlacementReplace`](<Design Artifact/Part Replacement replace-html/PlacementReplace.dc.html>) | `tyres.issued_wo_id` | BR-11 |
| REQ-PLC-004 | P0 | WHEN a tyre is demounted, THE SYSTEM SHALL require its condition (Needs\_Retread, Worn\_Out or Back to stock = In\_Stock) and set that status. | [`PlacementReplace`](<Design Artifact/Part Replacement replace-html/PlacementReplace.dc.html>) | `tyre_events` |  |
| REQ-PLC-005 | P0 | WHEN a tyre is rotated, THE SYSTEM SHALL change only its position; it stays Mounted. | [`PlacementRotate`](<Design Artifact/Part Replacement rotate-html/PlacementRotate.dc.html>) | `part_placements` |  |
| REQ-PLC-006 | P0 | IF a mount would exceed the vehicle's tyre count, or a second active WO changes the same position, THEN THE SYSTEM SHALL refuse it. | [`Placement`](<Design Artifact/Step Part Replacement map-html/Placement.dc.html>) | `uq_active_slot`, `uq_active_tyre` | NFR-03 |
| REQ-PLC-007 | P0 | THE SYSTEM SHALL record tread depth (mm) and pressure (PSI) per tyre; WHEN tread falls below the threshold (default 3 mm), THE SYSTEM SHALL raise a tyre alert that drafts a WO. | [`Placement`](<Design Artifact/Step Part Replacement map-html/Placement.dc.html>), [`SettingsAlertRules`](<Design Artifact/Settings Alert rules-html/SettingsAlertRules.dc.html>) | `tyre_inspections`, `app_settings` |  |
| REQ-PLC-008 | P0 | THE SYSTEM SHALL draw the map from the vehicle's chassis layout (axles in order, role, tyres per side, spacing), never from per-class drawing code, show empty positions, and give each position a status with a text label: Normal, Due soon, Act now, Empty or Missing \[A\]. | [`Placement`](<Design Artifact/Step Part Replacement map-html/Placement.dc.html>), [`Vehicles`](<Design Artifact/Vehicles tab-html/Vehicles.dc.html>) | `chassis_layouts`, `part_positions` | PR-6 |
| REQ-PLC-009 | P0 | WHEN a position is selected, THE SYSTEM SHALL show the tyre code and serial number, fitting date, accumulated km, the WO that fitted it and the position history; positions changed in the open step SHALL be highlighted. | [`Placement`](<Design Artifact/Step Part Replacement map-html/Placement.dc.html>) | `part_placements` |  |
| REQ-PLC-010 | P0 | THE SYSTEM SHALL use one map component, editable in the step, read only in Vehicles > Chassis and parts and in the layout preview, reading the same position and placement data; no second copy of a layout may exist. | [`Placement`](<Design Artifact/Step Part Replacement map-html/Placement.dc.html>), [`Vehicles`](<Design Artifact/Vehicles tab-html/Vehicles.dc.html>), [`ChassisLayouts`](<Design Artifact/Vehicle classes and chassis layouts-html/ChassisLayouts.dc.html>) | `part_positions`, `part_placements` |  |
| REQ-PLC-011 | P0 | THE SYSTEM SHALL show maintenance alerts for non-tyre parts in an alert list next to the map, not on it. | [`Vehicles`](<Design Artifact/Vehicles tab-html/Vehicles.dc.html>) | `maintenance_alerts` |  |
| REQ-PLC-012 | P0 | THE SYSTEM SHALL show the map read only to every role that can see the vehicle, including the Field Coordinator. | [`Vehicles`](<Design Artifact/Vehicles tab-html/Vehicles.dc.html>) |  | RL-6 |
| REQ-PLC-013 | P0 | THE SYSTEM SHALL let the System Admin create vehicle classes and chassis layouts with a live preview and the number of vehicles using each layout; a class without a layout cannot be given to a vehicle; saving a layout generates its tyre positions. | [`ChassisLayouts`](<Design Artifact/Vehicle classes and chassis layouts-html/ChassisLayouts.dc.html>) | `vehicle_classes`, `chassis_layouts`, `part_positions` |  |
| REQ-PLC-014 | P0 | THE SYSTEM SHALL save a map snapshot when the step is submitted, show it in the system and print it in the WO document as a black-and-white line drawing with a table of changed positions (DEC-33). | [`WODocument`](<Design Artifact/WO document-html/WODocument.dc.html>) | `placement_map_snapshots` |  |
| REQ-PLC-015 | P1 | WHILE a vehicle has no mounted tyre, THE SYSTEM SHALL let the System Admin move it to a newer layout version. | [`VehicleEdit`](<Design Artifact/Edit vehicle-html/VehicleEdit.dc.html>) | `vehicles.chassis_layout_id` |  |
| REQ-PLC-016 | P1 | THE SYSTEM SHALL show total km per tyre from first mount to Scrapped, and cost per km. | [`ReportsTyres`](<Design Artifact/Reports Tyres-html/ReportsTyres.dc.html>) | `part_placement_logs`, `retread_order_items` |  |
| REQ-PLC-017 | P0 | THE SYSTEM SHALL give every vehicle class a unit kind, Powered (tractor head, rigid truck such as a wingbox, pickup truck such as the safety patrol Toyota Hilux, van) or Towed (trailer tail), and let its chassis layout define the axles in order (role Steer, Drive or Trailer; tyres per side, single or dual), the front drawing (None, Fifth\_wheel or Kingpin) and the number of spare tyres from 0 upward; saving SHALL generate the wheel positions and one Spare position per spare (SP1, SP2) (DEC-68). | [ChassisLayouts](<Design Artifact/Vehicle classes and chassis layouts-html/ChassisLayouts.dc.html>) | vehicle\_classes.unit\_kind, chassis\_layouts.definition, part\_positions | PR-6 |
| REQ-PLC-018 | P0 | WHERE a vehicle belongs to a Towed class, THE SYSTEM SHALL ask no odometer anywhere (vehicle form, WO, steps, inspections, mobile) and SHALL use days only in every rule that otherwise uses km: tyre and position life, part age and early failure (REQ-BSL-009), PM intervals and placement logs; cost per km SHALL not be shown for it (DEC-68). | [PlacementTrailer](<Design Artifact/Step Part Replacement on a trailer tail (towed unit, spare)-html/PlacementTrailer.dc.html>), [Vehicles](<Design Artifact/Vehicles tab-html/Vehicles.dc.html>), [AddVehicle](<Design Artifact/Add vehicle with first documents-html/AddVehicle.dc.html>) | vehicle\_classes.unit\_kind | REQ-BSL-009 |
| REQ-PLC-019 | P0 | WHERE a layout has spare positions, THE SYSTEM SHALL show them in the map as spare slots and allow Mount, Demount and Scrap on them like any position, and Rotate between a spare and a wheel position (Swap with spare); a layout with 0 spares SHALL show no spare slot. The vehicle tyre count SHALL include the spare positions (REQ-PLC-006). | [PlacementTrailer](<Design Artifact/Step Part Replacement on a trailer tail (towed unit, spare)-html/PlacementTrailer.dc.html>), [Placement](<Design Artifact/Step Part Replacement map-html/Placement.dc.html>) | part\_positions.position\_kind | - |
| REQ-PLC-020 | P0 | THE SYSTEM SHALL treat a tractor head and a trailer tail as separate vehicles, each with its own plate, documents, WOs and tyres; there is no coupling record and no WO for a head and trailer together. A tyre moves between them only by a demount in a WO of one unit and a mount in a WO of the other (DEC-68). | [Vehicles](<Design Artifact/Vehicles tab-html/Vehicles.dc.html>) | vehicles | BR-01 |

**Build note.** Build one generic chassis map renderer that takes a layout definition; create today's classes (light van 4 tyres, medium truck 6, heavy truck 6x4 10) as the first layouts. This step has no image upload; evidence belongs to the Mechanic Action step.

| ID | Verifies | Acceptance criterion |
| --- | --- | --- |
| AC-PLC-001 | REQ-PLC-003 | A tyre not Issued to this WO SHALL NOT be selectable. |
| AC-PLC-002 | REQ-PLC-006 | IF a seventh tyre is mounted on a six-tyre vehicle, THEN THE SYSTEM SHALL refuse. |
| AC-PLC-003 | REQ-PLC-005 | WHEN two tyres are rotated, their positions SHALL swap and both SHALL stay Mounted. |
| AC-PLC-004 | REQ-PLC-007 | WHEN a tread of 2,5 mm is recorded, the position SHALL show Act now and a Draft tyre WO SHALL exist. |
| AC-PLC-005 | REQ-PLC-012 | WHEN a Field Coordinator opens the map, every edit control SHALL be absent. |
| AC-PLC-006 | REQ-PLC-010 | WHEN a tyre is mounted in the step, the same tyre SHALL show at the same position in Vehicles > Chassis and parts. |
| AC-PLC-007 | REQ-PLC-017 | WHEN the System Admin saves a Towed layout with 3 Trailer axles of 2 tyres per side and 1 spare, THE SYSTEM SHALL generate 13 positions (A1\_LO to A3\_RO and SP1) and draw a kingpin at the front. |
| AC-PLC-008 | REQ-PLC-018 | WHEN a WO is created for trailer tail B 9021 TR, no odometer field SHALL appear; a tyre fitted 412 days ago with a 450-day life SHALL show 92% life used and Due soon. |
| AC-PLC-009 | REQ-PLC-019 | WHEN a wingbox rigid layout with 0 spares is shown, no spare slot SHALL appear; WHEN a tyre is swapped with the spare on a head with 1 spare, both SHALL stay Mounted with their positions exchanged. |
| AC-PLC-010 | REQ-PLC-017 | WHEN the System Admin creates a class that is not in the launch list, for example a Powered 8x4 with axles Steer, Steer, Drive (dual), Drive (dual) and 0 spares, THE SYSTEM SHALL generate its 12 positions and draw its map in Part Replacement, Vehicles and the preview, with no code change and no new release. |

### 4.7 DOC: vehicle documents (P0)

Goal: keep every required document valid and block a vehicle from trips when one is Missing or Expired. States: `SM-DOC` (3.5).

| ID | P | Requirement | Screens | Data | Rules |
| --- | --- | --- | --- | --- | --- |
| REQ-DOC-001 | P0 | THE SYSTEM SHALL track STNK annual, STNK five-year, KIR (six-monthly, trucks) and insurance, plus any type in master data; which types are required comes from the vehicle class. | [`DocumentTypes`](<Design Artifact/Settings Document types-html/DocumentTypes.dc.html>) | `document_types` |  |
| REQ-DOC-002 | P0 | THE SYSTEM SHALL let the System Admin maintain document types: code, name, usual validity in months, warning days (default 30; the only place warning days are set), whether a renewal receipt is required, and the classes that need it; WHEN the required classes change, THE SYSTEM SHALL show how many vehicles become non-compliant before saving. | [`DocumentTypes`](<Design Artifact/Settings Document types-html/DocumentTypes.dc.html>) | `document_types` |  |
| REQ-DOC-003 | P0 | WHEN the daily check runs, THE SYSTEM SHALL set Warning at expiry minus the type's warning days, Expired on the expiry date, and Missing for a required type with no row. | [`Documents`](<Design Artifact/Documents tab-html/Documents.dc.html>), [`VehicleDocuments`](<Design Artifact/Vehicles Documents tab-html/VehicleDocuments.dc.html>) | `vehicle_documents.status` |  |
| REQ-DOC-004 | P0 | WHEN a document enters Warning, THE SYSTEM SHALL create exactly one Draft WO of the Document category for it (never a duplicate), which follows normal approval. | [`Documents`](<Design Artifact/Documents tab-html/Documents.dc.html>) | `uq_open_document_wo` | BR-04 |
| REQ-DOC-005 | P0 | WHILE a required document is Missing or Expired, THE SYSTEM SHALL show the vehicle Blocked and refuse to assign it to trips; it MAY still be placed on the maintenance schedule. | [`Vehicles`](<Design Artifact/Vehicles tab-html/Vehicles.dc.html>), [`DashboardDispatcher`](<Design Artifact/Dashboard (Field Coordinator)-html/DashboardDispatcher.dc.html>) | `vehicles.status` | BR-08 |
| REQ-DOC-006 | P0 | THE SYSTEM SHALL lift the block in exactly one of three ways: first entry of a never-entered document ([`AddDocument`](<Design Artifact/Add document (first entry)-html/AddDocument.dc.html>) or the Add vehicle form); "Correct entry" by the System Admin of a wrong first entry; renewal through a Document WO. | [`AddDocument`](<Design Artifact/Add document (first entry)-html/AddDocument.dc.html>), [`DocumentCorrectEntry`](<Design Artifact/Correct a first document entry (System Admin)-html/DocumentCorrectEntry.dc.html>), [`DocStep`](<Design Artifact/Step Document renewal-html/DocStep.dc.html>) |  | BR-01 |
| REQ-DOC-007 | P0 | WHEN the System Admin submits the Document step, THE SYSTEM SHALL require number, issue date, new expiry (later than the old one; prefilled as the issue date plus the type's usual validity in months, editable, DEC-80), scan, renewal cost (Rp) and, where the type requires it, a receipt image; WHEN the step is verified, the new expiry SHALL apply, the status SHALL be recalculated, the cost SHALL be added to the WO and the old record SHALL be kept as history. | [`DocStep`](<Design Artifact/Step Document renewal-html/DocStep.dc.html>) | `document_renewals`, `work_orders.document_cost` |  |
| REQ-DOC-008 | P0 | THE SYSTEM SHALL let the System Admin enter a document for the first time without a WO (number, issuer, issue date, expiry date, scan), preview the status it will get, list the documents still required, save a past expiry as Expired, and write an audit record. | [`AddDocument`](<Design Artifact/Add document (first entry)-html/AddDocument.dc.html>), [`AddVehicle`](<Design Artifact/Add vehicle with first documents-html/AddVehicle.dc.html>) | `vehicle_documents`, `audit_logs` | BR-01 |
| REQ-DOC-009 | P0 | WHILE no renewal WO exists for a document, THE SYSTEM SHALL let the System Admin correct its number, dates or scan with a reason ("Correct entry"), logging each field's old and new value; IF a renewal exists, THEN it SHALL refuse and a wrong value is fixed by a change request on that WO. | [`DocumentCorrectEntry`](<Design Artifact/Correct a first document entry (System Admin)-html/DocumentCorrectEntry.dc.html>) | `document_corrections` |  |
| REQ-DOC-010 | P0 | THE SYSTEM SHALL let a Document step change only documents of its WO's vehicle. | [`DocStep`](<Design Artifact/Step Document renewal-html/DocStep.dc.html>) |  | BR-02 |
| REQ-DOC-011 | P0 | THE SYSTEM SHALL show a matrix of vehicles by document type (one status per cell, vehicle status column), a detail panel with renewal history, View scan and Open WO; View scan shows every scan version with zoom, rotate and download, and logs every view. | [`Documents`](<Design Artifact/Documents tab-html/Documents.dc.html>), [`VehicleDocuments`](<Design Artifact/Vehicles Documents tab-html/VehicleDocuments.dc.html>), [`DocumentScan`](<Design Artifact/View scan-html/DocumentScan.dc.html>) | `document_view_logs` |  |
| REQ-DOC-012 | P0 | WHEN a document is Expired, THE SYSTEM SHALL remind the driver not to operate the vehicle: on the dashboards and the Field Coordinator views in release 1, in the mobile app from R1 step 7. | [`DashboardDispatcher`](<Design Artifact/Dashboard (Field Coordinator)-html/DashboardDispatcher.dc.html>), [`DashboardDriver`](<Design Artifact/Driver home (mobile)-html/DashboardDriver.dc.html>) | `notifications` |  |
| REQ-DOC-013 | P0 | THE SYSTEM SHALL import first-entry documents from a spreadsheet for go-live, through the bulk import of REQ-IAM-011. |  | `vehicle_documents` |  |

| ID | Verifies | Acceptance criterion |
| --- | --- | --- |
| AC-DOC-001 | REQ-DOC-004 | WHEN a KIR expires in 30 days, it SHALL show Warning and exactly one Draft Document WO SHALL exist. |
| AC-DOC-002 | REQ-DOC-005 | WHEN the expiry date arrives, the KIR SHALL show Expired and the vehicle SHALL be refused for trips. |
| AC-DOC-003 | REQ-DOC-007 | WHEN the renewal step is verified, the vehicle SHALL be assignable to trips again. |
| AC-DOC-004 | REQ-DOC-008 | WHEN a vehicle is saved without its insurance, the insurance SHALL show Missing and the vehicle Blocked. |
| AC-DOC-005 | REQ-DOC-008 | WHEN a document is entered with an expiry date in the past, it SHALL show Expired. |
| AC-DOC-006 | REQ-DOC-009 | IF Correct entry is used after a renewal WO exists, THEN THE SYSTEM SHALL refuse. |

### 4.8 CR: change request and amendment (P0)

Goal: let an executor ask for a change to wrong WO content while keeping authorized work under control. States: `SM-CR` (3.7), transitions T8 to T10 of `SM-WO`.

| ID | P | Requirement | Screens | Data | Rules |
| --- | --- | --- | --- | --- | --- |
| REQ-CR-001 | P0 | THE SYSTEM SHALL let the executor of the open step submit a change request with what changes, the requested change and a reason; WHEN submitted, the WO SHALL enter Pending\_Amendment without any approval. | [`ChangeRequest`](<Design Artifact/Raise a change request-html/ChangeRequest.dc.html>) | `wo_change_requests` |  |
| REQ-CR-002 | P0 | WHILE the WO is Pending\_Amendment, THE SYSTEM SHALL freeze the open step and keep later steps Locked. | [`StepLocked`](<Design Artifact/Step state locked-html/StepLocked.dc.html>), [`WorkOrder`](<Design Artifact/Work Order detail-html/WorkOrder.dc.html>) | `status_before_amendment` |  |
| REQ-CR-003 | P0 | THE SYSTEM SHALL let the WO creator revise the content of the open step and the steps after it (for example the part list or the work description) and add, remove or move steps that have not started; submitted and verified steps SHALL NOT change. IF the request changes the vehicle, THEN THE SYSTEM SHALL refuse it (cancel and recreate instead). | [`CreateWORevision`](<Design Artifact/Revise a WO (amendment)-html/CreateWORevision.dc.html>) | `wo_change_requests.revision` |  |
| REQ-CR-004 | P0 | WHEN an Approver approves the revision, THE SYSTEM SHALL apply it, raise the amendment number, keep the earlier version in history, restore the earlier WO status and let the step continue. | [`AmendmentReview`](<Design Artifact/Review approval amendment-html/AmendmentReview.dc.html>) | `work_orders.amendment_no`, `audit_logs` | BR-04 |
| REQ-CR-005 | P0 | WHEN an Approver rejects the revision with a reason, THE SYSTEM SHALL discard it, restore the earlier status and record the rejection. | [`AmendmentReview`](<Design Artifact/Review approval amendment-html/AmendmentReview.dc.html>) | `wo_change_requests` |  |
| REQ-CR-006 | P0 | IF an amendment would change a goods issue that is already posted, THEN THE SYSTEM SHALL refuse it; the correction is a reversal (`REQ-STK-008`). | [`CreateWORevision`](<Design Artifact/Revise a WO (amendment)-html/CreateWORevision.dc.html>) |  |  |
| REQ-CR-007 | P0 | IF the WO is Pending\_Verification, THEN THE SYSTEM SHALL refuse a change request \[A\]. | [`ChangeRequest`](<Design Artifact/Raise a change request-html/ChangeRequest.dc.html>) |  |  |
| REQ-CR-008 | P0 | THE SYSTEM SHALL let a revision change only the content of steps that are not yet submitted (the open step and the Locked steps after it); IF it would change content of a step that is already submitted or verified, THEN THE SYSTEM SHALL refuse it. A submitted step is corrected by the verifier returning it before verification (REQ-ENG-005), and posted stock by a reversal (REQ-STK-008) (DEC-72). | [CreateWORevision](<Design Artifact/Revise a WO (amendment)-html/CreateWORevision.dc.html>), [ChangeRequest](<Design Artifact/Raise a change request-html/ChangeRequest.dc.html>) | wo\_change\_requests.revision | REQ-CR-006 |

| ID | Verifies | Acceptance criterion |
| --- | --- | --- |
| AC-CR-001 | REQ-CR-001, REQ-CR-002 | WHEN a change request is submitted, the WO SHALL show Pending\_Amendment and the next step SHALL stay Locked. |
| AC-CR-002 | REQ-CR-005 | WHEN a revision is rejected, the original content SHALL remain and the step SHALL resume. |
| AC-CR-003 | REQ-CR-004 | WHEN a revision is approved, the amendment number SHALL rise by one and the old list SHALL stay in history. |
| AC-CR-004 | REQ-CR-003 | IF a change request asks to switch the vehicle, THEN THE SYSTEM SHALL refuse. |
| AC-CR-005 | REQ-CR-008 | IF a change request raised in step 3 asks to change the part list of the submitted Stock step 1, THEN THE SYSTEM SHALL refuse it; a request to change the work description of open step 3 SHALL be accepted. |

### 4.9 WOD: WO digital document (P0)

| ID | P | Requirement | Screens | Data | Rules |
| --- | --- | --- | --- | --- | --- |
| REQ-WOD-001 | P0 | THE SYSTEM SHALL produce for every WO a digital document, printable and exportable to PDF. | [`WODocument`](<Design Artifact/WO document-html/WODocument.dc.html>) |  |  |
| REQ-WOD-002 | P0 | THE SYSTEM SHALL include the WO header (number, type, source, priority, status), the description, the vehicle (plate, VIN, brand, model, year, odometer at creation, tyre count, axle count, customer), one completion section per step as defined by its module, an executor stamp and a verifier stamp per step, the placement changes in the Mechanic Action section (as REQ-WOD-007 prints them), every step timestamp, the total active time and the cost, with the stooring area and fee of each Mobilisasi step (never the mechanic's location trail). | [`WODocument`](<Design Artifact/WO document-html/WODocument.dc.html>) | `assignment_modules.completion_section` |  |
| REQ-WOD-003 | P0 | THE SYSTEM SHALL end the document with an approval block "Approved by GM/Supervisor" with two lines, creation and completion, each with stamp or signature, name, role (Supervisor, GM or System Admin), date and time, and the mark Self-approved where it applies; the completion line stays empty until granted. | [`WODocument`](<Design Artifact/WO document-html/WODocument.dc.html>), [`WorkOrder`](<Design Artifact/Work Order detail-html/WorkOrder.dc.html>) | `work_order_approvals` |  |
| REQ-WOD-004 | P0 | IF anyone tries to change a stamp after it is applied, THEN THE SYSTEM SHALL refuse. |  | `work_order_approvals` (append-only) | BR-10 |
| REQ-WOD-005 | P0 | WHEN a step is submitted from the mobile app, its stamps and photos SHALL print exactly as for a desktop submit. | [`WODocument`](<Design Artifact/WO document-html/WODocument.dc.html>) |  |  |
| REQ-WOD-006 | P1 | THE SYSTEM SHALL attach the amendment history to the document. | [`WODocument`](<Design Artifact/WO document-html/WODocument.dc.html>) | `wo_change_requests` |  |
| REQ-WOD-007 | P0 | THE SYSTEM SHALL keep the WO document print-ready in black and white: it SHALL contain no photos and no colour images; each step SHALL list its attachments as text (file name, type, uploaded by, time); statuses SHALL print as words; the placement snapshot SHALL print as a black-and-white line drawing with a table of changed positions (DEC-33). | [WODocument](<Design Artifact/WO document-html/WODocument.dc.html>) | wo\_attachments | DEC-33 |
| REQ-WOD-008 | P0 | THE WO document SHALL show for each step the opened, started, submitted and verified times and its pauses with reasons, and an Execution time table: per step the time waited to start, worked, paused, waited for verification and the number of returns, plus the approval waits of creation and completion; the longest phase and entered start times SHALL be marked. These times SHALL NOT appear on any invoice. | [`WODocument`](<Design Artifact/WO document-html/WODocument.dc.html>) | `step_time_events` | DEC-87 |

### 4.10 VEH: vehicles and odometer (P0)

| ID | P | Requirement | Screens | Data | Rules |
| --- | --- | --- | --- | --- | --- |
| REQ-VEH-001 | P0 | THE SYSTEM SHALL show vehicles as a master-detail page (search, "+ Add vehicle"; list with plate, class, km, status, alert count) with the tabs Overview, Documents, Chassis and parts, WO history and Inspections, and the header buttons "+ Parts baseline" and "Create Work Order". | [`Vehicles`](<Design Artifact/Vehicles tab-html/Vehicles.dc.html>), [`VehicleOverview`](<Design Artifact/Vehicles Overview tab-html/VehicleOverview.dc.html>), [`VehicleDocuments`](<Design Artifact/Vehicles Documents tab-html/VehicleDocuments.dc.html>), [`VehicleWOHistory`](<Design Artifact/Vehicles WO history tab-html/VehicleWOHistory.dc.html>), [`VehicleInspections`](<Design Artifact/Vehicles Inspections tab (System Admin, P0)-html/VehicleInspections.dc.html>) | `vehicles` |  |
| REQ-VEH-002 | P0 | THE SYSTEM SHALL let the System Admin add a vehicle (unique plate, VIN, engine number, class, brand, model, year, fuel type, customer, and odometer for a Powered unit only) with its first documents, show axle and tyre count read only from the class layout, and continue to the parts baseline ("Save and add parts"). | [`AddVehicle`](<Design Artifact/Add vehicle with first documents-html/AddVehicle.dc.html>) | `vehicles`, `vehicle_documents` |  |
| REQ-VEH-003 | P0 | THE SYSTEM SHALL let the System Admin edit a vehicle with a required reason written to the audit log; IF a tyre is mounted or a WO is open, THEN changing class or layout SHALL be refused. | [`VehicleEdit`](<Design Artifact/Edit vehicle-html/VehicleEdit.dc.html>) | `vehicles`, `audit_logs` |  |
| REQ-VEH-004 | P0 | WHEN the System Admin deactivates a vehicle with a reason and no WO is open, THE SYSTEM SHALL set it Inactive, hide it from lists, alerts, the schedule and new WOs, and keep its history readable. | [`VehicleDeactivate`](<Design Artifact/Deactivate vehicle (dialog)-html/VehicleDeactivate.dc.html>) | `vehicles.status` | BR-10 |
| REQ-VEH-005 | P0 | IF an odometer reading is not a positive whole number or is lower than the last reading that is not voided, THEN THE SYSTEM SHALL refuse it; IF it implies more than 1.500 km per day, THEN THE SYSTEM SHALL warn and save it with a note. | [`VehicleOdometer`](<Design Artifact/Vehicles odometer history and manual reading-html/VehicleOdometer.dc.html>) | `odometer_logs` | BR-09 |
| REQ-VEH-006 | P0 | THE SYSTEM SHALL let a permitted user record a manual reading (date, time, km, note) and list every reading with date, km, source (Admin, Driver, GPS), user, role and status; WHEN a reading is saved, the vehicle odometer and the PM due dates SHALL be recalculated. | [`VehicleOdometer`](<Design Artifact/Vehicles odometer history and manual reading-html/VehicleOdometer.dc.html>), [`VehicleOverview`](<Design Artifact/Vehicles Overview tab-html/VehicleOverview.dc.html>) | `odometer_logs`, `vehicle_pm_schedule` |  |
| REQ-VEH-007 | P0 | WHEN the System Admin voids a reading with a reason, THE SYSTEM SHALL keep it in history marked Voided, recalculate the vehicle odometer from the last valid reading and recalculate PM due dates; a user who entered a reading MAY request the void \[A\]. | [`OdometerVoid`](<Design Artifact/Void odometer reading (System Admin)-html/OdometerVoid.dc.html>) | `odometer_logs.voided_at` | BR-09, BR-10 |
| REQ-VEH-008 | P0 | THE SYSTEM SHALL show per vehicle its WO history (KPI cards: WOs, open, cost last 6 months, cost per km; filters; Open or WO document per row). | [`VehicleWOHistory`](<Design Artifact/Vehicles WO history tab-html/VehicleWOHistory.dc.html>) | `work_orders` |  |
| REQ-VEH-009 | P1 | THE SYSTEM SHALL update odometer readings automatically through a GPS adapter, Protrack first (source GPS). | [`Settings`](<Design Artifact/Settings (home)-html/Settings.dc.html>) | `odometer_logs` |  |
| REQ-VEH-010 | P0 | THE SYSTEM SHALL let the System Admin or a Field Coordinator set the current driver of a vehicle in Vehicles (one driver per vehicle, one vehicle per driver), log every change, and show the driver app only the vehicle assigned to that driver. | [VehicleOverview](<Design Artifact/Vehicles Overview tab-html/VehicleOverview.dc.html>), [DashboardDriver](<Design Artifact/Driver home (mobile)-html/DashboardDriver.dc.html>) | drivers.assigned\_vehicle\_id, audit\_logs | RL-6 |

| ID | Verifies | Acceptance criterion |
| --- | --- | --- |
| AC-VEH-001 | REQ-VEH-005 | IF a reading of 48.000 km is entered after 48.210 km, THEN THE SYSTEM SHALL refuse it. |
| AC-VEH-002 | REQ-VEH-007 | WHEN a reading of 418.200 km is voided, the vehicle odometer SHALL return to the last valid reading and the void SHALL be in the audit log. |
| AC-VEH-003 | REQ-VEH-003 | IF a vehicle with a mounted tyre gets a new class, THEN THE SYSTEM SHALL refuse. |
| AC-VEH-004 | REQ-VEH-010 | WHEN Joko is set as driver of B 1234 ABC while he drove D 4410 KL, D 4410 KL SHALL have no driver and Joko's app SHALL show only B 1234 ABC. |

### 4.11 PM: preventive maintenance, inspections and breakdowns (P0)

| ID | P | Requirement | Screens | Data | Rules |
| --- | --- | --- | --- | --- | --- |
| REQ-PM-001 | P0 | WHEN a vehicle reaches an interval in km or days, whichever comes first, of a package of its own vehicle class, THE SYSTEM SHALL raise one pending PM alert (never two for the same vehicle and package) that drafts a WO. | [`DashboardPlanner`](<Design Artifact/Dashboard (Planner)-html/DashboardPlanner.dc.html>) | `maintenance_alerts`, `vehicle_pm_schedule` |  |
| REQ-PM-002 | P0 | THE SYSTEM SHALL seed for the Tractor\_Head and Wingbox\_Rigid classes the packages PM-1 (10.000 km or 180 days: engine oil and filter, diesel filter, fluid check, tyre pressure check), PM-2 (20.000 km or 360 days: PM-1 plus air filter, tyre rotation, brake pad inspection) and PM-3 (40.000 km or 720 days: PM-2 plus transmission and differential oil, spark or glow plugs, coolant flush) as editable data; packages of other classes, such as PM-HILUX for Pickup\_Patrol and PM-TRAILER for Trailer\_Tail, are created by the Planner or System Admin. | [`SettingsPMPackages`](<Design Artifact/Settings PM packages and tasks-html/SettingsPMPackages.dc.html>) | `pm_packages`, `pm_tasks` |  |
| REQ-PM-003 | P0 | THE SYSTEM SHALL show every alert without a WO in an alert list with "Create WO" prefilled with vehicle, source and the preset of its alert rule (REQ-WO-012). | [`DashboardPlanner`](<Design Artifact/Dashboard (Planner)-html/DashboardPlanner.dc.html>), [`Vehicles`](<Design Artifact/Vehicles tab-html/Vehicles.dc.html>) | `maintenance_alerts` |  |
| REQ-PM-004 | P0 | THE SYSTEM SHALL let the System Admin record an inspection for a named driver (checklist brakes, lights, tyres, engine oil, body damage, each Pass or Fail; odometer), marked Entered by System Admin; IF an item fails, THEN a photo and a description SHALL be required and a WO with source Driver\_DVIR SHALL be drafted. | [`VehicleInspections`](<Design Artifact/Vehicles Inspections tab (System Admin, P0)-html/VehicleInspections.dc.html>), [`AdminInspectionForm`](<Design Artifact/Record inspection for a driver (P0)-html/AdminInspectionForm.dc.html>) | `dvir_logs` |  |
| REQ-PM-005 | P0 | THE SYSTEM SHALL let the System Admin report a breakdown for a driver (location, description, photo), which drafts a WO with source Driver\_Breakdown pre-seeded with one Mobilisasi step at the reported location (`REQ-WO-003`, `REQ-MBL-002`). | [`AdminBreakdownForm`](<Design Artifact/Report breakdown for a driver (P0)-html/AdminBreakdownForm.dc.html>) | `breakdown_reports`, `work_order_assignments` |  |
| REQ-PM-006 | P0 | THE SYSTEM SHALL let the System Admin set warning-only thresholds: dead stock (180 days), odometer jump (1.500 km per day) and the file storage budget (default 50 GB, alert at 80%, NFR-13). Tyre tread, part item life, PM lead and document warning days, which can draft a WO, are set in Alert rules (REQ-PM-007). | [`SettingsAlertThresholds`](<Design Artifact/Settings Alert thresholds-html/SettingsAlertThresholds.dc.html>) | `app_settings` |  |
| REQ-PM-007 | P0 | THE SYSTEM SHALL let the Planner or System Admin set, for each alert kind (PM due, Document expiry, Tyre tread, Part item life, Inspection fail, Breakdown, Field report), its trigger and its action: Show the alert only, or Show the alert and draft a WO; when to draft (for example when due soon or when due), the preset, the priority and the roles notified. Inspection fail, Breakdown and Field report SHALL always draft a WO. | [`SettingsAlertRules`](<Design Artifact/Settings Alert rules-html/SettingsAlertRules.dc.html>) | `alert_rules` | DEC-86 |
| REQ-PM-008 | P0 | THE SYSTEM SHALL take the preset of a drafted WO from the package for a PM alert, from the document type for a document alert, and from the rule for every other kind; the package and document type values SHALL be editable both in Alert rules and in PM packages or Document types, as one setting. Inspection fail, Breakdown and Field report default to no preset, so their draft arrives without steps for the Planner to compose (DEC-85). | [`SettingsAlertRules`](<Design Artifact/Settings Alert rules-html/SettingsAlertRules.dc.html>), [`SettingsPMPackages`](<Design Artifact/Settings PM packages and tasks-html/SettingsPMPackages.dc.html>), [`DocumentTypes`](<Design Artifact/Settings Document types-html/DocumentTypes.dc.html>) | `pm_packages`, `document_types`, `alert_rules` | DEC-86 |
| REQ-PM-009 | P0 | WHEN an alert triggers and its rule drafts a WO, THE SYSTEM SHALL create one Draft WO (never Active) with the vehicle, the source, the title, category, workshop flag and steps of the preset, the rule's priority and, for PM, the package's suggested parts, and SHALL notify the roles set on the rule; it SHALL NOT draft a second WO for the same vehicle and source (package, document, tyre or part item) while one is open. | [`FCRequests`](<Design Artifact/Requests draft WOs from drivers (Field Coordinator)-html/FCRequests.dc.html>), [`DashboardPlanner`](<Design Artifact/Dashboard (Planner)-html/DashboardPlanner.dc.html>) | `maintenance_alerts`, `work_orders` | REQ-WO-001 |
| REQ-PM-010 | P0 | Alert rules SHALL refuse Save while a package or document type that drafts WOs has no preset, or a tyre due soon limit is not above the Act now limit, and SHALL warn when a PM package drafts with a non-PM preset. IF a rule's preset is inactive when the alert triggers, THEN THE SYSTEM SHALL raise the alert without a draft and notify the System Admin. Changing a rule or a preset SHALL NOT change drafts already made. | [`SettingsAlertRules`](<Design Artifact/Settings Alert rules-html/SettingsAlertRules.dc.html>) | `alert_rules` | DEC-86 |

| ID | Verifies | Acceptance criterion |
| --- | --- | --- |
| AC-PM-001 | REQ-PM-001 | WHEN a vehicle last serviced at 0 km reaches 10.000 km before 180 days, one PM-1 alert SHALL exist with reason Mileage and a Draft WO. |
| AC-PM-002 | REQ-PM-004 | IF an inspection fails on brakes without a photo, THEN THE SYSTEM SHALL refuse to save it. |
| AC-PM-004 | REQ-PM-010 | WHEN the PM rule drafts WOs and package PM-3 of Tractor head 6x4 has no preset, Alert rules SHALL refuse Save and name PM-3. |
| AC-PM-005 | REQ-PM-009 | WHEN tyre TY-0088 reads 2,8 mm and the Tyre rule drafts with preset Tyre service at priority High, THE SYSTEM SHALL create one Draft WO with the steps of Tyre service and priority High; a second low reading of the same tyre SHALL NOT create another while that WO is open. |
| AC-PM-003 | REQ-PM-001 | WHEN a Pickup\_Patrol Hilux reaches 10.000 km since its last PM-HILUX, one PM-HILUX alert SHALL exist and no PM-1 alert; WHEN a Trailer\_Tail reaches 90 days since its last PM-TRAILER, one PM-TRAILER alert SHALL exist with reason Days. |

### 4.12 BSL: parts baseline (P0)

Goal: give alerts a starting point for vehicles that already have tyres and service parts fitted.

| ID | P | Requirement | Screens | Data | Rules |
| --- | --- | --- | --- | --- | --- |
| REQ-BSL-001 | P0 | THE SYSTEM SHALL let the System Admin enter a baseline without a WO, right after adding a vehicle or with "+ Parts baseline", in one transaction written to the audit log. | [`PartsBaseline`](<Design Artifact/Parts baseline (first entry)-html/PartsBaseline.dc.html>) | `vehicle_part_items`, `part_placements` (is\_baseline) | BR-01 |
| REQ-BSL-002 | P0 | THE SYSTEM SHALL let the System Admin pick, per tyre position, a tyre that is In\_Stock (go-live tyres are first received with source Existing), with tread depth and fitting odometer; WHEN saved, the tyre SHALL be Mounted there and leave the In Stock count. | [`PartsBaseline`](<Design Artifact/Parts baseline (first entry)-html/PartsBaseline.dc.html>) | `tyres`, `part_placements`, `tyre_events` | BR-11 |
| REQ-BSL-003 | P0 | THE SYSTEM SHALL take, per part item type that applies to the class, the date and odometer of the last replacement; the normal life in km and days SHALL come from the master and be editable per vehicle. | [`PartsBaseline`](<Design Artifact/Parts baseline (first entry)-html/PartsBaseline.dc.html>), [`SettingsPartItemTypes`](<Design Artifact/Settings Part item types-html/SettingsPartItemTypes.dc.html>) | `part_item_types`, `vehicle_part_items` |  |
| REQ-BSL-004 | P0 | THE SYSTEM SHALL compute next due (km and date, whichever first) and a status Normal, Due soon, Act now or Missing, and raise one alert per part item near its limit. A part item without a baseline SHALL show Missing and raise no alert \[A\]. | [`Vehicles`](<Design Artifact/Vehicles tab-html/Vehicles.dc.html>) | `vehicle_part_items`, `maintenance_alerts` |  |
| REQ-BSL-005 | P0 | WHILE no WO has touched a part item, THE SYSTEM SHALL let the System Admin correct its baseline with a reason ("Correct baseline"), logging old and new values and recalculating next due; tyres are never corrected here. IF a WO has touched it, THEN THE SYSTEM SHALL refuse. | [`BaselineCorrect`](<Design Artifact/Correct parts baseline (System Admin)-html/BaselineCorrect.dc.html>) | `vehicle_part_items`, `audit_logs` |  |
| REQ-BSL-006 | P0 | WHEN a WO completes, THE SYSTEM SHALL reset every part item linked (through the service or part catalog) to a line of that WO: last replaced date and odometer, next due, source Work\_Order \[A\]. |  | `vehicle_part_items.last_work_order_id` |  |
| REQ-BSL-007 | P0 | THE SYSTEM SHALL let a Planner or the System Admin maintain part item types in Settings > Part item types: code, name, category, normal life in km and days, early-failure tolerance (starting value 80%, adjustable, DEC-47), classes, optional PM package. | [`SettingsPartItemTypes`](<Design Artifact/Settings Part item types-html/SettingsPartItemTypes.dc.html>) | `part_item_types`, `part_item_type_classes` |  |
| REQ-BSL-008 | P0 | THE SYSTEM SHALL import baselines from a spreadsheet for go-live, through the bulk import of REQ-IAM-011. |  |  |  |
| REQ-BSL-009 | P0 | WHEN a WO that replaces a part item or tyre is submitted for approval, and again WHEN it completes, THE SYSTEM SHALL compute life used = the larger of km used ÷ normal life km and days used ÷ normal life days; IF life used is below the tolerance of its type (for tyres: the life of the position in the chassis layout and the single tyre tolerance in Settings, app\_settings.tyre\_early\_failure\_pct, set by the Planner), THEN THE SYSTEM SHALL flag Early failure on the approval review, record an early-failure event and notify the Planner, Supervisor and GM. The flag never blocks the WO. | [`ApprovalReview`](<Design Artifact/Review approval creation-html/ApprovalReview.dc.html>), [`SupervisorMobileReview`](<Design Artifact/Mobile app, Supervisor GM menu review and decide (P1)-html/SupervisorMobileReview.dc.html>), [`Dashboard`](<Design Artifact/Dashboard (Supervisor, GM)-html/Dashboard.dc.html>), [`NotificationCenter`](<Design Artifact/Notification center-html/NotificationCenter.dc.html>) | `early_failure_events`, `part_item_types.early_failure_pct` |  |

| ID | Verifies | Acceptance criterion |
| --- | --- | --- |
| AC-BSL-001 | REQ-BSL-004 | WHEN an oil filter was replaced at 10.100 km with a 10.000 km life, next due SHALL be 20.100 km. |
| AC-BSL-002 | REQ-BSL-002 | WHEN baseline tyres are saved, they SHALL show on both the Part Replacement map and the Vehicles map. |
| AC-BSL-003 | REQ-BSL-004 | A part item without a baseline SHALL raise no alert. |
| AC-BSL-004 | REQ-BSL-005 | IF Correct baseline is used on a part item that a completed WO reset, THEN THE SYSTEM SHALL refuse. |
| AC-BSL-005 | REQ-BSL-009 | WHEN front brake pads with a normal life of 40.000 km and 365 days are replaced after 18.000 km and 120 days (life used 45%, tolerance 80%), THE SYSTEM SHALL flag Early failure on the review, notify the Planner, Supervisor and GM, and the WO SHALL still be approvable. |

### 4.13 INV: parts inventory (P0, risk: high)

Goal: every change to part stock has a document, and stock stays accurate. Tyres are never handled here (4.14). States: `SM-GR`, `SM-SA` (3.7).

| ID | P | Requirement | Screens | Data | Rules |
| --- | --- | --- | --- | --- | --- |
| REQ-INV-001 | P0 | THE SYSTEM SHALL keep a part catalog with SKU, name, category, unit, brand, quantity, reorder point, moving average cost, rack and optional part item type. | [`Inventory`](<Design Artifact/Inventory-html/Inventory.dc.html>), [`PartDetail`](<Design Artifact/Inventory Part detail-html/PartDetail.dc.html>) | `parts_catalog` |  |
| REQ-INV-002 | P0 | THE SYSTEM SHALL let the Warehouse Manager add a part with opening quantity 0 (stock enters through a Goods Receipt, or once before go-live through the opening balance of REQ-INV-013) and edit it with a reason; IF the part has moved, THEN SKU and unit SHALL be locked. | [`AddPart`](<Design Artifact/Inventory Add part-html/AddPart.dc.html>), [`PartEdit`](<Design Artifact/Inventory Edit part-html/PartEdit.dc.html>) | `parts_catalog`, `audit_logs` |  |
| REQ-INV-003 | P0 | IF a part's quantity is not 0 or it sits on an open WO list or a Draft Goods Receipt, THEN THE SYSTEM SHALL refuse to deactivate it. | [`PartDeactivate`](<Design Artifact/Deactivate part (dialog)-html/PartDeactivate.dc.html>) | `parts_catalog.is_active` |  |
| REQ-INV-004 | P0 | THE SYSTEM SHALL let the Warehouse Manager create a Goods Receipt (generated number, date, supplier, optional PO, invoice or delivery note number, lines: SKU, quantity, unit price, expiry, rack) and post it without approval; WHEN posted, stock SHALL rise, the moving average cost SHALL be recalculated and a stock card row SHALL be written. | [`GoodsReceipts`](<Design Artifact/Inventory Goods Receipts-html/GoodsReceipts.dc.html>), [`GoodsReceiptForm`](<Design Artifact/New Goods Receipt-html/GoodsReceiptForm.dc.html>), [`GoodsReceiptDetail`](<Design Artifact/Goods Receipt detail-html/GoodsReceiptDetail.dc.html>) | `goods_receipts`, `goods_receipt_items`, `stock_cards` | BR-06, BR-12 |
| REQ-INV-005 | P0 | IF a posted Goods Receipt is edited, THEN THE SYSTEM SHALL refuse; a wrong quantity or price SHALL be fixed by a GR correction posted with a reason and no approval, which adjusts stock, average cost and the stock card and links to the receipt. | [`GRCorrection`](<Design Artifact/GR correction-html/GRCorrection.dc.html>) | `gr_corrections` | BR-06 |
| REQ-INV-006 | P0 | IF a stock change has no document (Goods Receipt, GR correction, goods issue, issue reversal or approved stock opname), THEN THE SYSTEM SHALL refuse it. | all | `stock_cards.reference_doc_id` | BR-06 |
| REQ-INV-007 | P0 | THE SYSTEM SHALL keep a stock card per SKU (date, type, document, vehicle for issues, in, out, balance, user), newest first, with summary cards (on hand, reorder point, average cost, rack, status). | [`StockCard`](<Design Artifact/Inventory Stock card-html/StockCard.dc.html>) | `stock_cards` |  |
| REQ-INV-008 | P0 | THE SYSTEM SHALL export the stock card by scope (one SKU, category or all), period, transaction types, format (xlsx, CSV, PDF) and columns, with opening and closing balance and one sheet per SKU in xlsx, and log every export. | [`StockCardExport`](<Design Artifact/Stock card Export-html/StockCardExport.dc.html>) | `export_logs` |  |
| REQ-INV-009 | P0 | WHEN a part's balance is at or below its reorder point, THE SYSTEM SHALL raise a Low Stock alert. | [`DashboardWarehouse`](<Design Artifact/Dashboard (Warehouse Manager)-html/DashboardWarehouse.dc.html>) | `parts_catalog` |  |
| REQ-INV-010 | P0 | THE SYSTEM SHALL let the Warehouse Manager create one stock opname document with many SKU rows (system quantity, physical quantity, variance = physical − system), each non-zero variance needing a reason code (Damaged, Entry\_Error, Lost, Found) and a note, and submit it for approval. | [`StockOpname`](<Design Artifact/Inventory Stock opname-html/StockOpname.dc.html>) | `stock_adjustments`, `stock_adjustment_items` | BR-12 |
| REQ-INV-011 | P0 | WHEN an Approver approves a stock opname, THE SYSTEM SHALL set system quantities to the physical quantities and write stock card rows; WHEN rejected with a reason, it SHALL return to Draft marked Returned for the Warehouse Manager to fix and resubmit. | [`StockOpnameApproval`](<Design Artifact/Review Stock opname (Supervisor, GM or System Admin)-html/StockOpnameApproval.dc.html>), [`StockOpnameReturned`](<Design Artifact/Stock opname returned by the approver-html/StockOpnameReturned.dc.html>) | `stock_adjustments.returned_reason` | BR-03, BR-12 |
| REQ-INV-012 | P1 | THE SYSTEM SHALL flag a part with no movement for more than 180 days as Dead Stock. | [`ReportsInventory`](<Design Artifact/Reports Inventory-html/ReportsInventory.dc.html>) | `parts_catalog.last_movement_at` |  |
| REQ-INV-013 | P0 | WHILE the system is in Setup mode (REQ-IAM-010), THE SYSTEM SHALL let the System Admin enter the opening balance with a row per SKU (physical quantity, unit cost, rack) and save it without approval, setting stock and average cost and writing stock card rows of type OB; WHEN the system is Live, THE SYSTEM SHALL refuse any opening balance. Tyres enter through Receive tyres with source Existing (REQ-BSL-002). | [OpeningBalance](<Design Artifact/Inventory opening balance in Setup mode (System Admin)-html/OpeningBalance.dc.html>) | stock\_adjustments (kind Opening), stock\_cards (OB), app\_settings.system\_mode | BR-06, BR-12 |
| REQ-INV-014 | P0 | THE SYSTEM SHALL let the System Admin maintain vendors (code, name, type Supplier, Workshop, Retread or Shop, phone, address, active); Goods Receipts, Part Purchase steps, External workshop services, and retread dispatches SHALL pick the vendor from this list instead of typing it. | [SettingsVendors](<Design Artifact/Settings Vendors (System Admin)-html/SettingsVendors.dc.html>) | vendors | - |

| ID | Verifies | Acceptance criterion |
| --- | --- | --- |
| AC-INV-001 | REQ-INV-004 | WHEN a receipt of 10 at Rp 100.000 is posted onto 10 at Rp 80.000, the average cost SHALL become Rp 90.000 and the stock 20. |
| AC-INV-002 | REQ-INV-005 | IF a posted Goods Receipt is edited, THEN THE SYSTEM SHALL refuse and offer GR correction. |
| AC-INV-003 | REQ-INV-010 | IF a row with a variance has no reason code, THEN Submit for approval SHALL be refused with an error under the sheet. |
| AC-INV-004 | REQ-INV-011 | IF the Warehouse Manager who counted tries to approve, THEN THE SYSTEM SHALL refuse; a System Admin who counted SHALL be allowed, marked Self-approved. |
| AC-INV-005 | REQ-INV-003 | IF a part with quantity 3 is deactivated, THEN THE SYSTEM SHALL refuse. |
| AC-INV-006 | REQ-INV-013 | WHEN the System Admin saves 420 L of SKU-1029 at Rp 76.500 in Setup mode, stock SHALL be 420 at that cost with one OB row and no approval; IF it is tried after Go live, THEN THE SYSTEM SHALL refuse. |

### 4.14 TYR: tyres and retread (P0)

Goal: track every tyre as an individual asset by condition, outside the part catalog, with retread handled outside WOs. States: `SM-TYRE` (3.6), `SM-TR`, `SM-RD`, `SM-TC` (3.7).

| ID | P | Requirement | Screens | Data | Rules |
| --- | --- | --- | --- | --- | --- |
| REQ-TYR-001 | P0 | THE SYSTEM SHALL record tyres one by one, never as catalog parts: no SKU, no quantity, no stock card, never in a Goods Receipt or stock opname. | [`Tyres`](<Design Artifact/Inventory Tyres-html/Tyres.dc.html>) | `tyres` | BR-11 |
| REQ-TYR-002 | P0 | THE SYSTEM SHALL give every tyre a generated system code (TY-0101) that cannot be typed, edited or reused, and store the serial number printed on the tyre, unique per brand \[A\]; both SHALL show wherever a tyre is listed or chosen. | [`Tyres`](<Design Artifact/Inventory Tyres-html/Tyres.dc.html>), [`Stock`](<Design Artifact/Step Stock-html/Stock.dc.html>), [`Placement`](<Design Artifact/Step Part Replacement map-html/Placement.dc.html>), [`PartsBaseline`](<Design Artifact/Parts baseline (first entry)-html/PartsBaseline.dc.html>) | `tyres.tyre_code`, `UNIQUE (brand, serial_number)` |  |
| REQ-TYR-003 | P0 | THE SYSTEM SHALL keep tyre statuses as master data: In\_Stock, Issued, Mounted, Needs\_Retread, Worn\_Out, On\_Retread, Scrapped and Lost (Scrapped and Lost final), editable by the System Admin \[A\]. | [`SettingsTyreStatuses`](<Design Artifact/Settings Tyre statuses-html/SettingsTyreStatuses.dc.html>) | `tyre_statuses` | PR-6 |
| REQ-TYR-004 | P0 | THE SYSTEM SHALL show Inventory in two modes chosen beside the title, Parts and Tyres; Tyres mode has the tabs Tyres, Retread and Tyre count and the buttons Receive tyres and Send to retread; the last mode used is remembered per user. | [`Inventory`](<Design Artifact/Inventory-html/Inventory.dc.html>), [`Tyres`](<Design Artifact/Inventory Tyres-html/Tyres.dc.html>) | `user_table_preferences` |  |
| REQ-TYR-005 | P0 | THE SYSTEM SHALL show the Tyres tab with eight status cards, an open-dispatch strip with Receive buttons, filters (code or serial, brand, size, status, retread vendor), a table with one field per column (default: code, serial, brand, size, status, location, position or rack, tread, retreads, total km), a column chooser saved per user (code and serial always shown) and a detail panel with history and actions. | [`Tyres`](<Design Artifact/Inventory Tyres-html/Tyres.dc.html>), [`TyreColumns`](<Design Artifact/Tyres column chooser-html/TyreColumns.dc.html>) | `tyres`, `tyre_events`, `user_table_preferences` | NFR-08 |
| REQ-TYR-006 | P0 | THE SYSTEM SHALL let the Warehouse Manager receive tyres with one form whose receipt type is New tyres (source Supplier, with invoice number and image, or Existing, with neither) or Retread return; WHEN a New receipt is confirmed, each tyre (serial, brand, model, size, type, tread, cost, rack) SHALL become In\_Stock with a generated code, without approval. | [`ReceiveTyres`](<Design Artifact/Receive tyres new tyres-html/ReceiveTyres.dc.html>) | `tyre_receipts`, `tyres`, `tyre_attachments` | BR-11 |
| REQ-TYR-007 | P0 | THE SYSTEM SHALL increase the In Stock count only through Receive tyres and a demount marked Back to stock, and decrease it only through the parts baseline, the Stock step of a WO and an approved tyre count. |  | `tyres.status_id` | BR-11 |
| REQ-TYR-008 | P0 | THE SYSTEM SHALL let the Warehouse Manager send Needs\_Retread tyres to a vendor with a dispatch (generated number, vendor, delivery note number and image, dispatch date, expected return); WHEN confirmed, each tyre SHALL become On\_Retread, with no approval and no WO \[A\]. | [`RetreadDispatch`](<Design Artifact/Send tyres to retread-html/RetreadDispatch.dc.html>), [`RetreadList`](<Design Artifact/Inventory Tyres, Retread-html/RetreadList.dc.html>), [`RetreadDispatchDetail`](<Design Artifact/Retread dispatch detail-html/RetreadDispatchDetail.dc.html>) | `retread_orders`, `retread_order_items` |  |
| REQ-TYR-009 | P0 | WHEN a Retread return is confirmed against a dispatch, THE SYSTEM SHALL require per tyre a result (Accepted, Rejected or Not returned yet), cost, new tread, invoice number and image; Accepted SHALL set In\_Stock, add 1 to the retread count, add the cost and set the retread vendor; Rejected SHALL require a reason and set Scrapped; Not returned yet SHALL keep the tyre On\_Retread and the dispatch open. | [`RetreadReceipt`](<Design Artifact/Receive tyres retread return-html/RetreadReceipt.dc.html>) | `tyre_receipts`, `retread_order_items`, `tyres.last_retread_vendor` |  |
| REQ-TYR-010 | P0 | THE SYSTEM SHALL let the Warehouse Manager mark a Needs\_Retread tyre Worn\_Out (reason and note) and scrap a Needs\_Retread or Worn\_Out tyre (reason, note, optional disposal reference; final). | [`TyreWornOut`](<Design Artifact/Tyres confirm Worn out-html/TyreWornOut.dc.html>), [`TyreScrap`](<Design Artifact/Tyres confirm Scrap-html/TyreScrap.dc.html>) | `tyre_events` |  |
| REQ-TYR-011 | P0 | THE SYSTEM SHALL let the Warehouse Manager count the tyres that should be in the warehouse (In\_Stock, Needs\_Retread, Worn\_Out), marking each Found or Missing (reason and note required for Missing), and submit the count for approval. | [`TyreCount`](<Design Artifact/Inventory Tyres, Tyre count-html/TyreCount.dc.html>) | `tyre_counts`, `tyre_count_items` | BR-12 |
| REQ-TYR-012 | P0 | WHEN an Approver approves a tyre count, THE SYSTEM SHALL write a Missing event and set status Lost for each missing tyre; WHEN rejected with a reason, it SHALL return to Draft marked Returned. | [`TyreCountApproval`](<Design Artifact/Review Tyre count (Supervisor, GM or System Admin)-html/TyreCountApproval.dc.html>), [`StockOpnameReturned`](<Design Artifact/Stock opname returned by the approver-html/StockOpnameReturned.dc.html>) | `tyre_events` | BR-03, BR-12 |
| REQ-TYR-013 | P0 | THE SYSTEM SHALL write one history entry per status change with the document that caused it (WO, tyre receipt, dispatch or tyre count), user and time. | [`Tyres`](<Design Artifact/Inventory Tyres-html/Tyres.dc.html>) | `tyre_events` |  |
| REQ-TYR-014 | P1 | THE SYSTEM SHALL compute cost per km per tyre from purchase cost plus all retread costs over the km of all mountings. | [`ReportsTyres`](<Design Artifact/Reports Tyres-html/ReportsTyres.dc.html>) | `retread_order_items`, `part_placement_logs` |  |
| REQ-TYR-015 | P1 | THE SYSTEM SHALL show low stock per tyre size against a minimum set in Settings \[A\], and alert when a tyre on retread passes its expected return date \[A\]. | [`DashboardWarehouse`](<Design Artifact/Dashboard (Warehouse Manager)-html/DashboardWarehouse.dc.html>), [`ReportsInventory`](<Design Artifact/Reports Inventory-html/ReportsInventory.dc.html>) | `tyre_min_levels` |  |

| ID | Verifies | Acceptance criterion |
| --- | --- | --- |
| AC-TYR-001 | REQ-PLC-004 | WHEN a tyre is demounted as Needs\_Retread, it SHALL show Needs\_Retread and its position SHALL be empty on the map. |
| AC-TYR-002 | REQ-TYR-008 | WHEN a dispatch is confirmed, every tyre in it SHALL be On\_Retread and SHALL NOT be selectable in a Stock step. |
| AC-TYR-003 | REQ-TYR-009 | WHEN a tyre is received as Accepted, it SHALL be In\_Stock with its retread count one higher. |
| AC-TYR-004 | REQ-TYR-009 | IF a tyre is received as Rejected without a reason, THEN THE SYSTEM SHALL refuse. |
| AC-TYR-005 | REQ-TYR-009 | WHEN one tyre is Not returned yet, the dispatch SHALL stay open (Partial). |
| AC-TYR-006 | REQ-TYR-012 | WHEN a count with one Missing tyre is approved, that tyre SHALL be Lost and leave the In Stock count. |
| AC-TYR-007 | REQ-TYR-001 | A Goods Receipt form SHALL offer no tyre. |

### 4.15 APR: approvals inbox (P0)

| ID | P | Requirement | Screens | Data | Rules |
| --- | --- | --- | --- | --- | --- |
| REQ-APR-001 | P0 | THE SYSTEM SHALL show an Approvals sidebar item with a count badge, only to Approvers; the dashboard list "Needs my action" SHALL show the same items. | [`Approvals`](<Design Artifact/Approvals (inbox)-html/Approvals.dc.html>), [`Dashboard`](<Design Artifact/Dashboard (Supervisor, GM)-html/Dashboard.dc.html>) |  | BR-04 |
| REQ-APR-002 | P0 | THE SYSTEM SHALL list in the Work Orders tab the WOs waiting for creation, amendment or completion approval, with type chips, search by WO or plate, and the columns WO, vehicle, title, category, approval type, requested by, submitted and waiting time. | [`Approvals`](<Design Artifact/Approvals (inbox)-html/Approvals.dc.html>) | `work_orders` |  |
| REQ-APR-003 | P0 | THE SYSTEM SHALL list in the Warehouse tab the stock opname sheets and tyre counts waiting for approval, with chips Stock opname and Tyre count and the columns document, type, rack, rows checked, result, requested by, role, submitted, waiting; Goods Receipts never appear. | [`ApprovalsWarehouse`](<Design Artifact/Approvals Warehouse tab (Supervisor, GM or System Admin)-html/ApprovalsWarehouse.dc.html>) | `stock_adjustments`, `tyre_counts` | BR-12 |
| REQ-APR-004 | P0 | WHEN a row is selected, THE SYSTEM SHALL show a preview with key data and "Open review"; the decision is made only on the review page, and a rejection SHALL need a reason. | [`ApprovalReview`](<Design Artifact/Review approval creation-html/ApprovalReview.dc.html>), [`AmendmentReview`](<Design Artifact/Review approval amendment-html/AmendmentReview.dc.html>), [`CompletionReview`](<Design Artifact/Review completion approval-html/CompletionReview.dc.html>), [`StockOpnameApproval`](<Design Artifact/Review Stock opname (Supervisor, GM or System Admin)-html/StockOpnameApproval.dc.html>), [`TyreCountApproval`](<Design Artifact/Review Tyre count (Supervisor, GM or System Admin)-html/TyreCountApproval.dc.html>) |  |  |
| REQ-APR-005 | P0 | WHEN one Approver decides an item, THE SYSTEM SHALL remove it from every Approver's list. | [`Approvals`](<Design Artifact/Approvals (inbox)-html/Approvals.dc.html>) |  | BR-04 |
| REQ-APR-006 | P0 | THE SYSTEM SHALL hide from a user the items they created or counted, except for the System Admin, who sees them marked Yours and may decide them (Self-approved). | [`Approvals`](<Design Artifact/Approvals (inbox)-html/Approvals.dc.html>) |  | BR-03 |
| REQ-APR-007 | P0 | THE SYSTEM SHALL list in the History tab the user's past decisions (decided, WO, vehicle, approval, decision, requested by) with chips Approved and Rejected, showing reason and stamp in the preview and "Open WO". | [`ApprovalsHistory`](<Design Artifact/Approvals History-html/ApprovalsHistory.dc.html>) | `work_order_approvals` |  |
| REQ-APR-008 | P1 | THE SYSTEM SHALL sort by waiting time and remind the Approvers when an item waits longer than a set time \[A\]. | [`Approvals`](<Design Artifact/Approvals (inbox)-html/Approvals.dc.html>) | `notifications` |  |
| REQ-APR-009 | P0 | THE SYSTEM SHALL show on the completion review an Evidence card with every step's photos, invoices and the placement snapshot, grouped by step, each opening the shared viewer. | [CompletionReview](<Design Artifact/Review completion approval-html/CompletionReview.dc.html>), [PhotoViewer](<Design Artifact/Component photo and file viewer (dialog)-html/PhotoViewer.dc.html>) | wo\_attachments, placement\_map\_snapshots | BR-04 |
| REQ-APR-010 | P0 | WHERE a WO comes from an inspection, a breakdown or a field finding, THE SYSTEM SHALL show the photos of that report on the creation review, each opening the shared viewer. | [ApprovalReview](<Design Artifact/Review approval creation-html/ApprovalReview.dc.html>), [PhotoViewer](<Design Artifact/Component photo and file viewer (dialog)-html/PhotoViewer.dc.html>) | dvir\_logs, breakdown\_reports | BR-04 |
| REQ-APR-011 | P0 | THE SYSTEM SHALL show on the creation review a Part age card with one row per part item and tyre position the WO will replace: last replaced date and odometer, km and days used, normal life, life used in percent and the Early failure flag of REQ-BSL-009, with the vehicle's earlier early failures of the same part. | [ApprovalReview](<Design Artifact/Review approval creation-html/ApprovalReview.dc.html>), [SupervisorMobileReview](<Design Artifact/Mobile app, Supervisor GM menu review and decide (P1)-html/SupervisorMobileReview.dc.html>) | vehicle\_part\_items, part\_item\_types, part\_placements, early\_failure\_events | BR-04 |

| ID | Verifies | Acceptance criterion |
| --- | --- | --- |
| AC-APR-001 | REQ-APR-001 | A Mechanic, and a Planner while Planner approval is off, SHALL NOT see the Approvals item; the System Admin always SHALL. |
| AC-APR-002 | REQ-APR-005 | WHEN a Supervisor approves an item, it SHALL disappear from the GM's list. |
| AC-APR-003 | REQ-APR-006 | A WO created by the viewer SHALL NOT appear in their list, unless the viewer is the System Admin. |
| AC-APR-004 | REQ-APR-004 | IF an item is rejected without a reason, THEN THE SYSTEM SHALL refuse. |
| AC-APR-005 | REQ-APR-011 | WHEN a WO replaces a battery fitted 200 days ago with a normal life of 730 days, the review SHALL show 27% life used and the Early failure flag. |

### 4.16 DSH: role dashboards (P0)

Every role lands on a dashboard that shows only work it can act on, and every item opens the exact WO, step or document it names.

| ID | P | Requirement | Screens |
| --- | --- | --- | --- |
| REQ-DSH-001 | P0 | Supervisor and GM: WO and warehouse approvals waiting, fleet status, early failures this month, invoices issued and unpaid; the GM also sees fleet-wide cost cards (P1). | [`Dashboard`](<Design Artifact/Dashboard (Supervisor, GM)-html/Dashboard.dc.html>) |
| REQ-DSH-002 | P0 | Planner: steps to verify, drafts from alerts, own WOs waiting for approval, WOs not on the schedule, Needs my action, alerts without a WO (each with Create WO). | [`DashboardPlanner`](<Design Artifact/Dashboard (Planner)-html/DashboardPlanner.dc.html>) |
| REQ-DSH-003 | P0 | Mechanic: steps open, returned and coming (locked), submitted this week, vehicles in the workshop today, Create WO (still needs approval). | [`DashboardMechanic`](<Design Artifact/Dashboard (Mechanic)-html/DashboardMechanic.dc.html>) |
| REQ-DSH-004 | P0 | Warehouse Manager: Stock steps open, parts at or below reorder point, tyres needing retread, open dispatches, returned counts, low stock list. | [`DashboardWarehouse`](<Design Artifact/Dashboard (Warehouse Manager)-html/DashboardWarehouse.dc.html>) |
| REQ-DSH-005 | P0 | System Admin: everything any role sees, plus Document steps open, own WOs waiting (may self-approve), vehicles missing a required document, vehicles without a baseline, odometer void requests, integration status (odometer sync, notifications, file storage usage against its budget), master data links. | [`DashboardAdmin`](<Design Artifact/Dashboard (System Admin)-html/DashboardAdmin.dc.html>) |
| REQ-DSH-006 | P0 | Field Coordinator: Active, Repair and Blocked counts, unavailable vehicles with reason and planned day, maintenance planned this week, driver requests to turn into WOs (+ Create WO), Part Purchase steps waiting. | [`DashboardDispatcher`](<Design Artifact/Dashboard (Field Coordinator)-html/DashboardDispatcher.dc.html>) |
| REQ-DSH-007 | P1 | Driver (mobile): my vehicle and status, Start daily inspection, last result, Record odometer, Report breakdown, reminders (document expiry, next PM). | [`DashboardDriver`](<Design Artifact/Driver home (mobile)-html/DashboardDriver.dc.html>) |
| REQ-DSH-008 | P0 | IF a card needs a P1 feature (cost, tyre minimum per size), THEN THE SYSTEM SHALL hide it until release 2. | all dashboards |
| REQ-DSH-009 | P0 | Accounting: invoice drafts waiting, issued and overdue invoices, billed this month, completed WOs that are not billable (vehicle without a customer). | [DashboardAccounting](<Design Artifact/Dashboard (Accounting)-html/DashboardAccounting.dc.html>) |
| REQ-DSH-010 | P1 | The Supervisor and GM dashboard SHALL show where steps wait in the last 30 days (median per step of waiting to start, working, paused and waiting for verification), the largest phase as the bottleneck, and the number of submitted steps waiting for verification for more than 8 hours, with a link to the Step time tab. | [`Dashboard`](<Design Artifact/Dashboard (Supervisor, GM)-html/Dashboard.dc.html>) |

### 4.17 SCH: maintenance schedule (P0)

Goal: the Planner places WO cards on planned days and the Field Coordinator plans trips around them. The schedule is a plan, never a rule on the WO (`BR-13`). States: `SM-SCH` (3.7).

| ID | P | Requirement | Screens | Data | Rules |
| --- | --- | --- | --- | --- | --- |
| REQ-SCH-001 | P0 | THE SYSTEM SHALL show every open WO (Draft, Pending\_Approval, Active, In\_Progress, Pending\_Verification, Pending\_Amendment) as a card; a card with no day sits in "Not on the schedule". | [`MaintenanceSchedule`](<Design Artifact/Maintenance schedule (Planner)-html/MaintenanceSchedule.dc.html>) | `wo_schedule` |  |
| REQ-SCH-002 | P0 | THE SYSTEM SHALL let only the Planner and System Admin drag a card onto a day (week or month view) or to another day at any time; one day can hold several cards. | [`MaintenanceSchedule`](<Design Artifact/Maintenance schedule (Planner)-html/MaintenanceSchedule.dc.html>) | `wo_schedule`, `wo_schedule_log` | RL-6 |
| REQ-SCH-003 | P0 | WHEN a planned day ends and the WO is not Completed, THE SYSTEM SHALL mark the card Missed and list it under "Missed the planned day", without changing the WO. | [`MaintenanceSchedule`](<Design Artifact/Maintenance schedule (Planner)-html/MaintenanceSchedule.dc.html>) | `wo_schedule.is_missed` | BR-13 |
| REQ-SCH-004 | P0 | WHEN a card is placed, moved or missed, and each morning for today's list, THE SYSTEM SHALL alert the Field Coordinator in the app (and by push from R1 step 7). | [`NotificationCenter`](<Design Artifact/Notification center-html/NotificationCenter.dc.html>), [`DispatcherMobileAlerts`](<Design Artifact/Mobile app, Field Coordinator menu alerts (P1)-html/DispatcherMobileAlerts.dc.html>) | `schedule_alerts`, `notifications` |  |
| REQ-SCH-005 | P0 | THE SYSTEM SHALL show the same calendar read only to the Field Coordinator, Supervisor and GM, and the planned day of each unavailable vehicle on the Field Coordinator dashboard. | [`ScheduleDispatcher`](<Design Artifact/Maintenance schedule (Field Coordinator, read only)-html/ScheduleDispatcher.dc.html>), [`DashboardDispatcher`](<Design Artifact/Dashboard (Field Coordinator)-html/DashboardDispatcher.dc.html>) | `wo_schedule` |  |
| REQ-SCH-006 | P0 | THE SYSTEM SHALL log every placement and move (WO, old day, new day, user, time); a Completed or Cancelled WO leaves the open lists and stays visible on its last day. | [`MaintenanceSchedule`](<Design Artifact/Maintenance schedule (Planner)-html/MaintenanceSchedule.dc.html>) | `wo_schedule_log` |  |
| REQ-SCH-007 | P0 | WHEN a WO card is marked Missed, and every morning after that until the WO is Completed, Cancelled or moved, THE SYSTEM SHALL send a late alert to the WO creator, the executor of its open step, the Planners, the Field Coordinators and the GM. | [NotificationCenter](<Design Artifact/Notification center-html/NotificationCenter.dc.html>) | notifications, wo\_schedule | BR-13 |

| ID | Verifies | Acceptance criterion |
| --- | --- | --- |
| AC-SCH-001 | REQ-SCH-002, REQ-SCH-004 | WHEN WO-0154 is dragged onto Tuesday, it SHALL show on Tuesday and exactly one alert SHALL reach the Field Coordinator. |
| AC-SCH-002 | REQ-SCH-002 | Two WOs SHALL be placeable on the same day. |
| AC-SCH-003 | REQ-SCH-003 | WHEN a WO planned for Friday is still In\_Progress on Saturday, its card SHALL show Missed, the WO SHALL stay In\_Progress and the card SHALL be movable to Monday. |
| AC-SCH-004 | REQ-SCH-002 | IF the Field Coordinator drags a card, THEN THE SYSTEM SHALL refuse. |
| AC-SCH-005 | REQ-SCH-007 | WHEN WO-0145 planned for Friday is still In\_Progress on Saturday morning, its creator, the open step's executor, the Planners, the Field Coordinators and the GM SHALL each get one late alert, and again on Sunday. |

### 4.18 IAM: sign-in, accounts and access (P0)

| ID | P | Requirement | Screens | Data | Rules |
| --- | --- | --- | --- | --- | --- |
| REQ-IAM-001 | P0 | THE SYSTEM SHALL sign users in on the web and the mobile app with email and password; IF 5 sign-ins fail in a row, THEN THE SYSTEM SHALL lock the account for 15 minutes (DEC-55), and an Access Manager can unlock it. | [`WebLogin`](<Design Artifact/Sign in (web)-html/WebLogin.dc.html>), [`MobileLogin`](<Design Artifact/Mobile app sign in (menu follows the role) (P1)-html/MobileLogin.dc.html>) | `users.failed_logins`, `locked_until` |  |
| REQ-IAM-002 | P0 | THE SYSTEM SHALL let only an Access Manager create, edit, deactivate and unlock accounts and give each exactly one role; there can be several Access Manager accounts. | [`UsersRoles`](<Design Artifact/Users and roles (Access Manager)-html/UsersRoles.dc.html>), [`AMAccountForm`](<Design Artifact/New or edit account (Access Manager)-html/AMAccountForm.dc.html>) | `users`, `user_roles` | RL-1 |
| REQ-IAM-003 | P0 | THE SYSTEM SHALL show Users and roles as the Access Manager's own area, outside Settings, with the sidebar items Users and roles and Audit log and the tabs Accounts, Roles and permissions, Access history; IF the System Admin opens it, THEN THE SYSTEM SHALL refuse. | [`UsersRoles`](<Design Artifact/Users and roles (Access Manager)-html/UsersRoles.dc.html>), [`AMAccessHistory`](<Design Artifact/Users and roles Access history (Access Manager)-html/AMAccessHistory.dc.html>) |  | RL-4 |
| REQ-IAM-004 | P0 | WHEN an Access Manager runs "Move System Admin role" with a reason to another active account, THE SYSTEM SHALL, in one transaction, give that account System Admin, remove it from the old account and write one audit record; IF a second System Admin is given, or the System Admin moves the role itself, or the System Admin account is deactivated while it holds the role, THEN THE SYSTEM SHALL refuse. | [`UsersRoles`](<Design Artifact/Users and roles (Access Manager)-html/UsersRoles.dc.html>) | `uq_one_system_admin`, `audit_logs` | BR-14 |
| REQ-IAM-005 | P0 | THE SYSTEM SHALL let an Access Manager adjust which screens and actions each role has in a permission matrix \[A\]; cells fixed by a business rule SHALL be locked (approvals stay with Supervisor, GM and System Admin, apart from the Planner approval switch of REQ-IAM-008; the System Admin keeps every operational permission; managing accounts stays with Access Managers). | [`AMRolesPermissions`](<Design Artifact/Users and roles Roles and permissions (Access Manager)-html/AMRolesPermissions.dc.html>) | `role_permissions` | 2.2 |
| REQ-IAM-006 | P0 | THE SYSTEM SHALL check the role on every action on the server, not only in the interface. | all |  | NFR-04 |
| REQ-IAM-007 | P0 | THE SYSTEM SHALL show an Audit log page (user, role, area, record, before, after, self-approval flag), read only, with filters and export, to Access Managers and the System Admin \[A\]. | [`AuditLog`](<Design Artifact/Audit log-html/AuditLog.dc.html>) | `audit_logs` | NFR-02 |
| REQ-IAM-008 | P0 | THE SYSTEM SHALL let an Access Manager switch Planner approval on or off with a reason and an optional end time (default off); the Access Manager SHALL tick which approval kinds it covers (WO creation, amendment, completion, stock opname, tyre count); WHILE it is on, every Planner SHALL be an Approver for the ticked kinds under BR-03, and WHEN the end time passes, THE SYSTEM SHALL switch it off. Every switch SHALL be written to the audit log and notified to Supervisors and GMs. | [AMRolesPermissions](<Design Artifact/Users and roles Roles and permissions (Access Manager)-html/AMRolesPermissions.dc.html>) | app\_settings.planner\_approval\_until, audit\_logs | RL-7, BR-04 |
| REQ-IAM-009 | P0 | WHEN an Access Manager creates an account or resets a password, THE SYSTEM SHALL give a one-time temporary password and force a new password at the next sign-in (ChangePassword); a user who forgot the password asks an Access Manager, as there is no email reset in R1. | [AMAccountForm](<Design Artifact/New or edit account (Access Manager)-html/AMAccountForm.dc.html>), [ChangePassword](<Design Artifact/Change password at first sign-in-html/ChangePassword.dc.html>) | users.must\_change\_password | NFR-05 |
| REQ-IAM-010 | P0 | THE SYSTEM SHALL start in Setup mode. WHILE in Setup mode, only the System Admin and Access Managers SHALL sign in (every other role sees "The system is being set up") (DEC-56); the System Admin SHALL enter master data, vehicles, documents, tyres (Receive tyres, source Existing), parts baseline and the opening balance without any approval, and no WO SHALL be created. WHEN the System Admin presses Go live and confirms, after seeing a checklist of what has been set up, THE SYSTEM SHALL switch to Live once and for all, write the time and an audit record, and from then on apply every approval and rule of this spec. | [SetupGoLive](<Design Artifact/System Admin Setup mode and Go live-html/SetupGoLive.dc.html>), [OpeningBalance](<Design Artifact/Inventory opening balance in Setup mode (System Admin)-html/OpeningBalance.dc.html>) | app\_settings.system\_mode, went\_live\_at, audit\_logs | BR-04, BR-12 |
| REQ-IAM-011 | P0 | WHILE the system is in Setup mode, THE SYSTEM SHALL let the System Admin bulk import master data from xlsx or CSV, one entity at a time in dependency order: customers, vendors, services, stooring rates, parts catalog, vehicles, vehicle documents, existing tyres, parts baseline and opening balance. For each entity THE SYSTEM SHALL offer a template to download, validate every row with the same rules as its form, show a preview with the error of each failed row, and import all rows in one transaction only when no row fails; every import SHALL keep its file and write an audit record. Vehicle classes, chassis layouts, document types, part item types and PM packages are set up in their screens \[A\] (DEC-75). | [SetupImport](<Design Artifact/Setup bulk import of master data-html/SetupImport.dc.html>), [SetupGoLive](<Design Artifact/System Admin Setup mode and Go live-html/SetupGoLive.dc.html>) | import\_batches | REQ-IAM-010 |

| ID | Verifies | Acceptance criterion |
| --- | --- | --- |
| AC-IAM-001 | REQ-IAM-004 | IF the System Admin role is given to a second account, THEN THE SYSTEM SHALL refuse. |
| AC-IAM-002 | REQ-IAM-004 | WHEN the role is moved from Yusuf to Rina, Rina SHALL be System Admin, Yusuf SHALL NOT, and exactly one audit record SHALL exist. |
| AC-IAM-003 | REQ-IAM-003 | IF the System Admin opens Users and roles or changes any account, role or permission, THEN THE SYSTEM SHALL refuse. |
| AC-IAM-004 | REQ-IAM-002 | IF an account is given a second role, THEN THE SYSTEM SHALL refuse. |
| AC-IAM-005 | REQ-IAM-008 | WHEN Planner approval is switched on until 18:00, a Planner SHALL approve a WO created by a Mechanic; IF the Planner created the WO, THEN THE SYSTEM SHALL refuse; after 18:00 the Approvals item SHALL disappear for Planners. |
| AC-IAM-006 | REQ-IAM-010 | WHILE the system is in Setup mode, a Planner sign-in SHALL be refused with The system is being set up and Create WO SHALL be unavailable; WHEN the System Admin goes live, the Planner SHALL sign in. |
| AC-IAM-007 | REQ-IAM-011 | WHEN a vehicles file of 100 rows has 2 rows with an unknown vehicle class, THE SYSTEM SHALL list those 2 rows with their error and import nothing; WHEN they are fixed, all 100 vehicles SHALL be created in one import; WHEN the system is Live, the import SHALL be refused. |

### 4.19 NTF: notifications (P0 in-app, push P0 for the R1 mobile roles, P1 for the rest)

| ID | P | Requirement | Screens | Data | Rules |
| --- | --- | --- | --- | --- | --- |
| REQ-NTF-001 | P0 | THE SYSTEM SHALL create an in-app notification for: approval waiting, step opened, step returned, WO rejected, change request, alert, schedule change; the bell in the page header SHALL open a list with read and unread state, and each notice SHALL open the record it names. | [`NotificationCenter`](<Design Artifact/Notification center-html/NotificationCenter.dc.html>) | `notifications` |  |
| REQ-NTF-002 | P1 | WHEN an in-app notification is created, THE SYSTEM SHALL also push it (P0 for the roles of the R1 step 7 app: Driver, Field Coordinator, System Admin; P1 for the rest) to every phone where the user is signed in to the mobile app; tapping it SHALL open the matching screen. | [`DispatcherMobileAlerts`](<Design Artifact/Mobile app, Field Coordinator menu alerts (P1)-html/DispatcherMobileAlerts.dc.html>), [`SupervisorMobileHome`](<Design Artifact/Mobile app, Supervisor GM menu approvals (P1)-html/SupervisorMobileHome.dc.html>) | `push_devices`, `notification_deliveries` |  |
| REQ-NTF-003 | P1 | THE SYSTEM SHALL let a user mute push per kind in Profile; the in-app notification SHALL stay. | mobile Profile | `notification_mutes` |  |
| REQ-NTF-004 | P2 | WHERE the WhatsApp or email adapter is enabled, THE SYSTEM SHALL send the same notifications on that channel. |  | `notification_deliveries.channel` |  |
| REQ-NTF-005 | P0 | THE SYSTEM SHALL send each event to exactly the recipients and channels of the notification matrix below this table. | [NotificationCenter](<Design Artifact/Notification center-html/NotificationCenter.dc.html>) | notifications | - |

**Notification matrix (REQ-NTF-005).** Each event goes to exactly these recipients; push goes only to roles that have the mobile app in that release (4.20).

| Event | Recipients | Channel |
| --- | --- | --- |
| WO submitted for approval (creation, amendment, completion) | Supervisors, GM, System Admin; Planners while Planner approval covers it | In-app, push |
| WO approved, rejected or cancelled | Creator; executor of the open step | In-app, push |
| Step opened | Executor roles of the step (Stock: Warehouse Manager; Part Purchase: Field Coordinators and System Admin) | In-app, push |
| Step submitted | Planners and System Admin (verifiers) | In-app |
| Step returned | Executor of the step | In-app, push |
| Change request submitted, decided | WO creator and Approvers; then the requester | In-app, push |
| Driver inspection Fail, breakdown, field finding | Field Coordinators, Planners, System Admin | In-app, push |
| PM, part item, tyre, document alert | Planners, System Admin | In-app |
| Early failure | Planners, Supervisors, GM | In-app |
| Schedule card placed, moved, missed; today's list | Field Coordinators | In-app, push |
| Stock opname or tyre count submitted | Supervisors, GM, System Admin (and Planners if ticked) | In-app |
| Low stock, overdue retread | Warehouse Manager | In-app |
| Planner approval switched on or off | Supervisors, GM | In-app |
| Invoice draft created, invoice overdue | Accounting, Supervisors | In-app |
| WO late (planned day passed, not Completed), daily | WO creator, executor of the open step, Planners, Field Coordinators, GM | In-app, push |
| Step assigned, reassigned, claimed or released | New assignee; previous assignee on a reassign; Planners when an assignee releases a step | In-app, push |
| Parts of a cancelled WO to receive | Warehouse Manager | In-app |
| Driver of a vehicle changed | New and previous driver | In-app, push |

### 4.20 MOB: mobile app (risk: high; P0 in R1 step 7 for Driver, Field Coordinator and System Admin; P1 for Mechanic, Supervisor and GM)

Goal: one mobile app for the roles that work in the field, with the same data, rules and scope lock as the web.

| ID | P | Requirement | Screens | Data | Rules |
| --- | --- | --- | --- | --- | --- |
| REQ-MOB-001 | P0 | THE SYSTEM SHALL provide one mobile app whose menu follows the signed-in role. Built in R1 step 7, after the web core: Driver (Home, Inspection, History, Profile), Field Coordinator (Fleet, Requests, Purchases, Schedule, Alerts; Profile from the header) and the System Admin field menu (Requests, Purchases, Steps, Profile). In release 2 (P1): Mechanic (My steps, Report, History, Profile) and Supervisor and GM (Approvals, Fleet, History, Profile). Other roles use the web. | [`MobileLogin`](<Design Artifact/Mobile app sign in (menu follows the role) (P1)-html/MobileLogin.dc.html>) |  | RL-1 |
| REQ-MOB-002 | P0 | THE SYSTEM SHALL apply on the phone exactly the rules of the web: scope lock, catalog prices for Internal, invoice image for External and Purchase, at least one camera photo, only tyres Issued to the WO, tread and pressure per tyre, the Mobilisasi destination and location trail (`REQ-MBL-005`), Raise change request. | [`MechanicMobileHome`](<Design Artifact/Mobile app, Mechanic menu my steps (P1)-html/MechanicMobileHome.dc.html>), [`MechanicMobileStep`](<Design Artifact/Mobile app, Mechanic menu Mechanic Action step (P1)-html/MechanicMobileStep.dc.html>), [`MechanicMobilePlacement`](<Design Artifact/Mobile app, Mechanic menu Part Replacement step (P1)-html/MechanicMobilePlacement.dc.html>), [`FCMobilePurchase`](<Design Artifact/Mobile Field Coordinator Part Purchase step-html/FCMobilePurchase.dc.html>) |  | BR-01, BR-02 |
| REQ-MOB-003 | P0 | THE SYSTEM SHALL let a Driver do the daily inspection, which asks the odometer of a Powered vehicle and saves it as an odometer reading with source Driver, the main odometer source in Release 1 (DEC-76) (rules of `REQ-PM-004`), report a breakdown, record an odometer reading (rules of `REQ-VEH-005`) and see their history; an Expired document SHALL show a reminder not to operate the vehicle. WHEN a Driver files a breakdown report, THE SYSTEM SHALL capture the driver's device location once at that moment, store it on the breakdown report, and draft a WO with source `Driver_Breakdown` pre-seeded with one Mobilisasi step whose destination is that captured location (`REQ-WO-003`, `REQ-MBL-002`). | [`DashboardDriver`](<Design Artifact/Driver home (mobile)-html/DashboardDriver.dc.html>), [`DriverInspection`](<Design Artifact/Mobile app, Driver menu daily inspection (P1)-html/DriverInspection.dc.html>), [`DriverBreakdown`](<Design Artifact/Mobile app, Driver menu report breakdown (P1)-html/DriverBreakdown.dc.html>), [`DriverOdometer`](<Design Artifact/Mobile app, Driver menu record odometer (P1)-html/DriverOdometer.dc.html>), [`DriverHistory`](<Design Artifact/Mobile app, Driver menu history (P1)-html/DriverHistory.dc.html>) | `dvir_logs`, `breakdown_reports`, `odometer_logs` |  |
| REQ-MOB-004 | P1 | THE SYSTEM SHALL let a Mechanic report a field finding (vehicle, location, description, suggested category, urgency, photos, odometer if seen), which drafts exactly one WO with source Manual\_Mechanic and opens no step. | [`MechanicMobileFieldReport`](<Design Artifact/Mobile app, Mechanic menu field finding (P1)-html/MechanicMobileFieldReport.dc.html>) | `work_orders` | BR-01 |
| REQ-MOB-005 | P1 | THE SYSTEM SHALL let a Supervisor or GM list every waiting item, review and decide it (Approve, or Reject with a reason) with their stamp under the rules of 4.15, see fleet status and vehicles needing attention, and see their past decisions. | [`SupervisorMobileHome`](<Design Artifact/Mobile app, Supervisor GM menu approvals (P1)-html/SupervisorMobileHome.dc.html>), [`SupervisorMobileReview`](<Design Artifact/Mobile app, Supervisor GM menu review and decide (P1)-html/SupervisorMobileReview.dc.html>), [`SupervisorMobileFleet`](<Design Artifact/Mobile app, Supervisor GM menu fleet today (P1)-html/SupervisorMobileFleet.dc.html>) |  | BR-04 |
| REQ-MOB-006 | P0 | THE SYSTEM SHALL show a Field Coordinator fleet availability with reasons and planned days, the week's schedule as a list per day (read only) and the schedule alerts; let it complete draft WOs and send them to the Planner from the Requests list (`REQ-WO-014`) or create a new one, and record Part Purchase steps with a receipt photo (`REQ-PUR-002`). | [`DispatcherMobileFleet`](<Design Artifact/Mobile app, Field Coordinator menu fleet availability (P1)-html/DispatcherMobileFleet.dc.html>), [`DispatcherMobileSchedule`](<Design Artifact/Mobile app, Field Coordinator menu schedule, read only (P1)-html/DispatcherMobileSchedule.dc.html>), [`DispatcherMobileAlerts`](<Design Artifact/Mobile app, Field Coordinator menu alerts (P1)-html/DispatcherMobileAlerts.dc.html>), [`FCMobileRequests`](<Design Artifact/Mobile Field Coordinator requests-html/FCMobileRequests.dc.html>), [`FCMobileCreateWO`](<Design Artifact/Mobile Field Coordinator completes a draft WO-html/FCMobileCreateWO.dc.html>), [`FCMobilePurchase`](<Design Artifact/Mobile Field Coordinator Part Purchase step-html/FCMobilePurchase.dc.html>) |  | RL-6 |
| REQ-MOB-007 | P1 | THE SYSTEM SHALL show on the Supervisor/GM mobile review a swipeable strip of the evidence photos (completion) or the report photos (creation); tapping one opens it full screen with pinch zoom. | [SupervisorMobileReview](<Design Artifact/Mobile app, Supervisor GM menu review and decide (P1)-html/SupervisorMobileReview.dc.html>) | stored\_files | BR-04 |
| REQ-MOB-008 | P0 | THE SYSTEM SHALL give the System Admin a field menu: Requests and Create WO (as `REQ-MOB-006`), Purchases, and Steps, which lists every open step and opens it in the mobile step screens, including the Mobilisasi step with its route and location trail (`REQ-MBL-005`). | [`SAMobileHome`](<Design Artifact/Mobile System Admin field menu-html/SAMobileHome.dc.html>), [`FCMobileRequests`](<Design Artifact/Mobile Field Coordinator requests-html/FCMobileRequests.dc.html>), [`FCMobilePurchase`](<Design Artifact/Mobile Field Coordinator Part Purchase step-html/FCMobilePurchase.dc.html>), [`MechanicMobileStep`](<Design Artifact/Mobile app, Mechanic menu Mechanic Action step (P1)-html/MechanicMobileStep.dc.html>) |  | RL-3 |
| REQ-MOB-009 | P0 | WHILE the phone is offline, THE SYSTEM SHALL keep step, inspection, breakdown and purchase drafts with their photos on the device and SHALL refuse Submit until the connection returns, because submit needs the server checks; a Mobilisasi step records its location trail only while online and In\_Progress (REQ-MBL-005); the screen SHALL show Offline, draft saved. | all mobile form screens | - | REQ-FUP-011 |

| ID | Verifies | Acceptance criterion |
| --- | --- | --- |
| AC-MOB-001 | REQ-WOD-005 | WHEN a step is submitted from the phone, the WO document SHALL show the same stamps and photos as for a desktop submit. |
| AC-MOB-002 | REQ-MOB-004 | WHEN a field finding is sent, exactly one Draft WO SHALL exist and no step SHALL open. |
| AC-MOB-003 | REQ-MOB-001 | WHEN a Driver signs in, only the Driver menu SHALL show. |
| AC-MOB-004 | REQ-MOB-006 | WHEN a Field Coordinator sends a draft WO from a driver breakdown on the phone, the WO SHALL stay Draft, marked Sent for review, with source Driver\_Breakdown and the Field Coordinator as creator; it SHALL become Pending\_Approval only when a Planner or the System Admin submits it, and the Field Coordinator SHALL NOT be able to approve it. |

### 4.21 RPT: reports (P1)

| ID | P | Requirement | Screens | Data |
| --- | --- | --- | --- | --- |
| REQ-RPT-001 | P1 | THE SYSTEM SHALL show a Reports page with the tabs Cost, Tyres, Maintenance, Inventory and Step time, filters for period and vehicle class, and Export (logged). | [`Reports`](<Design Artifact/Reports (Cost)-html/Reports.dc.html>) | `export_logs` |
| REQ-RPT-002 | P1 | Cost tab: totals (all, parts, labor, documents), cost per month by category, cost by vehicle model, five most expensive vehicles with cost per km. | [`Reports`](<Design Artifact/Reports (Cost)-html/Reports.dc.html>) | WO line tables |
| REQ-RPT-003 | P1 | Tyres tab: cost per km by brand and per tyre, retread vendors (sent, accepted, rejected, average cost), retread cost. Maintenance tab: PM on time per month, WO cycle time by category, documents to watch. Inventory tab: low stock, dead stock, stock value, count differences, tyres In Stock per size against the minimum \[A\]. | [`ReportsTyres`](<Design Artifact/Reports Tyres-html/ReportsTyres.dc.html>), [`ReportsMaintenance`](<Design Artifact/Reports Maintenance-html/ReportsMaintenance.dc.html>), [`ReportsInventory`](<Design Artifact/Reports Inventory-html/ReportsInventory.dc.html>) |  |
| REQ-RPT-004 | P1 | THE SYSTEM SHALL show every Reports tab to the GM and System Admin, every tab except Cost to the Supervisor and Planner, only the Inventory tab to the Warehouse Manager and only a Billing tab (billed, paid and overdue per customer and month) to Accounting; the Step time tab with its By person table only to the GM and Supervisor, and without By person to the Planner and System Admin \[A\]. | [`Reports`](<Design Artifact/Reports (Cost)-html/Reports.dc.html>) |  |
| REQ-RPT-005 | P1 | Step time tab, for finding bottlenecks: medians of WO lead time (approved to completed), waiting to start, working and waiting for verification per step, and the share of entered starts; time per module split into waiting to start, working, paused and waiting for verification; pause reasons by share of paused time; the longest phases of the period, each opening its WO; and per person the median time to start, working and to verify. Filters: period, category, vehicle class, internal or external work. | [`ReportsStepTime`](<Design Artifact/Reports Step time (GM, Supervisor)-html/ReportsStepTime.dc.html>) | `step_time_events`, `work_order_approvals` |

### 4.22 AI: AI assistant (P1)

| ID | P | Requirement | Screens | Data |
| --- | --- | --- | --- | --- |
| REQ-AI-001 | P1 | THE SYSTEM SHALL offer a collapsible sidebar on every web screen that takes questions in Indonesian or English and shortcuts such as `/summary <plate>` and `/audit-stock <sku>`, and streams the answer as markdown. | AI sidebar (no reference yet) |  |
| REQ-AI-002 | P1 | THE SYSTEM SHALL let the System Admin set an OpenAI or Anthropic API key (encrypted at rest), choose the model and switch provider. | [`Settings`](<Design Artifact/Settings (home)-html/Settings.dc.html>) | `ai_configurations` |
| REQ-AI-003 | P1 | IF the assistant attempts any insert, update or delete, THEN THE SYSTEM SHALL block it; the assistant SHALL read only vehicles, work orders, steps, stock cards, placement logs and tyres, through a read-only database account. |  | NFR-04 |
| REQ-AI-004 | P1 | THE SYSTEM SHALL add prepared context for fleet status, inventory audit and tyre longevity, and log every query (user, prompt, context, tokens). |  | `ai_query_logs` |

### 4.23 BIL: customers and invoices (P0)

Goal: every completed WO is billed to the customer that owns the vehicle, with one invoice per vehicle per day holding every WO completed for it that day (DEC-43). Accounting and the Supervisor own invoices; the GM views them (`RL-8`). States: `SM-INV` (3.7).

| ID | P | Requirement | Screens | Data | Rules |
| --- | --- | --- | --- | --- | --- |
| REQ-BIL-001 | P0 | THE SYSTEM SHALL let Accounting and the System Admin maintain customers (code, name, billing address, tax number (NPWP), contact person, phone, email, payment terms in days, active), and link each vehicle to one customer; the customer field of [`AddVehicle`](<Design Artifact/Add vehicle with first documents-html/AddVehicle.dc.html>) and [`VehicleEdit`](<Design Artifact/Edit vehicle-html/VehicleEdit.dc.html>) SHALL be a pick from this list. | [`Customers`](<Design Artifact/Customers-html/Customers.dc.html>), [`CustomerForm`](<Design Artifact/Add or edit customer-html/CustomerForm.dc.html>), [`AddVehicle`](<Design Artifact/Add vehicle with first documents-html/AddVehicle.dc.html>) | `customers`, `vehicles.customer_id` |  |
| REQ-BIL-002 | P0 | WHEN a WO becomes Completed, THE SYSTEM SHALL add it, billed to the vehicle's customer at that moment, to the Draft invoice of its vehicle for the completion date (local time), creating that draft when none exists \[A\]. | [`InvoiceList`](<Design Artifact/Invoices (Accounting)-html/InvoiceList.dc.html>) | `invoices`, `invoice_lines` | BR-15 |
| REQ-BIL-003 | P0 | THE SYSTEM SHALL write the parts, tyres and services used in the invoice's WOs as lines (item, quantity, unit price, amount), never one line per WO: a part or tyre at its cost on the WO (average cost, purchase or workshop price) plus the part markup from Settings (50%), a service at its WO price with no markup, a retreaded tyre at its latest retread cost plus the part markup, a document renewal and a stooring fee at cost with no markup; each part, tyre or service line of a WO becomes its own invoice line and lines are never merged, even for the same item; prices are saved as a snapshot; Accounting or the Supervisor MAY add an adjustment line (discount or extra) with a reason. | [`InvoiceDetail`](<Design Artifact/Invoice detail (Accounting, Supervisor)-html/InvoiceDetail.dc.html>) | `invoice_lines` | BR-07 |
| REQ-BIL-004 | P0 | THE SYSTEM SHALL compute subtotal, tax at the rate set in Settings (PPN 11%, may be set to 0) and grand total, in Indonesian number format. | [`InvoiceDetail`](<Design Artifact/Invoice detail (Accounting, Supervisor)-html/InvoiceDetail.dc.html>), [`SettingsBilling`](<Design Artifact/Settings Invoices and tax-html/SettingsBilling.dc.html>) | `invoices`, `app_settings` | NFR-08 |
| REQ-BIL-005 | P0 | WHEN Accounting or a Supervisor issues a Draft invoice, THE SYSTEM SHALL give it the next number in the form running number/BMI/dd-mm-yy of the issue date, for example 0102/BMI/26-10-26 (the running number never resets), lock its lines and set the due date from the customer's payment terms; no approval is needed. | [`InvoiceDetail`](<Design Artifact/Invoice detail (Accounting, Supervisor)-html/InvoiceDetail.dc.html>) | `invoices.invoice_no`, `due_date` | SM-INV |
| REQ-BIL-006 | P0 | WHEN Accounting or a Supervisor records a payment (date, amount equal to the total; no partial payment in R1, method, reference), THE SYSTEM SHALL set the invoice Paid; WHEN a Draft or Issued invoice is voided with a reason, THE SYSTEM SHALL free its WOs into a new Draft of the same vehicle and day. | [`InvoiceDetail`](<Design Artifact/Invoice detail (Accounting, Supervisor)-html/InvoiceDetail.dc.html>), [`InvoicePayment`](<Design Artifact/Record payment (dialog)-html/InvoicePayment.dc.html>), [`InvoiceVoid`](<Design Artifact/Void invoice (dialog)-html/InvoiceVoid.dc.html>) | `invoices`, `invoice_payments` | BR-10 |
| REQ-BIL-007 | P0 | THE SYSTEM SHALL print an invoice as an A4 PDF in black and white (the rules of `REQ-WOD-007`): company and customer, vehicle, one row per part, tyre and service with its price only (no cost, markup or WO number shown), totals, bank details from Settings, and an optional box for a wet signature on paper; issuing needs no approval in the system. Step times, pauses and executors SHALL NOT appear on an invoice or its export (DEC-87). | [`InvoiceDocument`](<Design Artifact/Invoice print (black and white)-html/InvoiceDocument.dc.html>) |  | DEC-33 |
| REQ-BIL-008 | P0 | THE SYSTEM SHALL list invoices in the tabs Draft, Issued, Paid, Void, Not billable and All, with filters customer, vehicle and date, and the columns invoice, date, customer, vehicle, WOs, total, status, due date. | [`InvoiceList`](<Design Artifact/Invoices (Accounting)-html/InvoiceList.dc.html>) | `invoices` |  |
| REQ-BIL-009 | P0 | IF a completed WO's vehicle has no customer, THEN THE SYSTEM SHALL list the WO in Not billable and add it to a draft as soon as a customer is set. | [`InvoiceList`](<Design Artifact/Invoices (Accounting)-html/InvoiceList.dc.html>) | `invoice_lines` |  |
| REQ-BIL-010 | P0 | THE SYSTEM SHALL let only Accounting, the Supervisor and the System Admin change invoices and customers, show them read only to the GM, and write every invoice action to the audit log. | all BIL screens | `audit_logs` | RL-9 |
| REQ-BIL-011 | P2 | WHERE the email adapter is enabled, THE SYSTEM SHALL email the issued invoice PDF to the customer. |  |  | REQ-NTF-004 |
| REQ-BIL-012 | P0 | THE SYSTEM SHALL let the System Admin set in Settings > Invoices and tax the PPN rate, the part markup (50%), the company details and the bank details; the number format is fixed. | [SettingsBilling](<Design Artifact/Settings Invoices and tax-html/SettingsBilling.dc.html>) | app\_settings | DEC-44 to 46 |

| ID | Verifies | Acceptance criterion |
| --- | --- | --- |
| AC-BIL-001 | REQ-BIL-002 | WHEN WO-0150 and WO-0152 of B 9044 UXT both complete on 3 November, THE SYSTEM SHALL show one Draft invoice for B 9044 UXT dated 3 November holding the parts and services of both WOs; WHEN WO-0155 completes on 4 November, it SHALL go to a new draft. |
| AC-BIL-002 | REQ-BIL-005 | IF a line of an Issued invoice is edited, THEN THE SYSTEM SHALL refuse. |
| AC-BIL-003 | REQ-BIL-006 | WHEN an Issued invoice is voided with a reason, its WOs SHALL appear on a new Draft and the voided number SHALL never be reused. |
| AC-BIL-004 | REQ-BIL-009 | WHEN a vehicle without a customer completes a WO, the WO SHALL be in Not billable; WHEN a customer is set, it SHALL move to a Draft. |
| AC-BIL-005 | REQ-BIL-003 | WHEN a WO uses 1 oil filter at an average cost of Rp 64.000 and service SVC-010 at Rp 150.000, the invoice SHALL show Oil filter 1 × Rp 96.000 and Engine oil change 1 × Rp 150.000, and the PDF SHALL show no cost, markup or WO number. |

## 5. Business rules

Business rules are invariants. They hold for every role, the System Admin included unless the rule says otherwise, and no permission change can switch them off. Each is enforced in the service layer; the Database column names the second line of defence in section 9.

| ID | Rule | Database guard | Requirements |
| --- | --- | --- | --- |
| BR-01 | No stock movement, tyre placement or service line without an active WO and an open step of the matching module. Exceptions, each with its own document and audit record: first entry of documents, the parts baseline, tyre documents (Receive tyres, retread dispatch and return, worn out, scrap, tyre count) and the warehouse documents Goods Receipt, GR correction and approved stock opname. | `goods_issues.work_order_id NOT NULL`; `part_placements` check `is_baseline OR installed_wo_id` | REQ-WO-001, REQ-PLC-001, REQ-DOC-006, REQ-BSL-001 |
| BR-02 | A step may change only the vehicle and parts named in its WO (scope lock), as declared in the module's `scope_rules`. | `goods_issues.vehicle_id` equals the WO vehicle (trigger) | REQ-STK-002, REQ-DOC-010 |
| BR-03 | The creator of a WO cannot approve it, the executor of a step cannot verify it, and the person who counted cannot approve the count. Exception: the System Admin may do all of these; each such decision is marked Self-approved or Self-verified on the stamp and in the audit log. | `self_approved`, `self_verified` columns; checks in service layer | REQ-WO-006, REQ-ENG-007, REQ-INV-011, REQ-TYR-012 |
| BR-04 | One approval from a Supervisor, GM or System Admin is enough at each stage: creation, amendment, completion, stock opname, tyre count. WHILE Planner approval is switched on (REQ-IAM-008), a Planner's approval also counts for the approval kinds the Access Manager ticked. | `work_order_approvals` check on `approver_role` | REQ-WO-005, REQ-APR-005 |
| BR-05 | The next step opens when the previous one is submitted. Completion approval needs every step Verified or Skipped. | completion request check | REQ-ENG-002, REQ-ENG-006 |
| BR-06 | Warehouse part stock changes only through a Goods Receipt, a GR correction, a Goods Issue tied to a WO, a verified reversal of an issue, an approved stock opname, or the opening balance saved in Setup mode. Parts bought outside (Part Purchase step) never change warehouse stock. | `stock_cards.reference_doc_id NOT NULL`; `stock_qty >= 0` | REQ-STK-003, REQ-INV-006 |
| BR-07 | Prices used in a WO are saved as snapshots; later price changes do not alter history. | `unit_price`, `price` stored on the line | REQ-STK-003, REQ-MEC-002 |
| BR-08 | A vehicle with an Expired or Missing required document cannot be assigned to trips. It can still be placed on the maintenance schedule, for example for its renewal WO. | derived `vehicles.status = Blocked` | REQ-DOC-005 |
| BR-09 | Odometer readings are positive whole numbers and never lower than the last reading that is not voided. A jump above 1.500 km per day warns but is not refused. | trigger on `odometer_logs` | REQ-VEH-005, REQ-VEH-007 |
| BR-10 | Core records are never physically deleted; they are soft-deleted, deactivated or voided. Stamps, approvals, stock cards, placement logs, tyre events and audit records are append-only. The only removal is the monthly archive of audit records older than 1 year (NFR-17). | `deleted_at`; `ON DELETE RESTRICT` | REQ-WOD-004, REQ-VEH-004 |
| BR-11 | Tyres enter the In Stock count only through Receive tyres or a demount marked Back to stock, and leave it only through the parts baseline, the Stock step of a WO and an approved tyre count. Only a tyre Issued to a WO can be mounted in that WO. | `tyres.issued_wo_id`; mount check | REQ-STK-006, REQ-PLC-003, REQ-TYR-007 |
| BR-12 | A Goods Receipt and a GR correction need no approval. A stock opname and a tyre count need an Approver. | status checks | REQ-INV-004, REQ-INV-011, REQ-TYR-012 |
| BR-13 | The maintenance schedule is a plan. Missing a planned day never changes, blocks or cancels a WO; it only raises a schedule alert. | none (no FK from status to schedule) | REQ-SCH-003 |
| BR-14 | Exactly one account holds System Admin and each account holds exactly one role. Only an Access Manager moves the System Admin role, in one step with a reason; the System Admin cannot move it, and its account cannot be deactivated while it holds it. | `uq_one_system_admin`, `uq_one_role_per_user` | REQ-IAM-004 |
| BR-15 | A WO is billed at most once: it sits on at most one invoice that is not Void, and only a Completed WO can be billed. Issued and Paid invoices never change; a mistake is fixed by voiding and re-issuing. | uq\_wo\_billed\_once (partial unique index on invoice\_wos) | REQ-BIL-002, REQ-BIL-006 |
| BR-16 | A Completed WO is never reopened or edited. A mistake found later is fixed outside the WO: a billing error by an invoice adjustment or Void (REQ-BIL-006), a stock error by a stock opname, a placement error by the next WO; each is logged. | status check on every WO write | REQ-WO-008, REQ-BIL-006 |

## 6. User flows by role and scenario

Each flow lists the screens of the design canvas in the order the user meets them, and names the requirements it exercises. Every web flow starts at [`WebLogin`](<Design Artifact/Sign in (web)-html/WebLogin.dc.html>) and lands on the role's dashboard; every mobile flow (R1 step 7 or P1, see 4.20) starts at [`MobileLogin`](<Design Artifact/Mobile app sign in (menu follows the role) (P1)-html/MobileLogin.dc.html>), whose menu follows the role. The bell in the page header opens [`NotificationCenter`](<Design Artifact/Notification center-html/NotificationCenter.dc.html>) from any screen; in the mobile app the same notices also arrive as push notifications. The System Admin can run every flow of every operational role; where it decides its own work the stamp is marked Self-approved or Self-verified.

### 6.1 Planner (web)

**FLW-PLN-01 Create a planned Work Order** (REQ-WO-001, REQ-WO-004).

1. [`WebLogin`](<Design Artifact/Sign in (web)-html/WebLogin.dc.html>) → [`DashboardPlanner`](<Design Artifact/Dashboard (Planner)-html/DashboardPlanner.dc.html>).
2. Sidebar Work Orders → [`WOList`](<Design Artifact/Work Orders tab-html/WOList.dc.html>) → "+ Create Work Order" → [`CreateWO`](<Design Artifact/Create Work Order step composer-html/CreateWO.dc.html>): title, vehicle, category, description; start from a preset or drag modules into the step list, and fill each step's details on the same screen.
3. Submit for approval. The WO shows under the Pending approval tab of [`WOList`](<Design Artifact/Work Orders tab-html/WOList.dc.html>); the Approvers are notified (FLW-APR-01).

**FLW-PLN-02 Create a WO from an alert or a vehicle** (REQ-WO-012, REQ-PM-003).

1. [`DashboardPlanner`](<Design Artifact/Dashboard (Planner)-html/DashboardPlanner.dc.html>) shows PM, tyre, part and document alerts → "Create WO" → [`CreateWOFromAlert`](<Design Artifact/Create WO from an alert-html/CreateWOFromAlert.dc.html>) with vehicle, source and the preset's steps filled.
2. Or Vehicles → [`VehicleOverview`](<Design Artifact/Vehicles Overview tab-html/VehicleOverview.dc.html>) → "Create Work Order" → [`CreateWO`](<Design Artifact/Create Work Order step composer-html/CreateWO.dc.html>) with the vehicle filled.
3. Submit for approval, as in FLW-PLN-01.

**FLW-PLN-03 Rejected WO** (REQ-WO-007).

1. Notification "WO rejected" → [`WOList`](<Design Artifact/Work Orders tab-html/WOList.dc.html>), Rejected tab → [`WORejected`](<Design Artifact/Work Order rejected-html/WORejected.dc.html>) shows the Approver's reason.
2. "Edit and resubmit" → [`CreateWO`](<Design Artifact/Create Work Order step composer-html/CreateWO.dc.html>) in edit mode → Submit → Pending\_Approval again; or cancel the draft.

**FLW-PLN-04 Plan the WO on the maintenance schedule** (REQ-SCH-001 to REQ-SCH-004).

1. Sidebar Schedule → [`MaintenanceSchedule`](<Design Artifact/Maintenance schedule (Planner)-html/MaintenanceSchedule.dc.html>).
2. Drag a WO card from "Not on the schedule" onto a day; a day can hold several cards. The Field Coordinator is alerted (FLW-FC-02).
3. A card whose day passed without completion is marked Missed; drag it to a new day. The WO itself never changes (BR-13).

**FLW-PLN-05 Verify a submitted step** (REQ-ENG-005, REQ-ENG-007).

1. [`DashboardPlanner`](<Design Artifact/Dashboard (Planner)-html/DashboardPlanner.dc.html>) "To verify" or the notification → [`WODetailVerify`](<Design Artifact/WO detail verification and completion-html/WODetailVerify.dc.html>).
2. Verify on a submitted step → [`StepVerify`](<Design Artifact/Verify a step-html/StepVerify.dc.html>): evidence, lines, executor stamp, note.
3. Verify (stamp added) or Return to executor with a required note; the executor then sees [`StepReturned`](<Design Artifact/Step state returned-html/StepReturned.dc.html>) (FLW-MEC-04).
4. A reversal raised in [`StockReversal`](<Design Artifact/Stock step reversal after submit-html/StockReversal.dc.html>) (FLW-WHM-02) is verified the same way.

**FLW-PLN-06 Revise a WO after a change request** (REQ-CR-003).

1. Notification "Change request" → [`WorkOrder`](<Design Artifact/Work Order detail-html/WorkOrder.dc.html>) shows Pending\_Amendment; later steps show [`StepLocked`](<Design Artifact/Step state locked-html/StepLocked.dc.html>).
2. "Revise" → [`CreateWORevision`](<Design Artifact/Revise a WO (amendment)-html/CreateWORevision.dc.html>): the requested change, the reason and the editable content.
3. Send revision for approval → the Approver decides in [`AmendmentReview`](<Design Artifact/Review approval amendment-html/AmendmentReview.dc.html>) (FLW-APR-02).

**FLW-PLN-07 Request completion** (REQ-ENG-006).

1. When every step is Verified, [`WODetailVerify`](<Design Artifact/WO detail verification and completion-html/WODetailVerify.dc.html>) enables "Request completion approval".
2. The Approver decides in [`CompletionReview`](<Design Artifact/Review completion approval-html/CompletionReview.dc.html>) (FLW-APR-03). After approval the WO is Completed and [`WODocument`](<Design Artifact/WO document-html/WODocument.dc.html>) holds every stamp.

**FLW-PLN-08 Maintain WO presets and PM packages, with the System Admin** (REQ-REG-001, REQ-REG-007).

1. Settings → [`SettingsWOPresets`](<Design Artifact/Settings WO presets-html/SettingsWOPresets.dc.html>): rename or deactivate presets. A preset's steps are changed by opening it in [`CreateWO`](<Design Artifact/Create Work Order step composer-html/CreateWO.dc.html>) (Edit steps in Create WO) and saving it again with Save as preset, which adds a version.
2. Settings → [`SettingsPMPackages`](<Design Artifact/Settings PM packages and tasks-html/SettingsPMPackages.dc.html>): packages grouped by vehicle class, with intervals, tasks and suggested parts.

### 6.2 Mechanic (web or tablet in release 1, mobile from P1)

**FLW-MEC-01 Do a Mechanic Action step, internal team** (REQ-MEC-001, REQ-MEC-002).

1. [`WebLogin`](<Design Artifact/Sign in (web)-html/WebLogin.dc.html>) → [`DashboardMechanic`](<Design Artifact/Dashboard (Mechanic)-html/DashboardMechanic.dc.html>), "My steps" → Open. A step that is not open yet shows [`StepLocked`](<Design Artifact/Step state locked-html/StepLocked.dc.html>).
2. [`Mechanic`](<Design Artifact/Step Mechanic Action-html/Mechanic.dc.html>): team Internal, services from the catalog (fixed prices), at least one repair photo.
3. Submit step → waits for verification (FLW-PLN-05).

**FLW-MEC-02 Repair at an outside workshop** (REQ-MEC-003).

1. In [`Mechanic`](<Design Artifact/Step Mechanic Action-html/Mechanic.dc.html>) switch the team to External → [`MechanicExternal`](<Design Artifact/Mechanic Action external team-html/MechanicExternal.dc.html>): vendor, services and price, invoice image (required), photos.
2. Submit step.

**FLW-MEC-03 Part Replacement step** (REQ-PLC-002 to REQ-PLC-005).

1. [`DashboardMechanic`](<Design Artifact/Dashboard (Mechanic)-html/DashboardMechanic.dc.html>) → Open → [`Placement`](<Design Artifact/Step Part Replacement map-html/Placement.dc.html>): the chassis map with each position and its tyre.
2. Replace: pick a position → [`PlacementReplace`](<Design Artifact/Part Replacement replace-html/PlacementReplace.dc.html>): choose a tyre Issued to this WO, set the old tyre's condition (Needs Retread, Worn Out or Back to stock), tread and pressure.
3. Rotate: [`PlacementRotate`](<Design Artifact/Part Replacement rotate-html/PlacementRotate.dc.html>): move tyres between positions.
4. Submit step.

**FLW-MEC-04 Returned step** (REQ-ENG-005).

1. Notification "Step returned" → [`StepReturned`](<Design Artifact/Step state returned-html/StepReturned.dc.html>) shows the verifier's note.
2. Fix the content → Submit step again.

**FLW-MEC-05 The WO content is wrong** (REQ-CR-001, REQ-CR-002).

1. Inside the open step → "Raise change request" → [`ChangeRequest`](<Design Artifact/Raise a change request-html/ChangeRequest.dc.html>): what changes, requested change, reason.
2. Submit request → the WO is Pending\_Amendment and later steps stay Locked until the Approver decides (FLW-PLN-06, FLW-APR-02).

**FLW-MEC-06 Mobile app (P1)** (REQ-MOB-002, REQ-MOB-004).

1. [`MobileLogin`](<Design Artifact/Mobile app sign in (menu follows the role) (P1)-html/MobileLogin.dc.html>) → Mechanic menu → [`MechanicMobileHome`](<Design Artifact/Mobile app, Mechanic menu my steps (P1)-html/MechanicMobileHome.dc.html>) (open, returned and coming steps).
2. Open a step → [`MechanicMobileStep`](<Design Artifact/Mobile app, Mechanic menu Mechanic Action step (P1)-html/MechanicMobileStep.dc.html>) (Mechanic Action) or [`MechanicMobilePlacement`](<Design Artifact/Mobile app, Mechanic menu Part Replacement step (P1)-html/MechanicMobilePlacement.dc.html>) (Part Replacement), same rules as FLW-MEC-01 to FLW-MEC-03 → Submit.
3. Report → [`MechanicMobileFieldReport`](<Design Artifact/Mobile app, Mechanic menu field finding (P1)-html/MechanicMobileFieldReport.dc.html>): vehicle, location, description, suggested category, urgency, photos → Send. It drafts a WO for the Planner (FLW-PLN-02); no work starts from the report.

### 6.3 Warehouse Manager (web)

**FLW-WHM-01 Issue parts and tyres for a WO** (REQ-STK-001 to REQ-STK-007).

1. [`WebLogin`](<Design Artifact/Sign in (web)-html/WebLogin.dc.html>) → [`DashboardWarehouse`](<Design Artifact/Dashboard (Warehouse Manager)-html/DashboardWarehouse.dc.html>), "My steps" → Open → [`Stock`](<Design Artifact/Step Stock-html/Stock.dc.html>).
2. For each line on the WO list enter the quantity used; for each tyre line choose a tyre In Stock by code and serial number.
3. Parts bought outside: [`PartPurchase`](<Design Artifact/Step Part Purchase (bought outside)-html/PartPurchase.dc.html>) step with free-text lines, a live total to check against the receipt and a receipt photo; warehouse stock does not change.
4. If the list is wrong → "Raise change request" → [`ChangeRequest`](<Design Artifact/Raise a change request-html/ChangeRequest.dc.html>) (FLW-MEC-05).
5. Submit step → stock goes down, chosen tyres become Issued and the cost lands on the WO.

**FLW-WHM-02 Reverse an issue after submit** (REQ-STK-008).

1. [`WorkOrder`](<Design Artifact/Work Order detail-html/WorkOrder.dc.html>) → step 1 Stock → "Reverse issue" → [`StockReversal`](<Design Artifact/Stock step reversal after submit-html/StockReversal.dc.html>): lines, quantities, reason.
2. Submit → a Planner or System Admin verifies (FLW-PLN-05) → stock and cost return.

**FLW-WHM-03 Goods Receipt, no approval** (REQ-INV-004, REQ-INV-005).

1. Inventory → [`GoodsReceipts`](<Design Artifact/Inventory Goods Receipts-html/GoodsReceipts.dc.html>) → "+ Goods Receipt" → [`GoodsReceiptForm`](<Design Artifact/New Goods Receipt-html/GoodsReceiptForm.dc.html>): supplier, invoice, lines → Post receipt. Stock and average cost update at once.
2. Open a posted receipt → [`GoodsReceiptDetail`](<Design Artifact/Goods Receipt detail-html/GoodsReceiptDetail.dc.html>).
3. A mistake → "GR correction" → [`GRCorrection`](<Design Artifact/GR correction-html/GRCorrection.dc.html>) with a reason → Post. It links to the original receipt.

**FLW-WHM-04 Parts master and stock card** (REQ-INV-002, REQ-INV-003, REQ-INV-007, REQ-INV-008).

1. [`Inventory`](<Design Artifact/Inventory-html/Inventory.dc.html>) → "+ Add part" → [`AddPart`](<Design Artifact/Inventory Add part-html/AddPart.dc.html>); select a part → [`PartDetail`](<Design Artifact/Inventory Part detail-html/PartDetail.dc.html>) → Edit → [`PartEdit`](<Design Artifact/Inventory Edit part-html/PartEdit.dc.html>); a part with quantity 0 can be deactivated → [`PartDeactivate`](<Design Artifact/Deactivate part (dialog)-html/PartDeactivate.dc.html>).
2. [`StockCard`](<Design Artifact/Inventory Stock card-html/StockCard.dc.html>) → Export → [`StockCardExport`](<Design Artifact/Stock card Export-html/StockCardExport.dc.html>).

**FLW-WHM-05 Stock opname** (REQ-INV-010, REQ-INV-011).

1. Inventory → [`StockOpname`](<Design Artifact/Inventory Stock opname-html/StockOpname.dc.html>): one document with many rows (system and counted quantity, reason when different) → Submit for approval.
2. The Approver decides in [`StockOpnameApproval`](<Design Artifact/Review Stock opname (Supervisor, GM or System Admin)-html/StockOpnameApproval.dc.html>) (FLW-APR-04).
3. Rejected → notification → [`StockOpnameReturned`](<Design Artifact/Stock opname returned by the approver-html/StockOpnameReturned.dc.html>) with the reason → fix → Submit again.

**FLW-WHM-06 Receive tyres** (REQ-TYR-006).

1. Inventory → [`Tyres`](<Design Artifact/Inventory Tyres-html/Tyres.dc.html>) → "Receive tyres" → [`ReceiveTyres`](<Design Artifact/Receive tyres new tyres-html/ReceiveTyres.dc.html>), receipt type New tyres, source Supplier (invoice required) or Existing (tyres already owned at go-live) → Confirm receipt. Each tyre becomes In Stock with a generated code.
2. Receipt type Retread return → [`RetreadReceipt`](<Design Artifact/Receive tyres retread return-html/RetreadReceipt.dc.html>) (FLW-WHM-07).

**FLW-WHM-07 Retread** (REQ-TYR-008, REQ-TYR-009).

1. [`Tyres`](<Design Artifact/Inventory Tyres-html/Tyres.dc.html>) → select tyres with status Needs Retread → "Send to retread" → [`RetreadDispatch`](<Design Artifact/Send tyres to retread-html/RetreadDispatch.dc.html>): vendor, delivery note → Confirm dispatch. The tyres become On Retread.
2. Follow open dispatches in [`RetreadList`](<Design Artifact/Inventory Tyres, Retread-html/RetreadList.dc.html>) → [`RetreadDispatchDetail`](<Design Artifact/Retread dispatch detail-html/RetreadDispatchDetail.dc.html>).
3. When tyres come back → "Receive" on the dispatch → [`RetreadReceipt`](<Design Artifact/Receive tyres retread return-html/RetreadReceipt.dc.html>): per tyre Accepted (In Stock, retread count +1), Rejected (Scrapped, reason) or Not returned yet.

**FLW-WHM-08 Tyre condition and list** (REQ-TYR-005, REQ-TYR-010).

1. [`Tyres`](<Design Artifact/Inventory Tyres-html/Tyres.dc.html>) → select a tyre → "Worn out" → [`TyreWornOut`](<Design Artifact/Tyres confirm Worn out-html/TyreWornOut.dc.html>), or "Scrap" → [`TyreScrap`](<Design Artifact/Tyres confirm Scrap-html/TyreScrap.dc.html>) (final, reason required).
2. Column chooser → [`TyreColumns`](<Design Artifact/Tyres column chooser-html/TyreColumns.dc.html>).

**FLW-WHM-09 Tyre count** (REQ-TYR-011, REQ-TYR-012).

1. Tyres → Tyre count → [`TyreCount`](<Design Artifact/Inventory Tyres, Tyre count-html/TyreCount.dc.html>): Found or Missing per tyre, a reason and note for each missing one → Submit for approval.
2. The Approver decides in [`TyreCountApproval`](<Design Artifact/Review Tyre count (Supervisor, GM or System Admin)-html/TyreCountApproval.dc.html>) (FLW-APR-04); approved missing tyres get status Lost. A returned count uses the [`StockOpnameReturned`](<Design Artifact/Stock opname returned by the approver-html/StockOpnameReturned.dc.html>) layout.

### 6.4 Supervisor and GM (web, mobile from P1)

**FLW-APR-01 Approve WO creation** (REQ-WO-005 to REQ-WO-007, REQ-APR-004).

1. [`WebLogin`](<Design Artifact/Sign in (web)-html/WebLogin.dc.html>) → [`Dashboard`](<Design Artifact/Dashboard (Supervisor, GM)-html/Dashboard.dc.html>) "Needs my action", or the notification → [`Approvals`](<Design Artifact/Approvals (inbox)-html/Approvals.dc.html>), Work Orders tab, chip Creation.
2. Select the WO → "Open review" → [`ApprovalReview`](<Design Artifact/Review approval creation-html/ApprovalReview.dc.html>).
3. Approve: the stamp is added, the WO becomes Active and step 1 opens. Or Reject with a required reason: the WO becomes Rejected and goes back to its creator (FLW-PLN-03).

**FLW-APR-02 Approve an amendment** (REQ-CR-004, REQ-CR-005).

1. [`Approvals`](<Design Artifact/Approvals (inbox)-html/Approvals.dc.html>), chip Amendment → [`AmendmentReview`](<Design Artifact/Review approval amendment-html/AmendmentReview.dc.html>): current and proposed content side by side, reason.
2. Approve revision (the amendment number goes up and the step resumes with the new content) or Reject (the original content stays and the step resumes).

**FLW-APR-03 Approve completion** (T13, T14 of SM-WO).

1. [`Approvals`](<Design Artifact/Approvals (inbox)-html/Approvals.dc.html>), chip Completion → [`CompletionReview`](<Design Artifact/Review completion approval-html/CompletionReview.dc.html>): verified steps, cost, stamps.
2. Approve: the WO is Completed, the vehicle status is recalculated and [`WODocument`](<Design Artifact/WO document-html/WODocument.dc.html>) is final. Reject with reason: the WO stays Pending\_Verification.

**FLW-APR-04 Approve warehouse documents** (REQ-APR-003, REQ-INV-011, REQ-TYR-012).

1. [`Approvals`](<Design Artifact/Approvals (inbox)-html/Approvals.dc.html>) → Warehouse tab → [`ApprovalsWarehouse`](<Design Artifact/Approvals Warehouse tab (Supervisor, GM or System Admin)-html/ApprovalsWarehouse.dc.html>).
2. A stock opname → [`StockOpnameApproval`](<Design Artifact/Review Stock opname (Supervisor, GM or System Admin)-html/StockOpnameApproval.dc.html>); a tyre count → [`TyreCountApproval`](<Design Artifact/Review Tyre count (Supervisor, GM or System Admin)-html/TyreCountApproval.dc.html>).
3. Approve (stock or tyre status is adjusted) or Reject with reason (back to Draft, marked Returned: FLW-WHM-05, FLW-WHM-09).

**FLW-APR-05 Cancel a WO** (REQ-WO-008).

1. [`WorkOrder`](<Design Artifact/Work Order detail-html/WorkOrder.dc.html>) → "Cancel WO" → [`CancelWO`](<Design Artifact/Cancel Work Order (dialog)-html/CancelWO.dc.html>): reason (required); posted issues are reversed and Issued tyres return to In Stock first.
2. Confirm → the WO shows Cancelled in [`WOList`](<Design Artifact/Work Orders tab-html/WOList.dc.html>).

**FLW-APR-06 Look back and follow up** (REQ-APR-007, REQ-RPT-001, REQ-SCH-005).

1. [`ApprovalsHistory`](<Design Artifact/Approvals History-html/ApprovalsHistory.dc.html>): past decisions with reasons and stamps.
2. [`Reports`](<Design Artifact/Reports (Cost)-html/Reports.dc.html>) → [`ReportsMaintenance`](<Design Artifact/Reports Maintenance-html/ReportsMaintenance.dc.html>), [`ReportsTyres`](<Design Artifact/Reports Tyres-html/ReportsTyres.dc.html>), [`ReportsInventory`](<Design Artifact/Reports Inventory-html/ReportsInventory.dc.html>) (P1).
3. [`MaintenanceSchedule`](<Design Artifact/Maintenance schedule (Planner)-html/MaintenanceSchedule.dc.html>), view only.

**FLW-APR-07 Mobile app (P1)** (REQ-MOB-005).

1. [`MobileLogin`](<Design Artifact/Mobile app sign in (menu follows the role) (P1)-html/MobileLogin.dc.html>) → Supervisor/GM menu → [`SupervisorMobileHome`](<Design Artifact/Mobile app, Supervisor GM menu approvals (P1)-html/SupervisorMobileHome.dc.html>) lists every waiting item.
2. Tap an item → [`SupervisorMobileReview`](<Design Artifact/Mobile app, Supervisor GM menu review and decide (P1)-html/SupervisorMobileReview.dc.html>) → Approve, or Reject with a reason; same rules as FLW-APR-01 to FLW-APR-04.
3. Fleet → [`SupervisorMobileFleet`](<Design Artifact/Mobile app, Supervisor GM menu fleet today (P1)-html/SupervisorMobileFleet.dc.html>): status counts and vehicles that need attention.

### 6.5 System Admin (web)

**FLW-SA-01 Add a vehicle with its first data** (REQ-VEH-002, REQ-DOC-008, REQ-BSL-001, REQ-BSL-002).

1. [`WebLogin`](<Design Artifact/Sign in (web)-html/WebLogin.dc.html>) → [`DashboardAdmin`](<Design Artifact/Dashboard (System Admin)-html/DashboardAdmin.dc.html>) → Vehicles → [`Vehicles`](<Design Artifact/Vehicles tab-html/Vehicles.dc.html>) → "+ Add vehicle" → [`AddVehicle`](<Design Artifact/Add vehicle with first documents-html/AddVehicle.dc.html>): plate, class and chassis layout, odometer and the first documents.
2. "Save and add parts" → [`PartsBaseline`](<Design Artifact/Parts baseline (first entry)-html/PartsBaseline.dc.html>): last replacement of each part item and the tyres already mounted (received first with [`ReceiveTyres`](<Design Artifact/Receive tyres new tyres-html/ReceiveTyres.dc.html>), source Existing) → Save baseline.
3. The vehicle is Active, or Blocked while a required document is Missing.

**FLW-SA-02 Documents** (REQ-DOC-006 to REQ-DOC-009, REQ-DOC-011).

1. [`Documents`](<Design Artifact/Documents tab-html/Documents.dc.html>) or [`VehicleDocuments`](<Design Artifact/Vehicles Documents tab-html/VehicleDocuments.dc.html>) → "+ Add document" → [`AddDocument`](<Design Artifact/Add document (first entry)-html/AddDocument.dc.html>) for a document never entered; "View scan" → [`DocumentScan`](<Design Artifact/View scan-html/DocumentScan.dc.html>).
2. A wrong number or date before the first renewal WO → "Correct entry" → [`DocumentCorrectEntry`](<Design Artifact/Correct a first document entry (System Admin)-html/DocumentCorrectEntry.dc.html>) with a reason.
3. Renewal: the Document WO drafted at Warning is approved (FLW-APR-01) → the System Admin opens the Document step → [`DocStep`](<Design Artifact/Step Document renewal-html/DocStep.dc.html>): new number, dates, scan, cost, receipt → Submit → verified (FLW-PLN-05) → the block is lifted.
4. Document types → [`DocumentTypes`](<Design Artifact/Settings Document types-html/DocumentTypes.dc.html>).

**FLW-SA-03 Keep a vehicle up to date** (REQ-VEH-003 to REQ-VEH-008, REQ-BSL-005).

1. [`VehicleOverview`](<Design Artifact/Vehicles Overview tab-html/VehicleOverview.dc.html>) → "Edit vehicle" → [`VehicleEdit`](<Design Artifact/Edit vehicle-html/VehicleEdit.dc.html>) (class and layout only when no tyre is mounted and no WO is open).
2. [`VehicleOdometer`](<Design Artifact/Vehicles odometer history and manual reading-html/VehicleOdometer.dc.html>): record a manual reading; a jump above 1.500 km per day warns. A wrong reading → "Void" → [`OdometerVoid`](<Design Artifact/Void odometer reading (System Admin)-html/OdometerVoid.dc.html>) with a reason.
3. [`VehicleWOHistory`](<Design Artifact/Vehicles WO history tab-html/VehicleWOHistory.dc.html>) for past WOs and cost.
4. Chassis and parts tab → "Correct baseline" → [`BaselineCorrect`](<Design Artifact/Correct parts baseline (System Admin)-html/BaselineCorrect.dc.html>) while no WO has touched the part.
5. Sold or out of service → [`VehicleDeactivate`](<Design Artifact/Deactivate vehicle (dialog)-html/VehicleDeactivate.dc.html>) (no open WO).

**FLW-SA-04 Enter driver data in release 1** (REQ-PM-004, REQ-PM-005).

1. Vehicles → Inspections tab → [`VehicleInspections`](<Design Artifact/Vehicles Inspections tab (System Admin, P0)-html/VehicleInspections.dc.html>).
2. "+ Record inspection" → [`AdminInspectionForm`](<Design Artifact/Record inspection for a driver (P0)-html/AdminInspectionForm.dc.html>) for the named driver; a Fail needs photo and description and drafts a WO (FLW-PLN-02).
3. "Report breakdown" → [`AdminBreakdownForm`](<Design Artifact/Report breakdown for a driver (P0)-html/AdminBreakdownForm.dc.html>): location, description, photo; it drafts a WO with source Driver\_Breakdown.

**FLW-SA-05 Master data** (REQ-REG-001, REQ-MEC-005, REQ-PLC-013, REQ-DOC-002, REQ-BSL-007, REQ-PM-006, REQ-TYR-003).

1. [`Settings`](<Design Artifact/Settings (home)-html/Settings.dc.html>) → [`SettingsWOPresets`](<Design Artifact/Settings WO presets-html/SettingsWOPresets.dc.html>), [`SettingsServiceCatalog`](<Design Artifact/Settings Service catalog-html/SettingsServiceCatalog.dc.html>), [`ChassisLayouts`](<Design Artifact/Vehicle classes and chassis layouts-html/ChassisLayouts.dc.html>), [`DocumentTypes`](<Design Artifact/Settings Document types-html/DocumentTypes.dc.html>), [`SettingsPartItemTypes`](<Design Artifact/Settings Part item types-html/SettingsPartItemTypes.dc.html>), [`SettingsPMPackages`](<Design Artifact/Settings PM packages and tasks-html/SettingsPMPackages.dc.html>), `SettingsAlertRules, SettingsAlertThresholds`, [`SettingsTyreStatuses`](<Design Artifact/Settings Tyre statuses-html/SettingsTyreStatuses.dc.html>).
2. Each page saves with its own audit record.

**FLW-SA-06 Oversight** (REQ-DSH-005, REQ-IAM-007).

1. [`DashboardAdmin`](<Design Artifact/Dashboard (System Admin)-html/DashboardAdmin.dc.html>): every role's waiting work and alerts.
2. [`AuditLog`](<Design Artifact/Audit log-html/AuditLog.dc.html>): every change with user and time; self-approvals and self-verifications are flagged.
3. The System Admin can run any flow above; it never opens Users and roles.

### 6.6 Access Manager (web)

**FLW-AM-01 Create an account** (REQ-IAM-002).

1. [`WebLogin`](<Design Artifact/Sign in (web)-html/WebLogin.dc.html>) → [`UsersRoles`](<Design Artifact/Users and roles (Access Manager)-html/UsersRoles.dc.html>) (the Access Manager's own area; no dashboard and no Settings) → "+ New account" → [`AMAccountForm`](<Design Artifact/New or edit account (Access Manager)-html/AMAccountForm.dc.html>): name, email, one role → Save.

**FLW-AM-02 Change a role or its permissions** (REQ-IAM-002, REQ-IAM-005).

1. [`UsersRoles`](<Design Artifact/Users and roles (Access Manager)-html/UsersRoles.dc.html>) → select the account → [`AMAccountForm`](<Design Artifact/New or edit account (Access Manager)-html/AMAccountForm.dc.html>) → change the role → Save.
2. Roles and permissions tab → [`AMRolesPermissions`](<Design Artifact/Users and roles Roles and permissions (Access Manager)-html/AMRolesPermissions.dc.html>): switch the screens and actions a role has; locked cells cannot change.

**FLW-AM-03 Move the System Admin role** (REQ-IAM-004).

1. [`UsersRoles`](<Design Artifact/Users and roles (Access Manager)-html/UsersRoles.dc.html>) → "Move System Admin role" → choose another active account, give a reason → confirm.
2. The new account becomes System Admin, the old one loses the role, and one audit record is written.

**FLW-AM-04 Lock, unlock or deactivate an account** (REQ-IAM-001, REQ-IAM-002).

1. [`UsersRoles`](<Design Artifact/Users and roles (Access Manager)-html/UsersRoles.dc.html>) → select the account → [`AMAccountForm`](<Design Artifact/New or edit account (Access Manager)-html/AMAccountForm.dc.html>) → Unlock (after failed sign-ins) or Deactivate. The System Admin account cannot be deactivated while it holds the role.

**FLW-AM-05 Review access changes** (REQ-IAM-007).

1. Access history tab → [`AMAccessHistory`](<Design Artifact/Users and roles Access history (Access Manager)-html/AMAccessHistory.dc.html>); full trail → [`AuditLog`](<Design Artifact/Audit log-html/AuditLog.dc.html>).

### 6.7 Driver (mobile, R1 step 7)

Until the mobile app ships in R1 step 7, the System Admin enters inspections and breakdowns for the driver (FLW-SA-04). Each inspection Fail and each breakdown drafts a WO that appears in the Requests list of the Field Coordinator, System Admin and Planner (FLW-FC-04).

**FLW-DRV-01 Daily inspection** (REQ-MOB-003, REQ-PM-004).

1. [`MobileLogin`](<Design Artifact/Mobile app sign in (menu follows the role) (P1)-html/MobileLogin.dc.html>) → Driver menu → [`DashboardDriver`](<Design Artifact/Driver home (mobile)-html/DashboardDriver.dc.html>): my vehicle, its status and document reminders.
2. Inspection → [`DriverInspection`](<Design Artifact/Mobile app, Driver menu daily inspection (P1)-html/DriverInspection.dc.html>): Pass or Fail per item, odometer; a Fail needs a photo and a description → Submit.
3. A Fail drafts a WO for the Planner (FLW-PLN-02).

**FLW-DRV-02 Breakdown** (REQ-MOB-003, REQ-PM-005).

1. [`DashboardDriver`](<Design Artifact/Driver home (mobile)-html/DashboardDriver.dc.html>) → "Report breakdown" → [`DriverBreakdown`](<Design Artifact/Mobile app, Driver menu report breakdown (P1)-html/DriverBreakdown.dc.html>): location, description, photo → Send. It drafts a WO with source Driver\_Breakdown.

**FLW-DRV-03 Odometer** (REQ-MOB-003, REQ-VEH-005).

1. [`DashboardDriver`](<Design Artifact/Driver home (mobile)-html/DashboardDriver.dc.html>) → "Record odometer" → [`DriverOdometer`](<Design Artifact/Mobile app, Driver menu record odometer (P1)-html/DriverOdometer.dc.html>) → Save; a reading lower than the last one is refused, a jump above 1.500 km per day warns.

**FLW-DRV-04 History** (REQ-MOB-003, REQ-DOC-012).

1. History → [`DriverHistory`](<Design Artifact/Mobile app, Driver menu history (P1)-html/DriverHistory.dc.html>): past inspections, breakdowns and readings.
2. A Blocked vehicle shows a reminder on [`DashboardDriver`](<Design Artifact/Driver home (mobile)-html/DashboardDriver.dc.html>) not to operate it.

### 6.8 Field Coordinator (web and mobile)

**FLW-FC-01 Check which vehicles can go on trips** (REQ-DSH-006, REQ-DOC-005).

1. [`WebLogin`](<Design Artifact/Sign in (web)-html/WebLogin.dc.html>) → [`DashboardDispatcher`](<Design Artifact/Dashboard (Field Coordinator)-html/DashboardDispatcher.dc.html>): Active, Repair and Blocked counts, vehicles that are not available with the reason and planned day, today's workshop list.
2. Open a vehicle → [`VehicleOverview`](<Design Artifact/Vehicles Overview tab-html/VehicleOverview.dc.html>) and [`VehicleDocuments`](<Design Artifact/Vehicles Documents tab-html/VehicleDocuments.dc.html>), read only.

**FLW-FC-02 Follow the maintenance schedule** (REQ-SCH-004, REQ-SCH-005).

1. Schedule → [`ScheduleDispatcher`](<Design Artifact/Maintenance schedule (Field Coordinator, read only)-html/ScheduleDispatcher.dc.html>): the Planner's calendar, read only; cards cannot be moved.
2. A card placed, moved or missed → notification → [`NotificationCenter`](<Design Artifact/Notification center-html/NotificationCenter.dc.html>) → opens the schedule.

**FLW-FC-03 Mobile app (R1 step 7)** (REQ-MOB-006, REQ-NTF-002).

1. [`MobileLogin`](<Design Artifact/Mobile app sign in (menu follows the role) (P1)-html/MobileLogin.dc.html>) → Field Coordinator menu → [`DispatcherMobileFleet`](<Design Artifact/Mobile app, Field Coordinator menu fleet availability (P1)-html/DispatcherMobileFleet.dc.html>) (availability).
2. Schedule → [`DispatcherMobileSchedule`](<Design Artifact/Mobile app, Field Coordinator menu schedule, read only (P1)-html/DispatcherMobileSchedule.dc.html>) (week list per day, read only).
3. Alerts → [`DispatcherMobileAlerts`](<Design Artifact/Mobile app, Field Coordinator menu alerts (P1)-html/DispatcherMobileAlerts.dc.html>); each alert also arrives as a push notification.

**FLW-FC-04 Turn a driver request into a WO** (REQ-WO-014, REQ-WO-001, RL-6).

1. [`DashboardDispatcher`](<Design Artifact/Dashboard (Field Coordinator)-html/DashboardDispatcher.dc.html>) → Requests → [`FCRequests`](<Design Artifact/Requests draft WOs from drivers (Field Coordinator)-html/FCRequests.dc.html>): Draft WOs from inspections, breakdowns and field findings, with the report photos.
2. Open one → [`FCCreateWO`](<Design Artifact/Complete and submit a draft WO (Field Coordinator)-html/FCCreateWO.dc.html>): vehicle and source prefilled; choose a suggested category, write the description, list the parts needed → Send to Planner, who adds the steps. Or "+ Create WO" for a new request the driver phoned in (source Manual\_Field\_Coordinator).
3. The Planner checks it, may change it, and submits it; it then waits for a Supervisor or GM (FLW-APR-01). The Field Coordinator cannot submit or approve it. On the phone: [`FCMobileRequests`](<Design Artifact/Mobile Field Coordinator requests-html/FCMobileRequests.dc.html>) → [`FCMobileCreateWO`](<Design Artifact/Mobile Field Coordinator completes a draft WO-html/FCMobileCreateWO.dc.html>).

**FLW-FC-05 Buy parts for a WO** (REQ-PUR-001 to 008).

1. Purchase alert → [`PartPurchase`](<Design Artifact/Step Part Purchase (bought outside)-html/PartPurchase.dc.html>) (web) or Purchases → [`FCMobilePurchase`](<Design Artifact/Mobile Field Coordinator Part Purchase step-html/FCMobilePurchase.dc.html>) (phone), with the suggested items.
2. Pick the vendor, type receipt number and date, type the quantity bought and unit price of each listed part and take the receipt photo; the total is calculated as you type.
3. Submit step; the next step opens (BR-05).

### 6.8a System Admin field menu (mobile, R1 step 7)

**FLW-SA-07 Field work on the phone** (REQ-MOB-008, REQ-MBL-005).

1. [`MobileLogin`](<Design Artifact/Mobile app sign in (menu follows the role) (P1)-html/MobileLogin.dc.html>) → System Admin field menu → [`SAMobileHome`](<Design Artifact/Mobile System Admin field menu-html/SAMobileHome.dc.html>): requests, purchases and open steps.
2. Requests and Purchases work as FLW-FC-04 and FLW-FC-05.
3. Steps → [`MechanicMobileStep`](<Design Artifact/Mobile app, Mechanic menu Mechanic Action step (P1)-html/MechanicMobileStep.dc.html>): pick the stooring area; services, photos → Submit (marked Self-verified if the System Admin later verifies it).

### 6.8b Accounting (web)

**FLW-ACC-01 Issue the daily invoices** (REQ-BIL-002 to 005, REQ-BIL-007).

1. [`WebLogin`](<Design Artifact/Sign in (web)-html/WebLogin.dc.html>) → [`DashboardAccounting`](<Design Artifact/Dashboard (Accounting)-html/DashboardAccounting.dc.html>): drafts waiting, overdue, not billable.
2. Invoices → [`InvoiceList`](<Design Artifact/Invoices (Accounting)-html/InvoiceList.dc.html>) (Draft tab): one draft per vehicle per day.
3. Open → [`InvoiceDetail`](<Design Artifact/Invoice detail (Accounting, Supervisor)-html/InvoiceDetail.dc.html>): check the part and service lines, add an adjustment if needed → Issue → Print → [`InvoiceDocument`](<Design Artifact/Invoice print (black and white)-html/InvoiceDocument.dc.html>) (black and white).

**FLW-ACC-02 Record a payment or void** (REQ-BIL-006).

1. [`InvoiceList`](<Design Artifact/Invoices (Accounting)-html/InvoiceList.dc.html>) (Issued tab) → [`InvoiceDetail`](<Design Artifact/Invoice detail (Accounting, Supervisor)-html/InvoiceDetail.dc.html>) → Record payment → [`InvoicePayment`](<Design Artifact/Record payment (dialog)-html/InvoicePayment.dc.html>) → Save; the invoice is Paid.
2. A wrong invoice: Void → [`InvoiceVoid`](<Design Artifact/Void invoice (dialog)-html/InvoiceVoid.dc.html>) with a reason; its WOs move to a new Draft.

**FLW-ACC-03 Maintain customers** (REQ-BIL-001, REQ-BIL-009).

1. Customers → [`Customers`](<Design Artifact/Customers-html/Customers.dc.html>) → "+ Add customer" or open one → [`CustomerForm`](<Design Artifact/Add or edit customer-html/CustomerForm.dc.html>) → Save.
2. [`InvoiceList`](<Design Artifact/Invoices (Accounting)-html/InvoiceList.dc.html>) (Not billable tab): WOs of vehicles without a customer; set the customer on the vehicle and the WOs move to a Draft.

### 6.8c Planner approval switch and early failure

**FLW-AM-06 Let Planners approve for a while** (REQ-IAM-008, RL-7).

1. Access Manager → [`AMRolesPermissions`](<Design Artifact/Users and roles Roles and permissions (Access Manager)-html/AMRolesPermissions.dc.html>) → Planner approval → On, with a reason and an end time → Save; Supervisors and GMs are notified.
2. Planners now see Approvals and decide WOs they did not create (FLW-APR-01). At the end time the switch turns off by itself.

**FLW-APR-08 Early failure on a review** (REQ-APR-011, REQ-BSL-009).

1. [`ApprovalReview`](<Design Artifact/Review approval creation-html/ApprovalReview.dc.html>) (or [`SupervisorMobileReview`](<Design Artifact/Mobile app, Supervisor GM menu review and decide (P1)-html/SupervisorMobileReview.dc.html>)): the Part age card flags Early failure with life used against normal life.
2. The Approver decides as usual; the WO is never blocked. The event appears on the GM dashboard ([`Dashboard`](<Design Artifact/Dashboard (Supervisor, GM)-html/Dashboard.dc.html>)) and the Planner reviews the normal life in [`SettingsPartItemTypes`](<Design Artifact/Settings Part item types-html/SettingsPartItemTypes.dc.html>).

### 6.8d Setup, master data and assignment

**FLW-SA-08 Set up and go live** (REQ-IAM-010, REQ-INV-013).

1. First sign-in of the System Admin → [`SetupGoLive`](<Design Artifact/System Admin Setup mode and Go live-html/SetupGoLive.dc.html>) (Setup mode): checklist of what is in the system.
2. Enter master data in [`Settings`](<Design Artifact/Settings (home)-html/Settings.dc.html>), vehicles in [`AddVehicle`](<Design Artifact/Add vehicle with first documents-html/AddVehicle.dc.html>), documents, tyres in [`ReceiveTyres`](<Design Artifact/Receive tyres new tyres-html/ReceiveTyres.dc.html>) (source Existing), [`PartsBaseline`](<Design Artifact/Parts baseline (first entry)-html/PartsBaseline.dc.html>) and [`OpeningBalance`](<Design Artifact/Inventory opening balance in Setup mode (System Admin)-html/OpeningBalance.dc.html>); nothing needs approval.
3. Back on [`SetupGoLive`](<Design Artifact/System Admin Setup mode and Go live-html/SetupGoLive.dc.html>): type GO LIVE → Go live now. Every role can now sign in and every approval applies.

**FLW-SA-09 Maintain vendors** (REQ-INV-014).

1. [`Settings`](<Design Artifact/Settings (home)-html/Settings.dc.html>) → Vendors → [`SettingsVendors`](<Design Artifact/Settings Vendors (System Admin)-html/SettingsVendors.dc.html>) → "+ Add vendor" or select one → Save. The vendor appears in Goods Receipts, Part Purchase steps, external services and retread dispatches.

**FLW-SA-10 Set a vehicle's driver** (REQ-VEH-010).

1. System Admin or Field Coordinator: [`VehicleOverview`](<Design Artifact/Vehicles Overview tab-html/VehicleOverview.dc.html>) → Driver → Change → pick the driver → Save. Both drivers are notified and the driver app shows the new vehicle.

**FLW-PLN-09 Assign a step** (REQ-ENG-011).

1. [`WorkOrder`](<Design Artifact/Work Order detail-html/WorkOrder.dc.html>) → a step card → Assign (or Reassign with a reason) → pick a user of the step's executor role. The assignee is notified.
2. Without an assignment, the first executor who opens the step claims it; others see it read only. The assignee can Release it with a reason; the draft stays with the step.

**FLW-WHM-10 Receive parts of a cancelled WO** (REQ-WO-008).

1. Notification → [`GoodsReceiptForm`](<Design Artifact/New Goods Receipt-html/GoodsReceiptForm.dc.html>) with type From cancelled WO, prefilled with the Part Purchase items and prices; map each to a SKU or mark it not kept → Post receipt.

### 6.9 Cross-role flow: a PM service from alert to WO document

| Order | Role | Action | Screens | Transition |
| --- | --- | --- | --- | --- |
| 1 | System | Odometer reaches the PM interval and raises a PM alert | [`DashboardPlanner`](<Design Artifact/Dashboard (Planner)-html/DashboardPlanner.dc.html>) |  |
| 2 | Planner | Creates the WO from the alert and submits it | [`CreateWOFromAlert`](<Design Artifact/Create WO from an alert-html/CreateWOFromAlert.dc.html>) | T1, T2 |
| 3 | Supervisor or GM | Approves creation | [`Approvals`](<Design Artifact/Approvals (inbox)-html/Approvals.dc.html>), [`ApprovalReview`](<Design Artifact/Review approval creation-html/ApprovalReview.dc.html>) | T3 |
| 4 | Planner | Places the WO on a day; the Field Coordinator is alerted | [`MaintenanceSchedule`](<Design Artifact/Maintenance schedule (Planner)-html/MaintenanceSchedule.dc.html>), [`ScheduleDispatcher`](<Design Artifact/Maintenance schedule (Field Coordinator, read only)-html/ScheduleDispatcher.dc.html>) |  |
| 5 | Warehouse Manager | Issues parts and tyres in the Stock step | [`Stock`](<Design Artifact/Step Stock-html/Stock.dc.html>) | T7 |
| 6 | Planner | Verifies step 1 | [`WODetailVerify`](<Design Artifact/WO detail verification and completion-html/WODetailVerify.dc.html>), [`StepVerify`](<Design Artifact/Verify a step-html/StepVerify.dc.html>) |  |
| 7 | [Mechanic](<Design Artifact/Step Mechanic Action-html/Mechanic.dc.html>) | Does the service and fits the tyres | [`Mechanic`](<Design Artifact/Step Mechanic Action-html/Mechanic.dc.html>), [`Placement`](<Design Artifact/Step Part Replacement map-html/Placement.dc.html>), [`PlacementReplace`](<Design Artifact/Part Replacement replace-html/PlacementReplace.dc.html>) | T11 |
| 8 | Planner | Verifies steps 2 and 3, requests completion | [`WODetailVerify`](<Design Artifact/WO detail verification and completion-html/WODetailVerify.dc.html>), [`StepVerify`](<Design Artifact/Verify a step-html/StepVerify.dc.html>) |  |
| 9 | Supervisor or GM | Approves completion | [`CompletionReview`](<Design Artifact/Review completion approval-html/CompletionReview.dc.html>) | T13 |
| 10 | All | The WO is Completed; the vehicle is Active again | [`WorkOrder`](<Design Artifact/Work Order detail-html/WorkOrder.dc.html>), [`WODocument`](<Design Artifact/WO document-html/WODocument.dc.html>), [`VehicleWOHistory`](<Design Artifact/Vehicles WO history tab-html/VehicleWOHistory.dc.html>) |  |

Side paths: a wrong part list (FLW-MEC-05, FLW-PLN-06, FLW-APR-02), a returned step (FLW-PLN-05, FLW-MEC-04), a rejection (FLW-APR-01, FLW-PLN-03), a cancellation (FLW-APR-05) and a reversal (FLW-WHM-02).

## 7. UI specification

This section fixes where objects sit, how pages are divided and how users move between screens. It does not fix visual style (0.1), except the BMI brand in 7.8.

### 7.1 Layout authority

| Binding (follow exactly) | Not binding (free at implementation) |
| --- | --- |
| Which regions a screen has and where each object sits | Colours other than the brand tokens of 7.8, fonts, sizes, spacing, icons, radius, shadows |
| Which pages, tabs, steps and dialogs exist, and their order | Illustrations and sample data in the canvas |
| How the user moves from screen to screen (section 6, 7.6) | Wording of hints and empty states |
| Status names and meanings; every status shows its text label, never colour alone | The colour of a status |
| App name BMI Stooring System, the BMI logo and the brand colour tokens (7.8) | How other colours are derived from the brand tokens |

The canvas screens are a layout reference only: their numbers, names and labels are placeholders, and data that the spec keeps in master data (modules, steps, classes, layouts, tyre positions, statuses) is never written into screens.

### 7.2 Global layout patterns

| Pattern | Rule |
| --- | --- |
| App shell | Fixed left navigation and a main area. Items: Dashboard, Work Orders, Schedule, Approvals, Inventory, Vehicles, Documents, Reports, Settings, shown by role (2.2); the System Admin sees every item; Mechanics have no Approvals item and Planners see it only while Planner approval is on. Accounting sees Dashboard, Invoices, Customers, Vehicles (read only) and Reports; Supervisors and the System Admin also see Invoices and Customers, the GM sees them read only. The Access Manager has its own navigation: Users and roles, Audit log. In Setup mode the System Admin sees only Setup and go live, Inventory, Vehicles, Documents and Settings (REQ-IAM-010). The page header holds the title (left), the user and role (right), the bell ([`NotificationCenter`](<Design Artifact/Notification center-html/NotificationCenter.dc.html>)) and the primary action. Every navigation item has an icon beside its name. A toggle at the foot of the navigation (Collapse menu) shrinks it to a 64 px icon rail and back (screen AppShellCollapsed); in the rail each item shows its name as a tooltip, the active item stays highlighted and a waiting count stays on the icon. The choice is saved per user, the toggle works by keyboard, and the main area takes the freed width (DEC-82). |
| List page | Header with the primary create button, then tabs, a filter row, the table. Rows waiting for the current user are marked and carry Open. |
| Master-detail page | List on the left, detail of the selected row on the right; selecting a row never leaves the page. |
| Step screen | Context banner (WO number, plate, "Step n of N", module, hint), the form, a bottom action bar aligned right (Save draft, Submit step). Raise change request sits in the content, not in the bar. |
| Form page | Cards in data-entry order and a bottom bar (Cancel, Save draft or Save, main action). Forms are full pages. Small actions use a side panel or a dialog: Replace and Rotate a tyre, column chooser, export, Cancel WO, Worn out, Scrap, deactivate, void, Correct baseline. |
| [Settings](<Design Artifact/Settings (home)-html/Settings.dc.html>) | Same shell; the Settings home groups items in cards (Work Orders; Fleet and maintenance; Alerts and system); each opens its own page. Users and roles is not in Settings. |
| One field per column | Each data item has its own sortable, filterable column; never two items in one column or two lines in one cell; wide tables offer a column chooser; a matrix cell holds one value. A person column shows the name; the role gets its own column where it matters. |
| Responsive | Web screens are desktop first and usable on a tablet. The mobile app (R1 step 7; the Mechanic and Supervisor menus in release 2) is mobile first at 390 × 844, one app whose menu follows the role. |

### 7.3 Screen inventory

Every artboard of the [design canvas](https://claude.ai/artifact/LvDdr6ZffShqyddQUYHG4w), grouped by area, with the requirements it serves. Dialog artboards show the dialog over its parent page.

| Screen | Title in the canvas | P | Requirements |
| --- | --- | --- | --- |
| **Shell and general** |  |  |  |
| [`WebLogin`](<Design Artifact/Sign in (web)-html/WebLogin.dc.html>) | Sign in (web) | P0 | REQ-IAM-001 |
| [`NotificationCenter`](<Design Artifact/Notification center-html/NotificationCenter.dc.html>) | Notification center | P0 | REQ-NTF-001 |
| [`AppShellCollapsed`](<Design Artifact/App shell navigation collapsed-html/AppShellCollapsed.dc.html>) | App shell: navigation collapsed | P0 | 7.2 App shell, DEC-82 |
| [`Main`](<Design Artifact/Screen map-html/Main.dc.html>) | Screen map | - | Overview of the canvas only; not built |
| **Dashboards** |  |  |  |
| [`Dashboard`](<Design Artifact/Dashboard (Supervisor, GM)-html/Dashboard.dc.html>) | Dashboard (Supervisor) | P0 | REQ-DSH-001 |
| [`DashboardPlanner`](<Design Artifact/Dashboard (Planner)-html/DashboardPlanner.dc.html>) | Dashboard (Planner) | P0 | REQ-DSH-002 |
| [`DashboardMechanic`](<Design Artifact/Dashboard (Mechanic)-html/DashboardMechanic.dc.html>) | Dashboard (Mechanic) | P0 | REQ-DSH-003 |
| [`DashboardWarehouse`](<Design Artifact/Dashboard (Warehouse Manager)-html/DashboardWarehouse.dc.html>) | Dashboard (Warehouse Manager) | P0 | REQ-DSH-004 |
| [`DashboardAdmin`](<Design Artifact/Dashboard (System Admin)-html/DashboardAdmin.dc.html>) | Dashboard (System Admin) | P0 | REQ-DSH-005 |
| [`DashboardDispatcher`](<Design Artifact/Dashboard (Field Coordinator)-html/DashboardDispatcher.dc.html>) | Dashboard (Field Coordinator) | P0 | REQ-DSH-006 |
| **Work Orders** |  |  |  |
| [`WOList`](<Design Artifact/Work Orders tab-html/WOList.dc.html>) | Work Orders tab | P0 | REQ-WO-010 |
| [`CreateWO`](<Design Artifact/Create Work Order step composer-html/CreateWO.dc.html>) | Create Work Order | P0 | REQ-WO-001, REQ-WO-004, REQ-WO-017 |
| [`CreateWOFromAlert`](<Design Artifact/Create WO from an alert-html/CreateWOFromAlert.dc.html>) | Create WO from an alert | P0 | REQ-WO-012 |
| [`WORejected`](<Design Artifact/Work Order rejected-html/WORejected.dc.html>) | Work Order rejected | P0 | REQ-WO-007 |
| [`WorkOrder`](<Design Artifact/Work Order detail-html/WorkOrder.dc.html>) | Work Order detail | P0 | REQ-WO-011 |
| [`WODetailVerify`](<Design Artifact/WO detail verification and completion-html/WODetailVerify.dc.html>) | WO detail: verification and completion | P0 | REQ-ENG-005, REQ-ENG-006 |
| [`StepVerify`](<Design Artifact/Verify a step-html/StepVerify.dc.html>) | Verify a step | P0 | REQ-ENG-005, REQ-ENG-007 |
| [`StepLocked`](<Design Artifact/Step state locked-html/StepLocked.dc.html>) | Step state: locked | P0 | REQ-ENG-008 |
| [`StepReturned`](<Design Artifact/Step state returned-html/StepReturned.dc.html>) | Step state: returned | P0 | REQ-ENG-008 |
| [`CancelWO`](<Design Artifact/Cancel Work Order (dialog)-html/CancelWO.dc.html>) | Cancel Work Order (dialog) | P0 | REQ-WO-008 |
| [`ChangeRequest`](<Design Artifact/Raise a change request-html/ChangeRequest.dc.html>) | Raise a change request | P0 | REQ-CR-001 |
| [`CreateWORevision`](<Design Artifact/Revise a WO (amendment)-html/CreateWORevision.dc.html>) | Revise a WO (amendment) | P0 | REQ-CR-003 |
| [`WODocument`](<Design Artifact/WO document-html/WODocument.dc.html>) | WO document | P0 | REQ-WOD-001 to REQ-WOD-003 |
| **Steps** |  |  |  |
| [`Stock`](<Design Artifact/Step Stock-html/Stock.dc.html>) | Step: Stock | P0 | REQ-STK-001 to REQ-STK-006 |
| [`PartPurchase`](<Design Artifact/Step Part Purchase (bought outside)-html/PartPurchase.dc.html>) | Step: Part Purchase (bought outside) | P0 | REQ-PUR-001 to 008 |
| [`StockReversal`](<Design Artifact/Stock step reversal after submit-html/StockReversal.dc.html>) | Stock step: reversal after submit | P0 | REQ-STK-008 |
| [`Mechanic`](<Design Artifact/Step Mechanic Action-html/Mechanic.dc.html>) | Step: Mechanic Action | P0 | REQ-MEC-001, REQ-MEC-002 |
| [`MechanicExternal`](<Design Artifact/Mechanic Action external team-html/MechanicExternal.dc.html>) | Mechanic Action: external team | P0 | REQ-MEC-003 |
| [`PartCheck`](<Design Artifact/Step Part Check (troubleshooting)-html/PartCheck.dc.html>) | Step: Part Check | P0 | REQ-CHK-002 |
| [`PartCheckVerify`](<Design Artifact/Verify a Part Check step-html/PartCheckVerify.dc.html>) | Verify a Part Check step | P0 | REQ-CHK-003 |
| [`CreateWOFromCheck`](<Design Artifact/Draft WO from a Part Check activate or discard-html/CreateWOFromCheck.dc.html>) | Draft WO from a Part Check | P0 | REQ-CHK-003, REQ-CHK-004 |
| [`MechanicMobileCheck`](<Design Artifact/Mobile app, Mechanic menu Part Check step (P1)-html/MechanicMobileCheck.dc.html>) | Mobile: Part Check step | P1 | REQ-CHK-002 |
| [`WODocumentCheck`](<Design Artifact/WO document Part Check WO (standalone)-html/WODocumentCheck.dc.html>) | WO document of a Part Check WO | P0 | REQ-CHK-006, REQ-CHK-007, REQ-WOD-008 |
| [`Placement`](<Design Artifact/Step Part Replacement map-html/Placement.dc.html>) | Step: Part Replacement map | P0 | REQ-PLC-001 to REQ-PLC-010 |
| [`PlacementReplace`](<Design Artifact/Part Replacement replace-html/PlacementReplace.dc.html>) | Part Replacement: replace | P0 | REQ-PLC-003, REQ-PLC-004 |
| [`PlacementRotate`](<Design Artifact/Part Replacement rotate-html/PlacementRotate.dc.html>) | Part Replacement: rotate | P0 | REQ-PLC-005 |
| [`DocStep`](<Design Artifact/Step Document renewal-html/DocStep.dc.html>) | Step: Document renewal | P0 | REQ-DOC-007 |
| **Approvals** |  |  |  |
| [`Approvals`](<Design Artifact/Approvals (inbox)-html/Approvals.dc.html>) | Approvals (inbox) | P0 | REQ-APR-001, REQ-APR-002 |
| [`ApprovalsWarehouse`](<Design Artifact/Approvals Warehouse tab (Supervisor, GM or System Admin)-html/ApprovalsWarehouse.dc.html>) | Approvals: Warehouse tab | P0 | REQ-APR-003 |
| [`ApprovalsHistory`](<Design Artifact/Approvals History-html/ApprovalsHistory.dc.html>) | Approvals: History | P0 | REQ-APR-007 |
| [`ApprovalReview`](<Design Artifact/Review approval creation-html/ApprovalReview.dc.html>) | Review approval: creation | P0 | REQ-WO-005, REQ-APR-004 |
| [`AmendmentReview`](<Design Artifact/Review approval amendment-html/AmendmentReview.dc.html>) | Review approval: amendment | P0 | REQ-CR-004, REQ-CR-005 |
| [`CompletionReview`](<Design Artifact/Review completion approval-html/CompletionReview.dc.html>) | Review: completion approval | P0 | SM-WO T13, T14 |
| [`StockOpnameApproval`](<Design Artifact/Review Stock opname (Supervisor, GM or System Admin)-html/StockOpnameApproval.dc.html>) | Review: Stock opname | P0 | REQ-INV-011 |
| [`TyreCountApproval`](<Design Artifact/Review Tyre count (Supervisor, GM or System Admin)-html/TyreCountApproval.dc.html>) | Review: Tyre count | P0 | REQ-TYR-012 |
| **Schedule** |  |  |  |
| [`MaintenanceSchedule`](<Design Artifact/Maintenance schedule (Planner)-html/MaintenanceSchedule.dc.html>) | Maintenance schedule (Planner) | P0 | REQ-SCH-001 to REQ-SCH-003, REQ-SCH-006 |
| [`ScheduleDispatcher`](<Design Artifact/Maintenance schedule (Field Coordinator, read only)-html/ScheduleDispatcher.dc.html>) | Maintenance schedule (Field Coordinator, read only) | P0 | REQ-SCH-005 |
| **Vehicles** |  |  |  |
| [`Vehicles`](<Design Artifact/Vehicles tab-html/Vehicles.dc.html>) | Vehicles tab (Chassis and parts) | P0 | REQ-VEH-001, REQ-PLC-010 |
| [`VehicleOverview`](<Design Artifact/Vehicles Overview tab-html/VehicleOverview.dc.html>) | Vehicles: Overview tab | P0 | REQ-VEH-001, REQ-VEH-006 |
| [`VehicleDocuments`](<Design Artifact/Vehicles Documents tab-html/VehicleDocuments.dc.html>) | Vehicles: Documents tab | P0 | REQ-DOC-011 |
| [`VehicleWOHistory`](<Design Artifact/Vehicles WO history tab-html/VehicleWOHistory.dc.html>) | Vehicles: WO history tab | P0 | REQ-VEH-008 |
| [`VehicleInspections`](<Design Artifact/Vehicles Inspections tab (System Admin, P0)-html/VehicleInspections.dc.html>) | Vehicles: Inspections tab | P0 | REQ-PM-004 |
| [`AddVehicle`](<Design Artifact/Add vehicle with first documents-html/AddVehicle.dc.html>) | Add vehicle with first documents | P0 | REQ-VEH-002 |
| [`VehicleEdit`](<Design Artifact/Edit vehicle-html/VehicleEdit.dc.html>) | Edit vehicle | P0 | REQ-VEH-003 |
| [`VehicleDeactivate`](<Design Artifact/Deactivate vehicle (dialog)-html/VehicleDeactivate.dc.html>) | Deactivate vehicle (dialog) | P0 | REQ-VEH-004 |
| [`VehicleOdometer`](<Design Artifact/Vehicles odometer history and manual reading-html/VehicleOdometer.dc.html>) | Vehicles: odometer history and manual reading | P0 | REQ-VEH-005, REQ-VEH-006 |
| [`OdometerVoid`](<Design Artifact/Void odometer reading (System Admin)-html/OdometerVoid.dc.html>) | Void odometer reading (dialog) | P0 | REQ-VEH-007 |
| [`PartsBaseline`](<Design Artifact/Parts baseline (first entry)-html/PartsBaseline.dc.html>) | Parts baseline (first entry) | P0 | REQ-BSL-001 to REQ-BSL-003 |
| [`BaselineCorrect`](<Design Artifact/Correct parts baseline (System Admin)-html/BaselineCorrect.dc.html>) | Correct parts baseline (dialog) | P0 | REQ-BSL-005 |
| [`AdminInspectionForm`](<Design Artifact/Record inspection for a driver (P0)-html/AdminInspectionForm.dc.html>) | Record inspection for a driver | P0 | REQ-PM-004 |
| [`AdminBreakdownForm`](<Design Artifact/Report breakdown for a driver (P0)-html/AdminBreakdownForm.dc.html>) | Report breakdown for a driver | P0 | REQ-PM-005 |
| **Documents** |  |  |  |
| [`Documents`](<Design Artifact/Documents tab-html/Documents.dc.html>) | Documents tab | P0 | REQ-DOC-011 |
| [`AddDocument`](<Design Artifact/Add document (first entry)-html/AddDocument.dc.html>) | Add document (first entry) | P0 | REQ-DOC-008 |
| [`DocumentScan`](<Design Artifact/View scan-html/DocumentScan.dc.html>) | View scan | P0 | REQ-DOC-011 |
| [`DocumentCorrectEntry`](<Design Artifact/Correct a first document entry (System Admin)-html/DocumentCorrectEntry.dc.html>) | Correct a first document entry | P0 | REQ-DOC-009 |
| **Inventory: parts** |  |  |  |
| [`Inventory`](<Design Artifact/Inventory-html/Inventory.dc.html>) | [Inventory](<Design Artifact/Inventory-html/Inventory.dc.html>) | P0 | REQ-INV-001, REQ-TYR-004 |
| [`AddPart`](<Design Artifact/Inventory Add part-html/AddPart.dc.html>) | Inventory: Add part | P0 | REQ-INV-002 |
| [`PartDetail`](<Design Artifact/Inventory Part detail-html/PartDetail.dc.html>) | Inventory: Part detail | P0 | REQ-INV-001 |
| [`PartEdit`](<Design Artifact/Inventory Edit part-html/PartEdit.dc.html>) | Inventory: Edit part | P0 | REQ-INV-002 |
| [`PartDeactivate`](<Design Artifact/Deactivate part (dialog)-html/PartDeactivate.dc.html>) | Deactivate part (dialog) | P0 | REQ-INV-003 |
| [`GoodsReceipts`](<Design Artifact/Inventory Goods Receipts-html/GoodsReceipts.dc.html>) | Inventory: Goods Receipts | P0 | REQ-INV-004 |
| [`GoodsReceiptForm`](<Design Artifact/New Goods Receipt-html/GoodsReceiptForm.dc.html>) | New Goods Receipt | P0 | REQ-INV-004 |
| [`GoodsReceiptDetail`](<Design Artifact/Goods Receipt detail-html/GoodsReceiptDetail.dc.html>) | Goods Receipt detail | P0 | REQ-INV-004 |
| [`GRCorrection`](<Design Artifact/GR correction-html/GRCorrection.dc.html>) | GR correction | P0 | REQ-INV-005 |
| [`StockCard`](<Design Artifact/Inventory Stock card-html/StockCard.dc.html>) | Inventory: Stock card | P0 | REQ-INV-007 |
| [`StockCardExport`](<Design Artifact/Stock card Export-html/StockCardExport.dc.html>) | Stock card: Export | P0 | REQ-INV-008 |
| [`StockOpname`](<Design Artifact/Inventory Stock opname-html/StockOpname.dc.html>) | Inventory: Stock opname | P0 | REQ-INV-010 |
| [`StockOpnameReturned`](<Design Artifact/Stock opname returned by the approver-html/StockOpnameReturned.dc.html>) | Stock opname returned (also serves a returned tyre count) | P0 | REQ-INV-011, REQ-TYR-012 |
| **Inventory: tyres** |  |  |  |
| [`Tyres`](<Design Artifact/Inventory Tyres-html/Tyres.dc.html>) | Inventory: Tyres | P0 | REQ-TYR-005 |
| [`TyreColumns`](<Design Artifact/Tyres column chooser-html/TyreColumns.dc.html>) | Tyres: column chooser | P0 | REQ-TYR-005 |
| [`ReceiveTyres`](<Design Artifact/Receive tyres new tyres-html/ReceiveTyres.dc.html>) | Receive tyres: new tyres | P0 | REQ-TYR-006 |
| [`RetreadReceipt`](<Design Artifact/Receive tyres retread return-html/RetreadReceipt.dc.html>) | Receive tyres: retread return | P0 | REQ-TYR-009 |
| [`RetreadDispatch`](<Design Artifact/Send tyres to retread-html/RetreadDispatch.dc.html>) | Send tyres to retread | P0 | REQ-TYR-008 |
| [`RetreadList`](<Design Artifact/Inventory Tyres, Retread-html/RetreadList.dc.html>) | Inventory: Tyres, Retread | P0 | REQ-TYR-008 |
| [`RetreadDispatchDetail`](<Design Artifact/Retread dispatch detail-html/RetreadDispatchDetail.dc.html>) | Retread dispatch detail | P0 | REQ-TYR-008 |
| [`TyreWornOut`](<Design Artifact/Tyres confirm Worn out-html/TyreWornOut.dc.html>) | Tyres: confirm Worn out | P0 | REQ-TYR-010 |
| [`TyreScrap`](<Design Artifact/Tyres confirm Scrap-html/TyreScrap.dc.html>) | Tyres: confirm Scrap | P0 | REQ-TYR-010 |
| [`TyreCount`](<Design Artifact/Inventory Tyres, Tyre count-html/TyreCount.dc.html>) | Inventory: Tyres, Tyre count | P0 | REQ-TYR-011 |
| **Settings** |  |  |  |
| [`Settings`](<Design Artifact/Settings (home)-html/Settings.dc.html>) | Settings (home) | P0 | 7.2 |
| [`SettingsWOPresets`](<Design Artifact/Settings WO presets-html/SettingsWOPresets.dc.html>) | Settings: WO presets | P0 | REQ-REG-003, REQ-REG-005 |
| [`SettingsAlertRules`](<Design Artifact/Settings Alert rules-html/SettingsAlertRules.dc.html>) | Settings: Alert rules | P0 | REQ-PM-007 to REQ-PM-010 |
| [`ChassisLayouts`](<Design Artifact/Vehicle classes and chassis layouts-html/ChassisLayouts.dc.html>) | Vehicle classes and chassis layouts | P0 | REQ-PLC-013 |
| [`DocumentTypes`](<Design Artifact/Settings Document types-html/DocumentTypes.dc.html>) | Settings: Document types | P0 | REQ-DOC-002 |
| [`SettingsServiceCatalog`](<Design Artifact/Settings Service catalog-html/SettingsServiceCatalog.dc.html>) | Settings: Service catalog | P0 | REQ-MEC-005 |
| [`SettingsPartItemTypes`](<Design Artifact/Settings Part item types-html/SettingsPartItemTypes.dc.html>) | Settings: Part item types | P0 | REQ-BSL-007 |
| [`SettingsPMPackages`](<Design Artifact/Settings PM packages and tasks-html/SettingsPMPackages.dc.html>) | Settings: PM packages and tasks | P0 | REQ-REG-007 |
| [`SettingsAlertThresholds`](<Design Artifact/Settings Alert thresholds-html/SettingsAlertThresholds.dc.html>) | Settings: Alert thresholds | P0 | REQ-PM-006 |
| [`SettingsTyreStatuses`](<Design Artifact/Settings Tyre statuses-html/SettingsTyreStatuses.dc.html>) | Settings: Tyre statuses | P0 | REQ-TYR-003 |
| `SettingsIntegrations` | Settings: Integrations (WhatsApp, Protrack/Cartrack, external tools) | P1 | DQ-05 (no artboard yet; follows 7.2) |
| **Access Manager area** |  |  |  |
| [`UsersRoles`](<Design Artifact/Users and roles (Access Manager)-html/UsersRoles.dc.html>) | Users and roles: Accounts | P0 | REQ-IAM-002 to REQ-IAM-004 |
| [`AMAccountForm`](<Design Artifact/New or edit account (Access Manager)-html/AMAccountForm.dc.html>) | New or edit account | P0 | REQ-IAM-002 |
| [`AMRolesPermissions`](<Design Artifact/Users and roles Roles and permissions (Access Manager)-html/AMRolesPermissions.dc.html>) | Users and roles: Roles and permissions | P0 | REQ-IAM-005 |
| [`AMAccessHistory`](<Design Artifact/Users and roles Access history (Access Manager)-html/AMAccessHistory.dc.html>) | Users and roles: Access history | P0 | REQ-IAM-003 |
| [`AuditLog`](<Design Artifact/Audit log-html/AuditLog.dc.html>) | Audit log | P0 | REQ-IAM-007 |
| **Reports** |  |  |  |
| [`Reports`](<Design Artifact/Reports (Cost)-html/Reports.dc.html>) | Reports (Cost) | P1 | REQ-RPT-001, REQ-RPT-002 |
| [`ReportsTyres`](<Design Artifact/Reports Tyres-html/ReportsTyres.dc.html>) | Reports: Tyres | P1 | REQ-RPT-003 |
| [`ReportsMaintenance`](<Design Artifact/Reports Maintenance-html/ReportsMaintenance.dc.html>) | Reports: Maintenance | P1 | REQ-RPT-003 |
| [`ReportsInventory`](<Design Artifact/Reports Inventory-html/ReportsInventory.dc.html>) | Reports: Inventory | P1 | REQ-RPT-003 |
| [`ReportsStepTime`](<Design Artifact/Reports Step time (GM, Supervisor)-html/ReportsStepTime.dc.html>) | Reports: Step time | P1 | REQ-RPT-005, REQ-DSH-010 |
| **Mobile app (390 × 844)** |  |  |  |
| [`MobileLogin`](<Design Artifact/Mobile app sign in (menu follows the role) (P1)-html/MobileLogin.dc.html>) | Sign in; the menu follows the role | P0 | REQ-MOB-001 |
| [`DashboardDriver`](<Design Artifact/Driver home (mobile)-html/DashboardDriver.dc.html>) | Driver home | P0 | REQ-DSH-007 |
| [`DriverInspection`](<Design Artifact/Mobile app, Driver menu daily inspection (P1)-html/DriverInspection.dc.html>) | Driver: daily inspection | P0 | REQ-MOB-003 |
| [`DriverBreakdown`](<Design Artifact/Mobile app, Driver menu report breakdown (P1)-html/DriverBreakdown.dc.html>) | Driver: report breakdown | P0 | REQ-MOB-003 |
| [`DriverOdometer`](<Design Artifact/Mobile app, Driver menu record odometer (P1)-html/DriverOdometer.dc.html>) | Driver: record odometer | P0 | REQ-MOB-003 |
| [`DriverHistory`](<Design Artifact/Mobile app, Driver menu history (P1)-html/DriverHistory.dc.html>) | Driver: history | P0 | REQ-MOB-003 |
| [`MechanicMobileHome`](<Design Artifact/Mobile app, Mechanic menu my steps (P1)-html/MechanicMobileHome.dc.html>) | Mechanic: my steps | P1 | REQ-MOB-002 |
| [`MechanicMobileStep`](<Design Artifact/Mobile app, Mechanic menu Mechanic Action step (P1)-html/MechanicMobileStep.dc.html>) | Mechanic: Mechanic Action step | P0 (System Admin field menu), P1 (Mechanic) | REQ-MOB-002 |
| [`MechanicMobilePlacement`](<Design Artifact/Mobile app, Mechanic menu Part Replacement step (P1)-html/MechanicMobilePlacement.dc.html>) | Mechanic: Part Replacement step | P1 | REQ-MOB-002 |
| [`MechanicMobileFieldReport`](<Design Artifact/Mobile app, Mechanic menu field finding (P1)-html/MechanicMobileFieldReport.dc.html>) | Mechanic: field finding | P1 | REQ-MOB-004 |
| [`MechanicMobileHistory`](<Design Artifact/Mobile app, Mechanic menu history (P1)-html/MechanicMobileHistory.dc.html>) | Mechanic: history | P1 | REQ-MOB-002, DQ-04 |
| [`SupervisorMobileHome`](<Design Artifact/Mobile app, Supervisor GM menu approvals (P1)-html/SupervisorMobileHome.dc.html>) | Supervisor/GM: approvals | P1 | REQ-MOB-005 |
| [`SupervisorMobileReview`](<Design Artifact/Mobile app, Supervisor GM menu review and decide (P1)-html/SupervisorMobileReview.dc.html>) | Supervisor/GM: review and decide | P1 | REQ-MOB-005 |
| [`SupervisorMobileFleet`](<Design Artifact/Mobile app, Supervisor GM menu fleet today (P1)-html/SupervisorMobileFleet.dc.html>) | Supervisor/GM: fleet today | P1 | REQ-MOB-005 |
| [`SupervisorMobileHistory`](<Design Artifact/Mobile app, Supervisor GM menu history (P1)-html/SupervisorMobileHistory.dc.html>) | Supervisor/GM: decision history | P1 | REQ-MOB-005, DQ-04 |
| [`MobileProfile`](<Design Artifact/Mobile app profile and settings (P1)-html/MobileProfile.dc.html>) | Mobile: profile and settings (every role) | P1 | REQ-MOB-001, DQ-01, DQ-03 |
| [`DispatcherMobileFleet`](<Design Artifact/Mobile app, Field Coordinator menu fleet availability (P1)-html/DispatcherMobileFleet.dc.html>) | Field Coordinator: fleet availability | P0 | REQ-MOB-006 |
| [`DispatcherMobileSchedule`](<Design Artifact/Mobile app, Field Coordinator menu schedule, read only (P1)-html/DispatcherMobileSchedule.dc.html>) | Field Coordinator: schedule, read only | P0 | REQ-MOB-006 |
| [`DispatcherMobileAlerts`](<Design Artifact/Mobile app, Field Coordinator menu alerts (P1)-html/DispatcherMobileAlerts.dc.html>) | Field Coordinator: alerts | P0 | REQ-MOB-006, REQ-NTF-002 |
| [FileUploadStates](<Design Artifact/Component file upload, seamless (FileDrop)-html/FileUploadStates.dc.html>) | Component: file upload states (FileDrop) | P0 | REQ-FUP-001 to 007 |
| [MechanicMobileUpload](<Design Artifact/Mobile app, Mechanic menu seamless photo upload (P1)-html/MechanicMobileUpload.dc.html>) | Mechanic: photos uploading in the background, submit when done | P1 | REQ-FUP-006, REQ-FUP-011 to 015 |
| [PhotoViewer](<Design Artifact/Component photo and file viewer (dialog)-html/PhotoViewer.dc.html>) | Component: photo and file viewer (dialog) | P0 | REQ-FUP-016, REQ-ENG-010, REQ-APR-009, REQ-APR-010 |
| **Field Coordinator requests and purchases (R1)** | - | - | - |
| [FCRequests](<Design Artifact/Requests draft WOs from drivers (Field Coordinator)-html/FCRequests.dc.html>) | Requests: draft WOs from drivers (Field Coordinator) | P0 | REQ-WO-014 |
| [FCCreateWO](<Design Artifact/Complete and submit a draft WO (Field Coordinator)-html/FCCreateWO.dc.html>) | Complete and submit a draft WO (Field Coordinator) | P0 | REQ-WO-001, REQ-WO-014 |
| [FCMobileRequests](<Design Artifact/Mobile Field Coordinator requests-html/FCMobileRequests.dc.html>) | Field Coordinator: requests | P0 | REQ-MOB-006, REQ-WO-014 |
| [FCMobileCreateWO](<Design Artifact/Mobile Field Coordinator completes a draft WO-html/FCMobileCreateWO.dc.html>) | Field Coordinator: complete a draft WO | P0 | REQ-MOB-006 |
| [FCMobilePurchase](<Design Artifact/Mobile Field Coordinator Part Purchase step-html/FCMobilePurchase.dc.html>) | Field Coordinator: Part Purchase step | P0 | REQ-PUR-001 to 008, REQ-MOB-006 |
| [SAMobileHome](<Design Artifact/Mobile System Admin field menu-html/SAMobileHome.dc.html>) | System Admin: field menu | P0 | REQ-MOB-008 |
| [FCDraftCancel](<Design Artifact/Cancel draft WO (Field Coordinator, dialog)-html/FCDraftCancel.dc.html>) | Cancel draft WO (dialog) | P0 | REQ-WO-014, DQ-11 |
| **Invoices and customers** | - | - | - |
| [DashboardAccounting](<Design Artifact/Dashboard (Accounting)-html/DashboardAccounting.dc.html>) | Dashboard (Accounting) | P0 | REQ-DSH-009 |
| [InvoiceList](<Design Artifact/Invoices (Accounting)-html/InvoiceList.dc.html>) | Invoices | P0 | REQ-BIL-008, REQ-BIL-009 |
| [InvoiceDetail](<Design Artifact/Invoice detail (Accounting, Supervisor)-html/InvoiceDetail.dc.html>) | Invoice detail | P0 | REQ-BIL-003 to 006 |
| [InvoicePayment](<Design Artifact/Record payment (dialog)-html/InvoicePayment.dc.html>) | Record payment (dialog) | P0 | REQ-BIL-006 |
| [InvoiceVoid](<Design Artifact/Void invoice (dialog)-html/InvoiceVoid.dc.html>) | Void invoice (dialog) | P0 | REQ-BIL-006 |
| [InvoiceDocument](<Design Artifact/Invoice print (black and white)-html/InvoiceDocument.dc.html>) | Invoice print (black and white) | P0 | REQ-BIL-007 |
| [Customers](<Design Artifact/Customers-html/Customers.dc.html>) | [Customers](<Design Artifact/Customers-html/Customers.dc.html>) | P0 | REQ-BIL-001 |
| [CustomerForm](<Design Artifact/Add or edit customer-html/CustomerForm.dc.html>) | Add or edit customer | P0 | REQ-BIL-001 |
| [SettingsBilling](<Design Artifact/Settings Invoices and tax-html/SettingsBilling.dc.html>) | Settings: Invoices and tax | P0 | REQ-BIL-004, REQ-BIL-007 |
| [SettingsStooringRates](<Design Artifact/Settings Stooring rates (System Admin)-html/SettingsStooringRates.dc.html>) | Settings: Stooring rates | P0 | REQ-MEC-010 |
| [OpeningBalance](<Design Artifact/Inventory opening balance in Setup mode (System Admin)-html/OpeningBalance.dc.html>) | Inventory: opening balance before go-live | P0 | REQ-INV-013 |
| [ChangePassword](<Design Artifact/Change password at first sign-in-html/ChangePassword.dc.html>) | Change password at first sign-in | P0 | REQ-IAM-009 |
| [SetupGoLive](<Design Artifact/System Admin Setup mode and Go live-html/SetupGoLive.dc.html>) | System Admin: Setup mode and Go live | P0 | REQ-IAM-010 |
| [SettingsVendors](<Design Artifact/Settings Vendors (System Admin)-html/SettingsVendors.dc.html>) | Settings: Vendors | P0 | REQ-INV-014 |
| [PlacementTrailer](<Design Artifact/Step Part Replacement on a trailer tail (towed unit, spare)-html/PlacementTrailer.dc.html>) | Part Replacement on a trailer tail (towed unit, spare) | P0 | REQ-PLC-017 to 020 |
| [SetupImport](<Design Artifact/Setup bulk import of master data-html/SetupImport.dc.html>) | System Admin: bulk import of master data (Setup mode) | P0 | REQ-IAM-011, REQ-DOC-013, REQ-BSL-008 |

The AI sidebar and its settings page have no artboard yet and are deferred to a later release (see 11.3); they follow the patterns of 7.2. `SettingsIntegrations` (DQ-05) also has no artboard yet. The design canvas screens are currently in English only; the Indonesian translation of the UI is deferred to a later release (see 11.3), with Indonesian as the default language once delivered.

### 7.4 Key screen layouts

Regions are listed left to right, top to bottom. Screens not listed follow their canvas artboard and the patterns of 7.2.

| Screen | Layout | Primary actions |
| --- | --- | --- |
| [`Dashboard`](<Design Artifact/Dashboard (Supervisor, GM)-html/Dashboard.dc.html>) and role dashboards | Summary cards across the top; below, "Needs my action" (wider, left) and a status or work list (right) | Open the item |
| [`WOList`](<Design Artifact/Work Orders tab-html/WOList.dc.html>) | Header with "+ Create Work Order"; tabs with counts; filter row (search, type, vehicle); table (WO, vehicle, type, status, current step, waiting on, action) | Open, Create |
| [`CreateWO`](<Design Artifact/Create Work Order step composer-html/CreateWO.dc.html>) | Header: title, Start from preset, Save as preset. Left: Work Order card (title, vehicle with chips, category, priority, Vehicle goes to the workshop, description) and Checks card. Right: Steps card with the module palette (draggable chips), drop zones that appear while dragging, one step card per step (drag handle, number, module icon and name, Optional, Move up, Move down, Remove; Executed by and Verified by; the module's details) and Add step. Bottom: Cancel, Save draft, Submit for approval | Submit for approval |
| [`WorkOrder`](<Design Artifact/Work Order detail-html/WorkOrder.dc.html>) | Header (number, type, status; WO document, Raise change request, Cancel WO). A row of step cards with status and Open on the user's step (Reverse issue on a submitted Stock step). Below: left description, cost so far, timeline; right the approval block | Open step |
| [`WODetailVerify`](<Design Artifact/WO detail verification and completion-html/WODetailVerify.dc.html>) | Step cards with Verify and Return on submitted steps; Completion card with "Request completion approval" (disabled with the reason until all steps are verified); approval block right | Verify, Request completion |
| [`StepVerify`](<Design Artifact/Verify a step-html/StepVerify.dc.html>) | Banner "Verify step n of N"; the work read only, with every photo and invoice as a thumbnail that opens PhotoViewer; executor stamp; verification card (note, required to return; stamp preview; Return to executor, Verify) | Verify |
| [`Stock`](<Design Artifact/Step Stock-html/Stock.dc.html>) | Banner; part table (part, planned, source, in stock, quantity used, unit price) with a tyre picker (code, serial number) under each tyre line; cards for invoice images and change request; bottom bar | Submit step |
| [`Mechanic`](<Design Artifact/Step Mechanic Action-html/Mechanic.dc.html>) | Banner with the work to do; team switch Internal or External; services table (catalog service, fixed price, mechanic); repair photos; labor total left of the bottom bar | Submit step |
| [`Placement`](<Design Artifact/Step Part Replacement map-html/Placement.dc.html>) | Banner; left the chassis map (editable); right the selected tyre with Replace and Rotate, tyres available to fit (Issued to this WO), legend; bottom bar. Replace and Rotate open in the right panel | Replace, Rotate, Submit step |
| [`DocStep`](<Design Artifact/Step Document renewal-html/DocStep.dc.html>) | Banner; left the current document read only; right the renewed document form (number, issue date, new expiry, scan, cost, receipt) with validation | Submit step |
| [`ApprovalReview`](<Design Artifact/Review approval creation-html/ApprovalReview.dc.html>), [`CompletionReview`](<Design Artifact/Review completion approval-html/CompletionReview.dc.html>) | Header (WO, approval type, status). Left: description, vehicle, parts, steps (executed by, verified by) and an Evidence card (completion: each step's photos, invoices and placement snapshot; creation: the photos of the source report). Right: decision card (reason, stamp preview, Reject, Approve), rules card, history card | Approve, Reject |
| [`AmendmentReview`](<Design Artifact/Review approval amendment-html/AmendmentReview.dc.html>) | Left: reason, comparison table (field, current, proposed) with changed lines marked, step states. Right: decision card (Reject, Approve revision) and outcomes | Approve revision |
| [`Approvals`](<Design Artifact/Approvals (inbox)-html/Approvals.dc.html>), [`ApprovalsWarehouse`](<Design Artifact/Approvals Warehouse tab (Supervisor, GM or System Admin)-html/ApprovalsWarehouse.dc.html>), [`ApprovalsHistory`](<Design Artifact/Approvals History-html/ApprovalsHistory.dc.html>) | Tabs Work Orders, Warehouse, History with counts; type chips and search; master-detail (table left, preview right with "Open review") | Open review |
| [`MaintenanceSchedule`](<Design Artifact/Maintenance schedule (Planner)-html/MaintenanceSchedule.dc.html>) | Week or month calendar with WO cards per day; left lists "Not on the schedule" and "Missed the planned day"; cards are dragged directly | Drag a card |
| [`Vehicles`](<Design Artifact/Vehicles tab-html/Vehicles.dc.html>) | Search and "+ Add vehicle"; left the vehicle list; right the profile with tabs and header buttons "+ Parts baseline", "Create Work Order"; Chassis and parts tab: map left (read only), alert list right with "Create WO" per alert and "Correct baseline" per untouched part item | Create WO |
| [`PartsBaseline`](<Design Artifact/Parts baseline (first entry)-html/PartsBaseline.dc.html>) | Two cards: Tyres (position table) and Service parts (with next due and status); bottom Skip for now, Save baseline | Save baseline |
| [`Documents`](<Design Artifact/Documents tab-html/Documents.dc.html>) | Three summary cards; left a matrix of vehicles by document type (vehicle status column, one status per cell); right the selected document with renewal history | Open WO, + Add document, View scan |
| [`Inventory`](<Design Artifact/Inventory-html/Inventory.dc.html>) | Parts or Tyres picker beside the title. Parts mode: "+ Add part", "+ Goods Receipt"; tabs Stock, Goods Receipts, Stock card, Stock opname; summary cards; stock table left, stock card of the selected part right. Tyres mode: "Receive tyres", "Send to retread"; tabs Tyres, Retread, Tyre count. Buttons of one mode never show in the other | + Goods Receipt, Receive tyres |
| [`GoodsReceiptForm`](<Design Artifact/New Goods Receipt-html/GoodsReceiptForm.dc.html>) | Left: header card (generated number, date, supplier, PO, invoice) and item table with "+ Add item" (parts only). Right: summary and "what posting does". Bottom: Cancel, Save draft, Post receipt | Post receipt |
| [`StockOpname`](<Design Artifact/Inventory Stock opname-html/StockOpname.dc.html>), [`TyreCount`](<Design Artifact/Inventory Tyres, Tyre count-html/TyreCount.dc.html>) | Banner; row with count date, counted by, rack filter, summary; the sheet; a row with a variance or Missing and no reason shows an error under the table; bottom Save draft, Submit for approval | Submit for approval |
| [`ReceiveTyres`](<Design Artifact/Receive tyres new tyres-html/ReceiveTyres.dc.html>), [`RetreadReceipt`](<Design Artifact/Receive tyres retread return-html/RetreadReceipt.dc.html>) | Receipt type switch on top (New tyres, Retread return). Header card and tyre table; right summary and "what confirming does"; bottom Cancel, Save draft, Confirm receipt | Confirm receipt |
| [`Tyres`](<Design Artifact/Inventory Tyres-html/Tyres.dc.html>) | Eight status cards; open-dispatch strip with Receive; filter row with column chooser; master-detail (tyre table left, detail with history and actions right) | Send to retread, Worn out, Scrap |
| [`SettingsWOPresets`](<Design Artifact/Settings WO presets-html/SettingsWOPresets.dc.html>) | Left: table of presets (name, category, steps, used by, status) with search and a category filter. Right: the selected preset (version, category, workshop flag, PM packages that use it, its steps with module icon, executor and details); bottom Deactivate, Rename, Edit steps in Create WO | Edit steps in Create WO |
| [`SettingsAlertRules`](<Design Artifact/Settings Alert rules-html/SettingsAlertRules.dc.html>) | Left: the alert rules in two groups, Maintenance due (PM due, Document expiry, Tyre tread, Part item life) and Reported problems (Inspection fail, Breakdown, Field report), each showing Drafts WO with its preset or Alert only. Right: Trigger card for the selected rule (PM: due soon km and days, and a preset per package; Document: warning days and a preset per document type; Tyre: Act now and due soon tread, pressure tolerance; Part item: due soon % of life and check time; Inspection: any or critical Fail; Breakdown and Field report: nothing to set) and When it triggers card (Show the alert only or Show the alert and draft a WO, Draft the WO at, Preset, Priority, category of the WO, Notify roles, Checks) | Save (refused while a check fails), Discard |
| [`ChassisLayouts`](<Design Artifact/Vehicle classes and chassis layouts-html/ChassisLayouts.dc.html>) | Left classes; centre layout header and axle table; right preview drawn by the map component; bottom Discard, Save as new layout version | Save layout |
| [`WODocument`](<Design Artifact/WO document-html/WODocument.dc.html>) | Toolbar (Print, Download PDF) and a paper page: header, description, vehicle, one section per step with stamps, timestamps and cost, approval block at the bottom; black and white with no photos, attachments listed as text | Download PDF |
| [`Reports`](<Design Artifact/Reports (Cost)-html/Reports.dc.html>) | Export; tabs Cost, Tyres, Maintenance, Inventory; filter row (period, class); summary cards, charts and tables per tab (REQ-RPT-002, REQ-RPT-003) | Export |
| [`ReportsStepTime`](<Design Artifact/Reports Step time (GM, Supervisor)-html/ReportsStepTime.dc.html>) | Reports tabs with Step time selected; filter row (period, category, vehicle class, internal or external); five summary cards (lead time, waiting to start, working, waiting for verification with the largest share marked, entered starts); Where the time goes per module (stacked bar per module: waiting to start, working, paused, waiting for verification); Pause reasons; Longest phases table (WO, vehicle, step, executor, phase, time); By person table (GM and Supervisor only) | Export; row opens the WO |
| [`PartCheck`](<Design Artifact/Step Part Check (troubleshooting)-html/PartCheck.dc.html>) | Context bar; step time bar (Start, Pause); WO description. Left: one card per part (number, part, what to check, Complete or what is missing; Condition; Good, Repair, Replace; Unsafe to drive when not Good; photos with Add) and Add a finding not on the list. Right: Summary (Good, Repair, Replace, not decided, what happens at verification), Checks, Overall note | Save draft, Submit step (refused until every part is complete) |
| [`CreateWOFromCheck`](<Design Artifact/Draft WO from a Part Check activate or discard-html/CreateWOFromCheck.dc.html>) | Header with Draft and priority, link to the check WO; note that Activate means submit for approval. Left: findings carried over with decision, Unsafe mark, condition and photos. Right: steps built from the findings with executors and Edit steps in Create WO. Bottom: reason field | Discard draft (reason required), Activate: submit for approval |
| Mobile screens | Header, one task per screen, large touch targets, bottom navigation with the role's four or five menu items | per role |
| [InvoiceList](<Design Artifact/Invoices (Accounting)-html/InvoiceList.dc.html>) | Header with the date filter; tabs Draft, Issued, Paid, Void, Not billable, All with counts; filter row (customer, vehicle, search); table (invoice, date, customer, vehicle, WOs, total, status, due date) | Open |
| [InvoiceDetail](<Design Artifact/Invoice detail (Accounting, Supervisor)-html/InvoiceDetail.dc.html>) | Header (number or Draft, status, Print, Void). Left: customer card, vehicle card, lines table (item, kind, WO reference, quantity, unit price, amount) and adjustment lines. Right: totals card (subtotal, tax, total), payment card, history. Bottom: Issue invoice on a Draft, Record payment on an Issued invoice | Issue, Record payment |
| [FCCreateWO](<Design Artifact/Complete and submit a draft WO (Field Coordinator)-html/FCCreateWO.dc.html>) | As CreateWO, with the source report (photos, driver, odometer) in the right column above the step preview | Submit for approval |
| [PartPurchase](<Design Artifact/Step Part Purchase (bought outside)-html/PartPurchase.dc.html>) | Banner; header card (vendor, receipt number and date, receipt photos); line table from the WO part list (part, kind, shortfall hint and unit read only; quantity bought and unit price typed; line total), no add or remove; a large calculated total, updated as you type | Submit step |

### 7.5 Shared components

Each component exists once and takes its data from the spec, never from literals.

| Component | Used in | Rule |
| --- | --- | --- |
| AppShell | Every web screen | Navigation by role with an icon per item, collapsible to an icon rail with the state saved per user, and the page header (7.2) |
| StepBanner | Every step screen | WO number, plate, "Step n of N" and module, from the WO's steps |
| StepTracker, StepCard | [`WorkOrder`](<Design Artifact/Work Order detail-html/WorkOrder.dc.html>), [`WODetailVerify`](<Design Artifact/WO detail verification and completion-html/WODetailVerify.dc.html>) | One card per step, in order, with status |
| StatusPill | Everywhere | Always a text label; the look per status is a style choice |
| ChassisMap | [`Placement`](<Design Artifact/Step Part Replacement map-html/Placement.dc.html>), [`Vehicles`](<Design Artifact/Vehicles tab-html/Vehicles.dc.html>), [`ChassisLayouts`](<Design Artifact/Vehicle classes and chassis layouts-html/ChassisLayouts.dc.html>), [`MechanicMobilePlacement`](<Design Artifact/Mobile app, Mechanic menu Part Replacement step (P1)-html/MechanicMobilePlacement.dc.html>) | One component, drawn from the chassis layout; modes editable, read only, preview |
| ApprovalBlock | [`WorkOrder`](<Design Artifact/Work Order detail-html/WorkOrder.dc.html>), [`WODocument`](<Design Artifact/WO document-html/WODocument.dc.html>) | Two lines (creation, completion): stamp, name, role, time, Self-approved mark |
| AlertList | Dashboards, [`Vehicles`](<Design Artifact/Vehicles tab-html/Vehicles.dc.html>) | Per alert "Create WO" prefilled with vehicle and type |
| FileDrop | Invoices, photos, scans | One profile per slot; compresses on the device and shows the file states of REQ-FUP-007 (FileUploadStates) |
| ActionBar | Step screens and forms | Bottom, aligned right |
| ColumnChooser | Wide tables ([`Tyres`](<Design Artifact/Inventory Tyres-html/Tyres.dc.html>) first) | Show, hide, reorder; saved per user |
| [PhotoViewer](<Design Artifact/Component photo and file viewer (dialog)-html/PhotoViewer.dc.html>) | Every thumbnail: StepVerify, reviews, Vehicles, Tyres, Documents, mobile | One viewer for photos and PDFs, with zoom, previous and next, and file details (REQ-FUP-016) |
| PartAgeCard | [ApprovalReview](<Design Artifact/Review approval creation-html/ApprovalReview.dc.html>), [SupervisorMobileReview](<Design Artifact/Mobile app, Supervisor GM menu review and decide (P1)-html/SupervisorMobileReview.dc.html>) | One row per part item or tyre position the WO replaces: last replaced, km and days used, normal life, life used %, Early failure flag (REQ-APR-011) |
| LocationField | [Mechanic](<Design Artifact/Step Mechanic Action-html/Mechanic.dc.html>), [MechanicMobileStep](<Design Artifact/Mobile app, Mechanic menu Mechanic Action step (P1)-html/MechanicMobileStep.dc.html>), [Placement](<Design Artifact/Step Part Replacement map-html/Placement.dc.html>), [SettingsStooringRates](<Design Artifact/Settings Stooring rates (System Admin)-html/SettingsStooringRates.dc.html>) | The stooring area and its fee belong to the Mobilisasi step (its destination comes from the breakdown report); the mechanic's location trail is recorded only while the Mobilisasi step is In\_Progress and shown only on StepVerify and the WO detail to the Planner and System Admin (REQ-MBL-005, REQ-MBL-006) |
| Icon | Web navigation, mobile bottom bar, step cards, module chips, Settings home, vehicle tabs, add and back buttons | One outline icon set in one stroke weight. An icon always sits beside its text label, never alone, except in the collapsed navigation rail, where the label becomes a tooltip and the accessible name. Each assignment module has one fixed icon from its registry entry (Stock package, Part Purchase cart, Mechanic Action wrench, Part Replacement tyre, Document file), so a new module brings its own icon (REQ-REG-006). The mobile bottom bar shows an icon above each label, with a target of at least 48 px |
| Motion and feedback | Every web and mobile screen; ApprovalBlock decision on ApprovalReview, AmendmentReview, CompletionReview, StockOpnameApproval, TyreCountApproval, SupervisorMobileReview | Motion only acknowledges an action or explains a state change; there is no page-load choreography. Buttons depress when pressed; table rows, list cards and Settings items highlight on hover; inputs change border on hover and focus (100 to 200 ms). Pass and Fail switch at once and the What is wrong panel appears while any item is Fail. The step waiting for the current user pulses twice when the WO opens, then rests. Dialogs fade in over their page (about 300 ms). On Approve, the approver's stamp is pressed into the stamp box with the time (about 450 ms) and Reject is disabled; this is the one authored moment. With reduced motion set on the device, movement is replaced by a plain fade and state changes stay visible |

A module's step screen opens through its registry entry (`ui_component`), so a new module appears in the WO workspace without changing the shell.

### 7.6 Navigation and paging rules

| ID | Rule |
| --- | --- |
| NAV-1 | A step screen opens only from the WO detail or from Open in [`WOList`](<Design Artifact/Work Orders tab-html/WOList.dc.html>) or a dashboard, and Back returns to the WO detail. |
| NAV-2 | Tabs change content inside the same page; they never open a new page. |
| NAV-3 | On master-detail pages the right side follows the selected row. |
| NAV-4 | Creation and edit forms are full pages \[A\]; confirmations and small actions are dialogs or side panels (7.2). |
| NAV-5 | A notification, an alert or a dashboard item opens the exact WO, step, document or vehicle it names. |
| NAV-6 | Settings home → a setting → its page → back to Settings home. |
| NAV-7 | The Parts or Tyres choice in Inventory and the column choice per table are remembered per user. |
| NAV-8 | Links from tyre alerts open Inventory in Tyres mode. |

### 7.7 Working rules for the implementing agent

1. Build the data model (section 9) and business rules (section 5) first, then requirements in release order (section 10).
2. Place objects, divide pages and wire navigation as in 7.2 to 7.6 and the canvas.
3. Do not copy code, data, text or styling from the canvas files. Choose the visual style freely within the BMI brand of 7.8.
4. If something is in the canvas but not in this spec, do not build it; list it as a question. If it is in this spec but not in the canvas, build it in the nearest matching region.
5. Treat every \[A\] as buildable but keep it configurable or isolated, so the answer to its question in 11.2 needs a small change.
6. After each screen, report what came from the canvas, what came from the spec, the REQ and AC IDs covered, and any conflict found.

### 7.8 Brand (DEC-81)

The product name is **BMI Stooring System** on every screen, the browser tab, the mobile app name and launcher, the login screens and printed documents. The short form in tight places is "BMI Stooring". Red and gold below are taken from the BMI logo supplied by the client; petrol, petrol ink and mist complete the Petrol Complement palette (DEC-84); they live as tokens in packages/shared and are never typed as literals in a screen. The full design system (every color, type, radius and spacing token, the component rules and the do's and don'ts, under the north star "The Workshop Logbook") is recorded in DESIGN.md, delivered with the design canvas; agents read it before building a screen. Where DESIGN.md and this spec disagree, this spec wins.

| Token | Hex | Use | Rule |
| --- | --- | --- | --- |
| brand.primary | #AD2713 | Primary buttons, active navigation item, active tab, focus ring, the approval stamp | White text on it (contrast 6.8:1) |
| brand.primaryDark | #8A1D0C | Hover and pressed state of primary | White text on it |
| brand.gold | #C09D11 | Accent on dark surfaces only (app bar, mobile header, logo highlights) | Never as text or a thin line on white (contrast 2.6:1) |
| brand.petrol | #1F4E5F | Second colour, the complement of brand.primary: in-text links, info and In Progress pills (on a #DCEBEF tint), module and Settings icons, the first series of every chart | Carries information, never authority: never a primary button, never an error; red and petrol never swap roles |
| brand.ink | #14262E | Petrol ink: web side navigation, mobile header, dialog scrim (55%) | Logo sits on a white tile on this surface |
| brand.mist | #E6EFF1 | Selected row, info panels, soft highlight | Text in normal ink |
| status.danger | #B91C1C | Error, Act now, Rejected, destructive actions | Kept apart from brand.primary: a status always carries its text label (7.1), and destructive buttons are outlined with an explicit verb |

| Logo use | Rule |
| --- | --- |
| Web side navigation and mobile header | Full-colour logo on a white rounded tile, with the name beside it |
| Login and change password | Larger logo with the name, on the dark surface |
| WO document and invoice PDF | Logo in grayscale beside the document title or company name, so it prints well in black and white |
| Favicon and app icon | The logo on white; minimum 48 px on the launcher |
| Never | Stretch, recolour, crop the letters, or put the logo directly on brand.primary |

### 7.9 Action map (DEC-90)

Every control drawn in the canvas, with what it does, where it goes and the rule behind it. Build each control exactly as written here. A control that is in the canvas but not in this map, or a row marked DQ while its decision in 7.11 is open, is not built: list it as a question (7.7). \[New\] marks behaviour defined by this review; it is binding like the rest of the spec. A screen's own rows win over the common controls.

#### Common controls (every screen)

| ID | Control | What it does and where it goes | Ref |
| --- | --- | --- | --- |
| C-01 | Sidebar item (web) | Opens the area's first page: Dashboard → the role's dashboard; Work Orders → [WOList](<Design Artifact/Work Orders tab-html/WOList.dc.html>); Requests → [FCRequests](<Design Artifact/Requests draft WOs from drivers (Field Coordinator)-html/FCRequests.dc.html>); Schedule → [MaintenanceSchedule](<Design Artifact/Maintenance schedule (Planner)-html/MaintenanceSchedule.dc.html>) (ScheduleDispatcher for read-only roles); Approvals → [Approvals](<Design Artifact/Approvals (inbox)-html/Approvals.dc.html>); Inventory → [Inventory](<Design Artifact/Inventory-html/Inventory.dc.html>) (last Parts/Tyres mode, NAV-7); Vehicles → [Vehicles](<Design Artifact/Vehicles tab-html/Vehicles.dc.html>); Documents → [Documents](<Design Artifact/Documents tab-html/Documents.dc.html>); Reports → the first Reports tab the role may see; Settings → [Settings](<Design Artifact/Settings (home)-html/Settings.dc.html>); Invoices → [InvoiceList](<Design Artifact/Invoices (Accounting)-html/InvoiceList.dc.html>); Customers → [Customers](<Design Artifact/Customers-html/Customers.dc.html>); Users and roles → [UsersRoles](<Design Artifact/Users and roles (Access Manager)-html/UsersRoles.dc.html>); Audit log → [AuditLog](<Design Artifact/Audit log-html/AuditLog.dc.html>); Setup and go live → [SetupGoLive](<Design Artifact/System Admin Setup mode and Go live-html/SetupGoLive.dc.html>). Items shown per role as in 7.2 | 7.2, 2.2 |
| C-02 | Collapse menu | Toggles the icon rail (AppShellCollapsed); saved per user; no navigation | DEC-82 |
| C-03 | Bell in the page header | Opens NotificationCenter as a panel over the current page; the badge shows the unread count | REQ-NTF-001, DQ-01 |
| C-04 | User and role in the page header | Opens the user menu: Change password (ChangePassword), Notification settings (P1), Sign out (ends the session, back to WebLogin; a dirty form asks first, C-13) | \[New\], DQ-01 |
| C-05 | Mobile bottom bar item | Driver: Home → [DashboardDriver](<Design Artifact/Driver home (mobile)-html/DashboardDriver.dc.html>), Inspection → [DriverInspection](<Design Artifact/Mobile app, Driver menu daily inspection (P1)-html/DriverInspection.dc.html>), History → [DriverHistory](<Design Artifact/Mobile app, Driver menu history (P1)-html/DriverHistory.dc.html>), Profile → MobileProfile. Field Coordinator: Fleet → [DispatcherMobileFleet](<Design Artifact/Mobile app, Field Coordinator menu fleet availability (P1)-html/DispatcherMobileFleet.dc.html>), Requests → [FCMobileRequests](<Design Artifact/Mobile Field Coordinator requests-html/FCMobileRequests.dc.html>), Purchases → [FCMobilePurchase](<Design Artifact/Mobile Field Coordinator Part Purchase step-html/FCMobilePurchase.dc.html>) list, Schedule → [DispatcherMobileSchedule](<Design Artifact/Mobile app, Field Coordinator menu schedule, read only (P1)-html/DispatcherMobileSchedule.dc.html>), Alerts → [DispatcherMobileAlerts](<Design Artifact/Mobile app, Field Coordinator menu alerts (P1)-html/DispatcherMobileAlerts.dc.html>); Profile from the header. System Admin: Requests → [FCMobileRequests](<Design Artifact/Mobile Field Coordinator requests-html/FCMobileRequests.dc.html>), Purchases → [FCMobilePurchase](<Design Artifact/Mobile Field Coordinator Part Purchase step-html/FCMobilePurchase.dc.html>) list, Steps → [SAMobileHome](<Design Artifact/Mobile System Admin field menu-html/SAMobileHome.dc.html>) (open steps), Profile → MobileProfile. Mechanic (P1): My steps → [MechanicMobileHome](<Design Artifact/Mobile app, Mechanic menu my steps (P1)-html/MechanicMobileHome.dc.html>), Report → [MechanicMobileFieldReport](<Design Artifact/Mobile app, Mechanic menu field finding (P1)-html/MechanicMobileFieldReport.dc.html>), History → MechanicMobileHistory, Profile → MobileProfile. Supervisor and GM (P1): Approvals → [SupervisorMobileHome](<Design Artifact/Mobile app, Supervisor GM menu approvals (P1)-html/SupervisorMobileHome.dc.html>), Fleet → [SupervisorMobileFleet](<Design Artifact/Mobile app, Supervisor GM menu fleet today (P1)-html/SupervisorMobileFleet.dc.html>), History → SupervisorMobileHistory, Profile → MobileProfile | REQ-MOB-001, DQ-03, DQ-04 |
| C-06 | Tab (inside a page) | Changes the content of the same page and keeps the filters of that tab; never opens a new page; the count in the label is live | NAV-2 |
| C-07 | Row, list card or calendar card (click) | On a master-detail page selects the row and fills the right panel; on a list page opens the record's page. A row the user may only read opens it read only | NAV-3, 7.2 |
| C-08 | Open (on a row or item) | Opens the exact record named: a step → its step screen (NAV-1), a WO → [WorkOrder](<Design Artifact/Work Order detail-html/WorkOrder.dc.html>), an invoice → [InvoiceDetail](<Design Artifact/Invoice detail (Accounting, Supervisor)-html/InvoiceDetail.dc.html>), a document → the document panel, a count → its count page | NAV-5 |
| C-09 | View (on a row) | Same as Open, read only, for a row that is not waiting for this user (no action bar) | \[New\] |
| C-10 | Review (on a dashboard item) | Opens the matching review: creation → [ApprovalReview](<Design Artifact/Review approval creation-html/ApprovalReview.dc.html>), amendment → [AmendmentReview](<Design Artifact/Review approval amendment-html/AmendmentReview.dc.html>), completion → [CompletionReview](<Design Artifact/Review completion approval-html/CompletionReview.dc.html>), stock opname → [StockOpnameApproval](<Design Artifact/Review Stock opname (Supervisor, GM or System Admin)-html/StockOpnameApproval.dc.html>), tyre count → [TyreCountApproval](<Design Artifact/Review Tyre count (Supervisor, GM or System Admin)-html/TyreCountApproval.dc.html>), odometer void request → [OdometerVoid](<Design Artifact/Void odometer reading (System Admin)-html/OdometerVoid.dc.html>) in review mode, a part-check draft → [CreateWOFromCheck](<Design Artifact/Draft WO from a Part Check activate or discard-html/CreateWOFromCheck.dc.html>) | NAV-5 |
| C-11 | Create WO / Create Work Order | From a header: CreateWO blank. From an alert row: CreateWOFromAlert with vehicle, source and the alert rule's preset. From a vehicle: CreateWO with the vehicle. Only roles that may create a WO see it (Planner, System Admin; Field Coordinator and Mechanic get the draft form FCCreateWO) | REQ-WO-012, FLW-PLN-02 |
| C-12 | Cancel (form page) | Leaves the form without saving and returns to the page it came from; if anything was typed, asks Leave without saving? (Leave, Stay) | \[New\] |
| C-13 | Leaving a page with unsaved changes (any way) | Same question as C-12; Save draft is never automatic except the mobile offline draft (REQ-MOB-009) | \[New\] |
| C-14 | Cancel (dialog) / Close / × | Closes the dialog or panel; nothing changes | \[New\] |
| C-15 | Save draft | Saves what is typed without the submit checks; stays on the page; shows Saved at hh:mm; only the owner and the WO creator see a draft | \[New\] |
| C-16 | Discard / Discard changes (settings and masters) | Reverts the page to the last saved version after Discard your changes? (Discard, Keep editing); no navigation | \[New\] |
| C-17 | Save (settings and masters) | Runs the page checks, saves one version with an audit record, stays on the page and shows Saved; refused with the reason when a check fails | FLW-SA-05 |
| C-18 | Submit step / Submit step again | Runs the module's submit checks; on success stamps the executor, sets Submitted, opens the next step and returns to WorkOrder with Step n submitted. Disabled with the reason while a check fails, while paused (REQ-ENG-013) or while files are still uploading (shows Sending when photos finish) | REQ-ENG-002, NAV-1 |
| C-19 | Start work / Start | Sets the real start time and unlocks the form (DEC-87); claims an unassigned step | REQ-ENG-012 |
| C-20 | I started earlier | Opens the Start earlier panel: Started (15 min, 30 min, 1 h, 2 h ago; never before the step opened) and Why (Forgot to press Start, No signal, Phone was off) → Start from that time; marked entered | REQ-ENG-014 |
| C-21 | Pause | Opens the Why are you pausing? dialog (web) or sheet (phone): Waiting for parts, Waiting for the vehicle, Waiting for vendor or agency, Break or shift ended, Other with a note → Pause. Form read only while paused | REQ-ENG-013 |
| C-22 | Resume | Ends the pause at once (no dialog) and unlocks the form | REQ-ENG-013 |
| C-23 | Raise change request | Opens ChangeRequest for the open step | REQ-CR-001 |
| C-24 | Approve (decision card) | Commits at once, adds the stamp with the time (7.5 motion) and disables Reject; there is no undo; the page then shows Decided and a link back to the inbox | REQ-APR-004, \[New\] no undo |
| C-25 | Reject (decision card) | Enabled only when the reason has text; commits at once with the reason; no undo | REQ-WO-006 |
| C-26 | Export | Opens the Export dialog (StockCardExport pattern): format xlsx or csv (pdf where the page is a document), what is exported = the current table with its filters and only the columns the role may see → Export; written to export\_logs | REQ-RPT-001, \[New\] |
| C-27 | Print / Download PDF | Print opens the browser print of the document page; Download PDF saves the same page. Before the WO is Completed the document carries the mark Not final on every page | REQ-WOD-001, \[New\] Not final mark |
| C-28 | Back / Back to … / Back to WO / Back to vehicle | Returns to the named parent page, keeping its tab and filters | NAV-1 |
| C-29 | Thumbnail or file name | Opens PhotoViewer on that file (previous and next walk the files of the same record) | REQ-FUP-016 |
| C-30 | Remove (line in a form) | Removes the line from the form at once; nothing is saved until Save draft or the main action | \[New\] |
| C-31 | New … / Add … in a master-detail settings page | Adds a blank record in the right panel, selected and marked New; nothing is saved until Save; Discard drops it | \[New\] |
| C-32 | Deactivate (master record) | Opens a confirm dialog naming what stops (for example: no new WO lines can use this service; saved lines keep it) → Deactivate; refused with the reason when the rule of that master forbids it | \[New\] |
| C-33 | Filters, search and sort | Change the table at once; search matches the code and name columns; the choice is kept while the user stays in the area | 7.2 One field per column |
| C-34 | Any button while its request runs | Is disabled and shows progress, so it cannot be sent twice; a refused request (no permission, a newer version saved by someone else, a rule) shows one sentence and leaves the form as typed | \[New\], NFR |
| C-35 | Any action on the phone without signal | Save draft, Start, Pause, Resume and photo capture work offline and sync later; Submit, Approve, Reject and Send need a connection and say so | REQ-MOB-009 |

#### Action map: Shell and sign-in

| Screen | Control | What it does and where it goes | Ref |
| --- | --- | --- | --- |
| [WebLogin](<Design Artifact/Sign in (web)-html/WebLogin.dc.html>) | Sign in | Checks email and password; 5 wrong tries lock the account (unlock by the Access Manager); first sign-in → [ChangePassword](<Design Artifact/Change password at first sign-in-html/ChangePassword.dc.html>); then the role's dashboard (Access Manager → [UsersRoles](<Design Artifact/Users and roles (Access Manager)-html/UsersRoles.dc.html>); System Admin in Setup mode → [SetupGoLive](<Design Artifact/System Admin Setup mode and Go live-html/SetupGoLive.dc.html>)) | REQ-IAM-001 |
| [WebLogin](<Design Artifact/Sign in (web)-html/WebLogin.dc.html>) | Forgot password? | Sends a password reset link to the account's email; the link opens a reset page and expires after a set time. Decided (DQ-02, 7.11) | DQ-02, 7.11 |
| [MobileLogin](<Design Artifact/Mobile app sign in (menu follows the role) (P1)-html/MobileLogin.dc.html>) | Sign in | As WebLogin; then the role's mobile home (C-05). A role with no mobile menu sees Use the web app | REQ-MOB-001 |
| [ChangePassword](<Design Artifact/Change password at first sign-in-html/ChangePassword.dc.html>) | Save and continue | Checks the current and new password (rules of REQ-IAM-001); then the role's dashboard | REQ-IAM-001 |
| [NotificationCenter](<Design Artifact/Notification center-html/NotificationCenter.dc.html>) | Mark all read | Marks every notice of this user read; no navigation | \[New\] |
| [NotificationCenter](<Design Artifact/Notification center-html/NotificationCenter.dc.html>) | Notice (click) | Marks it read and opens the record it names | REQ-NTF-001, NAV-5 |
| [NotificationCenter](<Design Artifact/Notification center-html/NotificationCenter.dc.html>) | Filter tabs (All, Approvals, Steps, Alerts, Schedule) | C-06 | C-06 |
| [AppShellCollapsed](<Design Artifact/App shell navigation collapsed-html/AppShellCollapsed.dc.html>) | Review | C-10 | C-10 |
| [PhotoViewer](<Design Artifact/Component photo and file viewer (dialog)-html/PhotoViewer.dc.html>) | Zoom, 100%, ‹ › | View only | REQ-FUP-016 |
| [PhotoViewer](<Design Artifact/Component photo and file viewer (dialog)-html/PhotoViewer.dc.html>) | Close | C-14 | C-14 |
| [FileUploadStates](<Design Artifact/Component file upload, seamless (FileDrop)-html/FileUploadStates.dc.html>) | Remove | Removes the file from the slot | REQ-FUP-007 |
| [FileUploadStates](<Design Artifact/Component file upload, seamless (FileDrop)-html/FileUploadStates.dc.html>) | Save draft | C-15 | C-15 |
| [FileUploadStates](<Design Artifact/Component file upload, seamless (FileDrop)-html/FileUploadStates.dc.html>) | Sending when photos finish… | C-18 while files upload; submits by itself when all are Ready | REQ-FUP-012 |
| [Main](<Design Artifact/Screen map-html/Main.dc.html>) | (none) | Canvas overview only; not built | 7.3 |

#### Action map: Dashboards

| Screen | Control | What it does and where it goes | Ref |
| --- | --- | --- | --- |
| [Dashboard](<Design Artifact/Dashboard (Supervisor, GM)-html/Dashboard.dc.html>) | Review | C-10 | C-10 |
| [Dashboard](<Design Artifact/Dashboard (Supervisor, GM)-html/Dashboard.dc.html>) | Step time report | Opens ReportsStepTime (Step time tab) for the last 30 days | REQ-DSH-010 |
| [Dashboard](<Design Artifact/Dashboard (Supervisor, GM)-html/Dashboard.dc.html>) | View (bottleneck row) | Opens ReportsStepTime filtered to open steps whose phase is Waiting for verification over 8 hours | REQ-DSH-010, \[New\] |
| [Dashboard](<Design Artifact/Dashboard (Supervisor, GM)-html/Dashboard.dc.html>) | Vehicle row, early failure row | Vehicle → [VehicleOverview](<Design Artifact/Vehicles Overview tab-html/VehicleOverview.dc.html>); early failure → the WO's ApprovalReview read only | NAV-5 |
| [Dashboard](<Design Artifact/Dashboard (Supervisor, GM)-html/Dashboard.dc.html>) | Invoices rows | InvoiceList on the Issued tab (Overdue row adds the overdue filter) | \[New\] |
| [DashboardPlanner](<Design Artifact/Dashboard (Planner)-html/DashboardPlanner.dc.html>) | Create Work Order | C-11 (CreateWO blank) | FLW-PLN-01 |
| [DashboardPlanner](<Design Artifact/Dashboard (Planner)-html/DashboardPlanner.dc.html>) | Verify | WODetailVerify of that WO, scrolled to the step | FLW-PLN-05 |
| [DashboardPlanner](<Design Artifact/Dashboard (Planner)-html/DashboardPlanner.dc.html>) | Revise | CreateWORevision of the change request | FLW-PLN-06 |
| [DashboardPlanner](<Design Artifact/Dashboard (Planner)-html/DashboardPlanner.dc.html>) | Request | WODetailVerify with the Completion card | FLW-PLN-07 |
| [DashboardPlanner](<Design Artifact/Dashboard (Planner)-html/DashboardPlanner.dc.html>) | Open (draft row) | CreateWO in edit mode for that draft | FLW-PLN-02 |
| [DashboardPlanner](<Design Artifact/Dashboard (Planner)-html/DashboardPlanner.dc.html>) | Review (part-check draft) | [CreateWOFromCheck](<Design Artifact/Draft WO from a Part Check activate or discard-html/CreateWOFromCheck.dc.html>) | REQ-CHK-004 |
| [DashboardPlanner](<Design Artifact/Dashboard (Planner)-html/DashboardPlanner.dc.html>) | Create WO (alert row) | C-11 from an alert | FLW-PLN-02 |
| [DashboardPlanner](<Design Artifact/Dashboard (Planner)-html/DashboardPlanner.dc.html>) | Summary cards | Each opens WOList on the matching tab, or the schedule for Not on the schedule | \[New\] |
| [DashboardMechanic](<Design Artifact/Dashboard (Mechanic)-html/DashboardMechanic.dc.html>) | Create Work Order | FCCreateWO as a Mechanic draft (no steps; sent to the Planner) | REQ-WO-016 |
| [DashboardMechanic](<Design Artifact/Dashboard (Mechanic)-html/DashboardMechanic.dc.html>) | Open | The step screen (C-08) | FLW-MEC-01 |
| [DashboardMechanic](<Design Artifact/Dashboard (Mechanic)-html/DashboardMechanic.dc.html>) | View (locked step) | [StepLocked](<Design Artifact/Step state locked-html/StepLocked.dc.html>) | REQ-ENG-008 |
| [DashboardWarehouse](<Design Artifact/Dashboard (Warehouse Manager)-html/DashboardWarehouse.dc.html>) | Goods Receipt | [GoodsReceiptForm](<Design Artifact/New Goods Receipt-html/GoodsReceiptForm.dc.html>) | FLW-WHM-03 |
| [DashboardWarehouse](<Design Artifact/Dashboard (Warehouse Manager)-html/DashboardWarehouse.dc.html>) | Receive tyres | [ReceiveTyres](<Design Artifact/Receive tyres new tyres-html/ReceiveTyres.dc.html>) | FLW-WHM-06 |
| [DashboardWarehouse](<Design Artifact/Dashboard (Warehouse Manager)-html/DashboardWarehouse.dc.html>) | Open | The Stock step, StockOpnameReturned or the item named | C-08 |
| [DashboardWarehouse](<Design Artifact/Dashboard (Warehouse Manager)-html/DashboardWarehouse.dc.html>) | Receive (dispatch row) | RetreadReceipt for that dispatch | FLW-WHM-07 |
| [DashboardAdmin](<Design Artifact/Dashboard (System Admin)-html/DashboardAdmin.dc.html>) | Add vehicle | [AddVehicle](<Design Artifact/Add vehicle with first documents-html/AddVehicle.dc.html>) | FLW-SA-01 |
| [DashboardAdmin](<Design Artifact/Dashboard (System Admin)-html/DashboardAdmin.dc.html>) | Add document | AddDocument for that vehicle and type | FLW-SA-02 |
| [DashboardAdmin](<Design Artifact/Dashboard (System Admin)-html/DashboardAdmin.dc.html>) | Open | C-08 | C-08 |
| [DashboardAdmin](<Design Artifact/Dashboard (System Admin)-html/DashboardAdmin.dc.html>) | Review | C-10 (self-approval shows Self-approved) | C-10 |
| [DashboardAdmin](<Design Artifact/Dashboard (System Admin)-html/DashboardAdmin.dc.html>) | Parts baseline | PartsBaseline for that vehicle | FLW-SA-01 |
| [DashboardAdmin](<Design Artifact/Dashboard (System Admin)-html/DashboardAdmin.dc.html>) | Manage (master data row) | The matching Settings page (DocumentTypes, ChassisLayouts, …) | NAV-6 |
| [DashboardAdmin](<Design Artifact/Dashboard (System Admin)-html/DashboardAdmin.dc.html>) | Integrations rows | Show each integration's status; a row opens `SettingsIntegrations`, where the System Admin connects WhatsApp, the Protrack/Cartrack odometer API and other external tools (credentials, enable/disable, connection test). Decided (DQ-05, 7.11) | DQ-05, 7.11, REQ-AI-002 |
| [DashboardDispatcher](<Design Artifact/Dashboard (Field Coordinator)-html/DashboardDispatcher.dc.html>) | Create WO | FCCreateWO (source Manual\_Field\_Coordinator) | FLW-FC-04 |
| [DashboardDispatcher](<Design Artifact/Dashboard (Field Coordinator)-html/DashboardDispatcher.dc.html>) | Open requests | [FCRequests](<Design Artifact/Requests draft WOs from drivers (Field Coordinator)-html/FCRequests.dc.html>) | FLW-FC-04 |
| [DashboardDispatcher](<Design Artifact/Dashboard (Field Coordinator)-html/DashboardDispatcher.dc.html>) | Not available row | VehicleOverview read only | FLW-FC-01 |
| [DashboardAccounting](<Design Artifact/Dashboard (Accounting)-html/DashboardAccounting.dc.html>) | Open | InvoiceDetail of that invoice | FLW-ACC-01 |
| [DashboardAccounting](<Design Artifact/Dashboard (Accounting)-html/DashboardAccounting.dc.html>) | Summary cards | InvoiceList on the matching tab | \[New\] |
| [DashboardDriver](<Design Artifact/Driver home (mobile)-html/DashboardDriver.dc.html>) | Start daily inspection | [DriverInspection](<Design Artifact/Mobile app, Driver menu daily inspection (P1)-html/DriverInspection.dc.html>) | FLW-DRV-01 |
| [DashboardDriver](<Design Artifact/Driver home (mobile)-html/DashboardDriver.dc.html>) | Record odometer | [DriverOdometer](<Design Artifact/Mobile app, Driver menu record odometer (P1)-html/DriverOdometer.dc.html>) | FLW-DRV-03 |
| [DashboardDriver](<Design Artifact/Driver home (mobile)-html/DashboardDriver.dc.html>) | Report breakdown | [DriverBreakdown](<Design Artifact/Mobile app, Driver menu report breakdown (P1)-html/DriverBreakdown.dc.html>) | FLW-DRV-02 |

#### Action map: Work Orders

| Screen | Control | What it does and where it goes | Ref |
| --- | --- | --- | --- |
| [WOList](<Design Artifact/Work Orders tab-html/WOList.dc.html>) | Create Work Order | C-11 | FLW-PLN-01 |
| [WOList](<Design Artifact/Work Orders tab-html/WOList.dc.html>) | Tabs (Active, My steps, Draft, Pending approval, Rejected, Completed, Cancelled, All) | C-06; Rejected rows open WORejected | FLW-PLN-03 |
| [WOList](<Design Artifact/Work Orders tab-html/WOList.dc.html>) | Open | The user's step (C-08) or, for a draft, CreateWO in edit mode | NAV-1 |
| [WOList](<Design Artifact/Work Orders tab-html/WOList.dc.html>) | View | WorkOrder read only (C-09) | C-09 |
| [CreateWO](<Design Artifact/Create Work Order step composer-html/CreateWO.dc.html>) | Start from preset | Replaces the steps with the preset's (asks first when steps exist); title and category are filled only when empty | REQ-REG-003 |
| [CreateWO](<Design Artifact/Create Work Order step composer-html/CreateWO.dc.html>) | Save as preset / Save preset | Opens the name panel; Save preset stores the steps, roles and details (not the vehicle) as a new preset or a new version of a preset with that name | REQ-REG-003 |
| [CreateWO](<Design Artifact/Create Work Order step composer-html/CreateWO.dc.html>) | Module chip (drag) / Add step menu | Adds the module as a step at the drop place / at the end | REQ-WO-017 |
| [CreateWO](<Design Artifact/Create Work Order step composer-html/CreateWO.dc.html>) | Move step up, Move step down, drag handle | Reorders; numbers follow | AC-REG-004 |
| [CreateWO](<Design Artifact/Create Work Order step composer-html/CreateWO.dc.html>) | Remove step | Removes the step at once (C-30) | C-30 |
| [CreateWO](<Design Artifact/Create Work Order step composer-html/CreateWO.dc.html>) | Add part, Add part to buy, Add part to check, Remove part | Edits the step's lines | REQ-WO-017, REQ-CHK-001 |
| [CreateWO](<Design Artifact/Create Work Order step composer-html/CreateWO.dc.html>) | Position chips (Part Replacement) | Toggle the positions to change | REQ-PLC-001 |
| [CreateWO](<Design Artifact/Create Work Order step composer-html/CreateWO.dc.html>) | Cancel | C-12; a new WO never saved leaves nothing behind | C-12 |
| [CreateWO](<Design Artifact/Create Work Order step composer-html/CreateWO.dc.html>) | Save draft | C-15; the WO stays Draft in WOList | C-15 |
| [CreateWO](<Design Artifact/Create Work Order step composer-html/CreateWO.dc.html>) | Submit for approval | Disabled while Checks shows an error; sends to the Approvers; WOList Pending approval | REQ-WO-004 |
| [CreateWOFromAlert](<Design Artifact/Create WO from an alert-html/CreateWOFromAlert.dc.html>) | Remove, Add part | C-30 and step lines as CreateWO | REQ-WO-012 |
| [CreateWOFromAlert](<Design Artifact/Create WO from an alert-html/CreateWOFromAlert.dc.html>) | Cancel | C-12; the alert stays Pending | C-12 |
| [CreateWOFromAlert](<Design Artifact/Create WO from an alert-html/CreateWOFromAlert.dc.html>) | Save draft | C-15; the alert shows Draft WO | C-15 |
| [CreateWOFromAlert](<Design Artifact/Create WO from an alert-html/CreateWOFromAlert.dc.html>) | Submit for approval | As CreateWO | REQ-WO-004 |
| [CreateWORevision](<Design Artifact/Revise a WO (amendment)-html/CreateWORevision.dc.html>) | Remove, Add part | Edit steps not yet started (DEC-85) | REQ-CR-003 |
| [CreateWORevision](<Design Artifact/Revise a WO (amendment)-html/CreateWORevision.dc.html>) | Cancel | C-12; the change request stays In\_Revision | C-12 |
| [CreateWORevision](<Design Artifact/Revise a WO (amendment)-html/CreateWORevision.dc.html>) | Save draft | C-15 | C-15 |
| [CreateWORevision](<Design Artifact/Revise a WO (amendment)-html/CreateWORevision.dc.html>) | Send revision for approval | AmendmentReview for the Approvers | FLW-PLN-06 |
| [WORejected](<Design Artifact/Work Order rejected-html/WORejected.dc.html>) | Edit and resubmit | CreateWO in edit mode | FLW-PLN-03 |
| [WORejected](<Design Artifact/Work Order rejected-html/WORejected.dc.html>) | (no Cancel) | A rejected WO returns to its creator as a Draft carrying the rejector's note; there is no cancel or un-reject on this screen, and even the rejector cannot revert the rejection. The creator edits the Draft and submits it for approval again (SM-WO T5). Decided (DQ-06, 7.11) | DQ-06, 7.11 |
| [WorkOrder](<Design Artifact/Work Order detail-html/WorkOrder.dc.html>) | WO document (PDF) | WODocument (or WODocumentCheck for a Part Check WO), C-27 | REQ-WOD-001 |
| [WorkOrder](<Design Artifact/Work Order detail-html/WorkOrder.dc.html>) | Raise change request (step executor) | [ChangeRequest](<Design Artifact/Raise a change request-html/ChangeRequest.dc.html>) raised by the executor of the open step when they disagree with the WO creator's assignment design; it puts the WO in Pending Amendment and the WO creator (Planner or System Admin) receives and decides the amendment (SM-WO T8 to T10, FLW-MEC-05). Only the open step's executor raises it, never the WO creator. Decided (DQ-07, 7.11) | REQ-CR-001, DQ-07, 7.11 |
| [WorkOrder](<Design Artifact/Work Order detail-html/WorkOrder.dc.html>) | Cancel WO | CancelWO (Supervisor, GM, System Admin only) | FLW-APR-05 |
| [WorkOrder](<Design Artifact/Work Order detail-html/WorkOrder.dc.html>) | Reverse issue | StockReversal (Warehouse Manager, System Admin) | FLW-WHM-02 |
| [WorkOrder](<Design Artifact/Work Order detail-html/WorkOrder.dc.html>) | Open step | The step screen | NAV-1 |
| [WorkOrder](<Design Artifact/Work Order detail-html/WorkOrder.dc.html>) | Assign / Reassign | Assign step dialog: pick an active user of the step's executor roles; Reassign also needs a reason; the user is notified | FLW-PLN-09, \[New\] dialog |
| [WorkOrder](<Design Artifact/Work Order detail-html/WorkOrder.dc.html>) | Correct time (System Admin, on a step's time line) | Correct step time dialog: event, new time, reason → Save; writes step\_time\_corrections and the audit log | REQ-ENG-014, \[New\] dialog |
| [WODetailVerify](<Design Artifact/WO detail verification and completion-html/WODetailVerify.dc.html>) | WO document (PDF) | C-27 | REQ-WOD-001 |
| [WODetailVerify](<Design Artifact/WO detail verification and completion-html/WODetailVerify.dc.html>) | Reverse issue | [StockReversal](<Design Artifact/Stock step reversal after submit-html/StockReversal.dc.html>) | FLW-WHM-02 |
| [WODetailVerify](<Design Artifact/WO detail verification and completion-html/WODetailVerify.dc.html>) | Verify | StepVerify (PartCheckVerify for Part Check) | FLW-PLN-05 |
| [WODetailVerify](<Design Artifact/WO detail verification and completion-html/WODetailVerify.dc.html>) | Return | StepVerify with the note field focused | FLW-PLN-05 |
| [WODetailVerify](<Design Artifact/WO detail verification and completion-html/WODetailVerify.dc.html>) | Request completion approval | Disabled with the reason until every step is Verified or Skipped; sends to CompletionReview | FLW-PLN-07 |
| [StepVerify](<Design Artifact/Verify a step-html/StepVerify.dc.html>) | Return to executor | Needs the note; the step becomes Open (Returned) and the executor is notified (StepReturned) | REQ-ENG-005, REQ-ENG-015 |
| [StepVerify](<Design Artifact/Verify a step-html/StepVerify.dc.html>) | Verify | Adds the verifier stamp; back to WODetailVerify | REQ-ENG-005 |
| [StepVerify](<Design Artifact/Verify a step-html/StepVerify.dc.html>) | Open trail on map | For a Mobilisasi step, opens the mechanic's recorded location trail and destination on an external map. The trail is recorded only while the step is In\_Progress and is scoped to the stooring verification (duration and route), visible to Planner and System Admin only, with every access logged; it is not continuous or deliberate employee tracking outside the step (DEC-90, REQ-MBL-005, RSK-09). Decided (DQ-08, 7.11) | DQ-08, 7.11 |
| [StepVerify](<Design Artifact/Verify a step-html/StepVerify.dc.html>) | Thumbnails | C-29 | C-29 |
| [StepLocked](<Design Artifact/Step state locked-html/StepLocked.dc.html>) | Back to WO | C-28 | NAV-1 |
| [StepReturned](<Design Artifact/Step state returned-html/StepReturned.dc.html>) | Pause | C-21 | C-21 |
| [StepReturned](<Design Artifact/Step state returned-html/StepReturned.dc.html>) | Internal team / External workshop | Switches the team as in Mechanic | REQ-MEC-003 |
| [StepReturned](<Design Artifact/Step state returned-html/StepReturned.dc.html>) | Save draft | C-15 | C-15 |
| [StepReturned](<Design Artifact/Step state returned-html/StepReturned.dc.html>) | Submit step again | C-18 | REQ-ENG-005 |
| [CancelWO](<Design Artifact/Cancel Work Order (dialog)-html/CancelWO.dc.html>) | WO document (PDF) | C-27 | C-27 |
| [CancelWO](<Design Artifact/Cancel Work Order (dialog)-html/CancelWO.dc.html>) | Cancel WO | Needs the reason; reverses posted issues, returns Issued tyres to In Stock, notifies the creator and executors; WOList Cancelled | REQ-WO-008 |
| [CancelWO](<Design Artifact/Cancel Work Order (dialog)-html/CancelWO.dc.html>) | Keep the WO | C-14 | C-14 |
| [ChangeRequest](<Design Artifact/Raise a change request-html/ChangeRequest.dc.html>) | Cancel | C-12 | C-12 |
| [ChangeRequest](<Design Artifact/Raise a change request-html/ChangeRequest.dc.html>) | Submit request | Needs the reason and the requested change; the WO becomes Pending\_Amendment; the step pauses with reason Change request | REQ-CR-001, REQ-ENG-013 |
| [WODocument](<Design Artifact/WO document-html/WODocument.dc.html>) | Print, Download PDF | C-27 | C-27 |
| [WODocumentCheck](<Design Artifact/WO document Part Check WO (standalone)-html/WODocumentCheck.dc.html>) | Print, Download PDF | C-27 | C-27 |
| [WODocumentCheck](<Design Artifact/WO document Part Check WO (standalone)-html/WODocumentCheck.dc.html>) | Follow-up WO number | Opens WorkOrder of the follow-up WO when the reader may see it; prints as text | REQ-CHK-006 |
| [FCRequests](<Design Artifact/Requests draft WOs from drivers (Field Coordinator)-html/FCRequests.dc.html>) | Create WO | FCCreateWO (Manual\_Field\_Coordinator) | FLW-FC-04 |
| [FCRequests](<Design Artifact/Requests draft WOs from drivers (Field Coordinator)-html/FCRequests.dc.html>) | Tabs | C-06 | C-06 |
| [FCRequests](<Design Artifact/Requests draft WOs from drivers (Field Coordinator)-html/FCRequests.dc.html>) | Open | Selects the draft in the right panel | NAV-3 |
| [FCRequests](<Design Artifact/Requests draft WOs from drivers (Field Coordinator)-html/FCRequests.dc.html>) | Complete and send to Planner | [FCCreateWO](<Design Artifact/Complete and submit a draft WO (Field Coordinator)-html/FCCreateWO.dc.html>) for that draft; the Field Coordinator completes it and sends it to the Planner, who submits it for approval (REQ-WO-016). The control is labelled "Complete and send to Planner", never "submit". Decided (DQ-10, 7.11) | REQ-WO-016, DQ-10, 7.11 |
| [FCRequests](<Design Artifact/Requests draft WOs from drivers (Field Coordinator)-html/FCRequests.dc.html>) | Cancel draft | Opens [FCDraftCancel](<Design Artifact/Cancel draft WO (Field Coordinator, dialog)-html/FCDraftCancel.dc.html>): reason → the draft is Cancelled, the reporter is notified, the report stays in the vehicle history. Decided (DQ-11, 7.11) | DQ-11, 7.11 |
| [FCCreateWO](<Design Artifact/Complete and submit a draft WO (Field Coordinator)-html/FCCreateWO.dc.html>) | Remove, Add part | Edits Parts needed | REQ-WO-016 |
| [FCCreateWO](<Design Artifact/Complete and submit a draft WO (Field Coordinator)-html/FCCreateWO.dc.html>) | Cancel draft | Opens [FCDraftCancel](<Design Artifact/Cancel draft WO (Field Coordinator, dialog)-html/FCDraftCancel.dc.html>), as FCRequests. Decided (DQ-11, 7.11) | DQ-11, 7.11 |
| [FCCreateWO](<Design Artifact/Complete and submit a draft WO (Field Coordinator)-html/FCCreateWO.dc.html>) | Save draft | C-15 | C-15 |
| [FCCreateWO](<Design Artifact/Complete and submit a draft WO (Field Coordinator)-html/FCCreateWO.dc.html>) | Send to Planner | Sends the draft; the Planner adds the steps | REQ-WO-016 |

#### Action map: Step screens

| Screen | Control | What it does and where it goes | Ref |
| --- | --- | --- | --- |
| [Stock](<Design Artifact/Step Stock-html/Stock.dc.html>) | Pause | C-21 | C-21 |
| [Stock](<Design Artifact/Step Stock-html/Stock.dc.html>) | Confirm shortfall | Confirms the missing quantity; adds a Part Purchase step right after this one with those lines and alerts the Field Coordinators | REQ-PUR-008 |
| [Stock](<Design Artifact/Step Stock-html/Stock.dc.html>) | Raise change request | C-23 | C-23 |
| [Stock](<Design Artifact/Step Stock-html/Stock.dc.html>) | Save draft | C-15 | C-15 |
| [Stock](<Design Artifact/Step Stock-html/Stock.dc.html>) | Submit step and post Goods Issue | C-18, posts the Goods Issue (stock down, tyres Issued, cost on the WO) | REQ-STK-005 |
| [StockReversal](<Design Artifact/Stock step reversal after submit-html/StockReversal.dc.html>) | Cancel | C-12 | C-12 |
| [StockReversal](<Design Artifact/Stock step reversal after submit-html/StockReversal.dc.html>) | Submit reversal | Needs the lines, quantities and a reason; waits for a Planner or System Admin to verify | REQ-STK-008 |
| [PartPurchase](<Design Artifact/Step Part Purchase (bought outside)-html/PartPurchase.dc.html>) | Resume | C-22 | C-22 |
| [PartPurchase](<Design Artifact/Step Part Purchase (bought outside)-html/PartPurchase.dc.html>) | Photo | Adds a receipt photo (camera or file) | REQ-PUR-004 |
| [PartPurchase](<Design Artifact/Step Part Purchase (bought outside)-html/PartPurchase.dc.html>) | Raise change request | C-23 | C-23 |
| [PartPurchase](<Design Artifact/Step Part Purchase (bought outside)-html/PartPurchase.dc.html>) | Submit with no lines and a reason | Opens Nothing bought? dialog: reason → Submit step | REQ-PUR-007, \[New\] dialog |
| [PartPurchase](<Design Artifact/Step Part Purchase (bought outside)-html/PartPurchase.dc.html>) | Save draft | C-15 | C-15 |
| [PartPurchase](<Design Artifact/Step Part Purchase (bought outside)-html/PartPurchase.dc.html>) | Submit step · total | C-18; adds the total to parts cost | REQ-PUR-006 |
| [Mechanic](<Design Artifact/Step Mechanic Action-html/Mechanic.dc.html>) | I started earlier | C-20 | C-20 |
| [Mechanic](<Design Artifact/Step Mechanic Action-html/Mechanic.dc.html>) | Start work | C-19 | C-19 |
| [Mechanic](<Design Artifact/Step Mechanic Action-html/Mechanic.dc.html>) | Internal team / External workshop | Switches the form; External opens the MechanicExternal layout; lines of the other team are cleared after Switch team? (Switch, Keep) | REQ-MEC-003, \[New\] confirm |
| [Mechanic](<Design Artifact/Step Mechanic Action-html/Mechanic.dc.html>) | Add service | Opens the catalog picker (search code or name, active services only, fixed price) → adds a line | REQ-MEC-001, \[New\] picker |
| [Mechanic](<Design Artifact/Step Mechanic Action-html/Mechanic.dc.html>) | Save draft | C-15 | C-15 |
| [Mechanic](<Design Artifact/Step Mechanic Action-html/Mechanic.dc.html>) | Submit step | C-18; needs at least one repair photo | REQ-MEC-002 |
| [Mechanic](<Design Artifact/Step Mechanic Action-html/Mechanic.dc.html>) | Release step | Release step dialog: reason → the step is unassigned, its draft stays | FLW-PLN-09, \[New\] dialog |
| [MechanicExternal](<Design Artifact/Mechanic Action external team-html/MechanicExternal.dc.html>) | Pause | C-21 | C-21 |
| [MechanicExternal](<Design Artifact/Mechanic Action external team-html/MechanicExternal.dc.html>) | Internal team / External workshop | As Mechanic | REQ-MEC-003 |
| [MechanicExternal](<Design Artifact/Mechanic Action external team-html/MechanicExternal.dc.html>) | Save draft | C-15 | C-15 |
| [MechanicExternal](<Design Artifact/Mechanic Action external team-html/MechanicExternal.dc.html>) | Submit step | C-18; needs vendor, price and the invoice image | REQ-MEC-003 |
| [PartCheck](<Design Artifact/Step Part Check (troubleshooting)-html/PartCheck.dc.html>) | Pause | C-21 | C-21 |
| [PartCheck](<Design Artifact/Step Part Check (troubleshooting)-html/PartCheck.dc.html>) | Good / Repair / Replace | Sets the part's decision; Good clears Unsafe to drive | REQ-CHK-002 |
| [PartCheck](<Design Artifact/Step Part Check (troubleshooting)-html/PartCheck.dc.html>) | Add (photo) | Adds a photo to that part (camera or file) | REQ-CHK-002 |
| [PartCheck](<Design Artifact/Step Part Check (troubleshooting)-html/PartCheck.dc.html>) | Add a finding not on the list / Remove finding | Adds or removes a part marked Added by mechanic | REQ-CHK-002 |
| [PartCheck](<Design Artifact/Step Part Check (troubleshooting)-html/PartCheck.dc.html>) | Internal team / External workshop, Add service | As Mechanic, for the check service | REQ-CHK-007 |
| [PartCheck](<Design Artifact/Step Part Check (troubleshooting)-html/PartCheck.dc.html>) | Save draft | C-15 | C-15 |
| [PartCheck](<Design Artifact/Step Part Check (troubleshooting)-html/PartCheck.dc.html>) | Submit step | C-18; refused until every part is complete and a service line exists | REQ-CHK-002, REQ-CHK-007 |
| [PartCheckVerify](<Design Artifact/Verify a Part Check step-html/PartCheckVerify.dc.html>) | Return with note | As StepVerify; no draft is made | REQ-CHK-003 |
| [PartCheckVerify](<Design Artifact/Verify a Part Check step-html/PartCheckVerify.dc.html>) | Verify | Stamps the step and makes the follow-up Draft WO when a part is Repair or Replace | REQ-CHK-003 |
| [PartCheckVerify](<Design Artifact/Verify a Part Check step-html/PartCheckVerify.dc.html>) | Thumbnails | C-29 | C-29 |
| [CreateWOFromCheck](<Design Artifact/Draft WO from a Part Check activate or discard-html/CreateWOFromCheck.dc.html>) | Open WO-0181 (check WO) | WorkOrder of the check WO | REQ-CHK-004 |
| [CreateWOFromCheck](<Design Artifact/Draft WO from a Part Check activate or discard-html/CreateWOFromCheck.dc.html>) | Edit steps in Create WO | CreateWO in edit mode for this draft | REQ-CHK-004 |
| [CreateWOFromCheck](<Design Artifact/Draft WO from a Part Check activate or discard-html/CreateWOFromCheck.dc.html>) | Discard draft | Needs the reason; the draft is Cancelled and keeps its link to the check; never made again | REQ-CHK-004 |
| [CreateWOFromCheck](<Design Artifact/Draft WO from a Part Check activate or discard-html/CreateWOFromCheck.dc.html>) | Activate: submit for approval | Submits for approval like CreateWO; the activating user counts as creator for BR-03 | REQ-CHK-004, \[New\] BR-03 |
| [Placement](<Design Artifact/Step Part Replacement map-html/Placement.dc.html>) | Pause | C-21 | C-21 |
| [Placement](<Design Artifact/Step Part Replacement map-html/Placement.dc.html>) | Replace | PlacementReplace in the right panel for the selected position | FLW-MEC-03 |
| [Placement](<Design Artifact/Step Part Replacement map-html/Placement.dc.html>) | Rotate | PlacementRotate in the right panel | FLW-MEC-03 |
| [Placement](<Design Artifact/Step Part Replacement map-html/Placement.dc.html>) | Tyre on the map (tap) | Selects the position | REQ-PLC-002 |
| [Placement](<Design Artifact/Step Part Replacement map-html/Placement.dc.html>) | Save draft | C-15 | C-15 |
| [Placement](<Design Artifact/Step Part Replacement map-html/Placement.dc.html>) | Submit step | C-18 | REQ-PLC-006 |
| [PlacementReplace](<Design Artifact/Part Replacement replace-html/PlacementReplace.dc.html>) | Pause | C-21 | C-21 |
| [PlacementReplace](<Design Artifact/Part Replacement replace-html/PlacementReplace.dc.html>) | Cancel | C-14 (closes the panel) | C-14 |
| [PlacementReplace](<Design Artifact/Part Replacement replace-html/PlacementReplace.dc.html>) | Confirm replacement | Records the change in the step draft (old tyre condition, tread, pressure); saved on Submit | REQ-PLC-003, REQ-PLC-004 |
| [PlacementRotate](<Design Artifact/Part Replacement rotate-html/PlacementRotate.dc.html>) | Pause | C-21 | C-21 |
| [PlacementRotate](<Design Artifact/Part Replacement rotate-html/PlacementRotate.dc.html>) | Cancel | C-14 | C-14 |
| [PlacementRotate](<Design Artifact/Part Replacement rotate-html/PlacementRotate.dc.html>) | Confirm rotation | Records the swap in the step draft | REQ-PLC-005 |
| [PlacementTrailer](<Design Artifact/Step Part Replacement on a trailer tail (towed unit, spare)-html/PlacementTrailer.dc.html>) | Pause | C-21 | C-21 |
| [PlacementTrailer](<Design Artifact/Step Part Replacement on a trailer tail (towed unit, spare)-html/PlacementTrailer.dc.html>) | Replace, Rotate | As Placement | FLW-MEC-03 |
| [PlacementTrailer](<Design Artifact/Step Part Replacement on a trailer tail (towed unit, spare)-html/PlacementTrailer.dc.html>) | Swap with spare | Swaps the selected tyre with the spare slot (a rotation with the spare) | REQ-PLC-018, \[New\] wording |
| [PlacementTrailer](<Design Artifact/Step Part Replacement on a trailer tail (towed unit, spare)-html/PlacementTrailer.dc.html>) | Save draft | C-15 | C-15 |
| [PlacementTrailer](<Design Artifact/Step Part Replacement on a trailer tail (towed unit, spare)-html/PlacementTrailer.dc.html>) | Submit step | C-18 | REQ-PLC-006 |
| [DocStep](<Design Artifact/Step Document renewal-html/DocStep.dc.html>) | Resume | C-22 | C-22 |
| [DocStep](<Design Artifact/Step Document renewal-html/DocStep.dc.html>) | Save draft | C-15 | C-15 |
| [DocStep](<Design Artifact/Step Document renewal-html/DocStep.dc.html>) | Submit step | C-18; needs number, dates, scan, cost, receipt when required | REQ-DOC-007 |

#### Action map: Approvals and schedule

| Screen | Control | What it does and where it goes | Ref |
| --- | --- | --- | --- |
| [Approvals](<Design Artifact/Approvals (inbox)-html/Approvals.dc.html>) | Tabs Work Orders, Warehouse, History | C-06 | C-06 |
| [Approvals](<Design Artifact/Approvals (inbox)-html/Approvals.dc.html>) | Type chips | Filter the list | C-33 |
| [Approvals](<Design Artifact/Approvals (inbox)-html/Approvals.dc.html>) | Open review | C-10 for the selected item | FLW-APR-01 |
| [ApprovalsWarehouse](<Design Artifact/Approvals Warehouse tab (Supervisor, GM or System Admin)-html/ApprovalsWarehouse.dc.html>) | Tabs Work Orders, Warehouse, History | C-06 | C-06 |
| [ApprovalsWarehouse](<Design Artifact/Approvals Warehouse tab (Supervisor, GM or System Admin)-html/ApprovalsWarehouse.dc.html>) | Type chips | Filter the list | C-33 |
| [ApprovalsWarehouse](<Design Artifact/Approvals Warehouse tab (Supervisor, GM or System Admin)-html/ApprovalsWarehouse.dc.html>) | Open review | C-10 for the selected item | FLW-APR-01 |
| [ApprovalsHistory](<Design Artifact/Approvals History-html/ApprovalsHistory.dc.html>) | Tabs Work Orders, Warehouse, History | C-06 | C-06 |
| [ApprovalsHistory](<Design Artifact/Approvals History-html/ApprovalsHistory.dc.html>) | Type chips | Filter the list | C-33 |
| [ApprovalsHistory](<Design Artifact/Approvals History-html/ApprovalsHistory.dc.html>) | Open WO | WorkOrder read only | FLW-APR-06 |
| [ApprovalReview](<Design Artifact/Review approval creation-html/ApprovalReview.dc.html>) | Reject | C-25 | C-25 |
| [ApprovalReview](<Design Artifact/Review approval creation-html/ApprovalReview.dc.html>) | Approve | C-24; the WO becomes Active and step 1 opens | FLW-APR-01 |
| [AmendmentReview](<Design Artifact/Review approval amendment-html/AmendmentReview.dc.html>) | Reject | C-25; the original content stays | FLW-APR-02 |
| [AmendmentReview](<Design Artifact/Review approval amendment-html/AmendmentReview.dc.html>) | Approve revision | C-24; amendment number +1, the step resumes | FLW-APR-02 |
| [CompletionReview](<Design Artifact/Review completion approval-html/CompletionReview.dc.html>) | Open WO document | WODocument (Not final) | C-27 |
| [CompletionReview](<Design Artifact/Review completion approval-html/CompletionReview.dc.html>) | Reject | C-25; WO stays Pending\_Verification | FLW-APR-03 |
| [CompletionReview](<Design Artifact/Review completion approval-html/CompletionReview.dc.html>) | Approve completion | C-24; WO Completed, vehicle status recalculated | FLW-APR-03 |
| [StockOpnameApproval](<Design Artifact/Review Stock opname (Supervisor, GM or System Admin)-html/StockOpnameApproval.dc.html>) | Reject | C-25; back to Draft, marked Returned | FLW-APR-04 |
| [StockOpnameApproval](<Design Artifact/Review Stock opname (Supervisor, GM or System Admin)-html/StockOpnameApproval.dc.html>) | Approve adjustment | C-24; stock adjusted | FLW-APR-04 |
| [TyreCountApproval](<Design Artifact/Review Tyre count (Supervisor, GM or System Admin)-html/TyreCountApproval.dc.html>) | Reject | C-25 | FLW-APR-04 |
| [TyreCountApproval](<Design Artifact/Review Tyre count (Supervisor, GM or System Admin)-html/TyreCountApproval.dc.html>) | Approve count | C-24; missing tyres become Lost | FLW-APR-04 |
| [MaintenanceSchedule](<Design Artifact/Maintenance schedule (Planner)-html/MaintenanceSchedule.dc.html>) | ‹ ›, Today, Week/Month | Moves the period; no data change | \[New\] |
| [MaintenanceSchedule](<Design Artifact/Maintenance schedule (Planner)-html/MaintenanceSchedule.dc.html>) | Drag a card | Places or moves the WO on a day; the Field Coordinators are alerted; the WO never changes | REQ-SCH-001 to 004 |
| [MaintenanceSchedule](<Design Artifact/Maintenance schedule (Planner)-html/MaintenanceSchedule.dc.html>) | Card (click) | [WorkOrder](<Design Artifact/Work Order detail-html/WorkOrder.dc.html>) | C-07 |
| [ScheduleDispatcher](<Design Artifact/Maintenance schedule (Field Coordinator, read only)-html/ScheduleDispatcher.dc.html>) | ‹ › | Moves the period | \[New\] |
| [ScheduleDispatcher](<Design Artifact/Maintenance schedule (Field Coordinator, read only)-html/ScheduleDispatcher.dc.html>) | Card (click) | WorkOrder read only; cards cannot move | REQ-SCH-005 |

#### Action map: Vehicles and documents

| Screen | Control | What it does and where it goes | Ref |
| --- | --- | --- | --- |
| [Vehicles](<Design Artifact/Vehicles tab-html/Vehicles.dc.html>) | Vehicle tabs (Overview, Documents, Chassis and parts, WO history, Inspections) | C-06; each tab is its own artboard | C-06 |
| [Vehicles](<Design Artifact/Vehicles tab-html/Vehicles.dc.html>) | Add vehicle | [AddVehicle](<Design Artifact/Add vehicle with first documents-html/AddVehicle.dc.html>) | FLW-SA-01 |
| [Vehicles](<Design Artifact/Vehicles tab-html/Vehicles.dc.html>) | Parts baseline | PartsBaseline (only while the vehicle has no baseline; then Correct baseline per part) | FLW-SA-01 |
| [Vehicles](<Design Artifact/Vehicles tab-html/Vehicles.dc.html>) | Create Work Order | C-11 with the vehicle | FLW-PLN-02 |
| [Vehicles](<Design Artifact/Vehicles tab-html/Vehicles.dc.html>) | Create WO (alert row) | C-11 from that alert | FLW-PLN-02 |
| [Vehicles](<Design Artifact/Vehicles tab-html/Vehicles.dc.html>) | Vehicle in the list | Selects it (NAV-3) | C-07 |
| [VehicleOverview](<Design Artifact/Vehicles Overview tab-html/VehicleOverview.dc.html>) | Vehicle tabs, Add vehicle, Edit vehicle, Parts baseline, Create Work Order | As Vehicles; Edit vehicle → [VehicleEdit](<Design Artifact/Edit vehicle-html/VehicleEdit.dc.html>) | FLW-SA-03 |
| [VehicleOverview](<Design Artifact/Vehicles Overview tab-html/VehicleOverview.dc.html>) | Record reading | [VehicleOdometer](<Design Artifact/Vehicles odometer history and manual reading-html/VehicleOdometer.dc.html>) | FLW-SA-03 |
| [VehicleOverview](<Design Artifact/Vehicles Overview tab-html/VehicleOverview.dc.html>) | Odometer history | VehicleOdometer scrolled to the readings list, with Void per reading | FLW-SA-03, \[New\] |
| [VehicleOverview](<Design Artifact/Vehicles Overview tab-html/VehicleOverview.dc.html>) | Change (driver) | Change driver dialog: pick an active driver (or none) → Save; both drivers are notified | REQ-VEH-010, \[New\] dialog |
| [VehicleDocuments](<Design Artifact/Vehicles Documents tab-html/VehicleDocuments.dc.html>) | Vehicle tabs, Add vehicle, Edit vehicle, Parts baseline, Create Work Order | As VehicleOverview | C-06 |
| [VehicleDocuments](<Design Artifact/Vehicles Documents tab-html/VehicleDocuments.dc.html>) | Add document | AddDocument for that type | FLW-SA-02 |
| [VehicleDocuments](<Design Artifact/Vehicles Documents tab-html/VehicleDocuments.dc.html>) | View scan | [DocumentScan](<Design Artifact/View scan-html/DocumentScan.dc.html>) | FLW-SA-02 |
| [VehicleDocuments](<Design Artifact/Vehicles Documents tab-html/VehicleDocuments.dc.html>) | Open WO | WorkOrder of the renewal WO | NAV-5 |
| [VehicleDocuments](<Design Artifact/Vehicles Documents tab-html/VehicleDocuments.dc.html>) | Correct entry | DocumentCorrectEntry (only before the first renewal) | REQ-DOC-011 |
| [VehicleWOHistory](<Design Artifact/Vehicles WO history tab-html/VehicleWOHistory.dc.html>) | Vehicle tabs, Add vehicle, Edit vehicle, Parts baseline, Create Work Order | As VehicleOverview | C-06 |
| [VehicleWOHistory](<Design Artifact/Vehicles WO history tab-html/VehicleWOHistory.dc.html>) | Row (click) | [WorkOrder](<Design Artifact/Work Order detail-html/WorkOrder.dc.html>) | C-07 |
| [VehicleWOHistory](<Design Artifact/Vehicles WO history tab-html/VehicleWOHistory.dc.html>) | Document | WODocument of that WO | REQ-WOD-001 |
| [VehicleInspections](<Design Artifact/Vehicles Inspections tab (System Admin, P0)-html/VehicleInspections.dc.html>) | Vehicle tabs, Add vehicle, Edit vehicle, Parts baseline, Create Work Order | As VehicleOverview | C-06 |
| [VehicleInspections](<Design Artifact/Vehicles Inspections tab (System Admin, P0)-html/VehicleInspections.dc.html>) | Report breakdown | [AdminBreakdownForm](<Design Artifact/Report breakdown for a driver (P0)-html/AdminBreakdownForm.dc.html>) | FLW-SA-04 |
| [VehicleInspections](<Design Artifact/Vehicles Inspections tab (System Admin, P0)-html/VehicleInspections.dc.html>) | Record inspection | [AdminInspectionForm](<Design Artifact/Record inspection for a driver (P0)-html/AdminInspectionForm.dc.html>) | FLW-SA-04 |
| [BaselineCorrect](<Design Artifact/Correct parts baseline (System Admin)-html/BaselineCorrect.dc.html>) | Vehicle tabs, Add vehicle | As Vehicles | C-06 |
| [BaselineCorrect](<Design Artifact/Correct parts baseline (System Admin)-html/BaselineCorrect.dc.html>) | Correct baseline | Opens this side panel | REQ-BSL-005 |
| [BaselineCorrect](<Design Artifact/Correct parts baseline (System Admin)-html/BaselineCorrect.dc.html>) | Cancel | C-14 | C-14 |
| [BaselineCorrect](<Design Artifact/Correct parts baseline (System Admin)-html/BaselineCorrect.dc.html>) | Save correction | Needs a reason; refused once a WO touched the part | REQ-BSL-005 |
| [VehicleDeactivate](<Design Artifact/Deactivate vehicle (dialog)-html/VehicleDeactivate.dc.html>) | Vehicle tabs, Add vehicle | As Vehicles | C-06 |
| [VehicleDeactivate](<Design Artifact/Deactivate vehicle (dialog)-html/VehicleDeactivate.dc.html>) | Cancel | C-14 | C-14 |
| [VehicleDeactivate](<Design Artifact/Deactivate vehicle (dialog)-html/VehicleDeactivate.dc.html>) | Deactivate vehicle | Refused while a WO is open; needs a reason; the vehicle becomes Inactive | REQ-VEH-008 |
| [AddVehicle](<Design Artifact/Add vehicle with first documents-html/AddVehicle.dc.html>) | Upload (document scan) | Adds the scan for that document row (FileDrop) | REQ-DOC-008 |
| [AddVehicle](<Design Artifact/Add vehicle with first documents-html/AddVehicle.dc.html>) | Cancel | C-12 | C-12 |
| [AddVehicle](<Design Artifact/Add vehicle with first documents-html/AddVehicle.dc.html>) | Save and add parts | Saves the vehicle (Active, or Blocked when a required document is missing) → [PartsBaseline](<Design Artifact/Parts baseline (first entry)-html/PartsBaseline.dc.html>) | FLW-SA-01 |
| [VehicleEdit](<Design Artifact/Edit vehicle-html/VehicleEdit.dc.html>) | Deactivate vehicle | [VehicleDeactivate](<Design Artifact/Deactivate vehicle (dialog)-html/VehicleDeactivate.dc.html>) | FLW-SA-03 |
| [VehicleEdit](<Design Artifact/Edit vehicle-html/VehicleEdit.dc.html>) | Cancel | C-12 | C-12 |
| [VehicleEdit](<Design Artifact/Edit vehicle-html/VehicleEdit.dc.html>) | Save changes | Class and layout only while no tyre is mounted and no WO is open | REQ-VEH-003 |
| [VehicleOdometer](<Design Artifact/Vehicles odometer history and manual reading-html/VehicleOdometer.dc.html>) | Back to vehicle | C-28 | C-28 |
| [VehicleOdometer](<Design Artifact/Vehicles odometer history and manual reading-html/VehicleOdometer.dc.html>) | Cancel | C-12 | C-12 |
| [VehicleOdometer](<Design Artifact/Vehicles odometer history and manual reading-html/VehicleOdometer.dc.html>) | Save reading | Refused below the last reading; warns above 1.500 km a day | REQ-VEH-005 |
| [OdometerVoid](<Design Artifact/Void odometer reading (System Admin)-html/OdometerVoid.dc.html>) | Back to vehicle | C-28 | C-28 |
| [OdometerVoid](<Design Artifact/Void odometer reading (System Admin)-html/OdometerVoid.dc.html>) | Void | Opens the void dialog for that reading | REQ-VEH-006 |
| [OdometerVoid](<Design Artifact/Void odometer reading (System Admin)-html/OdometerVoid.dc.html>) | Keep reading | C-14 | C-14 |
| [OdometerVoid](<Design Artifact/Void odometer reading (System Admin)-html/OdometerVoid.dc.html>) | Void reading | Needs a reason; the reading is kept but voided; PM due recalculated | REQ-VEH-006 |
| [PartsBaseline](<Design Artifact/Parts baseline (first entry)-html/PartsBaseline.dc.html>) | Skip for now | Leaves without a baseline; the vehicle shows No baseline on DashboardAdmin | REQ-BSL-001 |
| [PartsBaseline](<Design Artifact/Parts baseline (first entry)-html/PartsBaseline.dc.html>) | Save baseline | Saves tyres and part items; the next due dates are computed | REQ-BSL-002 |
| [AdminInspectionForm](<Design Artifact/Record inspection for a driver (P0)-html/AdminInspectionForm.dc.html>) | Cancel | C-12 | C-12 |
| [AdminInspectionForm](<Design Artifact/Record inspection for a driver (P0)-html/AdminInspectionForm.dc.html>) | Save inspection | A Fail needs photo and description and drafts a WO | REQ-PM-004 |
| [AdminInspectionForm](<Design Artifact/Record inspection for a driver (P0)-html/AdminInspectionForm.dc.html>) | checklist-1024.jpg | C-29 | C-29 |
| [AdminBreakdownForm](<Design Artifact/Report breakdown for a driver (P0)-html/AdminBreakdownForm.dc.html>) | Cancel | C-12 | C-12 |
| [AdminBreakdownForm](<Design Artifact/Report breakdown for a driver (P0)-html/AdminBreakdownForm.dc.html>) | Send breakdown report | Drafts a WO with source Driver\_Breakdown | REQ-PM-005 |
| [Documents](<Design Artifact/Documents tab-html/Documents.dc.html>) | Create WO | C-11 for a document in Warning or Expired with no open renewal WO | FLW-SA-02 |
| [Documents](<Design Artifact/Documents tab-html/Documents.dc.html>) | Add (Missing cell) | AddDocument for that vehicle and type | FLW-SA-02 |
| [Documents](<Design Artifact/Documents tab-html/Documents.dc.html>) | Open WO-… | WorkOrder of the renewal WO | NAV-5 |
| [Documents](<Design Artifact/Documents tab-html/Documents.dc.html>) | View scan | [DocumentScan](<Design Artifact/View scan-html/DocumentScan.dc.html>) | FLW-SA-02 |
| [Documents](<Design Artifact/Documents tab-html/Documents.dc.html>) | Matrix cell | Selects it (NAV-3) | C-07 |
| [AddDocument](<Design Artifact/Add document (first entry)-html/AddDocument.dc.html>) | Cancel | C-12 | C-12 |
| [AddDocument](<Design Artifact/Add document (first entry)-html/AddDocument.dc.html>) | Save and add another | Saves and clears the form for the next document of the same vehicle | REQ-DOC-006 |
| [AddDocument](<Design Artifact/Add document (first entry)-html/AddDocument.dc.html>) | Save document | Saves; back to the page it came from | REQ-DOC-006 |
| [DocumentScan](<Design Artifact/View scan-html/DocumentScan.dc.html>) | Download | Saves the file; written to document\_view\_logs | REQ-DOC-009 |
| [DocumentScan](<Design Artifact/View scan-html/DocumentScan.dc.html>) | Back | C-28 | C-28 |
| [DocumentScan](<Design Artifact/View scan-html/DocumentScan.dc.html>) | ‹ › Zoom out 100% Zoom in Rotate | View only | REQ-FUP-016 |
| [DocumentCorrectEntry](<Design Artifact/Correct a first document entry (System Admin)-html/DocumentCorrectEntry.dc.html>) | Replace scan | Picks a new scan for the correction | REQ-DOC-011 |
| [DocumentCorrectEntry](<Design Artifact/Correct a first document entry (System Admin)-html/DocumentCorrectEntry.dc.html>) | Cancel | C-12 | C-12 |
| [DocumentCorrectEntry](<Design Artifact/Correct a first document entry (System Admin)-html/DocumentCorrectEntry.dc.html>) | Save correction | Needs a reason; logged | REQ-DOC-011 |
| [DocumentTypes](<Design Artifact/Settings Document types-html/DocumentTypes.dc.html>) | New document type | C-31 | C-31 |
| [DocumentTypes](<Design Artifact/Settings Document types-html/DocumentTypes.dc.html>) | Discard changes | C-16 | C-16 |
| [DocumentTypes](<Design Artifact/Settings Document types-html/DocumentTypes.dc.html>) | Save | C-17 | REQ-DOC-002 |

#### Action map: Inventory and tyres

| Screen | Control | What it does and where it goes | Ref |
| --- | --- | --- | --- |
| [Inventory](<Design Artifact/Inventory-html/Inventory.dc.html>), [GoodsReceipts](<Design Artifact/Inventory Goods Receipts-html/GoodsReceipts.dc.html>), [StockCard](<Design Artifact/Inventory Stock card-html/StockCard.dc.html>), [StockCardExport](<Design Artifact/Stock card Export-html/StockCardExport.dc.html>), [StockOpname](<Design Artifact/Inventory Stock opname-html/StockOpname.dc.html>), [Tyres](<Design Artifact/Inventory Tyres-html/Tyres.dc.html>), [RetreadList](<Design Artifact/Inventory Tyres, Retread-html/RetreadList.dc.html>), [TyreCount](<Design Artifact/Inventory Tyres, Tyre count-html/TyreCount.dc.html>), [TyreColumns](<Design Artifact/Tyres column chooser-html/TyreColumns.dc.html>), [TyreWornOut](<Design Artifact/Tyres confirm Worn out-html/TyreWornOut.dc.html>), [TyreScrap](<Design Artifact/Tyres confirm Scrap-html/TyreScrap.dc.html>) | Parts / Tyres | Switches the Inventory mode; remembered per user | NAV-7 |
| Same screens | Tabs (Stock, Goods Receipts, Stock card, Stock opname; Tyres, Retread, Tyre count) | C-06 | C-06 |
| [Inventory](<Design Artifact/Inventory-html/Inventory.dc.html>), [GoodsReceipts](<Design Artifact/Inventory Goods Receipts-html/GoodsReceipts.dc.html>) | Add part | [AddPart](<Design Artifact/Inventory Add part-html/AddPart.dc.html>) | FLW-WHM-04 |
| [Inventory](<Design Artifact/Inventory-html/Inventory.dc.html>), [GoodsReceipts](<Design Artifact/Inventory Goods Receipts-html/GoodsReceipts.dc.html>) | Goods Receipt | [GoodsReceiptForm](<Design Artifact/New Goods Receipt-html/GoodsReceiptForm.dc.html>) | FLW-WHM-03 |
| [Inventory](<Design Artifact/Inventory-html/Inventory.dc.html>) | Stock row | Selects the part; the stock card on the right follows; the part name opens PartDetail | NAV-3, \[New\] |
| [GoodsReceipts](<Design Artifact/Inventory Goods Receipts-html/GoodsReceipts.dc.html>) | Receipt row | [GoodsReceiptDetail](<Design Artifact/Goods Receipt detail-html/GoodsReceiptDetail.dc.html>) | FLW-WHM-03 |
| [StockCard](<Design Artifact/Inventory Stock card-html/StockCard.dc.html>) | Export | [StockCardExport](<Design Artifact/Stock card Export-html/StockCardExport.dc.html>) | FLW-WHM-04 |
| [StockCardExport](<Design Artifact/Stock card Export-html/StockCardExport.dc.html>) | Close / Cancel | C-14 | C-14 |
| [StockCardExport](<Design Artifact/Stock card Export-html/StockCardExport.dc.html>) | Export | Exports the stock card for the chosen part, period and format; logged | REQ-INV-008 |
| [StockOpname](<Design Artifact/Inventory Stock opname-html/StockOpname.dc.html>) | Save draft | C-15 | C-15 |
| [StockOpname](<Design Artifact/Inventory Stock opname-html/StockOpname.dc.html>) | Submit for approval | Refused while a row has a variance or Missing without a reason | REQ-INV-010 |
| [StockOpnameReturned](<Design Artifact/Stock opname returned by the approver-html/StockOpnameReturned.dc.html>) | Save draft | C-15 | C-15 |
| [StockOpnameReturned](<Design Artifact/Stock opname returned by the approver-html/StockOpnameReturned.dc.html>) | Submit for approval again | As StockOpname | FLW-WHM-05 |
| [GoodsReceiptForm](<Design Artifact/New Goods Receipt-html/GoodsReceiptForm.dc.html>) | Add item | Adds a part line (catalog search) | REQ-INV-004 |
| [GoodsReceiptForm](<Design Artifact/New Goods Receipt-html/GoodsReceiptForm.dc.html>) | Cancel | C-12 | C-12 |
| [GoodsReceiptForm](<Design Artifact/New Goods Receipt-html/GoodsReceiptForm.dc.html>) | Save draft | C-15 | C-15 |
| [GoodsReceiptForm](<Design Artifact/New Goods Receipt-html/GoodsReceiptForm.dc.html>) | Post receipt | Stock and average cost update at once; no approval; cannot be edited after | REQ-INV-005 |
| [GoodsReceiptDetail](<Design Artifact/Goods Receipt detail-html/GoodsReceiptDetail.dc.html>) | Back to Goods Receipts | C-28 | C-28 |
| [GoodsReceiptDetail](<Design Artifact/Goods Receipt detail-html/GoodsReceiptDetail.dc.html>) | Print | C-27 | C-27 |
| [GoodsReceiptDetail](<Design Artifact/Goods Receipt detail-html/GoodsReceiptDetail.dc.html>) | GR correction | GRCorrection for this receipt | FLW-WHM-03 |
| [GRCorrection](<Design Artifact/GR correction-html/GRCorrection.dc.html>) | Cancel | C-12 | C-12 |
| [GRCorrection](<Design Artifact/GR correction-html/GRCorrection.dc.html>) | Save draft | C-15 | C-15 |
| [GRCorrection](<Design Artifact/GR correction-html/GRCorrection.dc.html>) | Post correction | Needs a reason; linked to the original receipt | REQ-INV-006 |
| [GRCorrection](<Design Artifact/GR correction-html/GRCorrection.dc.html>) | INV-7781-rev.jpg | C-29 | C-29 |
| [AddPart](<Design Artifact/Inventory Add part-html/AddPart.dc.html>) | Cancel | C-12 | C-12 |
| [AddPart](<Design Artifact/Inventory Add part-html/AddPart.dc.html>) | Save part | Creates the part; SKU unique | REQ-INV-002 |
| [PartDetail](<Design Artifact/Inventory Part detail-html/PartDetail.dc.html>) | Back to stock | C-28 | C-28 |
| [PartDetail](<Design Artifact/Inventory Part detail-html/PartDetail.dc.html>) | Open stock card | StockCard for this part | REQ-INV-007 |
| [PartDetail](<Design Artifact/Inventory Part detail-html/PartDetail.dc.html>) | Edit part | [PartEdit](<Design Artifact/Inventory Edit part-html/PartEdit.dc.html>) | FLW-WHM-04 |
| [PartEdit](<Design Artifact/Inventory Edit part-html/PartEdit.dc.html>) | Deactivate part | PartDeactivate (only at quantity 0) | REQ-INV-003 |
| [PartEdit](<Design Artifact/Inventory Edit part-html/PartEdit.dc.html>) | Cancel | C-12 | C-12 |
| [PartEdit](<Design Artifact/Inventory Edit part-html/PartEdit.dc.html>) | Save changes | Quantity and average cost are never editable here | REQ-INV-002 |
| [PartDeactivate](<Design Artifact/Deactivate part (dialog)-html/PartDeactivate.dc.html>) | Cancel | C-14 | C-14 |
| [PartDeactivate](<Design Artifact/Deactivate part (dialog)-html/PartDeactivate.dc.html>) | Deactivate part | Refused when quantity is not 0 or an open WO uses it | REQ-INV-003 |
| [OpeningBalance](<Design Artifact/Inventory opening balance in Setup mode (System Admin)-html/OpeningBalance.dc.html>) | Add SKU | Adds a row | REQ-INV-013 |
| [OpeningBalance](<Design Artifact/Inventory opening balance in Setup mode (System Admin)-html/OpeningBalance.dc.html>) | Import from spreadsheet | Uses the SetupImport flow for entity opening\_balance (template, check, import all or nothing) | REQ-IAM-011, \[New\] |
| [OpeningBalance](<Design Artifact/Inventory opening balance in Setup mode (System Admin)-html/OpeningBalance.dc.html>) | Save draft | C-15 | C-15 |
| [OpeningBalance](<Design Artifact/Inventory opening balance in Setup mode (System Admin)-html/OpeningBalance.dc.html>) | Save opening balance | Setup mode only; closed for good at go-live | REQ-INV-013 |
| [Tyres](<Design Artifact/Inventory Tyres-html/Tyres.dc.html>), [TyreColumns](<Design Artifact/Tyres column chooser-html/TyreColumns.dc.html>), [TyreCount](<Design Artifact/Inventory Tyres, Tyre count-html/TyreCount.dc.html>), [RetreadList](<Design Artifact/Inventory Tyres, Retread-html/RetreadList.dc.html>) | Receive tyres | [ReceiveTyres](<Design Artifact/Receive tyres new tyres-html/ReceiveTyres.dc.html>) | FLW-WHM-06 |
| [Tyres](<Design Artifact/Inventory Tyres-html/Tyres.dc.html>), [TyreColumns](<Design Artifact/Tyres column chooser-html/TyreColumns.dc.html>), [TyreCount](<Design Artifact/Inventory Tyres, Tyre count-html/TyreCount.dc.html>), [RetreadList](<Design Artifact/Inventory Tyres, Retread-html/RetreadList.dc.html>) | Send to retread | RetreadDispatch with the selected Needs Retread tyres | FLW-WHM-07 |
| [Tyres](<Design Artifact/Inventory Tyres-html/Tyres.dc.html>) | Receive (open dispatch strip) | RetreadReceipt for that dispatch | FLW-WHM-07 |
| [Tyres](<Design Artifact/Inventory Tyres-html/Tyres.dc.html>) | Columns | [TyreColumns](<Design Artifact/Tyres column chooser-html/TyreColumns.dc.html>) | FLW-WHM-08 |
| [Tyres](<Design Artifact/Inventory Tyres-html/Tyres.dc.html>) | Worn out | [TyreWornOut](<Design Artifact/Tyres confirm Worn out-html/TyreWornOut.dc.html>) | FLW-WHM-08 |
| [Tyres](<Design Artifact/Inventory Tyres-html/Tyres.dc.html>) | Scrap | [TyreScrap](<Design Artifact/Tyres confirm Scrap-html/TyreScrap.dc.html>) | FLW-WHM-08 |
| [TyreColumns](<Design Artifact/Tyres column chooser-html/TyreColumns.dc.html>) | Close | C-14 | C-14 |
| [TyreColumns](<Design Artifact/Tyres column chooser-html/TyreColumns.dc.html>) | Reset to default | Restores the default columns in the panel | REQ-TYR-010 |
| [TyreColumns](<Design Artifact/Tyres column chooser-html/TyreColumns.dc.html>) | Apply | Saves the columns for this user | NAV-7 |
| [TyreWornOut](<Design Artifact/Tyres confirm Worn out-html/TyreWornOut.dc.html>) | Cancel | C-14 | C-14 |
| [TyreWornOut](<Design Artifact/Tyres confirm Worn out-html/TyreWornOut.dc.html>) | Confirm Worn out | Sets Worn Out with the reason | REQ-TYR-005 |
| [TyreScrap](<Design Artifact/Tyres confirm Scrap-html/TyreScrap.dc.html>) | Cancel | C-14 | C-14 |
| [TyreScrap](<Design Artifact/Tyres confirm Scrap-html/TyreScrap.dc.html>) | Scrap tyre | Final; needs a reason | REQ-TYR-005 |
| [TyreCount](<Design Artifact/Inventory Tyres, Tyre count-html/TyreCount.dc.html>) | Save draft | C-15 | C-15 |
| [TyreCount](<Design Artifact/Inventory Tyres, Tyre count-html/TyreCount.dc.html>) | Submit for approval | Each Missing tyre needs a reason and note | REQ-TYR-011 |
| [ReceiveTyres](<Design Artifact/Receive tyres new tyres-html/ReceiveTyres.dc.html>) | Receipt type switch | New tyres or Retread return (→ [RetreadReceipt](<Design Artifact/Receive tyres retread return-html/RetreadReceipt.dc.html>)) | FLW-WHM-06 |
| [ReceiveTyres](<Design Artifact/Receive tyres new tyres-html/ReceiveTyres.dc.html>) | Add tyre | Adds a row | REQ-TYR-006 |
| [ReceiveTyres](<Design Artifact/Receive tyres new tyres-html/ReceiveTyres.dc.html>) | Copy brand and size to new rows | Fills empty brand and size of new rows from the first row | \[New\] |
| [ReceiveTyres](<Design Artifact/Receive tyres new tyres-html/ReceiveTyres.dc.html>) | Cancel | C-12 | C-12 |
| [ReceiveTyres](<Design Artifact/Receive tyres new tyres-html/ReceiveTyres.dc.html>) | Save draft | C-15 | C-15 |
| [ReceiveTyres](<Design Artifact/Receive tyres new tyres-html/ReceiveTyres.dc.html>) | Confirm receipt | Each tyre In Stock with a generated code | REQ-TYR-006 |
| [RetreadList](<Design Artifact/Inventory Tyres, Retread-html/RetreadList.dc.html>) | Receive | RetreadReceipt for that dispatch | FLW-WHM-07 |
| [RetreadList](<Design Artifact/Inventory Tyres, Retread-html/RetreadList.dc.html>) | View | [RetreadDispatchDetail](<Design Artifact/Retread dispatch detail-html/RetreadDispatchDetail.dc.html>) | FLW-WHM-07 |
| [RetreadDispatch](<Design Artifact/Send tyres to retread-html/RetreadDispatch.dc.html>) | Add tyre | Adds a Needs Retread tyre | REQ-TYR-008 |
| [RetreadDispatch](<Design Artifact/Send tyres to retread-html/RetreadDispatch.dc.html>) | Cancel | C-12 | C-12 |
| [RetreadDispatch](<Design Artifact/Send tyres to retread-html/RetreadDispatch.dc.html>) | Save draft | C-15 | C-15 |
| [RetreadDispatch](<Design Artifact/Send tyres to retread-html/RetreadDispatch.dc.html>) | Confirm dispatch | Tyres become On Retread | REQ-TYR-008 |
| [RetreadDispatchDetail](<Design Artifact/Retread dispatch detail-html/RetreadDispatchDetail.dc.html>) | Back to Retread | C-28 | C-28 |
| [RetreadDispatchDetail](<Design Artifact/Retread dispatch detail-html/RetreadDispatchDetail.dc.html>) | Print | C-27 (delivery note) | REQ-TYR-008 |
| [RetreadReceipt](<Design Artifact/Receive tyres retread return-html/RetreadReceipt.dc.html>) | Cancel | C-12 | C-12 |
| [RetreadReceipt](<Design Artifact/Receive tyres retread return-html/RetreadReceipt.dc.html>) | Save draft | C-15 | C-15 |
| [RetreadReceipt](<Design Artifact/Receive tyres retread return-html/RetreadReceipt.dc.html>) | Confirm receipt | Accepted → In Stock (retread count +1); Rejected → Scrapped; Not returned yet stays On Retread | REQ-TYR-009 |

### 7.11 Design-question decisions (DQ)

The Action map (7.9) marks a few controls with a DQ code where the earlier review left the behaviour open. This table closes them; each decision is binding like the rest of the spec, and the matching 7.9 rows carry the detail. A DQ shown as Deferred is intentionally out of Release 1.

| ID | Question | Decision |
| --- | --- | --- |
| DQ-01 | What does "Notification settings" in the user menu do? | It lives on the mobile `MobileProfile` screen (and the web user menu): per-channel and per-event toggles for push and in-app notices, saved per account. P1. |
| DQ-02 | "Forgot password?" on `WebLogin` — email reset or "ask your Access Manager"? | A password reset link is sent to the account's email; the link opens a reset page and expires after a set time. The Access Manager can still issue a temporary password (REQ-IAM-009). |
| DQ-03 | The mobile "Profile" destination on every role's bottom bar. | One shared `MobileProfile` screen for every role: identity, notification settings (DQ-01), language, app and session info, Change password, Sign out. P1. |
| DQ-04 | The mobile "History" destination for the Mechanic and Supervisor/GM menus. | `MechanicMobileHistory` (the mechanic's past steps, returns and field findings) and `SupervisorMobileHistory` (the Supervisor/GM's past approval decisions), read only, opening each record. P1. |
| DQ-05 | DashboardAdmin "Integrations" rows — are they clickable, and to where? | They open a new `SettingsIntegrations` screen where the System Admin connects WhatsApp, the Protrack/Cartrack odometer API and other external tools (credentials, enable or disable, a connection test). P1; no artboard yet, follows 7.2. |
| DQ-06 | Can the creator (or the rejector) cancel a Rejected WO? | No. A rejected WO returns to its creator as a Draft that carries the rejector's note; there is no cancel or un-reject, and the rejector cannot revert the rejection. The creator edits the Draft and submits it for approval again (SM-WO T5). |
| DQ-07 | Who raises "Request amendment" on a WO — the creator or the step executor? | The executor of the open step raises a change request when they disagree with the WO creator's assignment design; it puts the WO in Pending Amendment and the WO creator (Planner or System Admin) receives and decides the amendment (REQ-CR-001, SM-WO T8 to T10). The WO creator never raises it against their own design. |
| DQ-08 | "Open trail on map" in `StepVerify` — which map, and is this employee tracking? | For a Mobilisasi step it opens, on an external map, the mechanic's location trail and destination. Since DEC-90 the trail is recorded only while the step is In\_Progress (not a continuous background feed and no longer a one-time capture on Mechanic Action); it is scoped to stooring verification, visible to Planner and System Admin only, with access logged, and the privacy handling of RSK-09 / UU PDP applies. |
| DQ-10 | FCRequests label "Complete and submit" — but the Field Coordinator cannot submit. | Rename the control to "Complete and send to Planner". The Field Coordinator completes the draft and sends it to the Planner, who submits it for approval (REQ-WO-016). |
| DQ-11 | The FCRequests / FCCreateWO "Cancel draft" dialog. | Built as `FCDraftCancel`: a required reason marks the draft Cancelled, notifies the reporter, and keeps the original report in the vehicle history; nothing is billed and no WO is created. |

## 8. Non-functional requirements

| ID | Area | Requirement |
| --- | --- | --- |
| NFR-01 | Data integrity | A goods issue, the stock decrement, the stock card row and the WO part line SHALL commit or roll back together; the same holds for every multi-table write named in 9.13. Submit, approve, post and issue actions SHALL be safe to retry (idempotent). |
| NFR-02 | Audit | Every state change, approval, verification, change request, amendment, stock movement, tyre status change, master data change and access change SHALL write an append-only audit record with user, role, time, before and after; a System Admin self-decision SHALL be flagged. |
| NFR-03 | Concurrency | IF two users save the same WO, part or placement, THEN the second save SHALL be refused with a clear message (optimistic lock on `version`). |
| NFR-04 | Security | Every action SHALL check the role on the server; inputs SHALL be validated on the server; queries SHALL be parameterized; API keys and secrets SHALL be encrypted at rest; the AI assistant SHALL use a read-only database account. |
| NFR-05 | Sign-in | Passwords SHALL be stored only as hashes, have at least 8 characters with letters and digits, and be changed at the first sign-in; 5 failed sign-ins SHALL lock the account for 15 minutes; a web session SHALL end after 30 minutes without activity and a mobile session after 30 days (REQ-IAM-009). |
| NFR-06 | Files | Only JPG, PNG, HEIC/HEIF and PDF SHALL be accepted, images up to 30 MB and PDFs up to 10 MB before compression \[A\]; video is never accepted (DEC-31). Images SHALL be compressed per the upload profiles of 8.1 (Photo 1600 px, Document image 2400 px) and only the compressed file and its thumbnail SHALL be kept \[A\]. Files SHALL be stored privately and served only to users who can see the record (NFR-13). Photos marked "camera" on mobile SHALL come from the camera. |
| NFR-07 | Deletion | Core records SHALL be soft-deleted, never physically deleted (`BR-10`). |
| NFR-08 | Tables | One field per column, every column sortable and filterable (7.2). |
| NFR-09 | Language and format | The interface SHALL be translatable (Indonesian and English); numbers SHALL use a dot for thousands and a comma for decimals (48.210 km, Rp 1.240.000, 2,4 mm); dates `YYYY-MM-DD`, times `HH:MM:SS`. |
| NFR-10 | Usability | Web screens SHALL be usable on a desktop and a tablet; the mobile app (R1 step 7 and P1) SHALL be mobile first; status colours carry a text label (green Active or Passed, yellow Warning or Pending, red Blocked or Expired). |
| NFR-11 | Extensibility | Telematics, push, WhatsApp and email providers SHALL plug in through adapters; modules, WO presets, classes, layouts, tyre statuses and document types SHALL be data (PR-6). |
| NFR-12 | Jobs | A daily job SHALL run document status, PM and part item alerts, schedule Missed marks and the Today list; jobs SHALL be idempotent and logged. |
| NFR-13 | File storage | Files SHALL be kept in S3-compatible object storage behind a storage adapter, Cloudflare R2 first \[A\] (DEC-32, ASM-28); the database SHALL hold only the object key and metadata (name, type, size, uploader). Files SHALL be private and opened through signed links that expire after a few minutes. Files are never deleted (BR-10); files older than 12 months SHALL move to the cheaper Infrequent Access class \[A\]. A daily job SHALL read total usage; WHEN usage reaches 80% of the budget set in Settings (default 50 GB), THE SYSTEM SHALL alert the System Admin. Sizing: under 100 vehicles and compressed photos give about 1 GB per month, about 12 GB per year. |
| NFR-14 | Time | Every date and time SHALL be stored in UTC and shown in Asia/Jakarta (WIB); a day (invoice day, stooring day, schedule day, daily job) is a WIB calendar day; the daily job SHALL run at 00:30 WIB. |
| NFR-15 | Numbering | Document numbers SHALL be running numbers that are never reused, also after cancel or void: WO-NNNN, CR-NNNN, GR-NNNN, GRC-NNNN, GI-NNNN, SA-NNNN, OB-NNNN, TR-NNNN, RD-NNNN, TC-NNNN, tyre codes TY-NNNN, invoices NNNN/BMI/dd-mm-yy (DEC-46); four digits, widening when needed; the formats live in one numbering configuration so the product owner can change them after the build without code changes. |
| NFR-16 | Money | Amounts SHALL be stored with 2 decimals and average costs with 4; a marked-up invoice price SHALL be rounded half up to a whole rupiah per unit before the line is multiplied, and PPN SHALL be computed on the subtotal and rounded half up to a whole rupiah. |
| NFR-17 | Backup and retention | The database SHALL be backed up daily and kept 1 year, with point-in-time restore for 7 days; files are never deleted while their record exists; audit logs SHALL be kept 1 year in the database; each month a job SHALL export the records older than 1 year to a read-only archive file in object storage (CSV, checksum logged) and only then delete them from the database (DEC-57); a restore SHALL be tested before go-live. |
| NFR-18 | Platforms | The web app SHALL run in current desktop Chrome and Edge. In Release 1 the mobile app SHALL run on Android phones from Android 8.0 (Oreo) upward with Google Play services (needed for push), installed from a signed APK outside the Play Store; the Expo SDK chosen SHALL still support Android 8.0, and an SDK upgrade that drops it needs the client's agreement; the iPhone app follows in Release 2 from the same code. Web and mobile SHALL reach the data only through the API server (8.2, DEC-66). |
| NFR-19 | Capacity | The system SHALL be sized for about 100 vehicles, 15 users and 100 to 500 WOs per month, and SHALL keep its response targets at three times that load (300 vehicles, 45 users, 1.500 WOs per month) without a change of design; at launch the smallest managed tiers are enough (one Cloud Run instance kept warm, a small Cloud SQL instance, a basic Redis), and they scale up by setting only. |

### 8.1 FUP: file upload and compression (P0)

Goal: every image is made small on the user's device before it travels, and the server checks and finishes the job, so storage grows by about 1 GB a month and no unchecked file reaches a record. The client compresses to save time and data; the server is the guard and never trusts the client. For the user it is seamless: they take or pick a file, keep filling the form and press Submit once; compression, upload, retries and checks run in the background and only a problem that needs them is ever shown.

**Upload profiles.** Each upload slot has one profile; the profile decides the size and quality.

| Profile | Used for | Accepted input | Stored output | Long side | Quality | Target size | Thumbnail |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Photo | Repair photos, inspection and breakdown photos, field findings | JPG, PNG, HEIC/HEIF, at most 30 MB | JPEG | 1600 px | 80%, then 70% and 60% while above 1 MB | 200 to 400 KB | 320 px, JPEG 70% |
| Document image | Invoices, receipts, delivery notes and document scans taken as a photo | JPG, PNG, HEIC/HEIF, at most 30 MB | JPEG | 2400 px | 85%, then 75% while above 1,5 MB | 400 to 800 KB | 320 px, JPEG 70% |
| PDF | Invoices, receipts and document scans as PDF | PDF, at most 10 MB, at most 20 pages \[A\] | PDF, unchanged | n/a | n/a | as uploaded | first page, 320 px |

Images are never upscaled. Transparency is flattened on white. Video and every other type are refused (DEC-31).

**Pipeline**

1. **Pick.** Web: drop or choose a file. Mobile (P1): the camera opens by default for Photo slots that require a camera photo; the gallery is allowed only where the slot allows it.
2. **Check on the device.** The type comes from the file content, not only its extension. A file that cannot be used (a video, a PDF above 10 MB or 20 pages, an image above 30 MB) shows one plain sentence at once and is never sent; every other file is accepted and converted without asking. Its thumbnail appears at once from the local copy.
3. **Compress on the device.** The image is rotated to its EXIF orientation, resized, re-encoded per profile and stripped of EXIF data. Only the capture time is kept, as metadata; GPS is removed \[A\]. The row shows original size and new size.
4. **Get an upload link.** The client asks the API for a signed upload link with profile, type and size. The API checks the user may upload to that record and step, then creates a `stored_files` row with status Pending.
5. **Upload straight to storage.** The file goes from the device to object storage, never through the app server's disk. Mobile keeps the file in a local queue until it is uploaded, so a lost connection only delays it.
6. **Finish on the server.** A worker checks the file again: real type, size and dimensions within the profile. If the client did not compress (an old app or a direct call), the worker compresses it with the same profile. It writes the thumbnail, the SHA-256 hash, final size, width, height and page count, and sets status Ready, or Rejected with a reason.
7. **Attach.** The form saves only references to Ready files, and evidence rules (for example "at least one repair photo") count only Ready files. The user never waits for this: pressing Submit while files are still on their way shows "Sending when photos finish", the user may leave the screen, and the app submits by itself the moment the last file is Ready.
8. **Serve.** Lists and previews load the thumbnail and a click opens the full file, both through signed links that expire after 5 minutes \[A\].

| ID | P | Requirement | Screens | Data |
| --- | --- | --- | --- | --- |
| REQ-FUP-001 | P0 | THE SYSTEM SHALL give every upload slot one profile (Photo, Document image or PDF) and apply that profile's limits and output. | [`FileUploadStates`](<Design Artifact/Component file upload, seamless (FileDrop)-html/FileUploadStates.dc.html>), step screens, forms | `stored_files.profile` |
| REQ-FUP-002 | P0 | IF a file is not JPG, PNG, HEIC/HEIF or PDF by its content, is an image above 30 MB, or is a PDF above 10 MB or 20 pages, THEN THE SYSTEM SHALL refuse it on the device with one plain sentence and refuse it again on the server; every other file SHALL be accepted and converted without asking the user anything. | [`FileUploadStates`](<Design Artifact/Component file upload, seamless (FileDrop)-html/FileUploadStates.dc.html>) |  |
| REQ-FUP-003 | P0 | WHEN an image is picked, THE SYSTEM SHALL auto-rotate, resize, re-encode to JPEG and strip EXIF per its profile on the device before upload, and show original and new size. | [`FileUploadStates`](<Design Artifact/Component file upload, seamless (FileDrop)-html/FileUploadStates.dc.html>) | `stored_files.original_bytes`, `stored_bytes` |
| REQ-FUP-004 | P0 | THE SYSTEM SHALL upload files directly from the device to object storage through a signed link issued only after a permission check; the app server SHALL NOT store files on its own disk. |  | `stored_files` |
| REQ-FUP-005 | P0 | WHEN an upload lands, THE SYSTEM SHALL re-check type, size and dimensions, compress it if it is still above its profile, create the thumbnail, store the SHA-256 hash and set Ready or Rejected with a reason. |  | `stored_files.status`, `sha256` |
| REQ-FUP-006 | P0 | WHEN the user presses Submit while files are still in progress, THE SYSTEM SHALL show "Sending when photos finish", let the user leave the screen and submit automatically once every file is Ready; IF a file fails for good, THEN the step SHALL stay a draft and the user SHALL get one notification naming the file to fix. The server SHALL still refuse a submit that references a file that is not Ready. | step screens |  |
| REQ-FUP-007 | P0 | THE SYSTEM SHALL show the user only three states on each thumbnail: in progress (a ring that covers checking, compressing, uploading, processing and, on mobile, waiting for signal), done (a check mark) and needs attention (a red badge with one action, Retry or Remove). Sizes, profile and technical states SHALL appear only in the file's detail panel. | [`FileUploadStates`](<Design Artifact/Component file upload, seamless (FileDrop)-html/FileUploadStates.dc.html>) |  |
| REQ-FUP-008 | P0 | THE SYSTEM SHALL never change or delete a Ready file that is attached to a record; replacing a file adds a new one and keeps the old one in history. |  | `stored_files` |
| REQ-FUP-009 | P0 | WHEN a Pending or Rejected file is not attached to any record after 24 hours, THE SYSTEM SHALL delete it from storage and mark the row Expired; these are not core records. |  | `stored_files.status` |
| REQ-FUP-010 | P0 | THE SYSTEM SHALL limit a step to 10 photos and 5 documents \[A\]. | step screens |  |
| REQ-FUP-011 | P1 | WHILE the mobile app is offline, THE SYSTEM SHALL keep compressed files in a local queue and upload them when the connection returns; for the R1 mobile roles this is P0 together with REQ-MOB-009. | mobile step screens |  |
| REQ-FUP-012 | P0 | WHEN a file is picked, THE SYSTEM SHALL show its thumbnail at once from the local copy and compress and upload it in the background while the user keeps filling the form. | [FileUploadStates](<Design Artifact/Component file upload, seamless (FileDrop)-html/FileUploadStates.dc.html>), [MechanicMobileUpload](<Design Artifact/Mobile app, Mechanic menu seamless photo upload (P1)-html/MechanicMobileUpload.dc.html>) | stored\_files |
| REQ-FUP-013 | P0 | IF an upload fails, THEN THE SYSTEM SHALL retry by itself up to 3 times with growing waits, and again whenever the connection returns, and SHALL ask the user only after that. | [FileUploadStates](<Design Artifact/Component file upload, seamless (FileDrop)-html/FileUploadStates.dc.html>) | stored\_files |
| REQ-FUP-014 | P0 | THE SYSTEM SHALL keep picked files with the step draft, so leaving and reopening the step keeps them. On the web, leaving while a file is still uploading SHALL ask once; on mobile (P1) uploads SHALL continue in the background. | step screens | stored\_files |
| REQ-FUP-015 | P1 | THE SYSTEM SHALL let the mobile camera take several photos in a row without leaving the camera, each added to the slot. | [MechanicMobileUpload](<Design Artifact/Mobile app, Mechanic menu seamless photo upload (P1)-html/MechanicMobileUpload.dc.html>) | stored\_files |
| REQ-FUP-016 | P0 | WHEN a user opens any photo or file thumbnail, THE SYSTEM SHALL show it in one shared viewer: the full image with zoom and pan, previous and next across the same record, a PDF page by page, and the file's details (step, slot, taken at, uploaded by and role, time). The viewer SHALL be read only except for the uploader before submit (Remove). | [PhotoViewer](<Design Artifact/Component photo and file viewer (dialog)-html/PhotoViewer.dc.html>) | stored\_files |

| ID | Verifies | Acceptance criterion |
| --- | --- | --- |
| AC-FUP-001 | REQ-FUP-003 | WHEN a 4,2 MB 4032 × 3024 phone photo is added to a repair photo slot, THE SYSTEM SHALL store a JPEG of 1600 × 1200 below 1 MB without EXIF GPS, plus a 320 px thumbnail. |
| AC-FUP-002 | REQ-FUP-002 | IF an MP4 file renamed to .jpg is picked, THEN THE SYSTEM SHALL refuse it on the device; IF it is sent directly to the API, THEN the server SHALL set it Rejected. |
| AC-FUP-003 | REQ-FUP-005 | WHEN an uncompressed 8 MB JPEG reaches storage, the worker SHALL compress it to the Photo profile before setting Ready. |
| AC-FUP-004 | REQ-FUP-006 | WHEN Submit step is pressed while one photo is still uploading, the step SHALL be submitted automatically once that photo is Ready, without a second tap. |
| AC-FUP-005 | REQ-FUP-002 | WHEN a 1,8 MB PDF invoice is uploaded, it SHALL be stored unchanged with a first-page thumbnail. |
| AC-FUP-006 | REQ-FUP-009 | WHEN a photo is uploaded but the form is cancelled, the file SHALL be gone from storage after 24 hours. |
| AC-FUP-007 | REQ-FUP-013 | WHEN the signal drops during an upload on the phone and returns 5 minutes later, the photo SHALL finish uploading with no action from the user. |
| AC-FUP-008 | REQ-FUP-002 | WHEN a 14 MB camera photo is picked, it SHALL be accepted and stored below 1 MB, with no message to the user. |
| AC-FUP-009 | REQ-FUP-007 | The words Compressing, Processing and file sizes SHALL NOT appear on the thumbnails; they appear only in the file's detail panel. |

### 8.2 Technology stack and architecture (DEC-66)

The system is built by AI coding agents and finished by internal developers (code review, hardening, deployment). The stack therefore uses one language end to end, one repository and one source for every shared rule, so an agent never has to keep two versions of the same logic in sync.

**Architecture.** The web app and the mobile app are two clients of one API server. Only the API server connects to the database and the file storage; no client ever connects to the database directly. Every business rule, transaction (TX-01 onward), permission check, scope lock and numbering runs on the server, so the web and the phone always see the same data and the same rules (REQ-MOB-002).

```
Web app (desktop browser) ──┐
                            ├──►  API server  ──►  PostgreSQL
Mobile app (Android APK) ───┘         │
                                      ├──►  Object storage (photos, PDFs)
                                      └──►  Job queue (alerts, archive, PDFs)
```

| Layer | Choice | Notes |
| --- | --- | --- |
| Language | TypeScript (strict) everywhere | Web, mobile, API and shared code |
| Repository | One monorepo with pnpm workspaces and Turborepo | apps/web, apps/mobile, apps/api, packages/shared |
| Shared package | packages/shared | Enums of 9.1, status machines of section 3, validation schemas (Zod), rule constants (tolerances, markup, numbering formats) and the API types; web, mobile and API import it, never copy it |
| API server | NestJS on Node.js, REST with JSON | An OpenAPI description is generated from the code and the web and mobile clients are generated from it |
| Database | PostgreSQL on Google Cloud SQL (Jakarta) | Schema of section 9 as plain SQL migration files; Drizzle ORM for queries; enums, CHECKs and triggers stay in the database |
| File storage | Cloudflare R2 behind the storage adapter (NFR-13, DEC-32) | Photos and PDFs; the client compresses (8.1) and uploads with a short-lived signed URL; the database keeps only the key |
| Web app | Next.js (React) | Desktop browser only; calls the API, holds no business rule beyond form checks from packages/shared |
| Mobile app | React Native with Expo | Android only in Release 1; iPhone (iOS) in Release 2 from the same code |
| Mobile device features | Expo camera and image picker, Expo location, Expo SQLite, Expo secure store, Expo notifications | Camera photos, driver location captured once at breakdown report and the mechanic's location trail while a Mobilisasi step is In\_Progress (REQ-MOB-003, REQ-MBL-005), offline drafts and photo queue (REQ-MOB-009, REQ-FUP-011), token storage, push |
| Sign-in | Own accounts in the API; short-lived access token and refresh token | Password rules of NFR-05; tokens on the phone are kept in secure storage |
| Push | Firebase Cloud Messaging through the Expo push service | In-app notifications are written by the API (NTF) and pushed to the phone |
| Background jobs | BullMQ on Redis | PM and late-WO alerts, monthly audit archive (NFR-17), PDF rendering, exports |
| PDF and exports | Server side: HTML templates rendered with headless Chromium; xlsx and CSV with ExcelJS | WO document, invoice PDF, stock card and report exports |
| Hosting | Google Cloud, Jakarta region, with Cloudflare in front (DEC-67) | Cloud Run for the API, the workers and the web app; Cloud SQL for PostgreSQL with daily backup and point-in-time restore (NFR-17); Memorystore for Redis; Secret Manager for the release keystore and secrets; files on Cloudflare R2; Cloudflare DNS, TLS and attack protection in front of the web app and the API |
| Environments | Development, staging, production | Setup mode and Go live happen in production |
| Tests | Vitest for shared rules and services; API integration tests against a real PostgreSQL; Playwright for web flows | The acceptance criteria of section 4 are the test cases |

**Android distribution.** The mobile app is delivered as an installable APK, not through the Play Store, in Release 1:

1. Build with EAS Build using a profile with buildType apk (a local Gradle build gives the same file). A Play Store build (.aab) can come from the same code later.
2. Every build is signed with one release keystore kept in Google Secret Manager; losing it means installed apps can no longer be updated.
3. The APK is shared by a download link; each phone allows "Install unknown apps" once.
4. Changes to screens and logic reach the phones as over-the-air updates (EAS Update) without reinstalling; a change to native features or permissions needs a new APK.
5. On first use the app asks the Android permissions for camera, location and notifications; position capture stays invisible in the screens, but the operating system permission is still asked once.

**Working rules for the agents.** Build the API contract first; a screen is built only against a generated client. Put every enum, status, validation and constant in packages/shared. A module of the registry (4.3) is one folder in the API plus one step screen in web and mobile, wired only through its registry row (REQ-REG-006). Internal developers review every merge to the main branch, own the release keystore and the cloud accounts, and run the production deployments.

### 8.3 Engineering practices that reduce delivery risk (DEC-78)

These practices are binding for the implementing agents and the internal developers; code review rejects a change that breaks one of them. They change no behaviour of the system.

| Area | Practice |
| --- | --- |
| WO lifecycle (4.1) | One transition table per state machine of section 3 in packages/shared and one transition endpoint on the server; an automated test for every allowed and every refused transition |
| Assignment engine (4.2) | Built and tested first with a dummy module, before any real module; the steps of a WO are frozen as a JSON snapshot when it is approved; the engine package may not import any module package, checked in CI |
| Module registry (4.3) | Stock and Mechanic Action are built first as the reference modules; one contract test suite that every module, current or future, must pass |
| Stock and inventory (4.4, 4.13) | The stock card is the single source of truth (a ledger); stock and average cost are computed by one function; a lock per SKU during a stock transaction; corrections are always reversing entries, never edits of old rows; a daily reconciliation job alerts on any difference |
| Part Purchase (4.4a) | Line and grand totals use the same function on client and server, from packages/shared, with decimal arithmetic, never floating point |
| Mechanic Action (4.5) | Photo rules run on the server; the Mechanic Action step no longer reads or stores any position (REQ-MEC-008 retired) |
| Mobilisasi (4.5a) | The stooring fee (one per WO per region per day) and the auto-submit-on-arrival run on the server; the mechanic's location trail is accepted only between Start and Submit of the step, stored for the verifier, and every read is access-logged (REQ-MBL-005, REQ-MBL-006, RSK-09) |
| Chassis map (4.6) | The map component is built first as a separate library, with fixtures for every launch layout and generated layouts (DEC-73) and an image snapshot test per layout |
| Tyres and retread (4.14) | Every tyre status change goes through one service that always writes tyre\_events; the tyre transition table is tested like the WO one |
| Baseline, PM and part age (4.11, 4.12) | One life-used function (km or days, days only for a Towed unit) shared by tyres, part items and PM |
| Daily jobs (documents, PM, late WOs) | Every job is idempotent and guarded by a unique index; staging offers a dry run that lists the alerts a job would create |
| WO document and invoice PDF (4.9, 4.23) | One template engine; the document data is frozen when the WO completes; PDFs are rendered in a worker; golden-file tests compare each PDF with an approved sample |
| Approvals (4.15) | One policy function canApprove(user, object) for every kind of approval, including four-eyes, System Admin self-approval and the Planner switch |
| Access (4.18) | A capability guard on every endpoint through a decorator, never only in the UI; the role x capability test matrix is generated from the permission table of section 2 |
| Notifications (4.19) | Outbox pattern: a notification is written in the same transaction as its event and sent by a worker with a dedupe key |
| File upload (8.1) | A proven compression library on web and phone; an idempotency key on every upload; automatic retry on a weak signal |
| Invoices (4.23) | The invoice number comes from a database sequence inside the Issue transaction; a Draft has no number |
| Schedule (4.17) | A mature drag-and-drop library; the server decides, the screen only proposes |
| Dashboards and reports (4.16, 4.21) | Aggregates come from views or a cache refreshed on a schedule, not recomputed on every page open |
| Mobile app (4.20) | A small mobile spike in R1 step 1 (sign-in, camera, position, push, APK build on an Android 8 phone), although the full app comes in step 7 |
| All areas | The example data of the design canvas seeds staging; every acceptance criterion of this spec is an automated test in CI; staging can always be reset to Setup mode |

### 8.4 Risk tiers: where to spend the most effort (DEC-79)

The areas below carry the highest delivery risk. Their section headings in 4 are marked risk: critical or risk: high. An agent working in a marked area spends more of its effort there than the size of the area suggests, and follows the extra rules of its tier.

| Tier | Areas | Why | Extra rules |
| --- | --- | --- | --- |
| Critical | 4.2 ENG assignment engine, 4.3 REG module registry | Every module and every WO runs on them; a design mistake spreads to all of them | Built first in its step and before any module; design note reviewed by an internal developer before coding; contract and transition tests with a dummy module; two reviewers per merge |
| High | 4.1 WO lifecycle, 4.4 STK Stock step, 4.13 INV inventory, 4.6 PLC Part Replacement and chassis map, 4.20 MOB mobile app | Money, stock and status consistency across modules; offline phones; one map component for every unit type | Built at the start of its release step; concurrency tests for stock; image snapshot tests for every layout; mobile spike in R1 step 1; an internal developer reviews every merge |
| Normal | Every other area | Standard rules and validation | The practices of 8.3 and the acceptance criteria of 4 |

A tier is about delivery effort, not priority: every P0 area is still required for Release 1.

## 9. Data model

This is the final schema in PostgreSQL syntax, the database of 8.2; any relational database with transactions can implement it. It already includes every later decision, so there are no ALTER steps to replay. File columns (file\_url, photo\_url, receipt\_url) hold the storage\_key of a Ready row in stored\_files (9.12), never a public URL (8.1, NFR-13). Tables appear in dependency order except where 9.13 notes a circular key.

### 9.0 Conventions

- Every table has `id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY`, `created_at TIMESTAMP NOT NULL DEFAULT now()` and `updated_at TIMESTAMP`; they are left out below.
- `-- SD` = soft delete (`deleted_at TIMESTAMP`); unique indexes on such tables ignore deleted rows. Every foreign key is `ON DELETE RESTRICT`.
- `-- OL` = optimistic lock (`version INT NOT NULL DEFAULT 1`).
- `-- AO` = append-only: no UPDATE or DELETE is allowed.
- Money `NUMERIC(14,2)`, unit cost `NUMERIC(14,4)`; dates `DATE`, timestamps `TIMESTAMP`.
- `-- guard` = also enforced in the service layer (section 5); the database check is the second line of defence.

### 9.1 Enumerations

```sql
CREATE TYPE role_t            AS ENUM ('Planner','Mechanic','Warehouse_Manager','Supervisor','GM','System_Admin','Access_Manager','Driver','Field_Coordinator','Accounting');
CREATE TYPE vehicle_status_t  AS ENUM ('Active','Repair','Blocked','Inactive');
CREATE TYPE doc_status_t      AS ENUM ('Valid','Warning','Expired','Missing');
CREATE TYPE odo_source_t      AS ENUM ('Admin','Driver','GPS');
CREATE TYPE trigger_t         AS ENUM ('Mileage','Time');
CREATE TYPE alert_type_t      AS ENUM ('PM','Part_Item','Tyre','Document');
CREATE TYPE alert_status_t    AS ENUM ('Pending','Converted_To_WO','Dismissed');
CREATE TYPE wo_status_t       AS ENUM ('Draft','Pending_Approval','Rejected','Active','In_Progress','Pending_Verification','Pending_Amendment','Completed','Cancelled');
CREATE TYPE wo_source_t       AS ENUM ('System_PM','Tyre_Alert','Document_Alert','Driver_DVIR','Driver_Breakdown','Part_Check','Manual_Planner','Manual_Mechanic','Manual_Field_Coordinator','Manual_Admin');
CREATE TYPE wo_category_t     AS ENUM ('PM','Corrective','Tyre','Document','Other');   -- DEC-85
CREATE TYPE asg_status_t      AS ENUM ('Locked','Open','In_Progress','Submitted','Verified','Skipped');
CREATE TYPE approval_stage_t  AS ENUM ('Creation','Completion','Amendment');
CREATE TYPE approval_action_t AS ENUM ('Submit','Approve','Reject','Cancel','Request_Completion');
CREATE TYPE cr_status_t       AS ENUM ('Submitted','In_Revision','Pending_Approval','Approved','Rejected');
CREATE TYPE part_source_t     AS ENUM ('Warehouse');   -- the Stock step cuts stock only; outside purchases live in work_order_purchases (DEC-60)
CREATE TYPE invoice_status_t  AS ENUM ('Draft','Issued','Paid','Void');
CREATE TYPE location_capture_t AS ENUM ('Captured','Denied','Unavailable');
CREATE TYPE team_t            AS ENUM ('Internal','External');
CREATE TYPE attachment_t      AS ENUM ('Invoice','Repair_Photo','Document_Scan','Receipt','DVIR_Photo','Check_Photo');
CREATE TYPE tyre_type_t       AS ENUM ('Tube','Tubeless');
CREATE TYPE placement_act_t   AS ENUM ('Baseline','Mount','Rotate','Demount','Scrap');
CREATE TYPE stock_tx_t        AS ENUM ('OB','GR','GRC','GI','GIR','SA');   -- opening balance, receipt, receipt correction, issue, issue reversal, stock opname
CREATE TYPE reason_t          AS ENUM ('Damaged','Entry_Error','Lost','Found');
CREATE TYPE ai_provider_t     AS ENUM ('OpenAI','Anthropic');
-- Modules and tyre statuses are rows, not enums: assignment_modules (9.6), tyre_statuses (9.9).
```

### 9.2 Identity, access and audit

```sql
CREATE TABLE users (                          -- SD
  name VARCHAR(100) NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  failed_logins SMALLINT NOT NULL DEFAULT 0,
  must_change_password BOOLEAN NOT NULL DEFAULT true,   -- REQ-IAM-009
  locked_until TIMESTAMP                      -- 5 failed sign-ins lock 15 minutes [A]
);
CREATE TABLE user_roles (
  user_id BIGINT NOT NULL REFERENCES users(id),
  role role_t NOT NULL,
  PRIMARY KEY (user_id, role)
);
CREATE UNIQUE INDEX uq_one_role_per_user ON user_roles (user_id);                            -- BR-14
CREATE UNIQUE INDEX uq_one_system_admin  ON user_roles (role) WHERE role = 'System_Admin';   -- BR-14
CREATE TABLE role_permissions (               -- [A] permission matrix of 2.2, edited by the Access Manager
  role role_t NOT NULL,
  permission_code VARCHAR(60) NOT NULL,       -- for example wo.create, wo.approve, stock.issue
  allowed BOOLEAN NOT NULL,
  is_locked BOOLEAN NOT NULL DEFAULT false,   -- fixed by a business rule; cannot be changed
  PRIMARY KEY (role, permission_code)
);
CREATE TABLE audit_logs (                     -- AO
  entity VARCHAR(60) NOT NULL,
  entity_id BIGINT NOT NULL,
  action VARCHAR(40) NOT NULL,
  before JSONB,
  after JSONB,
  reason TEXT,
  user_id BIGINT REFERENCES users(id),
  user_role role_t,
  self_decision BOOLEAN NOT NULL DEFAULT false,   -- Self-approved or Self-verified
  at TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX ix_audit_entity ON audit_logs (entity, entity_id);
-- Moving System_Admin (Access_Manager only): one transaction deletes the old user_roles row, inserts the new one, writes audit_logs.
-- Service layer: refuse to deactivate or soft-delete the user who holds System_Admin.
```

### 9.3 Fleet, chassis and odometer

```sql
CREATE TABLE chassis_layouts (
  code VARCHAR(40) NOT NULL,
  name VARCHAR(100) NOT NULL,
  version INT NOT NULL DEFAULT 1,
  definition JSONB NOT NULL,                  -- axles in order: role (Steer, Drive, Trailer), tyres per side (1 or 2), spacing; front drawing (None, Fifth_wheel, Kingpin); spare_count (REQ-PLC-017)
  axle_count SMALLINT NOT NULL CHECK (axle_count > 0),
  tyre_count SMALLINT NOT NULL CHECK (tyre_count > 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (code, version)
);
CREATE TABLE vehicle_classes (
  code VARCHAR(30) NOT NULL UNIQUE,           -- Tractor_Head, Trailer_Tail, Wingbox_Rigid, Pickup_Patrol, Light_Van, future classes
  unit_kind VARCHAR(7) NOT NULL DEFAULT 'Powered' CHECK (unit_kind IN ('Powered','Towed')),   -- Towed: no odometer, days only (REQ-PLC-018)
  name VARCHAR(100) NOT NULL,
  default_chassis_layout_id BIGINT NOT NULL REFERENCES chassis_layouts(id),
  is_active BOOLEAN NOT NULL DEFAULT true
);
CREATE TABLE part_positions (                 -- generated from a layout's definition when the layout is saved
  chassis_layout_id BIGINT NOT NULL REFERENCES chassis_layouts(id),
  code VARCHAR(40) NOT NULL,                  -- for example A2_LO
  position_kind VARCHAR(5) NOT NULL DEFAULT 'Wheel' CHECK (position_kind IN ('Wheel','Spare')),   -- REQ-PLC-019
  axle_index SMALLINT,                        -- NULL for a Spare position
  side VARCHAR(5) CHECK (side IN ('Left','Right')),   -- NULL for a Spare position
  CHECK (position_kind = 'Spare' OR (axle_index IS NOT NULL AND side IS NOT NULL)),
  ordinal SMALLINT NOT NULL,                  -- inner or outer on a dual axle
  label VARCHAR(80) NOT NULL,
  UNIQUE (chassis_layout_id, code)
);
CREATE TABLE vehicles (                       -- SD, OL
  license_plate VARCHAR(20) NOT NULL UNIQUE,
  vin VARCHAR(30) UNIQUE,
  engine_number VARCHAR(30),
  vehicle_class_id BIGINT NOT NULL REFERENCES vehicle_classes(id),
  chassis_layout_id BIGINT NOT NULL REFERENCES chassis_layouts(id),   -- layout version in use
  brand VARCHAR(50), model VARCHAR(50), year SMALLINT,
  fuel_type VARCHAR(20),
  customer_id BIGINT REFERENCES customers(id),   -- REQ-BIL-001; NULL = not billable (9.14)
  current_odometer INT NOT NULL DEFAULT 0 CHECK (current_odometer >= 0),   -- latest reading that is not voided, mainly from the Driver's daily inspection (DEC-76); stays 0 for a Towed unit (REQ-PLC-018); axle and tyre counts are read from the layout (DEC-80)
  status vehicle_status_t NOT NULL DEFAULT 'Active',                       -- derived (SM-VEH)
  deactivated_at TIMESTAMP,
  deactivate_reason TEXT,
  version INT NOT NULL DEFAULT 1
);
CREATE TABLE drivers (                        -- SD
  user_id BIGINT UNIQUE REFERENCES users(id), -- the driver's mobile account (R1 step 7); NULL until it is created
  name VARCHAR(100) NOT NULL,
  assigned_vehicle_id BIGINT REFERENCES vehicles(id)
);
CREATE TABLE odometer_logs (
  vehicle_id BIGINT NOT NULL REFERENCES vehicles(id),
  reading INT NOT NULL CHECK (reading > 0),
  reading_at TIMESTAMP NOT NULL,              -- when it was read, not when entered
  source odo_source_t NOT NULL,
  note TEXT,
  jump_warning BOOLEAN NOT NULL DEFAULT false,   -- more than 1.500 km per day
  recorded_by BIGINT REFERENCES users(id),
  void_requested_by BIGINT REFERENCES users(id), -- [A]
  voided_at TIMESTAMP,
  voided_by BIGINT REFERENCES users(id),      -- must hold System_Admin
  void_reason TEXT,
  CHECK (voided_at IS NULL OR (voided_by IS NOT NULL AND void_reason IS NOT NULL))
);
-- trigger (BR-09): reading >= the last reading of the vehicle WHERE voided_at IS NULL; then refresh vehicles.current_odometer
```

### 9.4 Documents

```sql
CREATE TABLE document_types (
  code VARCHAR(30) NOT NULL UNIQUE,           -- STNK_Annual, STNK_5Year, KIR, Insurance, ...
  name VARCHAR(100) NOT NULL,
  usual_validity_months SMALLINT,             -- prefills the new expiry on renewal (REQ-DOC-007)
  warning_days SMALLINT NOT NULL DEFAULT 30 CHECK (warning_days > 0),  -- also edited in Settings: Alert rules (DEC-86)
  preset_id BIGINT REFERENCES wo_presets(id), -- preset of the WO its expiry alert drafts (REQ-PM-008)
  receipt_required BOOLEAN NOT NULL DEFAULT true,
  is_active BOOLEAN NOT NULL DEFAULT true
);
CREATE TABLE document_type_classes (          -- which classes must have the type
  document_type_id BIGINT NOT NULL REFERENCES document_types(id),
  vehicle_class_id BIGINT NOT NULL REFERENCES vehicle_classes(id),
  PRIMARY KEY (document_type_id, vehicle_class_id)
);
CREATE TABLE vehicle_documents (              -- SD, the current document per type
  vehicle_id BIGINT NOT NULL REFERENCES vehicles(id),
  document_type_id BIGINT NOT NULL REFERENCES document_types(id),
  document_number VARCHAR(60) NOT NULL,
  issuer VARCHAR(150),
  issue_date DATE,
  expiry_date DATE NOT NULL,
  status doc_status_t NOT NULL DEFAULT 'Valid',   -- set by the daily job; Missing is derived for a required type with no row
  file_url VARCHAR(500) NOT NULL
);
CREATE UNIQUE INDEX uq_vehicle_doc ON vehicle_documents (vehicle_id, document_type_id) WHERE deleted_at IS NULL;
CREATE TABLE document_corrections (           -- Correct entry, only before the first renewal
  vehicle_document_id BIGINT NOT NULL REFERENCES vehicle_documents(id),
  field VARCHAR(30) NOT NULL,
  old_value TEXT, new_value TEXT,
  reason TEXT NOT NULL,
  corrected_by BIGINT NOT NULL REFERENCES users(id),   -- must hold System_Admin
  corrected_at TIMESTAMP NOT NULL DEFAULT now()
);   -- guard: refused when document_renewals has a row for the document
CREATE TABLE document_view_logs (             -- AO
  vehicle_document_id BIGINT NOT NULL REFERENCES vehicle_documents(id),
  action VARCHAR(10) NOT NULL CHECK (action IN ('View','Download')),
  user_id BIGINT NOT NULL REFERENCES users(id),
  at TIMESTAMP NOT NULL DEFAULT now()
);
-- document_renewals is in 9.6 because it references work_orders
```

### 9.5 Maintenance rules, part items, alerts and inspections

```sql
CREATE TABLE pm_packages (
  vehicle_class_id BIGINT NOT NULL REFERENCES vehicle_classes(id),   -- each package belongs to one class (DEC-70)
  package_code VARCHAR(20) NOT NULL,          -- PM-1, PM-2, PM-3, PM-HILUX, PM-TRAILER
  package_name VARCHAR(100) NOT NULL,
  interval_km INT CHECK (interval_km > 0),     -- NULL for a Towed class (REQ-PLC-018)
  interval_days INT NOT NULL CHECK (interval_days > 0),
  preset_id BIGINT NOT NULL REFERENCES wo_presets(id),   -- steps drafted for this package's alerts (REQ-REG-007, REQ-WO-012)
  UNIQUE (vehicle_class_id, package_code),
  is_active BOOLEAN NOT NULL DEFAULT true
);
CREATE TABLE pm_tasks (
  package_id BIGINT NOT NULL REFERENCES pm_packages(id),
  task_description TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0
);
CREATE TABLE vehicle_pm_schedule (            -- state for the km-or-days trigger
  vehicle_id BIGINT NOT NULL REFERENCES vehicles(id),
  package_id BIGINT NOT NULL REFERENCES pm_packages(id),
  last_done_odometer INT NOT NULL DEFAULT 0,
  last_done_date DATE NOT NULL,
  next_due_km INT NOT NULL,
  next_due_date DATE NOT NULL,
  UNIQUE (vehicle_id, package_id)
);
CREATE TABLE part_item_types (                -- tracked service parts
  code VARCHAR(30) NOT NULL UNIQUE,           -- ENGINE_OIL, OIL_FILTER, BRAKE_PADS_FRONT, BATTERY, ...
  name VARCHAR(100) NOT NULL,
  category VARCHAR(30) NOT NULL,              -- Lubricant, Filter, Brake, Fluid, Electrical
  default_life_km INT, default_life_days INT,  -- normal life, set by the Planner or System Admin
  early_failure_pct SMALLINT NOT NULL DEFAULT 80 CHECK (early_failure_pct BETWEEN 1 AND 100),   -- REQ-BSL-009 [A]
  pm_package_id BIGINT REFERENCES pm_packages(id),
  is_active BOOLEAN NOT NULL DEFAULT true
);
CREATE TABLE part_item_type_classes (
  part_item_type_id BIGINT NOT NULL REFERENCES part_item_types(id),
  vehicle_class_id BIGINT NOT NULL REFERENCES vehicle_classes(id),
  PRIMARY KEY (part_item_type_id, vehicle_class_id)
);
CREATE TABLE vehicle_part_items (             -- baseline and current state of each service part
  vehicle_id BIGINT NOT NULL REFERENCES vehicles(id),
  part_item_type_id BIGINT NOT NULL REFERENCES part_item_types(id),
  sku VARCHAR(40) REFERENCES parts_catalog(sku),
  last_replaced_date DATE NOT NULL,
  last_replaced_odometer INT NOT NULL CHECK (last_replaced_odometer >= 0),
  life_km INT, life_days INT,                 -- copied from the type, editable per vehicle
  next_due_km INT, next_due_date DATE,
  source VARCHAR(10) NOT NULL DEFAULT 'Baseline' CHECK (source IN ('Baseline','Work_Order')),
  last_work_order_id BIGINT REFERENCES work_orders(id),   -- set once a WO touched it; Correct baseline is then refused
  UNIQUE (vehicle_id, part_item_type_id),
  CHECK (source = 'Baseline' OR last_work_order_id IS NOT NULL)
);
CREATE TABLE early_failure_events (           -- AO, REQ-BSL-009; never blocks a WO
  vehicle_id BIGINT NOT NULL REFERENCES vehicles(id),
  work_order_id BIGINT NOT NULL REFERENCES work_orders(id),
  part_item_id BIGINT REFERENCES vehicle_part_items(id),
  tyre_id BIGINT REFERENCES tyres(id),
  stage VARCHAR(10) NOT NULL CHECK (stage IN ('Submitted','Completed')),
  km_used INT NOT NULL, days_used INT NOT NULL,
  life_km INT, life_days INT,
  life_used_pct NUMERIC(5,1) NOT NULL,         -- larger of km and days ratio
  tolerance_pct SMALLINT NOT NULL,
  detected_at TIMESTAMP NOT NULL DEFAULT now(),
  CHECK (part_item_id IS NOT NULL OR tyre_id IS NOT NULL)
);
CREATE TABLE maintenance_alerts (
  vehicle_id BIGINT NOT NULL REFERENCES vehicles(id),
  alert_type alert_type_t NOT NULL,
  package_id BIGINT REFERENCES pm_packages(id),             -- PM
  part_item_id BIGINT REFERENCES vehicle_part_items(id),    -- Part_Item
  tyre_id BIGINT REFERENCES tyres(id),                      -- Tyre (tread below threshold)
  vehicle_document_id BIGINT REFERENCES vehicle_documents(id),   -- Document
  trigger_reason trigger_t,                   -- which limit came first (PM, Part_Item)
  alert_date DATE NOT NULL,
  status alert_status_t NOT NULL DEFAULT 'Pending',
  CHECK ((alert_type = 'PM' AND package_id IS NOT NULL) OR (alert_type = 'Part_Item' AND part_item_id IS NOT NULL)
      OR (alert_type = 'Tyre' AND tyre_id IS NOT NULL) OR (alert_type = 'Document' AND vehicle_document_id IS NOT NULL))
);
CREATE UNIQUE INDEX uq_open_pm_alert   ON maintenance_alerts (vehicle_id, package_id) WHERE status = 'Pending' AND package_id IS NOT NULL;
CREATE UNIQUE INDEX uq_open_part_alert ON maintenance_alerts (part_item_id) WHERE status = 'Pending' AND part_item_id IS NOT NULL;
CREATE UNIQUE INDEX uq_open_tyre_alert ON maintenance_alerts (tyre_id) WHERE status = 'Pending' AND tyre_id IS NOT NULL;
CREATE TABLE alert_rules (                    -- SD, one row per alert kind; Settings: Alert rules (DEC-86)
  rule_kind VARCHAR(20) NOT NULL UNIQUE CHECK (rule_kind IN ('PM','Document','Tyre','Part_Item','Inspection_Fail','Breakdown','Field_Report')),
  drafts_wo BOOLEAN NOT NULL DEFAULT true,    -- false = Show the alert only
  draft_at VARCHAR(12) CHECK (draft_at IN ('Due_Soon','Due','Warning','Expiry','Act_Now')),
  preset_id BIGINT REFERENCES wo_presets(id), -- Tyre, Part_Item and reported problems; NULL = no preset, the Planner adds steps; PM uses pm_packages.preset_id, Document uses document_types.preset_id
  priority VARCHAR(6) NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Normal','High','Urgent')),
  notify_roles role_t[] NOT NULL DEFAULT '{Planner}',
  trigger_config JSONB NOT NULL DEFAULT '{}', -- PM: due_soon_km, due_soon_days; Tyre: act_now_mm = 3, due_soon_mm = 4, pressure_pct = 10; Part_Item: due_soon_pct = 10, check_time; Inspection_Fail: Any or Critical
  updated_by BIGINT NOT NULL REFERENCES users(id),
  CHECK (drafts_wo OR rule_kind IN ('PM','Document','Tyre','Part_Item'))   -- reported problems always draft
);
CREATE TABLE dvir_logs (                      -- daily inspection
  vehicle_id BIGINT NOT NULL REFERENCES vehicles(id),
  driver_id BIGINT NOT NULL REFERENCES drivers(id),
  log_date TIMESTAMP NOT NULL,
  odometer_log_id BIGINT REFERENCES odometer_logs(id),   -- the reading this inspection saved (source Driver, DEC-76); NULL for a Towed unit
  inspection_status VARCHAR(4) NOT NULL CHECK (inspection_status IN ('Pass','Fail')),
  checklist JSONB NOT NULL,                  -- brakes, lights, tyres, engine oil, body damage: Pass or Fail each
  notes TEXT,
  photo_url VARCHAR(500),
  entered_by BIGINT NOT NULL REFERENCES users(id),   -- the driver in the app, or the System Admin entering for a driver
  entered_for_driver BOOLEAN NOT NULL DEFAULT false, -- shown as Entered by System Admin
  CHECK (inspection_status = 'Pass' OR (photo_url IS NOT NULL AND notes IS NOT NULL))
);
CREATE TABLE breakdown_reports (
  vehicle_id BIGINT NOT NULL REFERENCES vehicles(id),
  driver_id BIGINT NOT NULL REFERENCES drivers(id),
  reported_at TIMESTAMP NOT NULL DEFAULT now(),
  location TEXT,
  location_lat NUMERIC(9,6), location_lng NUMERIC(9,6),   -- driver's device location captured once at report (REQ-MOB-003); seeds the Mobilisasi destination (REQ-MBL-002)
  location_captured_at TIMESTAMP,
  description TEXT NOT NULL,
  photo_url VARCHAR(500),
  entered_by BIGINT NOT NULL REFERENCES users(id)
);
```

### 9.6 Work orders, steps and approvals

```sql
CREATE TABLE assignment_modules (             -- module registry (REQ-REG-002)
  code VARCHAR(40) NOT NULL UNIQUE,           -- Stock, Part_Purchase, Mechanic_Action, Mobilisasi (MBL), Part_Replacement, Document, Part_Check (DEC-88), future modules
  name VARCHAR(100) NOT NULL,
  description TEXT,
  ui_component VARCHAR(80) NOT NULL,
  config_schema JSONB,
  creation_schema JSONB,                       -- fields the WO creator fills for this module's step; NULL = none (REQ-WO-017)
  executor_roles role_t[] NOT NULL,
  scope_rules JSONB NOT NULL,
  completion_section JSONB NOT NULL,
  cost_kind VARCHAR(10) NOT NULL CHECK (cost_kind IN ('Parts','Labor','Document','None')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0
);
CREATE TABLE wo_presets (                     -- SD; saved step sequences, a starting point only (DEC-85)
  name VARCHAR(100) NOT NULL,
  category wo_category_t NOT NULL,
  requires_downtime BOOLEAN NOT NULL DEFAULT true,
  version INT NOT NULL DEFAULT 1,             -- Save as preset with an existing name adds a version (REQ-REG-003)
  created_by BIGINT NOT NULL REFERENCES users(id),
  is_active BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (name, version)
);
CREATE TABLE wo_preset_steps (                -- one row per step per preset version
  preset_id BIGINT NOT NULL REFERENCES wo_presets(id),
  sequence_no INT NOT NULL CHECK (sequence_no > 0),
  module VARCHAR(40) NOT NULL REFERENCES assignment_modules(code),
  step_config JSONB NOT NULL DEFAULT '{}',
  is_optional BOOLEAN NOT NULL DEFAULT false,
  executor_roles role_t[] NOT NULL,           -- one or more; a Stock step: Warehouse_Manager, Field_Coordinator, System_Admin
  verifier_role role_t NOT NULL CHECK (verifier_role IN ('Planner','System_Admin')),
  UNIQUE (preset_id, sequence_no)             -- the same module may repeat; step_config holds the saved step details
);
CREATE TABLE work_orders (                    -- SD, OL
  wo_number VARCHAR(30) NOT NULL UNIQUE,
  vehicle_id BIGINT NOT NULL REFERENCES vehicles(id),
  title VARCHAR(150) NOT NULL,                -- prefilled from the preset name, editable
  category wo_category_t NOT NULL,            -- lists, filters and reports
  requires_downtime BOOLEAN NOT NULL DEFAULT true,   -- Vehicle goes to the workshop (REQ-WO-009)
  preset_id BIGINT REFERENCES wo_presets(id), -- where the steps started from; NULL = built from blank; never followed later
  request_source wo_source_t NOT NULL,
  alert_id BIGINT REFERENCES maintenance_alerts(id),
  dvir_log_id BIGINT REFERENCES dvir_logs(id),
  breakdown_report_id BIGINT REFERENCES breakdown_reports(id),
  vehicle_document_id BIGINT REFERENCES vehicle_documents(id),   -- Document WO
  source_assignment_id BIGINT,                -- the verified Part Check step this draft came from (REQ-CHK-003); FK added after work_order_assignments
  priority VARCHAR(10) NOT NULL DEFAULT 'Normal',
  description TEXT NOT NULL,
  status wo_status_t NOT NULL DEFAULT 'Draft',
  sent_for_review_at TIMESTAMP,                -- a Mechanic or Field Coordinator sent the draft to the Planner (REQ-WO-016)
  status_before_amendment wo_status_t,
  amendment_no INT NOT NULL DEFAULT 0,
  created_by BIGINT NOT NULL REFERENCES users(id),
  approved_by BIGINT REFERENCES users(id),
  approved_at TIMESTAMP,
  activated_at TIMESTAMP,
  started_at TIMESTAMP,
  completion_requested_at TIMESTAMP,          -- only when every step is Verified or Skipped
  completion_approved_by BIGINT REFERENCES users(id),
  completed_at TIMESTAMP,
  cancelled_by BIGINT REFERENCES users(id),
  cancel_reason TEXT,
  labor_cost NUMERIC(14,2) NOT NULL DEFAULT 0,     -- cached sums of the line tables
  parts_cost NUMERIC(14,2) NOT NULL DEFAULT 0,
  document_cost NUMERIC(14,2) NOT NULL DEFAULT 0,
  stooring_cost NUMERIC(14,2) NOT NULL DEFAULT 0,   -- sum of the Mobilisasi steps' stooring fees (REQ-MBL-006)
  version INT NOT NULL DEFAULT 1,
  CHECK (status <> 'Cancelled' OR cancel_reason IS NOT NULL)
);
-- one live WO per source; the source finds its WO through these keys (DEC-80)
CREATE UNIQUE INDEX uq_wo_alert     ON work_orders (alert_id)            WHERE alert_id IS NOT NULL AND status <> 'Cancelled';
CREATE UNIQUE INDEX uq_wo_dvir      ON work_orders (dvir_log_id)         WHERE dvir_log_id IS NOT NULL AND status <> 'Cancelled';
CREATE UNIQUE INDEX uq_wo_breakdown ON work_orders (breakdown_report_id) WHERE breakdown_report_id IS NOT NULL AND status <> 'Cancelled';
-- approver <> creator is a service-layer rule (BR-03) because the System Admin may self-approve
CREATE UNIQUE INDEX uq_open_document_wo ON work_orders (vehicle_document_id)
  WHERE vehicle_document_id IS NOT NULL AND status NOT IN ('Completed','Cancelled');
CREATE UNIQUE INDEX uq_wo_check ON work_orders (source_assignment_id) WHERE source_assignment_id IS NOT NULL;   -- one follow-up draft per Part Check step, kept even when discarded
CREATE TABLE work_order_assignments (         -- the WO's steps, one row per step; edited in Create WO while Draft or Rejected, frozen at approval (TX-02)
  work_order_id BIGINT NOT NULL REFERENCES work_orders(id),
  sequence_no INT NOT NULL,
  module VARCHAR(40) NOT NULL REFERENCES assignment_modules(code),
  step_config JSONB NOT NULL DEFAULT '{}',
  is_optional BOOLEAN NOT NULL DEFAULT false,
  executor_roles role_t[] NOT NULL,           -- set per step in Create WO
  verifier_role role_t NOT NULL,
  status asg_status_t NOT NULL DEFAULT 'Locked',
  team team_t,                                -- Mechanic_Action and Part_Check
  location_lat NUMERIC(9,6), location_lng NUMERIC(9,6),   -- Mobilisasi step: destination (from breakdown_reports) and arrival point at submit; the in-progress trail is in mobilisation_location_trail (REQ-MBL-005). No longer set by Mechanic Action (REQ-MEC-008 retired)
  location_accuracy_m INT,
  location_captured_at TIMESTAMP,
  location_capture location_capture_t,
  stooring_rate_id BIGINT REFERENCES stooring_rates(id),   -- Mobilisasi step: region of the destination; Workshop = fee 0 (REQ-MBL-006)
  stooring_fee NUMERIC(14,2) NOT NULL DEFAULT 0,   -- snapshot of the region price at the Mobilisasi step submit (BR-07, REQ-MBL-006)
  assigned_to BIGINT REFERENCES users(id),    -- REQ-ENG-011: named executor, set by Planner or System Admin or by the first claim
  claimed_at TIMESTAMP,
  opened_at TIMESTAMP,                        -- Locked to Open; waiting to start counts from here (DEC-87)
  executed_by BIGINT REFERENCES users(id),
  started_at TIMESTAMP,                       -- set only by Start (REQ-ENG-012), of the current attempt
  start_entered BOOLEAN NOT NULL DEFAULT false,   -- Start from an earlier time (REQ-ENG-014)
  attempt_no SMALLINT NOT NULL DEFAULT 1,     -- +1 after each return
  worked_seconds INT, paused_seconds INT,     -- cached from step_time_events at submit, all attempts
  submitted_at TIMESTAMP,
  verified_by BIGINT REFERENCES users(id),
  verified_at TIMESTAMP,
  self_verified BOOLEAN NOT NULL DEFAULT false,
  return_note TEXT,                           -- set when returned; shown as Returned
  skip_reason TEXT,
  UNIQUE (work_order_id, sequence_no)
);
-- verifier <> executor is a service-layer rule (BR-03)
CREATE TABLE step_time_events (               -- AO, every Open, Start, Pause, Resume, Submit, Return, Verify of a step (DEC-87)
  assignment_id BIGINT NOT NULL REFERENCES work_order_assignments(id),
  attempt_no SMALLINT NOT NULL,
  event VARCHAR(8) NOT NULL CHECK (event IN ('Open','Start','Pause','Resume','Submit','Return','Verify','Skip')),
  at TIMESTAMP NOT NULL,                      -- when it happened; server time, or phone time for an offline phone
  recorded_at TIMESTAMP NOT NULL DEFAULT now(),   -- when the server received it
  pause_reason VARCHAR(22) CHECK (pause_reason IN ('Waiting_Parts','Waiting_Vehicle','Waiting_Vendor_Agency','Break_Shift_End','Change_Request','Other')),
  note TEXT,                                  -- required for Other and for an entered start
  entered_late BOOLEAN NOT NULL DEFAULT false,   -- Start from an earlier time, at most 2 h before recorded_at and never before Open
  clock_flag BOOLEAN NOT NULL DEFAULT false,  -- phone time more than 10 min off the server time
  actor_id BIGINT REFERENCES users(id),       -- NULL for System events
  on_behalf_of VARCHAR(150),                  -- external workshop name when a Field Coordinator or System Admin acts for it
  CHECK (event <> 'Pause' OR pause_reason IS NOT NULL),
  CHECK (pause_reason IS DISTINCT FROM 'Other' OR note IS NOT NULL)
);
CREATE TABLE step_time_corrections (          -- AO, System Admin only; the original event is never changed
  event_id BIGINT NOT NULL REFERENCES step_time_events(id),
  old_at TIMESTAMP NOT NULL,
  new_at TIMESTAMP NOT NULL,
  reason TEXT NOT NULL,
  corrected_by BIGINT NOT NULL REFERENCES users(id),
  corrected_at TIMESTAMP NOT NULL DEFAULT now()
);   -- reports and the WO document use the latest correction of each event
CREATE TABLE mobilisation_location_trail (    -- AO; the mechanic's location trail while a Mobilisasi step is In_Progress (REQ-MBL-005, RSK-09)
  assignment_id BIGINT NOT NULL REFERENCES work_order_assignments(id),   -- a Mobilisasi step
  attempt_no SMALLINT NOT NULL,
  lat NUMERIC(9,6) NOT NULL, lng NUMERIC(9,6) NOT NULL,
  accuracy_m INT,
  recorded_at TIMESTAMP NOT NULL,             -- only between Start and Submit of the step; recording stops at Submit
  received_at TIMESTAMP NOT NULL DEFAULT now()
);   -- visible to Planner and System Admin only; every read is written to an access log (RSK-09, NFR-04)
CREATE TABLE wo_change_requests (
  work_order_id BIGINT NOT NULL REFERENCES work_orders(id),
  assignment_id BIGINT NOT NULL REFERENCES work_order_assignments(id),
  requested_by BIGINT NOT NULL REFERENCES users(id),   -- executor of the open step
  reason TEXT NOT NULL,
  requested_change JSONB NOT NULL,
  revision JSONB,                             -- proposed content from the WO creator
  revised_by BIGINT REFERENCES users(id),
  status cr_status_t NOT NULL DEFAULT 'Submitted',
  decided_by BIGINT REFERENCES users(id),     -- Supervisor, GM or System Admin
  decided_at TIMESTAMP,
  decision_note TEXT,
  amendment_no_applied INT
);
CREATE TABLE work_order_approvals (           -- AO, feeds the approval block
  work_order_id BIGINT NOT NULL REFERENCES work_orders(id),
  change_request_id BIGINT REFERENCES wo_change_requests(id),
  stage approval_stage_t NOT NULL,
  action approval_action_t NOT NULL,
  acted_by BIGINT NOT NULL REFERENCES users(id),
  approver_role role_t NOT NULL,
  acted_at TIMESTAMP NOT NULL DEFAULT now(),
  note TEXT,
  self_approved BOOLEAN NOT NULL DEFAULT false,
  CHECK (action NOT IN ('Approve','Reject') OR approver_role IN ('Supervisor','GM','System_Admin','Planner')),   -- Planner only while planner approval is on (REQ-IAM-008), service layer
  CHECK (action <> 'Reject' OR note IS NOT NULL)
);
ALTER TABLE work_orders ADD FOREIGN KEY (source_assignment_id) REFERENCES work_order_assignments(id);
CREATE TABLE work_order_check_items (         -- Part Check lines (DEC-88): requested by the WO creator, or added by the executor
  assignment_id BIGINT NOT NULL REFERENCES work_order_assignments(id),
  line_no INT NOT NULL,
  sku VARCHAR(40) REFERENCES parts_catalog(sku),
  part_item_type_id BIGINT REFERENCES part_item_types(id),
  tyre_position VARCHAR(10),                  -- for a tyre, the position on the chassis layout
  label VARCHAR(150) NOT NULL,                -- what the line shows, for example Air brake hose, axle 2
  what_to_check TEXT,                         -- from the WO creator
  added_by_executor BOOLEAN NOT NULL DEFAULT false,
  condition_note TEXT,                        -- required at submit
  decision VARCHAR(7) CHECK (decision IN ('Good','Repair','Replace')),   -- required at submit
  unsafe_to_drive BOOLEAN NOT NULL DEFAULT false,
  decided_by BIGINT REFERENCES users(id),
  UNIQUE (assignment_id, line_no),
  CHECK (decision IS NOT NULL OR NOT unsafe_to_drive),
  CHECK (decision IS DISTINCT FROM 'Good' OR NOT unsafe_to_drive)
);   -- submit guard: every line has condition_note, decision and at least one Check_Photo
CREATE TABLE wo_attachments (
  work_order_id BIGINT NOT NULL REFERENCES work_orders(id),
  assignment_id BIGINT NOT NULL REFERENCES work_order_assignments(id),
  work_order_part_id BIGINT REFERENCES work_order_parts(id),
  work_order_service_id BIGINT REFERENCES work_order_services(id),
  check_item_id BIGINT REFERENCES work_order_check_items(id),   -- Check_Photo of one checked part (REQ-CHK-002)
  attachment_type attachment_t NOT NULL,
  label VARCHAR(10) CHECK (label IN ('Before','After')),   -- P1
  file_url VARCHAR(500) NOT NULL,
  file_name VARCHAR(255), mime_type VARCHAR(100), size_bytes INT,
  uploaded_by BIGINT NOT NULL REFERENCES users(id)
);
CREATE TABLE work_order_part_requests (       -- parts named in a draft by a Field Coordinator or Mechanic (REQ-WO-016)
  work_order_id BIGINT NOT NULL REFERENCES work_orders(id),
  part_id BIGINT NOT NULL REFERENCES parts_catalog(id),
  requested_by BIGINT NOT NULL REFERENCES users(id),
  note TEXT
);
CREATE TABLE document_renewals (              -- written by the Document step
  vehicle_document_id BIGINT NOT NULL REFERENCES vehicle_documents(id),
  work_order_id BIGINT NOT NULL REFERENCES work_orders(id),   -- guard
  old_number VARCHAR(60), new_number VARCHAR(60) NOT NULL,
  old_expiry DATE NOT NULL, new_expiry DATE NOT NULL,
  issue_date DATE,
  cost NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (cost >= 0),
  file_url VARCHAR(500) NOT NULL,             -- new scan
  receipt_url VARCHAR(500),                   -- required when document_types.receipt_required
  entered_by BIGINT NOT NULL REFERENCES users(id),
  CHECK (new_expiry > old_expiry)
);
```

### 9.7 WO content: parts, tyres and services

```sql
CREATE TABLE service_catalog (                -- SD, Internal services
  service_code VARCHAR(30) NOT NULL UNIQUE,
  service_name VARCHAR(150) NOT NULL,
  standard_price NUMERIC(14,2) NOT NULL CHECK (standard_price >= 0),
  part_item_type_id BIGINT REFERENCES part_item_types(id),   -- [A] resets that part item when a WO completes
  is_active BOOLEAN NOT NULL DEFAULT true
);
CREATE TABLE work_order_parts (               -- planned lines (required list) and actual lines
  work_order_id BIGINT NOT NULL REFERENCES work_orders(id),
  assignment_id BIGINT REFERENCES work_order_assignments(id),   -- set when actual use is recorded
  sku VARCHAR(40) REFERENCES parts_catalog(sku),
  tyre_size VARCHAR(30),                      -- planned tyre line: size and quantity, for example 11R22.5 x 2
  tyre_id BIGINT REFERENCES tyres(id),        -- actual tyre line: one row per chosen tyre
  part_name VARCHAR(150) NOT NULL,
  for_step VARCHAR(13) NOT NULL DEFAULT 'Stock' CHECK (for_step IN ('Stock','Part_Purchase')),   -- Part_Purchase lines have no planned quantity (DEC-64)
  planned_qty INT NOT NULL DEFAULT 0 CHECK (planned_qty >= 0),
  qty INT NOT NULL DEFAULT 0 CHECK (qty >= 0),
  unit_price NUMERIC(14,4) NOT NULL DEFAULT 0,   -- snapshot (BR-07)
  source part_source_t,
  goods_issue_item_id BIGINT REFERENCES goods_issue_items(id),
  reverses_line_id BIGINT REFERENCES work_order_parts(id),
  CHECK (sku IS NOT NULL OR tyre_size IS NOT NULL OR tyre_id IS NOT NULL),
  CHECK (source IS DISTINCT FROM 'Warehouse' OR qty = 0 OR goods_issue_item_id IS NOT NULL OR tyre_id IS NOT NULL)
);
CREATE TABLE work_order_purchases (          -- Part Purchase step header (REQ-PUR-004)
  work_order_id BIGINT NOT NULL REFERENCES work_orders(id),
  assignment_id BIGINT NOT NULL REFERENCES work_order_assignments(id),
  vendor_id BIGINT REFERENCES vendors(id),
  vendor_other VARCHAR(150),                  -- typed when the vendor is not in the master [A]
  receipt_number VARCHAR(60),
  receipt_date DATE NOT NULL,
  calculated_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  nothing_bought_reason TEXT,                 -- set when the step is submitted with no lines
  bought_by BIGINT NOT NULL REFERENCES users(id),
  CHECK (vendor_id IS NOT NULL OR vendor_other IS NOT NULL OR nothing_bought_reason IS NOT NULL)
);
CREATE TABLE work_order_purchase_lines (     -- part from the catalog, typed quantity and price (REQ-PUR-002)
  purchase_id BIGINT NOT NULL REFERENCES work_order_purchases(id),
  work_order_part_id BIGINT NOT NULL REFERENCES work_order_parts(id),   -- the planned line it buys (DEC-63)
  kind VARCHAR(5) NOT NULL DEFAULT 'Part' CHECK (kind IN ('Part','Tyre')),
  sku VARCHAR(40) REFERENCES parts_catalog(sku),   -- copied from the planned line; NULL only for a Tyre line
  item_name VARCHAR(150) NOT NULL,            -- snapshot of the catalog name
  quantity NUMERIC(10,2) NOT NULL CHECK (quantity > 0),
  unit VARCHAR(10) NOT NULL DEFAULT 'pcs',
  unit_price NUMERIC(14,2) NOT NULL CHECK (unit_price >= 0),
  line_total NUMERIC(14,2) NOT NULL,          -- quantity x unit_price, shown live
  tyre_id BIGINT REFERENCES tyres(id),        -- Tyre lines create a tyre Issued to the WO (REQ-PUR-005)
  CHECK (kind = 'Part' OR tyre_id IS NOT NULL),
  CHECK (kind = 'Tyre' OR sku IS NOT NULL)
);
CREATE TABLE stooring_rates (                 -- SD, master data of the System Admin (REQ-MEC-010)
  code VARCHAR(20) NOT NULL UNIQUE,
  region_name VARCHAR(100) NOT NULL,          -- Workshop Cikarang, Bekasi, Karawang, Jakarta, ...
  price NUMERIC(14,2) NOT NULL CHECK (price >= 0),   -- 0 for the workshop
  is_active BOOLEAN NOT NULL DEFAULT true
);
CREATE TABLE work_order_services (
  work_order_id BIGINT NOT NULL REFERENCES work_orders(id),
  assignment_id BIGINT NOT NULL REFERENCES work_order_assignments(id),
  team team_t NOT NULL,
  service_id BIGINT REFERENCES service_catalog(id),
  vendor_name VARCHAR(150),
  description TEXT NOT NULL,
  price NUMERIC(14,2) NOT NULL CHECK (price >= 0),   -- catalog snapshot for Internal, free for External
  performed_by BIGINT NOT NULL REFERENCES users(id),
  CHECK ((team = 'Internal' AND service_id IS NOT NULL AND vendor_name IS NULL)
      OR (team = 'External' AND service_id IS NULL AND vendor_name IS NOT NULL))
);
-- Part_Check has cost_kind Labor and uses work_order_services for its check service; at least one line is required (REQ-CHK-007).
-- Evidence on submit: Internal needs at least one Repair_Photo (for Part_Check: a Check_Photo per checked part); External services and Part Purchase steps need at least one Invoice or receipt in wo_attachments.
```

### 9.8 Parts inventory and stock ledger

```sql
CREATE TABLE parts_catalog (                  -- SD, OL; parts only, never tyres
  sku VARCHAR(40) NOT NULL UNIQUE,
  part_name VARCHAR(150) NOT NULL,
  category VARCHAR(60),
  unit VARCHAR(10) NOT NULL DEFAULT 'pcs',    -- locked after the first movement
  brand VARCHAR(80),
  description TEXT,
  stock_qty INT NOT NULL DEFAULT 0 CHECK (stock_qty >= 0),
  reorder_point INT NOT NULL DEFAULT 0,
  average_cost NUMERIC(14,4) NOT NULL DEFAULT 0,   -- moving average
  rack_location VARCHAR(30),
  part_item_type_id BIGINT REFERENCES part_item_types(id),
  last_movement_at TIMESTAMP,                 -- dead stock after 180 days (P1)
  is_active BOOLEAN NOT NULL DEFAULT true,    -- deactivate only when stock_qty = 0
  version INT NOT NULL DEFAULT 1
);
CREATE TABLE vendors (                        -- SD, REQ-INV-014; every vendor_name column below becomes vendor_id REFERENCES vendors(id)
  code VARCHAR(20) NOT NULL UNIQUE,
  name VARCHAR(150) NOT NULL,
  vendor_type VARCHAR(10) NOT NULL CHECK (vendor_type IN ('Supplier','Workshop','Retread','Shop')),
  phone VARCHAR(30), address TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true
);
CREATE TABLE goods_receipts (                 -- SD; posted without approval (BR-12)
  gr_number VARCHAR(30) NOT NULL UNIQUE,      -- generated
  po_number VARCHAR(40),
  supplier_name VARCHAR(150) NOT NULL,          -- replaced by vendor_id (REQ-INV-014) in the build
  source_work_order_id BIGINT REFERENCES work_orders(id),   -- set for a receipt of parts bought for a cancelled WO (REQ-WO-008)
  invoice_number VARCHAR(60) NOT NULL,        -- invoice or delivery note
  received_date DATE NOT NULL,
  status VARCHAR(10) NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft','Posted')),
  created_by BIGINT NOT NULL REFERENCES users(id),
  posted_by BIGINT REFERENCES users(id),
  posted_at TIMESTAMP,
  CHECK (status = 'Draft' OR posted_by IS NOT NULL)
);
CREATE TABLE goods_receipt_items (
  goods_receipt_id BIGINT NOT NULL REFERENCES goods_receipts(id),
  sku VARCHAR(40) NOT NULL REFERENCES parts_catalog(sku),
  qty INT NOT NULL CHECK (qty > 0),
  unit_price NUMERIC(14,4) NOT NULL CHECK (unit_price >= 0),
  expiry_date DATE,
  rack_location VARCHAR(30)
);
CREATE TABLE gr_corrections (                 -- fixes a posted receipt line; no approval
  correction_number VARCHAR(30) NOT NULL UNIQUE,
  goods_receipt_id BIGINT NOT NULL REFERENCES goods_receipts(id),
  sku VARCHAR(40) NOT NULL REFERENCES parts_catalog(sku),
  qty_change INT NOT NULL DEFAULT 0,
  new_unit_price NUMERIC(14,4),
  reason TEXT NOT NULL,
  posted_by BIGINT NOT NULL REFERENCES users(id),
  posted_at TIMESTAMP NOT NULL DEFAULT now()
);
CREATE TABLE goods_issues (                   -- Warehouse source only
  gi_number VARCHAR(30) NOT NULL UNIQUE,
  work_order_id BIGINT NOT NULL REFERENCES work_orders(id),          -- guard (BR-01)
  assignment_id BIGINT NOT NULL REFERENCES work_order_assignments(id),
  vehicle_id BIGINT NOT NULL REFERENCES vehicles(id),               -- guard: equals the WO vehicle (BR-02)
  issued_date DATE NOT NULL,
  issued_by BIGINT NOT NULL REFERENCES users(id),
  reverses_gi_id BIGINT REFERENCES goods_issues(id),                -- a reversal
  reversal_reason TEXT,
  reversal_verified_by BIGINT REFERENCES users(id),                 -- stock returns only after verification
  CHECK (reverses_gi_id IS NULL OR reversal_reason IS NOT NULL)
);
CREATE TABLE goods_issue_items (
  goods_issue_id BIGINT NOT NULL REFERENCES goods_issues(id),
  sku VARCHAR(40) NOT NULL REFERENCES parts_catalog(sku),           -- guard: on the WO part list
  qty INT NOT NULL CHECK (qty > 0),
  unit_cost NUMERIC(14,4) NOT NULL                                  -- average cost at issue time
);
CREATE TABLE stock_adjustments (              -- stock opname document, or the opening balance
  kind VARCHAR(8) NOT NULL DEFAULT 'Opname' CHECK (kind IN ('Opname','Opening')),   -- Opening: REQ-INV-013, Setup mode only, saved without approval
  sa_number VARCHAR(30) NOT NULL UNIQUE,
  adjustment_date DATE NOT NULL,
  rack_filter VARCHAR(30),
  status VARCHAR(16) NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft','Pending_Approval','Approved')),
  returned_reason TEXT,                       -- set by a reject; shown as Returned
  counted_by BIGINT NOT NULL REFERENCES users(id),
  approved_by BIGINT REFERENCES users(id),    -- Supervisor, GM or System Admin; not counted_by unless System Admin
  self_approved BOOLEAN NOT NULL DEFAULT false
);
CREATE TABLE stock_adjustment_items (
  stock_adjustment_id BIGINT NOT NULL REFERENCES stock_adjustments(id),
  sku VARCHAR(40) NOT NULL REFERENCES parts_catalog(sku),
  system_qty INT NOT NULL,
  physical_qty INT NOT NULL CHECK (physical_qty >= 0),
  variance INT GENERATED ALWAYS AS (physical_qty - system_qty) STORED,
  reason_code reason_t,
  explanation TEXT,
  UNIQUE (stock_adjustment_id, sku),
  CHECK (physical_qty = system_qty OR (reason_code IS NOT NULL AND length(trim(explanation)) > 0))
);
CREATE TABLE stock_cards (                    -- AO ledger
  sku VARCHAR(40) NOT NULL REFERENCES parts_catalog(sku),
  transaction_type stock_tx_t NOT NULL,
  reference_doc_id VARCHAR(30) NOT NULL,      -- GR, GRC, GI or SA number: no movement without a document (BR-06)
  work_order_id BIGINT REFERENCES work_orders(id),
  vehicle_id BIGINT REFERENCES vehicles(id),  -- for GI and GIR
  qty_in INT NOT NULL DEFAULT 0 CHECK (qty_in >= 0),
  qty_out INT NOT NULL DEFAULT 0 CHECK (qty_out >= 0),
  balance_after INT NOT NULL CHECK (balance_after >= 0),
  user_id BIGINT NOT NULL REFERENCES users(id),
  tx_at TIMESTAMP NOT NULL DEFAULT now()
);
```

### 9.9 Tyres, tyre documents and retread

```sql
CREATE TABLE tyre_statuses (                  -- master data (REQ-TYR-003)
  code VARCHAR(20) NOT NULL UNIQUE,           -- seed: In_Stock, Issued, Mounted, Needs_Retread, Worn_Out, On_Retread, Scrapped, Lost
  name VARCHAR(60) NOT NULL,
  in_warehouse BOOLEAN NOT NULL DEFAULT false, -- true for In_Stock, Needs_Retread, Worn_Out (counted in a tyre count)
  is_final BOOLEAN NOT NULL DEFAULT false,     -- Scrapped, Lost
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0
);
CREATE SEQUENCE tyre_code_seq;                -- source of TY-0001, never reused
CREATE TABLE retread_orders (                 -- retread dispatch
  rd_number VARCHAR(30) NOT NULL UNIQUE,
  vendor_name VARCHAR(150) NOT NULL,
  delivery_note_number VARCHAR(60),
  dispatch_date DATE NOT NULL,
  expected_return_date DATE,
  status VARCHAR(12) NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft','Sent','Partial','Closed')),
  created_by BIGINT NOT NULL REFERENCES users(id)
);
CREATE TABLE tyre_receipts (                  -- SD; Receive tyres, no approval
  receipt_number VARCHAR(30) NOT NULL UNIQUE, -- TR-0001
  receipt_type VARCHAR(15) NOT NULL CHECK (receipt_type IN ('New','Retread_Return')),
  source VARCHAR(20) CHECK (source IN ('Supplier','Existing')),   -- New only
  supplier_name VARCHAR(150),
  retread_order_id BIGINT REFERENCES retread_orders(id),          -- Retread_Return only
  invoice_number VARCHAR(60),
  received_date DATE NOT NULL,
  status VARCHAR(10) NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft','Confirmed')),
  received_by BIGINT NOT NULL REFERENCES users(id),
  CHECK ((receipt_type = 'New' AND source IS NOT NULL AND retread_order_id IS NULL)
      OR (receipt_type = 'Retread_Return' AND retread_order_id IS NOT NULL AND invoice_number IS NOT NULL)),
  CHECK (source IS DISTINCT FROM 'Supplier' OR invoice_number IS NOT NULL)
);
CREATE TABLE tyres (                          -- SD; individual assets, never in parts_catalog
  tyre_code VARCHAR(20) NOT NULL UNIQUE,      -- generated from tyre_code_seq
  serial_number VARCHAR(40) NOT NULL,         -- printed on the tyre
  brand VARCHAR(50) NOT NULL,
  model VARCHAR(50),
  size VARCHAR(30) NOT NULL,
  tyre_type tyre_type_t NOT NULL,
  status_id BIGINT NOT NULL REFERENCES tyre_statuses(id),
  source VARCHAR(20) NOT NULL CHECK (source IN ('Supplier','Existing','External_Workshop')),
  tyre_receipt_id BIGINT REFERENCES tyre_receipts(id),   -- the receipt that created it
  supplier_name VARCHAR(150),
  purchase_invoice_number VARCHAR(60),
  purchase_cost NUMERIC(14,2),
  received_date DATE,
  received_by BIGINT REFERENCES users(id),
  initial_tread_depth NUMERIC(4,1) NOT NULL,
  current_tread_depth NUMERIC(4,1),           -- cache of the latest tyre_inspections row, written in the same transaction (DEC-80)
  current_pressure_psi NUMERIC(5,1),          -- same cache
  rack_location VARCHAR(30),                  -- while in the warehouse
  retread_count INT NOT NULL DEFAULT 0,
  last_retread_vendor VARCHAR(150),
  issued_wo_id BIGINT REFERENCES work_orders(id),   -- set only while status is Issued
  UNIQUE (brand, serial_number)               -- [A] unique per brand
);
CREATE TABLE tyre_events (                    -- AO history
  tyre_id BIGINT NOT NULL REFERENCES tyres(id),
  event VARCHAR(30) NOT NULL,                 -- Received, Issued, Released, Mounted, Rotated, Demounted, Returned_To_Stock, Retread_Sent, Retread_Accepted, Retread_Rejected, Worn_Out, Scrapped, Missing, Lost
  from_status_id BIGINT REFERENCES tyre_statuses(id),
  to_status_id BIGINT REFERENCES tyre_statuses(id),
  document_ref VARCHAR(30) NOT NULL,          -- WO, TR, RD or tyre count number; BASELINE for the parts baseline
  vehicle_id BIGINT REFERENCES vehicles(id),
  position_id BIGINT REFERENCES part_positions(id),
  odometer INT,
  reason TEXT,
  user_id BIGINT NOT NULL REFERENCES users(id),
  at TIMESTAMP NOT NULL DEFAULT now()
);
CREATE TABLE tyre_attachments (
  tyre_id BIGINT NOT NULL REFERENCES tyres(id),
  attachment_type VARCHAR(15) NOT NULL CHECK (attachment_type IN ('Invoice')),
  file_url VARCHAR(500) NOT NULL,
  uploaded_by BIGINT NOT NULL REFERENCES users(id)
);
CREATE TABLE retread_order_items (
  retread_order_id BIGINT NOT NULL REFERENCES retread_orders(id),
  tyre_id BIGINT NOT NULL REFERENCES tyres(id),
  tyre_receipt_id BIGINT REFERENCES tyre_receipts(id),   -- the Retread_Return that settled it
  result VARCHAR(10) CHECK (result IN ('Accepted','Rejected')),   -- NULL = not returned yet
  cost NUMERIC(14,2) CHECK (cost >= 0),
  new_tread_depth NUMERIC(4,1),
  reject_reason TEXT,
  received_date DATE,
  UNIQUE (retread_order_id, tyre_id),
  CHECK (result IS DISTINCT FROM 'Rejected' OR reject_reason IS NOT NULL)
);
CREATE TABLE retread_attachments (
  retread_order_id BIGINT NOT NULL REFERENCES retread_orders(id),
  attachment_type VARCHAR(15) NOT NULL CHECK (attachment_type IN ('Delivery_Note','Invoice')),
  file_url VARCHAR(500) NOT NULL,
  uploaded_by BIGINT NOT NULL REFERENCES users(id)
);
CREATE TABLE tyre_counts (
  count_number VARCHAR(30) NOT NULL UNIQUE,
  count_date DATE NOT NULL,
  rack_filter VARCHAR(30),
  status VARCHAR(16) NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft','Pending_Approval','Approved')),
  returned_reason TEXT,
  counted_by BIGINT NOT NULL REFERENCES users(id),
  approved_by BIGINT REFERENCES users(id),    -- Supervisor, GM or System Admin; not counted_by unless System Admin
  self_approved BOOLEAN NOT NULL DEFAULT false
);
CREATE TABLE tyre_count_items (
  tyre_count_id BIGINT NOT NULL REFERENCES tyre_counts(id),
  tyre_id BIGINT NOT NULL REFERENCES tyres(id),
  result VARCHAR(8) NOT NULL CHECK (result IN ('Found','Missing')),
  reason VARCHAR(20),
  note TEXT,
  UNIQUE (tyre_count_id, tyre_id),
  CHECK (result = 'Found' OR (reason IS NOT NULL AND note IS NOT NULL))
);
CREATE TABLE tyre_min_levels (                -- P1, low stock per size [A]
  size VARCHAR(30) NOT NULL UNIQUE,
  min_qty INT NOT NULL CHECK (min_qty >= 0)
);
CREATE TABLE tyre_inspections (               -- tread and pressure recorded in a WO step
  tyre_id BIGINT NOT NULL REFERENCES tyres(id),
  work_order_id BIGINT NOT NULL REFERENCES work_orders(id),   -- guard
  assignment_id BIGINT NOT NULL REFERENCES work_order_assignments(id),
  tread_depth_mm NUMERIC(4,1) NOT NULL CHECK (tread_depth_mm >= 0),
  pressure_psi NUMERIC(5,1),
  odometer INT,
  inspected_by BIGINT NOT NULL REFERENCES users(id)
);
```

### 9.10 Placements and the map

```sql
CREATE TABLE part_placements (                -- OL; the current tyre at each position
  vehicle_id BIGINT NOT NULL REFERENCES vehicles(id),
  position_id BIGINT NOT NULL REFERENCES part_positions(id),   -- must belong to the vehicle's chassis_layout_id (trigger)
  tyre_id BIGINT NOT NULL REFERENCES tyres(id),
  status VARCHAR(10) NOT NULL DEFAULT 'Active' CHECK (status IN ('Active','Removed')),
  is_baseline BOOLEAN NOT NULL DEFAULT false,
  installed_wo_id BIGINT REFERENCES work_orders(id),
  installed_assignment_id BIGINT REFERENCES work_order_assignments(id),
  installed_odometer INT NOT NULL,
  installed_at TIMESTAMP NOT NULL,
  removed_wo_id BIGINT REFERENCES work_orders(id),
  removed_at TIMESTAMP,
  version INT NOT NULL DEFAULT 1,
  CHECK (is_baseline OR installed_wo_id IS NOT NULL)        -- BR-01
);
CREATE UNIQUE INDEX uq_active_slot ON part_placements (position_id, vehicle_id) WHERE status = 'Active';
CREATE UNIQUE INDEX uq_active_tyre ON part_placements (tyre_id) WHERE status = 'Active';
CREATE TABLE part_placement_logs (            -- AO
  work_order_id BIGINT REFERENCES work_orders(id),
  assignment_id BIGINT REFERENCES work_order_assignments(id),
  vehicle_id BIGINT NOT NULL REFERENCES vehicles(id),
  action_type placement_act_t NOT NULL,
  tyre_id BIGINT NOT NULL REFERENCES tyres(id),
  old_position_id BIGINT REFERENCES part_positions(id),
  new_position_id BIGINT REFERENCES part_positions(id),
  odometer_at_action INT NOT NULL,
  accumulated_km INT NOT NULL DEFAULT 0,
  logged_by BIGINT NOT NULL REFERENCES users(id),
  CHECK (action_type = 'Baseline' OR work_order_id IS NOT NULL)   -- BR-01
);
CREATE TABLE placement_map_snapshots (        -- [A] saved when a Part Replacement step is submitted
  work_order_id BIGINT NOT NULL REFERENCES work_orders(id),
  assignment_id BIGINT NOT NULL UNIQUE REFERENCES work_order_assignments(id),
  snapshot JSONB NOT NULL
);
```

### 9.11 Maintenance schedule

```sql
CREATE TABLE wo_schedule (                    -- a plan only; never changes a WO (BR-13)
  work_order_id BIGINT NOT NULL UNIQUE REFERENCES work_orders(id),
  planned_date DATE NOT NULL,
  placed_by BIGINT NOT NULL REFERENCES users(id),
  is_missed BOOLEAN NOT NULL DEFAULT false    -- set by the daily job
);
CREATE TABLE wo_schedule_log (                -- AO
  work_order_id BIGINT NOT NULL REFERENCES work_orders(id),
  old_date DATE,
  new_date DATE,
  action VARCHAR(10) NOT NULL CHECK (action IN ('Placed','Moved','Removed','Missed')),
  user_id BIGINT REFERENCES users(id),
  at TIMESTAMP NOT NULL DEFAULT now()
);
CREATE TABLE schedule_alerts (                -- shown to the Field Coordinator; also raises a notification
  work_order_id BIGINT NOT NULL REFERENCES work_orders(id),
  alert_type VARCHAR(10) NOT NULL CHECK (alert_type IN ('Placed','Moved','Missed','Today')),
  recipient_id BIGINT NOT NULL REFERENCES users(id),
  read_at TIMESTAMP
);
```

### 9.12 Platform: settings, notifications, preferences and AI

```sql
CREATE TABLE app_settings (
  setting_key VARCHAR(60) NOT NULL UNIQUE,   -- dead_stock_days = 180, odometer_jump_km_per_day = 1500, storage_budget_gb = 50, storage_alert_pct = 80, storage_ia_after_months = 12, planner_approval_until = null, system_mode = 'Setup' then 'Live' (REQ-IAM-010), went_live_at, tyre_early_failure_pct = 80, numbering formats (NFR-15), invoice_tax_pct = 11, invoice_part_markup_pct = 50, invoice_bank_details
  setting_value JSONB NOT NULL               -- triggers that draft WOs are in alert_rules, document warning days on document_types (DEC-86)
);
CREATE TABLE stored_files (                   -- every uploaded file (8.1); file columns elsewhere hold its storage_key
  storage_key VARCHAR(300) NOT NULL UNIQUE,   -- {env}/{yyyy}/{mm}/{entity}/{uuid}.jpg or .pdf, private bucket
  thumb_key VARCHAR(300),                     -- 320 px JPEG
  profile VARCHAR(10) NOT NULL CHECK (profile IN ('Photo','Document','PDF')),
  mime_type VARCHAR(30) NOT NULL CHECK (mime_type IN ('image/jpeg','application/pdf')),   -- stored output type
  original_name VARCHAR(255),
  original_bytes INT,                         -- before compression
  stored_bytes INT,
  width INT, height INT, page_count INT,
  sha256 CHAR(64),                            -- set when Ready
  captured_at TIMESTAMP,                      -- from EXIF, the only EXIF field kept
  capture_source VARCHAR(8) CHECK (capture_source IN ('Camera','Gallery','File')),
  status VARCHAR(10) NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending','Ready','Rejected','Expired')),
  reject_reason TEXT,
  uploaded_by BIGINT NOT NULL REFERENCES users(id),
  attached_at TIMESTAMP,                      -- set when a record references it; then never changed or deleted
  CHECK (status <> 'Ready' OR sha256 IS NOT NULL)
);
CREATE TABLE notifications (                  -- the only notifications table; in-app from release 1
  user_id BIGINT NOT NULL REFERENCES users(id),
  kind VARCHAR(20) NOT NULL CHECK (kind IN ('Approval','Step','Alert','Schedule','Change_Request')),
  title VARCHAR(200) NOT NULL,
  body TEXT,
  link_record VARCHAR(60),                    -- the WO, step, document or vehicle it opens
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  read_at TIMESTAMP
);
CREATE TABLE push_devices (                   -- P1: phones where a user is signed in
  user_id BIGINT NOT NULL REFERENCES users(id),
  push_token TEXT NOT NULL UNIQUE,
  platform VARCHAR(10) NOT NULL CHECK (platform IN ('Android','iOS')),
  last_seen_at TIMESTAMP
);
CREATE TABLE notification_deliveries (        -- one row per channel and device
  notification_id BIGINT NOT NULL REFERENCES notifications(id),
  channel VARCHAR(10) NOT NULL CHECK (channel IN ('InApp','Push')),   -- Email, WhatsApp added in P2
  device_id BIGINT REFERENCES push_devices(id),
  status VARCHAR(10) NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending','Sent','Failed')),
  sent_at TIMESTAMP
);
CREATE TABLE notification_mutes (             -- P1: push muted per kind; in-app stays
  user_id BIGINT NOT NULL REFERENCES users(id),
  kind VARCHAR(20) NOT NULL,
  UNIQUE (user_id, kind)
);
CREATE TABLE user_table_preferences (         -- column chooser and Parts or Tyres mode
  user_id BIGINT NOT NULL REFERENCES users(id),
  table_key VARCHAR(60) NOT NULL,             -- for example tyres_list, inventory_mode
  columns JSONB NOT NULL,
  PRIMARY KEY (user_id, table_key)
);
CREATE TABLE import_batches (                 -- REQ-IAM-011, Setup mode only
  entity VARCHAR(40) NOT NULL,                -- customers, vendors, services, stooring_rates, parts_catalog, vehicles, vehicle_documents, tyres, baseline, opening_balance
  file_key VARCHAR(300) NOT NULL,             -- the uploaded file in object storage
  rows_total INT NOT NULL,
  rows_failed INT NOT NULL DEFAULT 0,
  status VARCHAR(10) NOT NULL DEFAULT 'Validated' CHECK (status IN ('Validated','Imported','Discarded')),
  errors JSONB,                               -- row number and message per failed row
  imported_by BIGINT NOT NULL REFERENCES users(id),
  imported_at TIMESTAMP,
  CHECK (status <> 'Imported' OR rows_failed = 0)
);
CREATE TABLE export_logs (                    -- AO
  user_id BIGINT NOT NULL REFERENCES users(id),
  export_type VARCHAR(40) NOT NULL,           -- stock_card, report, audit_log
  parameters JSONB NOT NULL,
  file_format VARCHAR(5) NOT NULL CHECK (file_format IN ('xlsx','csv','pdf')),
  at TIMESTAMP NOT NULL DEFAULT now()
);
CREATE TABLE ai_configurations (              -- P1
  provider ai_provider_t NOT NULL UNIQUE,
  api_key_encrypted TEXT NOT NULL,
  active_model VARCHAR(60) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT false,
  updated_by BIGINT NOT NULL REFERENCES users(id)
);
CREATE TABLE ai_query_logs (                  -- P1, AO
  user_id BIGINT NOT NULL REFERENCES users(id),
  raw_prompt TEXT NOT NULL,
  skill_used VARCHAR(40),
  executed_sql_context TEXT,
  tokens_used INT
);
```

### 9.13 Integrity rules and key transactions

| ID | Rule or transaction | Steps, all in one database transaction unless stated |
| --- | --- | --- |
| TX-01 | Creation order | Create enums, then tables in the order of 9.2 to 9.12, then 9.14 (customers before the foreign key vehicles.customer\_id). Add the circular foreign keys last: `vehicle_part_items` → `parts_catalog`, `work_orders`; `maintenance_alerts` → `tyres`, `work_orders`; `dvir_logs`, `breakdown_reports` → `work_orders`; `wo_attachments` → `work_order_parts`, `work_order_services`; `work_order_parts` → `tyres`, `goods_issue_items`; `tyres.issued_wo_id`. |
| TX-02 | Approve creation (T3) | Lock the WO; check status Pending\_Approval, BR-03 and the step checks of REQ-REG-004; freeze the WO's `work_order_assignments` (module, order, `step_config`, roles); set step 1 Open, the rest Locked; write `work_order_approvals` (`self_approved` when the System Admin approves its own WO) and `audit_logs`; notify the executor of step 1. |
| TX-03 | Stock step submit | Lock the part rows (`SELECT … FOR UPDATE`); check the WO is Active or In\_Progress, the step is Open or In\_Progress and each SKU and tyre size is on the WO list; check stock; insert `goods_issues` and `goods_issue_items`; decrease `parts_catalog.stock_qty`; insert `stock_cards` (GI); write `work_order_parts` at the average cost; for each chosen tyre set Issued, `issued_wo_id`, write a `work_order_parts` row at its purchase cost and a `tyre_events` row (Issued); set the step Submitted and open the next one; write `audit_logs`. Any failure rolls back everything. |
| TX-04 | Retired (DEC-60) | Parts supplied by an external workshop are recorded in the Part Purchase step (TX-21). Formerly: write only `work_order_parts` and `wo_attachments` (and, for a tyre, a new `tyres` row with source External\_Workshop, status Issued, plus `tyre_attachments`); never touch `parts_catalog`, `goods_issues` or `stock_cards`. |
| TX-05 | Issue reversal | On submit write the reversing `goods_issues` row with reason and no stock change; on verification increase `stock_qty` at the original `unit_cost`, insert `stock_cards` (GIR), write the reversing `work_order_parts` line, and set any Issued tyre back to In\_Stock (event Released). |
| TX-06 | Post a Goods Receipt | Set Posted; for each line increase `stock_qty`, recompute `average_cost = (old_qty × old_cost + qty × unit_price) / (old_qty + qty)`, insert `stock_cards` (GR). A GR correction does the same with its signed change and writes GRC. |
| TX-07 | Approve a stock opname | For each row set `stock_qty = physical_qty`, insert `stock_cards` (SA) for non-zero variance; set Approved, `approved_by`, `self_approved`; write `audit_logs`. |
| TX-08 | Confirm Receive tyres | New: one `tyres` row per tyre with `tyre_code` from `tyre_code_seq`, status In\_Stock, a `tyre_events` row (Received) and the invoice in `tyre_attachments`. Retread return: per tyre update `retread_order_items`, set In\_Stock (+1 `retread_count`, cost added, `last_retread_vendor`) or Scrapped, write `tyre_events`; set the dispatch Partial or Closed. Never writes `goods_receipts`, `parts_catalog` or `stock_cards`. |
| TX-09 | Mount, demount, rotate | Mount only a tyre with status Issued and `issued_wo_id` = this WO, not Active in `part_placements`, at a position of the vehicle's layout; mount sets Mounted and clears `issued_wo_id`. Demount sets the chosen status. Each writes `part_placements`, `part_placement_logs` and `tyre_events`. |
| TX-10 | Approve a tyre count | For each Missing row write `tyre_events` (Missing, then Lost) and set status Lost; set Approved; write `audit_logs`. |
| TX-11 | Baseline save | Write `vehicle_part_items`, set the chosen tyres Mounted, write `part_placements` (`is_baseline = true`), `part_placement_logs` (Baseline), `tyre_events` (document\_ref BASELINE) and `audit_logs`; no WO. |
| TX-12 | Change request decision | Approve: apply `revision` to the WO content, increment `amendment_no`, restore `status_before_amendment`, write the previous content to `audit_logs`. Reject: discard `revision`, restore the status only. |
| TX-13 | Completion request and approval | `completion_requested_at` is set only if every step is Verified or Skipped. Approval sets Completed, writes the completion approval, recalculates the vehicle status, resets linked `vehicle_part_items` \[A\], and releases still-Issued tyres to In\_Stock (event Released). |
| TX-14 | Cancel | Reverse posted goods issues (TX-05 without verification \[A\]), release Issued tyres, set Cancelled with reason, remove the card from the open schedule lists, write `audit_logs`. |
| TX-15 | Document first entry and renewal | First entry inserts `vehicle_documents` and `audit_logs` with no WO and no `document_renewals` row. Correct entry writes `document_corrections`, refused once a `document_renewals` row exists. A verified Document step writes `document_renewals` (with `work_order_id`), updates `vehicle_documents`, recalculates status and vehicle status, and adds the cost to `work_orders.document_cost`. A required type with no row counts as Missing and blocks trips. |
| TX-16 | Daily job (NFR-12) | Document statuses and one Document WO per Warning document; PM, part item and tyre alerts (one pending per subject); schedule Missed marks and Today alerts; vehicle status recalculation. |
| TX-17 | Shared map data | The Vehicles tab and the Part Replacement step both read `part_positions` of the vehicle's layout and the Active `part_placements`; there is no second copy of a layout. |
| TX-18 | Soft delete | Unique indexes on soft-deleted tables ignore rows where `deleted_at` is set. |
| TX-19 | Bill a completed WO | Inside TX-13: find the Draft invoice of the vehicle for the completion date or create it (customer from vehicles.customer\_id); insert an invoice\_wos row and one invoice\_lines row per part, tyre and service line of the WO (parts and tyres at cost × (1 + invoice\_part\_markup\_pct), services at their price), never merged; recompute subtotal, tax and total. No customer: insert the invoice\_wos row with invoice\_id NULL (Not billable) and no lines until a customer is set. Write audit\_logs. |
| TX-20 | Planner approval switch | Set app\_settings.planner\_approval\_until (or null to switch off), write audit\_logs with the reason, notify Supervisors and GMs. Every approval by a Planner checks the switch and BR-03 at decision time. |
| TX-21 | Part Purchase step submit | Write work\_order\_purchases and its lines with the calculated total, create a tyres row (status Issued, issued\_wo\_id) for each Tyre line, attach the receipt photos, add the total to work\_orders.parts\_cost; never touch parts\_catalog, goods\_issues or stock\_cards (DEC-60). |

### 9.14 Customers and invoices

```sql
CREATE TABLE customers (                      -- SD, REQ-BIL-001
  code VARCHAR(20) NOT NULL UNIQUE,
  name VARCHAR(150) NOT NULL,
  billing_address TEXT NOT NULL,
  tax_number VARCHAR(30),                     -- NPWP
  contact_name VARCHAR(100), phone VARCHAR(30), email VARCHAR(150),
  payment_terms_days SMALLINT NOT NULL DEFAULT 30 CHECK (payment_terms_days >= 0),
  is_active BOOLEAN NOT NULL DEFAULT true
);
CREATE SEQUENCE invoice_no_seq;               -- running number, never reset (DEC-50)
CREATE TABLE invoices (                       -- OL, one per vehicle per day (DEC-43)
  invoice_no VARCHAR(30) UNIQUE,              -- {NNNN}/BMI/{dd-mm-yy of issue}, set on Issue, never reused (DEC-46)
  customer_id BIGINT NOT NULL REFERENCES customers(id),
  vehicle_id BIGINT NOT NULL REFERENCES vehicles(id),
  service_date DATE NOT NULL,                 -- completion date of its WOs
  status invoice_status_t NOT NULL DEFAULT 'Draft',
  subtotal NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax_pct NUMERIC(5,2) NOT NULL,              -- copied from app_settings.invoice_tax_pct (11)
  tax_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  total NUMERIC(14,2) NOT NULL DEFAULT 0,
  issued_by BIGINT REFERENCES users(id), issued_at TIMESTAMP, due_date DATE,
  void_reason TEXT, voided_by BIGINT REFERENCES users(id), voided_at TIMESTAMP,
  version INT NOT NULL DEFAULT 1,
  CHECK (status IN ('Draft','Void') OR invoice_no IS NOT NULL),
  CHECK (status <> 'Void' OR void_reason IS NOT NULL)
);
CREATE UNIQUE INDEX uq_one_draft_per_vehicle_day ON invoices (vehicle_id, service_date) WHERE status = 'Draft';
CREATE TABLE invoice_wos (                    -- which completed WOs an invoice bills (BR-15)
  invoice_id BIGINT REFERENCES invoices(id),  -- NULL = Not billable (vehicle without a customer)
  work_order_id BIGINT NOT NULL REFERENCES work_orders(id),
  is_void BOOLEAN NOT NULL DEFAULT false      -- set when its invoice is voided
);
CREATE UNIQUE INDEX uq_wo_billed_once ON invoice_wos (work_order_id) WHERE NOT is_void;   -- BR-15
CREATE TABLE invoice_lines (                  -- parts, tyres and services used, never one line per WO (DEC-44)
  invoice_id BIGINT NOT NULL REFERENCES invoices(id),
  kind VARCHAR(10) NOT NULL CHECK (kind IN ('Part','Tyre','Service','Document','Stooring','Adjustment')),
  description VARCHAR(200) NOT NULL,          -- printed; no cost, markup or WO number on the PDF
  sku VARCHAR(40), service_id BIGINT REFERENCES service_catalog(id),
  qty NUMERIC(10,2) NOT NULL DEFAULT 1,
  unit_cost NUMERIC(14,4),                    -- internal: cost on the WO line
  markup_pct NUMERIC(5,2) NOT NULL DEFAULT 0, -- 50 for Part and Tyre, 0 otherwise; internal only
  unit_price NUMERIC(14,2) NOT NULL,          -- printed; = unit_cost × (1 + markup_pct / 100), snapshot (BR-07)
  amount NUMERIC(14,2) NOT NULL,              -- qty × unit_price; negative for a discount
  adjustment_reason TEXT,
  CHECK (kind <> 'Adjustment' OR adjustment_reason IS NOT NULL)
);
CREATE TABLE invoice_line_sources (           -- traceability: which WO lines make up an invoice line
  invoice_line_id BIGINT NOT NULL REFERENCES invoice_lines(id),
  work_order_id BIGINT NOT NULL REFERENCES work_orders(id),
  work_order_part_id BIGINT REFERENCES work_order_parts(id),
  work_order_service_id BIGINT REFERENCES work_order_services(id)
);
CREATE TABLE invoice_payments (               -- AO
  invoice_id BIGINT NOT NULL REFERENCES invoices(id),
  paid_on DATE NOT NULL,
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),   -- equal to the total in R1 (DEC-50)
  method VARCHAR(20) NOT NULL,                -- Transfer, Cash, Giro
  reference VARCHAR(60),
  recorded_by BIGINT NOT NULL REFERENCES users(id)
);
```

## 10. Release plan

Release 1 is built in seven steps; each step ends with its acceptance criteria passing and a UAT sign-off on staging by the product owner or the System Admin (DEC-77), and step 7 (mobile app and invoices) starts only when the web core of steps 1 to 6 is done (DEC-41). Release 2 adds the P1 items; P2 comes later.

| Stage | Scope | Requirement areas | Priority |
| --- | --- | --- | --- |
| R1 step 1 | Setup mode and Go live, sign-in, roles (Accounting included), vendor master, Access Manager area with the Planner approval switch, audit log, file storage adapter with upload compression, vehicles, classes and chassis layouts, document master, WO core with approvals and stamps, scope lock | IAM, VEH, PLC-013, DOC-001/002, WO, APR, BR-01 to BR-04, BR-14 | P0 |
| R1 step 2 | Assignment engine, module registry, step composer and WO presets, WO document with approval block | ENG, REG, WOD | P0 |
| R1 step 3 | Stock step (cut stock) and Part Purchase step, and parts inventory: catalog, Goods Receipt and correction, issues and reversal, stock card and export, low stock, stock opname | STK, INV | P0 |
| R1 step 4 | Mechanic Action with work location, and service catalog | MEC | P0 |
| R1 step 5 | Tyres (receive, retread, worn out, scrap, tyre count), Part Replacement and the chassis map, parts baseline and correction, normal life and early-failure alerts | TYR, PLC, BSL | P0 |
| R1 step 6 | Document management and renewal, PM engine and alerts, inspections and breakdowns entered by the System Admin, manual odometer and void, change request and amendment, maintenance schedule, role dashboards, in-app notifications, Requests list for draft WOs, bulk import of master data for go-live | DOC, PM, VEH-005 to VEH-008, CR, SCH, DSH, NTF-001, WO-014, IAM-011, DOC-013, BSL-008 | P0 |
| R1 step 7 (after steps 1 to 6 pass) | Customers and invoices with the Accounting role; one Android mobile app (APK) with push for Driver, Field Coordinator and the System Admin field menu, with GPS work location | BIL, MOB-001 to 003, MOB-006, MOB-008, MEC-008, NTF-002 (those roles) | P0 |
| Release 2 | iPhone (iOS) build of the mobile app (DEC-66); mobile menus for Mechanic and Supervisor/GM; reports and cost analytics, tyre CPK, dead stock, tyre minimum per size; AI assistant; Protrack odometer adapter; amendment history attachment; optional step skip; photo labels | MOB-004, MOB-005, MOB-007, NTF-002/003, RPT, AI, VEH-009, ENG-009, WOD-006 | P1 |
| Later | WhatsApp and email notifications, invoice email, parallel steps, mechanic shift schedule | NTF-004, BIL-011 | P2 |

**Go-live steps** (in Setup mode, REQ-IAM-010; every step by the System Admin except accounts): 1. accounts and roles by the Access Manager; 2. master data (classes and layouts, document types, part item types with normal life, services, stooring rates, customers, tax and markup); 3. vehicles with first documents; 4. tyres received with source Existing; 5. parts baseline per vehicle; 6. opening balance (REQ-INV-013); 7. a test restore of the backup (NFR-17); 8. Go live. From that moment the system runs normally with every approval; nothing is migrated from paper jobs.

**Dependencies.** Protrack API access (automatic odometer; manual and driver input cover the gap). Part item, position and service master data must be entered before launch. Service catalog prices are needed before Internal services can be recorded. A push provider is needed for R1 step 7. Customer master data and the tax rate are needed before the first invoice.

## 11. Decisions, assumptions, open questions and risks

### 11.1 Decisions (confirmed by the product owner)

| ID | Decision | Applies to |
| --- | --- | --- |
| DEC-01 | "PM" means Maintenance Planner | 2.1 |
| DEC-02 | Any one of Supervisor, GM or System Admin approves WO creation, amendment and completion, stock opname and tyre count | BR-04 |
| DEC-03 | Approval shows as a stamp or signature in an "Approved by GM/Supervisor" block at the bottom of the WO document, two lines: creation and completion | REQ-WOD-003 |
| DEC-04 | A Planner or the System Admin verifies every step; the next step opens without waiting for verification; completion needs every step verified | BR-05 |
| DEC-05 | Modules are a registry; a WO type may repeat a module; the Planner and System Admin design the process (WO types superseded by DEC-85: the process is now built per WO in Create WO) | 4.3 |
| DEC-06 | The part list is fixed at creation; executors raise change requests; submitting one puts the WO in Pending\_Amendment; the Approver only decides the revision; later steps stay Locked | 4.8 |
| DEC-07 | The visual placement map is a core feature | 4.6 |
| DEC-08 | The System Admin has every operational permission, may self-approve and self-verify (marked), and cannot manage accounts, roles or permissions; exactly one System Admin account | BR-03, BR-14 |
| DEC-09 | A separate Access Manager role (one or more accounts) manages accounts, roles and permissions and moves the System Admin role; self-handover by the System Admin is not allowed | 4.18 |
| DEC-10 | Each account has exactly one role | RL-1 |
| DEC-11 | One warehouse role, the Warehouse Manager; Goods Receipts and GR corrections are posted without approval | BR-12 |
| DEC-12 | Tyres are never in a Goods Receipt or the part catalog; Receive tyres is the only door, with type New tyres (Supplier or Existing) or Retread return; there is no separate tyre registration screen | 4.14 |
| DEC-13 | The In Stock tyre count goes down only through the parts baseline, the Stock step and an approved tyre count; WO creation includes tyre lines | BR-11 |
| DEC-14 | A tyre missing in an approved count gets the final status Lost | REQ-TYR-012 |
| DEC-15 | Warehouse documents: Draft → Pending\_Approval → Approved; a reject returns to Draft marked Returned; one stock opname holds many SKU rows | 3.7 |
| DEC-16 | Vehicle statuses are Active, Repair, Blocked and Inactive | SM-VEH |
| DEC-17 | Class or layout changes only with no mounted tyre and no open WO; mostly done at setup | REQ-VEH-003 |
| DEC-18 | The maintenance schedule: the Planner drags WO cards onto days, several per day; not strict; a missed card is marked Missed and moved; the Field Coordinator views it and gets alerts | 4.17 |
| DEC-19 | The Dispatcher role is merged into Field Coordinator (Koordinator Lapangan) with the Dispatcher capabilities | 2.1 |
| DEC-20 | Document warning days are set only per document type; first entry and Correct entry happen outside a WO; renewal goes through a Document WO | 4.7 |
| DEC-21 | BR-08 means a blocked vehicle cannot be assigned to trips; it can still be placed on the schedule | BR-08 |
| DEC-22 | A wrong odometer reading is voided (never deleted) by the System Admin with a reason; a jump above 1.500 km per day warns | BR-09 |
| DEC-23 | A wrong parts baseline value is corrected by the System Admin with Correct baseline until a WO touches that part | REQ-BSL-005 |
| DEC-24 | A breakdown report drafts a WO | REQ-PM-005 |
| DEC-25 | Superseded by DEC-41: the driver mobile app is built in R1 step 7; until then the System Admin enters driver data in Vehicles > Inspections | 4.11 |
| DEC-26 | One mobile app with a menu per role: Driver, Mechanic, Supervisor/GM, Field Coordinator | 4.20 |
| DEC-27 | Push notifications come with the mobile app (R1 step 7 for Driver, Field Coordinator and System Admin, P1 for the rest, DEC-41); email and WhatsApp later (P2) | 4.19 |
| DEC-28 | Users and roles is the Access Manager's own area, outside Settings | REQ-IAM-003 |
| DEC-29 | No Auditor role | 2.1 |
| DEC-30 | Indonesian number format; one field per column in every table | NFR-08, NFR-09 |
| DEC-31 | No video uploads; evidence is photos (JPG, PNG) and PDF only | NFR-06 |
| DEC-32 | Files may be stored outside Indonesia; the company SOP sets no data-location rule. Fleet size is under 100 vehicles | NFR-13 |
| DEC-33 | The WO document is print-ready: no photos or colour images, attachments listed as text, and the placement snapshot printed as a black-and-white line drawing plus a table of changed positions. Verifiers and Approvers see the photos in the system (StepVerify, ApprovalReview, CompletionReview, mobile review) through one shared viewer | REQ-WOD-007, REQ-FUP-016 |
| DEC-34 | The Field Coordinator (Korlap) creates and submits draft WOs; there is no separate field admin role, the System Admin covers that work | RL-6, REQ-WO-014 |
| DEC-35 | Approval stays with the Supervisor, GM or System Admin; the Planner decides with them outside the system, and an Access Manager can switch Planner approval on for urgent cases | RL-7, REQ-IAM-008 |
| DEC-36 | The approval review shows the part age, and an early failure (replaced before its normal life) raises an alert; the Planner sets the normal life in Settings | REQ-APR-011, REQ-BSL-009 |
| DEC-37 | The GM acts as director: the rights of the Supervisor plus wider data | RL-8 |
| DEC-38 | One Stock step can be worked by the Warehouse Manager, the Field Coordinator and the System Admin, and can cut stock and buy parts in the same step | REQ-STK-010 |
| DEC-39 | Internal services stay catalog only; completion approval stays | REQ-MEC-002, BR-05 |
| DEC-40 | Superseded by DEC-90: one-time position capture at Mechanic Action submit is removed. The work location is captured once from the Driver's breakdown report and verified through the Mobilisasi step's location trail (REQ-MOB-003, REQ-MBL-005). | REQ-MEC-008 (retired), REQ-MBL-005 |
| DEC-41 | The mobile app for Driver, Field Coordinator and System Admin moves to release 1 (P0), built in R1 step 7 after the web core; Mechanic and Supervisor/GM menus stay P1. Replaces DEC-25 and the release part of DEC-26 | 4.20, 10 |
| DEC-42 | A new Accounting role and an invoice feature: invoices go to the vehicle's customer, grouped per day, with every WO of the unit; owned by Accounting and the Supervisor | 4.23, BR-15 |
| DEC-43 | One invoice per vehicle per day | REQ-BIL-002 |
| DEC-44 | Invoice lines show the parts and services used, not the WOs; parts are billed at purchase cost + 50%, services without markup; the PDF shows prices only, never the markup | REQ-BIL-003, REQ-BIL-007 |
| DEC-45 | PPN 11% | REQ-BIL-004 |
| DEC-46 | Invoice number: running number/BMI/dd-mm-yy | REQ-BIL-005 |
| DEC-47 | The early-failure tolerance is adjustable by the Planner in Settings | REQ-BSL-007 |
| DEC-48 | Which approvals the Planner gets when switched on is a checklist in the Access Manager menu | REQ-IAM-008 |
| DEC-49 | The Field Coordinator never cuts warehouse stock; any of the three Stock roles may submit the step. The WO creator sets each part line to Cut stock or Purchase mode, and Purchase mode raises a purchase alert (superseded by DEC-60) | REQ-STK-010 to 012 |
| DEC-50 | The invoice running number never resets; tyres carry the 50% part markup; document renewals are billed at cost; invoice lines are never merged; invoices need no approval, take full payment only and are not emailed in R1; a short Cut stock line may be moved to Purchase without a change request | REQ-BIL-003, REQ-BIL-005, REQ-BIL-006, REQ-STK-004 |
| DEC-51 | The WO document carries a stooring (mobilisation) fee; prices are set per region in the stooring rates master data, maintained by the System Admin. Since DEC-90 the fee is produced by the Mobilisasi step (its destination from the breakdown report), not by the Mechanic Action step | REQ-MBL-006, REQ-MEC-010 |
| DEC-52 | Superseded by DEC-90: the stooring area and location no longer sit on the Mechanic Action step. The Mobilisasi module carries the stooring area (from the breakdown destination) and records the mechanic's location trail for the Planner and System Admin to check | REQ-MEC-007 (retired), REQ-MEC-008 (retired), REQ-MBL-005 |
| DEC-53 | Superseded by DEC-90 for position capture: no position is required on Mechanic Action, Part Replacement or Part Check submit. Stooring is charged by the Mobilisasi step, once per WO per region per day, and is still billed to the customer at cost, without markup | REQ-MBL-006, REQ-BIL-003 |
| DEC-54 | The remaining gaps of the audit are closed with the defaults of REQ-INV-013 (opening balance), REQ-WO-015 (priority), REQ-IAM-009 (passwords), REQ-MOB-009 (offline), REQ-NTF-005 (notification matrix), BR-16 (no reopening), RL-10 (branch), NFR-14 to 17 (time, numbering, money, backup) and the go-live steps of 10; each default is marked \[A\] and listed in 11.2 | 4, 5, 8, 10 |
| DEC-55 | Before go-live the system is in Setup mode: only the System Admin enters data, nothing needs approval, and a Go live button switches it to normal operation. No priority deadlines, but late WOs alert everyone involved and the GM. Password policy confirmed; submit needs a connection; no branches; WIB; number formats kept for now and editable later; rounding confirmed; backups and audit logs kept 1 year. Mechanic shift schedule comes in a later release | REQ-IAM-010, REQ-INV-013, REQ-SCH-007, RL-10, NFR-14 to 17, 10 |
| DEC-56 | In Setup mode no role other than the System Admin and Access Managers can sign in | REQ-IAM-010 |
| DEC-57 | Audit records older than 1 year are exported to an archive file in storage and then deleted from the database; this is the only exception to append-only BR-10 | BR-10, NFR-17 |
| DEC-58 | Audit answers: a step is assigned to a named user or claimed by the first executor; parts bought for a cancelled WO go into stock by Goods Receipt and are never billed; a retreaded tyre is billed at its latest retread cost plus markup; one tyre early-failure tolerance in Settings; no stooring for External work; the verifier checks the position on the map; cash advances stay outside the system; the invoice has an optional wet signature, no approval; the System Admin or Field Coordinator sets each vehicle's driver; a vendor master; no on-trip status; KPI targets after about 3 months; every earlier assumption ASM-01 to ASM-46 is confirmed | REQ-ENG-011, REQ-WO-008, REQ-BIL-003, REQ-BIL-007, REQ-BSL-009, REQ-MBL-005, REQ-VEH-010, REQ-INV-014, 11.2 |
| DEC-59 | A step's draft moves with the step when it is reassigned; an assignee may release a step with a reason, and the Planners are notified | REQ-ENG-011 |
| DEC-60 | The Stock step only cuts warehouse stock. Buying parts outside is a separate Part Purchase module: the buyer types quantity and price for the parts the Planner or System Admin put on the WO (DEC-63), and sees each line total and the grand total at once to check against the shop receipt. Replaces the mixed Stock step of DEC-38 and DEC-49 and the Cut stock or Purchase mode per line | REQ-STK-001, REQ-PUR-001 |
| DEC-61 | The Part Purchase step has no Total on receipt field and no match check; it shows the line totals and the calculated total only; the step verifier checks them against the receipt photo (DEC-62) | REQ-PUR-003 |
| DEC-62 | Part Purchase lines pick the part from the parts catalog so part age and early failure work; quantity and price are typed. A vendor may be chosen or typed by hand. A confirmed shortfall adds a Part Purchase step after the Stock step. The step verifier checks the lines and total against the receipt photo and returns the step with a note when they differ | REQ-PUR-002 to 004, REQ-PUR-008, REQ-PUR-009 |
| DEC-63 | The Planner and the System Admin design which parts a WO uses. The Warehouse Manager only confirms availability and issues in the Stock step; the Field Coordinator only types quantity and price in the Part Purchase step. Neither adds or changes parts; that needs a change request | REQ-PUR-002, REQ-PUR-008 |
| DEC-64 | A Mechanic or Field Coordinator creates a Draft WO and sends it to the Planner, who checks, may change and submits it for approval (replaces the Field Coordinator submit of DEC-34). For the Part Purchase step the Planner lists only which parts to buy, without quantity; the Field Coordinator types the quantity actually bought, which may exceed the shortfall, and the price. This applies only to the Part Purchase module; the Stock step keeps planned quantities | REQ-WO-001, REQ-WO-016, REQ-PUR-002 |
| DEC-65 | Not every WO type has every module; the Create WO form follows the step design of the chosen type, one section per step in order, from each module's creation section, so no module is hard-coded in the form (superseded by DEC-85: the steps are composed in the form itself) | REQ-WO-017, REQ-WO-004 |
| DEC-66 | Technology stack: TypeScript monorepo with a NestJS API server, PostgreSQL, Cloudflare R2 file storage (DEC-32), Next.js web and an Expo React Native mobile app; web and mobile reach the database only through the API. The Android app is distributed as a signed APK; iPhone follows in Release 2. Hosting is in the cloud. The system is built by AI agents and finished by internal developers | 8.2, NFR-18 |
| DEC-67 | Hosting: Google Cloud in the Jakarta region (Cloud Run for API, workers and web; Cloud SQL for PostgreSQL; Memorystore for Redis; Secret Manager), files on Cloudflare R2, and Cloudflare DNS, TLS and protection in front | 8.2, NFR-17 |
| DEC-68 | Vehicle classes have a unit kind: Powered (tractor head, wingbox rigid truck, van) or Towed (trailer tail). A Towed unit has no odometer and counts tyre life, part age and PM in days only. Head and trailer tail are separate units with separate WOs and no coupling record. Layouts may have spare tyre positions, from 0 upward. The fleet has no lift axles, so axle roles stay Steer, Drive and Trailer | REQ-PLC-017 to 020 |
| DEC-69 | The fleet includes pickup trucks used as safety patrol vehicles (Toyota Hilux): class Pickup\_Patrol, unit kind Powered, layout of 2 axles (Steer and Drive) with 1 tyre per side and 1 spare, 5 positions. It is an internal vehicle, so it has no customer and is never invoiced (REQ-BIL-001) | REQ-PLC-017 |
| DEC-70 | PM packages are set per vehicle class: each package (interval, tasks, suggested parts, WO preset since DEC-85) belongs to one class, a class may have several, and a Towed class uses days only. A vehicle gets alerts only from the packages of its own class | REQ-REG-007, REQ-PM-001, REQ-PM-002 |
| DEC-71 | Superseded by DEC-90: the 15-second one-time position capture at Mechanic Action submit is removed with the capture itself; location now comes from the breakdown report and the Mobilisasi location trail | REQ-MEC-008 (retired), REQ-MBL-005 |
| DEC-72 | A change request may change only steps that are not yet submitted; a submitted step is corrected by the verifier returning it, and posted stock by a reversal | REQ-CR-008 |
| DEC-73 | Release 1 testing of the chassis map covers the launch layouts (tractor head, trailer tail 2 and 3 axles, wingbox rigid, pickup patrol Hilux, van) plus generated layouts of 1 to 6 axles with every role, single or dual, and 0 to 2 spares, so a future unit type is added by the System Admin as data, without code change | REQ-PLC-017, AC-PLC-010 |
| DEC-74 | Release 1 file exports (xlsx, CSV, PDF) are only the stock card and the audit log; the WO document and invoice PDFs are documents, not exports, and stay in Release 1. Every other export, including list exports and Reports, comes in Release 2 | REQ-INV-008, REQ-IAM-007, REQ-RPT-001 |
| DEC-75 | Bulk import moves to Release 1: the System Admin prepares the master data before go-live, importing customers, vendors, services, stooring rates, parts, vehicles, documents, existing tyres, baselines and the opening balance from spreadsheets in Setup mode; an import goes in only when every row is valid | REQ-IAM-011, REQ-DOC-013, REQ-BSL-008 |
| DEC-76 | In Release 1 the odometer comes from the Driver: the daily inspection in the mobile app asks the reading and saves it with source Driver; System Admin manual readings remain; the Protrack adapter stays in Release 2 | REQ-MOB-003, REQ-VEH-006, REQ-VEH-009 |
| DEC-77 | User acceptance testing and sign-off at the end of each Release 1 step are done by the product owner or the System Admin, on staging, with real work cases | 10 |
| DEC-78 | The risk-reducing engineering practices of the development plan are binding for the agents and internal developers (8.3) | 8.3 |
| DEC-79 | The highest-risk areas are marked so agents focus their effort on them: critical for the assignment engine and module registry; high for the WO lifecycle, Stock step, inventory, Part Replacement and chassis map, and the mobile app | 8.4 |
| DEC-80 | Data simplification after the schema audit: removed unused columns (driver licence and WhatsApp, position service life and coordinates, signature hashes); removed duplicates (vehicle axle and tyre counts, read from the layout; the WO link on alerts, inspections and breakdowns, kept only on work\_orders with one-live-WO unique indexes; the inspection odometer, now a link to odometer\_logs); tyre tread and pressure kept as a same-transaction cache; usual validity now prefills the renewal expiry. No feature or relation is lost | 9, REQ-DOC-007 |
| DEC-81 | The product is named BMI Stooring System and uses the BMI logo supplied by the client. Brand tokens: primary red #AD2713, dark red #8A1D0C, gold #C09D11 (dark surfaces only), and the Petrol Complement neutrals petrol #1F4E5F, petrol ink #14262E and selection mist #E6EFF1 (DEC-84, which replaced the original ink #1A1A1A and sand #F7F1E8); the status red #B91C1C stays separate and every status keeps its text. Logo on a white tile on dark surfaces, grayscale on printed documents. This narrows the earlier rule that visual style is fully free (0.1): the rest of the style stays free | 0.1, 7.1, 7.7, 7.8 |
| DEC-82 | The web navigation is collapsible to a 64 px icon rail, saved per user, and icons are used where they help users find their way: every navigation item on web and mobile, assignment modules on step cards and in the WO designer, Settings home items, vehicle detail tabs, and add and back buttons. Icons come from one outline set and always sit beside a text label, except in the collapsed rail | 7.2, 7.3, 7.5 |
| DEC-83 | The UI gives immediate feedback on every control and uses motion only to acknowledge actions and explain state changes; the approval stamp is the one authored moment. Interactions are clickable in the design canvas (stamp, Pass/Fail, collapse menu). Reduced motion is respected | 7.5 |
| DEC-84 | Palette Petrol Complement: petrol #1F4E5F joins BMI red as the second colour (links, info states, icons, charts); the frame becomes petrol ink #14262E and selection mist #E6EFF1, with cool grey neutrals. This replaces the ink #1A1A1A and sand #F7F1E8 of DEC-81; red, gold, status colours and the logo rules are unchanged | 7.8, DESIGN.md |
| DEC-85 | WO types and the WO type designer in Settings are removed. The Planner or System Admin builds each WO's steps directly in Create WO, on one screen: modules are dragged from a palette (or added with Add step), reordered by drag or Move up and Move down, and each step's roles and details are filled in place. Saved step sequences become WO presets (Save as preset, Settings: WO presets), used as optional starting points and by PM packages and alerts. Each WO gets a title, a required category (PM, Corrective, Tyre, Document, Other) and a Vehicle goes to the workshop flag, which replace the type in lists, reports and the Repair status. Drafts from Field Coordinators and mechanics carry no steps, only the parts needed; a change request may add, remove or move steps that have not started. The engine is unchanged: it already runs each WO's own steps (DEC-65 and DEC-05 apply to WOs instead of types) | 4.1, 4.3, REQ-WO-017, REQ-REG-001 to 005, REQ-CR-003, 9 |
| DEC-86 | A new Settings: Alert rules screen holds, per alert kind (PM due, Document expiry, Tyre tread, Part item life, Inspection fail, Breakdown, Field report), the trigger and the action: Show the alert only or draft a WO, when to draft, the preset, the priority and who is notified. The preset is per package for PM and per document type for documents, the same values as in PM packages and Document types (editable in both places), and per rule for the other kinds. Reported problems always draft and default to no preset (DEC-85). Tyre and part item limits move from Alert thresholds, which keeps only warning-only limits (odometer, dead stock, schedule, file storage). Earlier rule that document warning days are set only on document types is relaxed: they are also editable in Alert rules | REQ-PM-003, REQ-PM-006 to 010, REQ-WO-012, 7.3, 7.4, 9 |
| DEC-87 | A step's start time is the moment its executor presses Start, not the moment the step opens after the previous one is submitted, and not the first edit. Each step records Open, Start, Pause (with a reason), Resume, Submit, Return and Verify in an append-only log, so time splits into waiting to start, working, paused and waiting for verification, per attempt. A forgotten Start may be entered up to 2 hours back with a reason and is marked; other corrections are System Admin only, with reason and audit. For external workshops the Field Coordinator or System Admin presses Start at hand-over. The times show in the WO document (Execution time) and in a Step time report and dashboard card for the GM and Supervisor, and never on an invoice. Durations are calendar time; working hours and holidays are not deducted (pauses cover breaks and shift ends). | REQ-ENG-012 to 016, REQ-WOD-008, REQ-RPT-005, REQ-DSH-010, 4.2 |
| DEC-88 | A sixth module, Part Check (troubleshooting), lets the Planner list parts to check in Create WO. The mechanic reports per part the condition, Good, Repair or Replace, an optional Unsafe to drive mark and at least one photo, and may add parts not on the list. When the step is verified, the not-good findings become one Draft WO with steps built from them (Stock or Part Purchase for Replace, Mechanic Action for Repair, Part Replacement for tyres). The Planner activates it, which means submitting it for approval, or discards it with a reason; the draft is never Active on its own, keeping the approval rule. Repairs never run in the same WO as the check, so the check WO can be completed and billed on its own. Unsafe to drive warns and notifies but does not block the vehicle. | REQ-CHK-001 to 006, 9.6 |
| DEC-89 | The Part Check is billed: its step carries a check service from the service catalog (new category Diagnosis: SVC-095 Brake system check, SVC-096 Electrical system check, SVC-097 General vehicle check) or an external workshop's price; stooring for a field check is charged by the WO's Mobilisasi step (DEC-90), not by the Part Check step. At least one service line is required; a free check needs a Rp 0 catalog service. The repairs it finds are billed with the follow-up WO. Replaces the no-cost rule of DEC-88 | REQ-CHK-001, REQ-CHK-007, REQ-MBL-006, 9.6 |
| DEC-90 | The stooring (mobilisation) capability moves out of the Mechanic Action step into a new, data-driven assignment module Mobilisasi (REQ-MBL-\*), a peer of Stock, Part Purchase, Mechanic Action, Part Replacement and Document. Mechanic Action no longer captures the device position (REQ-MEC-007 to 009 retired, superseding DEC-40, DEC-52, DEC-53 position capture and DEC-71). A Driver breakdown captures the driver's location once and auto-drafts a WO pre-seeded with one Mobilisasi step at that location (REQ-WO-003, REQ-MOB-003); the Planner composes the rest. The Mobilisasi step shows a route to the destination, auto-submits on arrival with a manual Finish stooring fallback, and records the mechanic's location trail only while In\_Progress; it produces the stooring fee (one per WO per region per day). The continuous trail is broader than the old one-time capture, so the RSK-09 / UU PDP handling (privacy notice, trail scoped to the active step, access logged, visible to Planner and System Admin only) applies | REQ-MBL-001 to 006, REQ-WO-003, REQ-WO-014, REQ-MOB-003, REQ-PM-005, RSK-09, 3.3, 9.5, 9.6 |

### 11.2 Assumptions \[A\] and the question to confirm each

| ID | Assumption built into this spec | Where | Question for the product owner |
| --- | --- | --- | --- |
| ASM-01 | PostgreSQL syntax for the schema | 9 | Confirmed (DEC-58). |
| ASM-02 | Part Replacement and the map cover tyres only; other parts are tracked as part items | 4.6 | Confirmed (DEC-58). |
| ASM-03 | Map position statuses Normal, Due soon, Act now, Empty, Missing, from km and days since fitting, tread and pressure | REQ-PLC-008 | Confirmed (DEC-58). |
| ASM-04 | Decided: a map snapshot is saved at step submit, shown in colour in the system and printed in the WO document as a black-and-white line drawing with a table of changed positions (DEC-33) | REQ-PLC-014 | Decided. |
| ASM-05 | An optional step can be skipped with a reason and Approver consent (P1) | REQ-ENG-009 | Confirmed (DEC-58). |
| ASM-06 | A step returned while the WO is Pending\_Verification puts the WO back to In\_Progress | SM-WO T12 | Confirmed (DEC-58). |
| ASM-07 | No change request while the WO is Pending\_Verification | REQ-CR-007 | Confirmed (DEC-58). |
| ASM-08 | Vehicle status precedence: Inactive, Blocked, Repair, Active | SM-VEH | Confirmed (DEC-58). |
| ASM-09 | A rejected completion keeps the WO in Pending\_Verification | SM-WO T14 | Confirmed (DEC-58). |
| ASM-10 | An Issued tyre returns to In\_Stock when its WO is cancelled or completed without mounting it | SM-TYRE | Confirmed (DEC-58). |
| ASM-11 | A tyre bought by an external workshop is recorded as a new tyre, Issued to the WO (now in the Part Purchase step, DEC-60) | REQ-STK-007 | Confirmed (DEC-58). |
| ASM-12 | The serial number is unique per brand, not across all tyres | REQ-TYR-002 | Confirmed (DEC-58). |
| ASM-13 | Demount offers Needs\_Retread, Worn\_Out or Back to stock; a Worn\_Out tyre cannot go to retread; a retread dispatch needs no approval | 4.14 | Confirmed (DEC-58). |
| ASM-14 | Tyre statuses are master data that the System Admin can extend | REQ-TYR-003 | Confirmed (DEC-58). |
| ASM-15 | A part item without a baseline shows Missing and raises no alert | REQ-BSL-004 | Confirmed (DEC-58). |
| ASM-16 | A completed WO resets every part item linked to its lines through the service or part catalog | REQ-BSL-006 | Confirmed (DEC-58). |
| ASM-17 | A renewal receipt image is required by default, set per document type | REQ-DOC-007 | Confirmed (DEC-58). |
| ASM-18 | The Access Manager can edit the permission matrix (`role_permissions`), except locked cells | REQ-IAM-005 | Confirmed (DEC-58). |
| ASM-19 | The audit log is visible to Access Managers and the System Admin | REQ-IAM-007 | Confirmed (DEC-58). |
| ASM-20 | 5 failed sign-ins lock an account for 15 minutes | REQ-IAM-001 | Decided (DEC-55). |
| ASM-21 | Files are limited to 10 MB each | NFR-06 | Confirmed (DEC-58). |
| ASM-22 | Reports are visible to Supervisor, GM, Planner and System Admin; the Warehouse Manager sees only the Inventory tab | REQ-RPT-004 | Confirmed (DEC-58). |
| ASM-23 | Low stock per tyre size, the overdue retread alert and the Inventory report contents | REQ-TYR-015, REQ-RPT-003 | Confirmed (DEC-58). |
| ASM-24 | Approvers get a reminder when an item waits longer than a set time (P1) | REQ-APR-008 | Confirmed (DEC-58). |
| ASM-25 | The Planner and System Admin record manual odometer readings; the person who entered a reading can request its void | REQ-VEH-006, REQ-VEH-007 | Confirmed (DEC-58). |
| ASM-26 | Forms are full pages; WO cards are dragged directly on the schedule | NAV-4 | Confirmed (DEC-58). |
| ASM-27 | Cancelling a WO reverses its posted issues without a separate verification | TX-14 | Confirmed (DEC-58). |
| ASM-28 | Cloudflare R2 is the first storage provider: US$0,015 per GB-month, 10 GB free, no egress fee | NFR-13 | Confirmed (DEC-58). |
| ASM-29 | Uploaded images are compressed (1600 px, about 80% quality) and the original is not kept | NFR-06 | Confirmed (DEC-58). |
| ASM-30 | Files older than 12 months move to Infrequent Access; storage budget 50 GB with an alert at 80% | NFR-13 | Confirmed (DEC-58). |
| ASM-31 | GPS and every EXIF field except capture time are removed from photos | 8.1 | Confirmed (DEC-58). |
| ASM-32 | Limits: PDF at most 20 pages; a step holds at most 10 photos and 5 documents; signed links expire after 5 minutes | REQ-FUP-002, REQ-FUP-010 | Confirmed (DEC-58). |
| ASM-33 | Seamless upload: images up to 30 MB are accepted and compressed without a message; Submit waits for uploads and sends by itself; 3 silent retries before the user is asked | 8.1 | Confirmed (DEC-58). |
| ASM-34 | One invoice per vehicle per day (not one per customer per day with several vehicles) | REQ-BIL-002 | Decided: per vehicle per day (DEC-43). |
| ASM-35 | Invoice lines are parts and services (DEC-44); tyres count as parts with the markup; document renewal costs are billed at cost; lines are never merged | REQ-BIL-003 | Decided (DEC-50). |
| ASM-36 | PPN 11% from Settings, can be set to 0 | REQ-BIL-004 | Decided: PPN 11% (DEC-45). |
| ASM-37 | Invoices need no approval; Draft, Issued, Paid, Void; full payment only in R1; no email in R1; the running number of the invoice number never resets | REQ-BIL-005, REQ-BIL-006 | Decided (DEC-46, DEC-50). |
| ASM-38 | Early-failure tolerance 80% of normal life per part item type | REQ-BSL-009 | Decided: the Planner adjusts it in Settings (DEC-47); 80% is only the starting value. |
| ASM-39 | GM extra data: all report tabs including Cost, fleet-wide cost cards, early-failure report, audit log; the Supervisor sees no Cost tab | RL-8 | Decided. |
| ASM-40 | Planner approval covers the kinds the Access Manager ticks (DEC-48), with an optional end time | RL-7 | Decided (DEC-48). |
| ASM-41 | The Field Coordinator records Purchase lines but never issues warehouse stock; any of the three roles may submit the step | REQ-STK-010 | Decided (DEC-49); superseded by DEC-60. |
| ASM-42 | The interface says "WO"; "SPK" is listed in the glossary as the same thing | 1.5 | Decided: the interface says WO. |
| ASM-43 | Push notifications are P0 for the R1 mobile roles | REQ-NTF-002 | Confirmed (DEC-58). |
| ASM-44 | A position is required for every submit, on the phone and on the web | REQ-MEC-008 | Decided (DEC-53). |
| ASM-45 | One stooring fee per WO per region per day, even when several steps are done there | REQ-MEC-009 | Decided (DEC-53). |
| ASM-46 | Stooring is billed to the customer at cost, without markup | REQ-BIL-003 | Decided (DEC-53). |
| ASM-47 | Opening balance entered by the System Admin in Setup mode, no approval | REQ-INV-013 | Decided (DEC-55). |
| ASM-48 | Priorities Low, Normal, High, Urgent without deadlines; Urgent notifies every Approver at once | REQ-WO-015 | Decided (DEC-55). |
| ASM-49 | Temporary password from the Access Manager, no email reset; web session 30 minutes idle, mobile 30 days | REQ-IAM-009, NFR-05 | Decided (DEC-55). |
| ASM-50 | Mobile drafts are kept offline but Submit needs a connection | REQ-MOB-009 | Decided (DEC-55). |
| ASM-51 | No branches | RL-10 | Decided (DEC-55). |
| ASM-52 | WIB everywhere; daily job at 00:30 | NFR-14 | Decided (DEC-55). |
| ASM-53 | Number formats of NFR-15 | NFR-15 | Decided: keep for now; editable later (DEC-55). |
| ASM-54 | Rounding half up to a whole rupiah per unit price and on PPN | NFR-16 | Decided (DEC-55). |
| ASM-55 | Daily backup and audit logs kept 1 year | NFR-17 | Decided (DEC-55). |
| ASM-56 | Setup mode before go-live, then normal operation | 10 | Decided (DEC-55). |
| ASM-57 | A vendor not in the master can be typed as Other | REQ-PUR-004 | Decided (DEC-62): choose from the master or type by hand. |
| ASM-58 | No receipt total field or match check; the buyer checks the lines against the receipt by eye | REQ-PUR-003 | Decided (DEC-61). |
| ASM-59 | A confirmed shortfall adds a Part Purchase step right after the Stock step | REQ-PUR-008 | Confirmed (DEC-62). |
| ASM-60 | Parts bought outside are picked from the catalog and reset part items and early failure like issued parts | REQ-PUR-009 | Decided (DEC-62). |
| ASM-61 | Which parts a WO uses is designed by the Planner or System Admin; a part not yet in the catalog is added to the catalog before it is put on the WO | REQ-PUR-002 | Decided (DEC-63). |
| ASM-62 | The buyer types the quantity after buying and may buy more than the shortfall | REQ-PUR-002 | Decided (DEC-64). |
| ASM-63 | Files are on Cloudflare R2 (DEC-32); the API server, workers, PostgreSQL and Redis run on a cloud provider chosen by the internal developers, in a region close to Indonesia | 8.2 | Decided (DEC-67). |
| ASM-64 | Bulk import is available only in Setup mode, and classes, layouts, document types, part item types and PM packages are entered in their screens | REQ-IAM-011 | Decided: Setup mode only. Bulk import is not available after go-live; post-launch records are added through their own screens. |

### 11.3 Other open questions

| ID | Question |
| --- | --- |
| Q-01 | Targets for G-2 (PM on time), G-6 (opname variance) and G-7 (WO cycle time), to set after about 3 months of live use (DEC-58). |
| Q-02 | Answered by DEC-34 and DEC-58: the Field Coordinator creates draft WOs and executes Part Purchase steps (RL-6); there is no on-trip status in R1. |
| Q-03 | Open, to define later (product owner): who owns the Google Cloud, Cloudflare, Firebase and Expo (EAS) accounts, and which domain the web app and API use. Needed before the first staging deploy (R1 step 1) and before the first APK build (R1 step 7). |
| Q-04 | Decided: the AI assistant (REQ-AI-001 to 004) and its settings page are deferred to a later release; they have no artboard and are not built in Release 1. |
| Q-05 | Decided: the Indonesian translation of the UI is deferred to a later release. The current canvas screens are English only; Indonesian becomes the default language once the translation is delivered (NFR-09). |

### 11.4 Risks

| ID | Risk | Mitigation |
| --- | --- | --- |
| RSK-01 | Approver bottleneck: all work waits for one approval | Any one Approver suffices; waiting items show on dashboards, in-app and by push (P1), with a reminder (ASM-24) |
| RSK-02 | A change request freezes the step | Keep requests small; show how long a WO has waited |
| RSK-03 | A badly designed step sequence stalls WOs | Live checks in Create WO (REQ-REG-004), approval of every WO's steps, presets as tested starting points |
| RSK-04 | Master data (layouts, part items, services, positions) missing at go-live | Load it in R1 step 1 to 5; bulk import in Release 1 (REQ-IAM-011) |
| RSK-05 | Drivers and mechanics do not adopt the mobile app | Short flows, camera-first photos, release 1 fallback through the System Admin and desktop |
| RSK-06 | Protrack API access delayed | Manual and driver readings cover the gap |
| RSK-07 | R1 grows by a mobile app and invoicing, so the web core may ship later | Mobile and invoicing are R1 step 7, started only after steps 1 to 6 pass; they can ship as a separate R1 drop |
| RSK-08 | Planner approval left on by mistake weakens the four-eyes rule | Optional end time, audit record, notice to Supervisors and GMs, BR-03 still enforced |
| RSK-09 | Recording an employee's position without telling them may conflict with the Indonesian personal data protection law (UU PDP 27/2022); the phone also asks for location permission once. The Mobilisasi module (DEC-90, REQ-MBL-005) now records a continuous location trail of the mechanic while the step is In\_Progress — broader than the old one-time capture — raising the privacy exposure | Cover it in the employment agreement or company policy and the app privacy notice (not on the step screen); scope the location trail strictly to the duration a Mobilisasi step is In\_Progress and stop recording at submit; keep the data only for verification, visible to Planner and System Admin, with every access logged |

## 12. Traceability matrix

One row per requirement area: where it is specified, tested, shown, stored, guarded and walked through. An agent can start from any column and find the rest.

| Area | Requirements | Acceptance criteria | Screens | Main tables | Rules and machines | Flows |
| --- | --- | --- | --- | --- | --- | --- |
| WO lifecycle | REQ-WO-001 to 017 | AC-WO-001 to 006 | [`WOList`](<Design Artifact/Work Orders tab-html/WOList.dc.html>), [`CreateWO`](<Design Artifact/Create Work Order step composer-html/CreateWO.dc.html>), [`CreateWOFromAlert`](<Design Artifact/Create WO from an alert-html/CreateWOFromAlert.dc.html>), [`WORejected`](<Design Artifact/Work Order rejected-html/WORejected.dc.html>), [`WorkOrder`](<Design Artifact/Work Order detail-html/WorkOrder.dc.html>), [`CancelWO`](<Design Artifact/Cancel Work Order (dialog)-html/CancelWO.dc.html>), [`ApprovalReview`](<Design Artifact/Review approval creation-html/ApprovalReview.dc.html>) | `work_orders`, `work_order_approvals` | BR-01, BR-03, BR-04, SM-WO | FLW-PLN-01 to 03, FLW-APR-01, FLW-APR-05 |
| Assignment engine | REQ-ENG-001 to 011 | AC-ENG-001 to 005 | [`WODetailVerify`](<Design Artifact/WO detail verification and completion-html/WODetailVerify.dc.html>), [`StepVerify`](<Design Artifact/Verify a step-html/StepVerify.dc.html>), [`StepLocked`](<Design Artifact/Step state locked-html/StepLocked.dc.html>), [`StepReturned`](<Design Artifact/Step state returned-html/StepReturned.dc.html>) | `work_order_assignments` | BR-03, BR-05, SM-STEP | FLW-PLN-05, FLW-PLN-07, FLW-MEC-04 |
| Module registry | REQ-REG-001 to 007 | AC-REG-001 to 005 | [`CreateWO`](<Design Artifact/Create Work Order step composer-html/CreateWO.dc.html>), [`SettingsWOPresets`](<Design Artifact/Settings WO presets-html/SettingsWOPresets.dc.html>), [`SettingsPMPackages`](<Design Artifact/Settings PM packages and tasks-html/SettingsPMPackages.dc.html>) | `assignment_modules`, `wo_presets`, `wo_preset_steps`, `work_order_assignments`, `pm_packages` | PR-6 | FLW-PLN-08 |
| Stock step | REQ-STK-001 to 012 | AC-STK-001 to 006 | [`Stock`](<Design Artifact/Step Stock-html/Stock.dc.html>), [`PartPurchase`](<Design Artifact/Step Part Purchase (bought outside)-html/PartPurchase.dc.html>), [`StockReversal`](<Design Artifact/Stock step reversal after submit-html/StockReversal.dc.html>) | `goods_issues`, `work_order_parts`, `stock_cards` | BR-01, BR-02, BR-06, BR-07, TX-03 to 05 | FLW-WHM-01, FLW-WHM-02 |
| Mechanic Action | REQ-MEC-001 to 010 | AC-MEC-001 to 005 | [`Mechanic`](<Design Artifact/Step Mechanic Action-html/Mechanic.dc.html>), [`MechanicExternal`](<Design Artifact/Mechanic Action external team-html/MechanicExternal.dc.html>), [`SettingsServiceCatalog`](<Design Artifact/Settings Service catalog-html/SettingsServiceCatalog.dc.html>) | `work_order_services`, `service_catalog`, `wo_attachments` | BR-07 | FLW-MEC-01, FLW-MEC-02 |
| Mobilisasi step | REQ-MBL-001 to 006 | AC-MBL-001 to 004 | [`CreateWO`](<Design Artifact/Create Work Order step composer-html/CreateWO.dc.html>), [`MechanicMobileStep`](<Design Artifact/Mobile app, Mechanic menu Mechanic Action step (P1)-html/MechanicMobileStep.dc.html>), [`StepVerify`](<Design Artifact/Verify a step-html/StepVerify.dc.html>), [`SettingsStooringRates`](<Design Artifact/Settings Stooring rates (System Admin)-html/SettingsStooringRates.dc.html>) | `assignment_modules`, `work_order_assignments`, `mobilisation_location_trail`, `breakdown_reports`, `stooring_rates` | PR-6, BR-07, SM-STEP, RSK-09 | FLW-SA-07 |
| Part Replacement and map | REQ-PLC-001 to 020 | AC-PLC-001 to 010 | [`Placement`](<Design Artifact/Step Part Replacement map-html/Placement.dc.html>), [`PlacementReplace`](<Design Artifact/Part Replacement replace-html/PlacementReplace.dc.html>), [`PlacementRotate`](<Design Artifact/Part Replacement rotate-html/PlacementRotate.dc.html>), [`Vehicles`](<Design Artifact/Vehicles tab-html/Vehicles.dc.html>), [`ChassisLayouts`](<Design Artifact/Vehicle classes and chassis layouts-html/ChassisLayouts.dc.html>) | `part_placements`, `part_placement_logs`, `chassis_layouts`, `part_positions` | BR-01, BR-11, SM-TYRE, TX-09 | FLW-MEC-03 |
| [Documents](<Design Artifact/Documents tab-html/Documents.dc.html>) | REQ-DOC-001 to 013 | AC-DOC-001 to 006 | [`Documents`](<Design Artifact/Documents tab-html/Documents.dc.html>), [`VehicleDocuments`](<Design Artifact/Vehicles Documents tab-html/VehicleDocuments.dc.html>), [`AddDocument`](<Design Artifact/Add document (first entry)-html/AddDocument.dc.html>), [`DocumentScan`](<Design Artifact/View scan-html/DocumentScan.dc.html>), [`DocumentCorrectEntry`](<Design Artifact/Correct a first document entry (System Admin)-html/DocumentCorrectEntry.dc.html>), [`DocStep`](<Design Artifact/Step Document renewal-html/DocStep.dc.html>), [`DocumentTypes`](<Design Artifact/Settings Document types-html/DocumentTypes.dc.html>) | `vehicle_documents`, `document_renewals`, `document_corrections` | BR-08, SM-DOC, TX-15 | FLW-SA-02 |
| Change request | REQ-CR-001 to 008 | AC-CR-001 to 005 | [`ChangeRequest`](<Design Artifact/Raise a change request-html/ChangeRequest.dc.html>), [`CreateWORevision`](<Design Artifact/Revise a WO (amendment)-html/CreateWORevision.dc.html>), [`AmendmentReview`](<Design Artifact/Review approval amendment-html/AmendmentReview.dc.html>) | `wo_change_requests` | SM-CR, SM-WO T8 to T10, TX-12 | FLW-MEC-05, FLW-PLN-06, FLW-APR-02 |
| WO document | REQ-WOD-001 to 006 | AC-MOB-001 | [`WODocument`](<Design Artifact/WO document-html/WODocument.dc.html>) | `work_order_approvals`, `placement_map_snapshots` | BR-10 | FLW-PLN-07 |
| Vehicles and odometer | REQ-VEH-001 to 010 | AC-VEH-001 to 003 | [`Vehicles`](<Design Artifact/Vehicles tab-html/Vehicles.dc.html>), [`VehicleOverview`](<Design Artifact/Vehicles Overview tab-html/VehicleOverview.dc.html>), [`AddVehicle`](<Design Artifact/Add vehicle with first documents-html/AddVehicle.dc.html>), [`VehicleEdit`](<Design Artifact/Edit vehicle-html/VehicleEdit.dc.html>), [`VehicleDeactivate`](<Design Artifact/Deactivate vehicle (dialog)-html/VehicleDeactivate.dc.html>), [`VehicleOdometer`](<Design Artifact/Vehicles odometer history and manual reading-html/VehicleOdometer.dc.html>), [`OdometerVoid`](<Design Artifact/Void odometer reading (System Admin)-html/OdometerVoid.dc.html>), [`VehicleWOHistory`](<Design Artifact/Vehicles WO history tab-html/VehicleWOHistory.dc.html>) | `vehicles`, `odometer_logs` | BR-09, SM-VEH | FLW-SA-01, FLW-SA-03 |
| PM and inspections | REQ-PM-001 to 006 | AC-PM-001 to 003 | [`DashboardPlanner`](<Design Artifact/Dashboard (Planner)-html/DashboardPlanner.dc.html>), [`VehicleInspections`](<Design Artifact/Vehicles Inspections tab (System Admin, P0)-html/VehicleInspections.dc.html>), [`AdminInspectionForm`](<Design Artifact/Record inspection for a driver (P0)-html/AdminInspectionForm.dc.html>), [`AdminBreakdownForm`](<Design Artifact/Report breakdown for a driver (P0)-html/AdminBreakdownForm.dc.html>), `[SettingsAlertRules](<Design Artifact/Settings Alert rules-html/SettingsAlertRules.dc.html>), [SettingsAlertThresholds](<Design Artifact/Settings Alert thresholds-html/SettingsAlertThresholds.dc.html>)` | `maintenance_alerts`, `vehicle_pm_schedule`, `dvir_logs`, `breakdown_reports` | TX-16 | FLW-PLN-02, FLW-SA-04 |
| Parts baseline | REQ-BSL-001 to 009 | AC-BSL-001 to 005 | [`PartsBaseline`](<Design Artifact/Parts baseline (first entry)-html/PartsBaseline.dc.html>), [`BaselineCorrect`](<Design Artifact/Correct parts baseline (System Admin)-html/BaselineCorrect.dc.html>), [`SettingsPartItemTypes`](<Design Artifact/Settings Part item types-html/SettingsPartItemTypes.dc.html>) | `vehicle_part_items`, `part_item_types` | BR-01, TX-11 | FLW-SA-01, FLW-SA-03 |
| Parts inventory | REQ-INV-001 to 014 | AC-INV-001 to 005 | [`Inventory`](<Design Artifact/Inventory-html/Inventory.dc.html>), [`AddPart`](<Design Artifact/Inventory Add part-html/AddPart.dc.html>), [`PartDetail`](<Design Artifact/Inventory Part detail-html/PartDetail.dc.html>), [`PartEdit`](<Design Artifact/Inventory Edit part-html/PartEdit.dc.html>), [`PartDeactivate`](<Design Artifact/Deactivate part (dialog)-html/PartDeactivate.dc.html>), [`GoodsReceipts`](<Design Artifact/Inventory Goods Receipts-html/GoodsReceipts.dc.html>), [`GoodsReceiptForm`](<Design Artifact/New Goods Receipt-html/GoodsReceiptForm.dc.html>), [`GoodsReceiptDetail`](<Design Artifact/Goods Receipt detail-html/GoodsReceiptDetail.dc.html>), [`GRCorrection`](<Design Artifact/GR correction-html/GRCorrection.dc.html>), [`StockCard`](<Design Artifact/Inventory Stock card-html/StockCard.dc.html>), [`StockCardExport`](<Design Artifact/Stock card Export-html/StockCardExport.dc.html>), [`StockOpname`](<Design Artifact/Inventory Stock opname-html/StockOpname.dc.html>), [`StockOpnameApproval`](<Design Artifact/Review Stock opname (Supervisor, GM or System Admin)-html/StockOpnameApproval.dc.html>), [`StockOpnameReturned`](<Design Artifact/Stock opname returned by the approver-html/StockOpnameReturned.dc.html>) | `parts_catalog`, `goods_receipts`, `gr_corrections`, `stock_adjustments`, `stock_cards` | BR-06, BR-12, SM-GR, SM-SA, TX-06, TX-07 | FLW-WHM-03 to 05, FLW-APR-04 |
| Tyres and retread | REQ-TYR-001 to 015 | AC-TYR-001 to 007 | [`Tyres`](<Design Artifact/Inventory Tyres-html/Tyres.dc.html>), [`TyreColumns`](<Design Artifact/Tyres column chooser-html/TyreColumns.dc.html>), [`ReceiveTyres`](<Design Artifact/Receive tyres new tyres-html/ReceiveTyres.dc.html>), [`RetreadReceipt`](<Design Artifact/Receive tyres retread return-html/RetreadReceipt.dc.html>), [`RetreadDispatch`](<Design Artifact/Send tyres to retread-html/RetreadDispatch.dc.html>), [`RetreadList`](<Design Artifact/Inventory Tyres, Retread-html/RetreadList.dc.html>), [`RetreadDispatchDetail`](<Design Artifact/Retread dispatch detail-html/RetreadDispatchDetail.dc.html>), [`TyreWornOut`](<Design Artifact/Tyres confirm Worn out-html/TyreWornOut.dc.html>), [`TyreScrap`](<Design Artifact/Tyres confirm Scrap-html/TyreScrap.dc.html>), [`TyreCount`](<Design Artifact/Inventory Tyres, Tyre count-html/TyreCount.dc.html>), [`TyreCountApproval`](<Design Artifact/Review Tyre count (Supervisor, GM or System Admin)-html/TyreCountApproval.dc.html>), [`SettingsTyreStatuses`](<Design Artifact/Settings Tyre statuses-html/SettingsTyreStatuses.dc.html>) | `tyres`, `tyre_events`, `tyre_receipts`, `retread_orders`, `tyre_counts` | BR-11, BR-12, SM-TYRE, SM-TR, SM-RD, SM-TC, TX-08, TX-10 | FLW-WHM-06 to 09 |
| [Approvals](<Design Artifact/Approvals (inbox)-html/Approvals.dc.html>) | REQ-APR-001 to 011 | AC-APR-001 to 005 | [`Approvals`](<Design Artifact/Approvals (inbox)-html/Approvals.dc.html>), [`ApprovalsWarehouse`](<Design Artifact/Approvals Warehouse tab (Supervisor, GM or System Admin)-html/ApprovalsWarehouse.dc.html>), [`ApprovalsHistory`](<Design Artifact/Approvals History-html/ApprovalsHistory.dc.html>), review screens | `work_order_approvals` | BR-03, BR-04 | FLW-APR-01 to 06 |
| Dashboards | REQ-DSH-001 to 009 | 4.16 | the six web dashboards, [`DashboardDriver`](<Design Artifact/Driver home (mobile)-html/DashboardDriver.dc.html>) |  |  | every flow's first step |
| Schedule | REQ-SCH-001 to 007 | AC-SCH-001 to 004 | [`MaintenanceSchedule`](<Design Artifact/Maintenance schedule (Planner)-html/MaintenanceSchedule.dc.html>), [`ScheduleDispatcher`](<Design Artifact/Maintenance schedule (Field Coordinator, read only)-html/ScheduleDispatcher.dc.html>) | `wo_schedule`, `wo_schedule_log`, `schedule_alerts` | BR-13, SM-SCH | FLW-PLN-04, FLW-FC-02 |
| Accounts and access | REQ-IAM-001 to 011 | AC-IAM-001 to 007 | [`WebLogin`](<Design Artifact/Sign in (web)-html/WebLogin.dc.html>), [`UsersRoles`](<Design Artifact/Users and roles (Access Manager)-html/UsersRoles.dc.html>), [`AMAccountForm`](<Design Artifact/New or edit account (Access Manager)-html/AMAccountForm.dc.html>), [`AMRolesPermissions`](<Design Artifact/Users and roles Roles and permissions (Access Manager)-html/AMRolesPermissions.dc.html>), [`AMAccessHistory`](<Design Artifact/Users and roles Access history (Access Manager)-html/AMAccessHistory.dc.html>), [`AuditLog`](<Design Artifact/Audit log-html/AuditLog.dc.html>) | `users`, `user_roles`, `role_permissions`, `audit_logs` | BR-14, RL-1 to RL-5 | FLW-AM-01 to 05 |
| Notifications | REQ-NTF-001 to 005 | AC-SCH-001 | [`NotificationCenter`](<Design Artifact/Notification center-html/NotificationCenter.dc.html>), [`DispatcherMobileAlerts`](<Design Artifact/Mobile app, Field Coordinator menu alerts (P1)-html/DispatcherMobileAlerts.dc.html>) | `notifications`, `notification_deliveries`, `push_devices` |  | FLW-FC-02, FLW-FC-03 |
| Mobile app | REQ-MOB-001 to 009 | AC-MOB-001 to 004 | the mobile screens of 7.3 | as the web | BR-01, BR-02, RL-6 | FLW-MEC-06, FLW-APR-07, FLW-DRV-01 to 04, FLW-FC-03 |
| [Reports](<Design Artifact/Reports (Cost)-html/Reports.dc.html>) | REQ-RPT-001 to 004 |  | [`Reports`](<Design Artifact/Reports (Cost)-html/Reports.dc.html>), [`ReportsTyres`](<Design Artifact/Reports Tyres-html/ReportsTyres.dc.html>), [`ReportsMaintenance`](<Design Artifact/Reports Maintenance-html/ReportsMaintenance.dc.html>), [`ReportsInventory`](<Design Artifact/Reports Inventory-html/ReportsInventory.dc.html>) | `export_logs` |  | FLW-APR-06 |
| AI assistant | REQ-AI-001 to 004 |  | AI sidebar, [`Settings`](<Design Artifact/Settings (home)-html/Settings.dc.html>) | `ai_configurations`, `ai_query_logs` | NFR-04 |  |
| File upload and compression | REQ-FUP-001 to 011, NFR-06, NFR-13 | AC-FUP-001 to 006 | FileUploadStates, every screen with a FileDrop | stored\_files, app\_settings | BR-10, DEC-31, DEC-32 | FLW-MEC-01, FLW-MEC-02, FLW-WHM-01, FLW-SA-02, FLW-DRV-01 |
| Customers and invoices | REQ-BIL-001 to 012 | AC-BIL-001 to 005 | [InvoiceList](<Design Artifact/Invoices (Accounting)-html/InvoiceList.dc.html>), [InvoiceDetail](<Design Artifact/Invoice detail (Accounting, Supervisor)-html/InvoiceDetail.dc.html>), [InvoicePayment](<Design Artifact/Record payment (dialog)-html/InvoicePayment.dc.html>), [InvoiceVoid](<Design Artifact/Void invoice (dialog)-html/InvoiceVoid.dc.html>), [InvoiceDocument](<Design Artifact/Invoice print (black and white)-html/InvoiceDocument.dc.html>), [Customers](<Design Artifact/Customers-html/Customers.dc.html>), [CustomerForm](<Design Artifact/Add or edit customer-html/CustomerForm.dc.html>), [SettingsBilling](<Design Artifact/Settings Invoices and tax-html/SettingsBilling.dc.html>), [DashboardAccounting](<Design Artifact/Dashboard (Accounting)-html/DashboardAccounting.dc.html>) | customers, invoices, invoice\_lines, invoice\_payments | BR-15, SM-INV, TX-19, RL-9 | FLW-ACC-01 to 03 |
| Field Coordinator requests | REQ-WO-014, REQ-PUR-001, REQ-MOB-006, REQ-MOB-008 | AC-STK-006, AC-MOB-004 | [FCRequests](<Design Artifact/Requests draft WOs from drivers (Field Coordinator)-html/FCRequests.dc.html>), [FCCreateWO](<Design Artifact/Complete and submit a draft WO (Field Coordinator)-html/FCCreateWO.dc.html>), [FCMobileRequests](<Design Artifact/Mobile Field Coordinator requests-html/FCMobileRequests.dc.html>), [FCMobileCreateWO](<Design Artifact/Mobile Field Coordinator completes a draft WO-html/FCMobileCreateWO.dc.html>), [FCMobilePurchase](<Design Artifact/Mobile Field Coordinator Part Purchase step-html/FCMobilePurchase.dc.html>), [SAMobileHome](<Design Artifact/Mobile System Admin field menu-html/SAMobileHome.dc.html>) | work\_orders, work\_order\_parts | RL-6, TX-21 | FLW-FC-04, FLW-FC-05, FLW-SA-07 |
| Part age and early failure | REQ-APR-011, REQ-BSL-007, REQ-BSL-009 | AC-APR-005, AC-BSL-005 | [ApprovalReview](<Design Artifact/Review approval creation-html/ApprovalReview.dc.html>), [SupervisorMobileReview](<Design Artifact/Mobile app, Supervisor GM menu review and decide (P1)-html/SupervisorMobileReview.dc.html>), [SettingsPartItemTypes](<Design Artifact/Settings Part item types-html/SettingsPartItemTypes.dc.html>), [Dashboard](<Design Artifact/Dashboard (Supervisor, GM)-html/Dashboard.dc.html>) | early\_failure\_events, part\_item\_types | - | FLW-APR-08 |
| Planner approval switch | REQ-IAM-008 | AC-IAM-005 | [AMRolesPermissions](<Design Artifact/Users and roles Roles and permissions (Access Manager)-html/AMRolesPermissions.dc.html>) | app\_settings, audit\_logs | RL-7, BR-04, TX-20 | FLW-AM-06 |
| Setup and go live | REQ-IAM-010, REQ-INV-013 | AC-IAM-006, AC-INV-006 | [SetupGoLive](<Design Artifact/System Admin Setup mode and Go live-html/SetupGoLive.dc.html>), [OpeningBalance](<Design Artifact/Inventory opening balance in Setup mode (System Admin)-html/OpeningBalance.dc.html>) | app\_settings, stock\_adjustments, stock\_cards | BR-06 | FLW-SA-08 |
| Vendors, drivers, step assignment | REQ-INV-014, REQ-VEH-010, REQ-ENG-011 | AC-VEH-004, AC-ENG-006 | [SettingsVendors](<Design Artifact/Settings Vendors (System Admin)-html/SettingsVendors.dc.html>), [VehicleOverview](<Design Artifact/Vehicles Overview tab-html/VehicleOverview.dc.html>), [WorkOrder](<Design Artifact/Work Order detail-html/WorkOrder.dc.html>) | vendors, drivers, work\_order\_assignments | RL-6 | FLW-SA-09, FLW-SA-10, FLW-PLN-09 |
| Stooring | REQ-MEC-007 to 010 | AC-MEC-004, AC-MEC-005 | [Mechanic](<Design Artifact/Step Mechanic Action-html/Mechanic.dc.html>), [MechanicMobileStep](<Design Artifact/Mobile app, Mechanic menu Mechanic Action step (P1)-html/MechanicMobileStep.dc.html>), [StepVerify](<Design Artifact/Verify a step-html/StepVerify.dc.html>), [SettingsStooringRates](<Design Artifact/Settings Stooring rates (System Admin)-html/SettingsStooringRates.dc.html>) | stooring\_rates, work\_order\_assignments | BR-07 | FLW-SA-07 |
| Part Purchase | REQ-PUR-001 to 009 | AC-PUR-001 to 006 | [PartPurchase](<Design Artifact/Step Part Purchase (bought outside)-html/PartPurchase.dc.html>), [FCMobilePurchase](<Design Artifact/Mobile Field Coordinator Part Purchase step-html/FCMobilePurchase.dc.html>) | work\_order\_purchases, work\_order\_purchase\_lines | BR-06, TX-21 | FLW-FC-05 |

**Change history. v2.3 (2026-10-27) adds DEC-59 and DEC-60: step draft on reassignment, and the Part Purchase module (4.4a) split from the Stock step; new assumptions ASM-57 to ASM-60. v2.2 (2026-10-27) adds DEC-43 to DEC-58: invoice lines, markup, numbering and stooring; silent position capture; Setup mode and Go live; opening balance; priorities and late alerts; passwords, offline, time, numbering, rounding and retention rules; no branches; vendor master, driver assignment and step assignment; every earlier assumption confirmed. v2.1 (2026-10-27) applies the meeting decisions DEC-34 to DEC-42: Accounting role and invoices (4.23), Field Coordinator draft WOs and purchase lines, Planner approval switch, GM as director, part age and early failure, mixed Stock step, GPS work location, mobile app for Driver, Field Coordinator and System Admin in R1 step 7; new assumptions ASM-34 to ASM-43.** v2 (2026-10-26) restructures the earlier PRD for SDD agents: IDs on every requirement, EARS acceptance criteria, state machines, a consolidated schema (the earlier A.1 to A.14 with every ALTER applied), traceability to screens and tables, and all "added in October" and "Decided" items merged into their sections. Behaviour is unchanged except where 11.2 marks a new assumption (ASM-06, ASM-08, ASM-21, ASM-27) or 9 normalizes a structure (`document_type_classes`, `role_permissions`, `maintenance_alerts.alert_type`).
