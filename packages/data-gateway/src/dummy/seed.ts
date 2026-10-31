/**
 * Seed data for `DummyDataGateway` (Phase 1), using the PRD's concrete example
 * records so later flows are demonstrable and internally consistent (foreign
 * keys resolve):
 *
 *   - Work Order **WO-0142** (PRD §4 AC-WO-001/ENG-007/WOD-008) on vehicle
 *     **B 1234 ABC** (PRD §4.10 AC-VEH-004).
 *   - Tyres coded **TY-0101 … TY-0110** (PRD §1.5 "Tyre code = TY-0101",
 *     REQ-STK-006 AC-STK-004 "tyre TY-0110"). Codes are generated and never
 *     reused — here they are produced through `@bmi/config`'s running-number
 *     generator so the dummy data obeys the same NFR-15 rule as production.
 *   - The master data those records require: a customer, a vehicle class, and
 *     one user per role that WO-0142 touches (Planner, Supervisor, Mechanic,
 *     Driver, Warehouse Manager, System Admin).
 *
 * All ids are the numeric surrogate keys of PRD §9.0 (`BIGINT ... IDENTITY`),
 * assigned densely from 1 per table, and branded via `@bmi/shared`'s `toId`.
 * `version` starts at 1 on every mutable aggregate (`version INT DEFAULT 1`).
 */

import {
  toId,
  type UserId,
  Role,
  Team,
  TyreType,
  WorkOrderSource,
  WorkOrderCategory,
  WorkOrderPriority,
  AlertType,
  AlertStatus,
  WorkOrderStatus,
  StepStatus,
  VehicleStatus,
  TyreStatus,
  ScheduleStatus,
  InvoiceStatus,
  type UserDto,
  type VehicleDto,
  type VehicleDocumentDto,
  type WorkOrderDto,
  type AssignmentDto,
  type TyreDto,
  type MaintenanceAlertDto,
  type ScheduleCardDto,
  type InvoiceDto,
} from '@bmi/shared';
import { createDefaultNumberGenerator } from '@bmi/config';

import type { Aggregate } from '../data-gateway.interface.js';
import { emptyTable, type AggregateTable, type DummyStore } from './store.js';

// --- Fixed ids for the example graph (dense, 1-based per table, PRD §9.0) ---

const CUSTOMER_ID = toId<'CustomerId'>(1);
const VEHICLE_CLASS_ID = toId<'VehicleClassId'>(1);
const CHASSIS_LAYOUT_ID = toId<'ChassisLayoutId'>(1);

const USER = {
  planner: toId<'UserId'>(1),
  supervisor: toId<'UserId'>(2),
  mechanic: toId<'UserId'>(3),
  driver: toId<'UserId'>(4),
  warehouse: toId<'UserId'>(5),
  systemAdmin: toId<'UserId'>(6),
  accessManager: toId<'UserId'>(7),
} as const;

/**
 * The plaintext dev sign-in password for every seeded account (Phase 1 only).
 * Meets NFR-05 (≥8 chars, letters + digits). It is never stored: the seed holds
 * only its bcrypt hash ({@link SEED_PASSWORD_HASH}); this constant lets dev tools
 * and tests sign in. Production seeds a one-time password per account instead.
 */
export const SEED_PASSWORD = 'Bmi12345';

/**
 * A real bcrypt hash of {@link SEED_PASSWORD} (cost 10). Stored as a literal so
 * `@bmi/data-gateway` carries no password-hashing dependency — bcrypt hashes are
 * opaque strings. The IAM hasher (`@bmi/api`) verifies against it at login.
 */
export const SEED_PASSWORD_HASH =
  '$2b$10$0pv/u1jXgAgisINc9abK1.ZUCPcGj1x5ZLKLZXgAF/9m9zcO3r0S.';

const VEHICLE_ID = toId<'VehicleId'>(1);
const WORK_ORDER_ID = toId<'WorkOrderId'>(1);
const ALERT_ID = toId<'MaintenanceAlertId'>(1);
const SCHEDULE_CARD_ID = toId<'ScheduleCardId'>(1);
const INVOICE_ID = toId<'InvoiceId'>(1);

// Module ids for the three WO-0142 steps (Stock, Part_Purchase, Mechanic_Action).
const MODULE = {
  stock: toId<'AssignmentModuleId'>(1),
  partPurchase: toId<'AssignmentModuleId'>(2),
  mechanicAction: toId<'AssignmentModuleId'>(3),
} as const;

/** Fixed example instants (ISO-8601 UTC); WIB rendering is `@bmi/config`'s job. */
const CREATED_AT = '2026-10-26T02:00:00.000Z';

// --- Users (one per role WO-0142 touches; exactly one role each, BR-14) -----

/** Build a seeded account: shared auth defaults, one role each (BR-14). */
function seedUser(
  id: UserId,
  fullName: string,
  email: string,
  role: Role,
): UserDto {
  return {
    id,
    fullName,
    role,
    isActive: true,
    email,
    passwordHash: SEED_PASSWORD_HASH,
    // Seeded accounts are already past first sign-in, so dev login works directly.
    mustChangePassword: false,
    failedLogins: 0,
    lockedUntil: null,
    version: 1,
  };
}

const users: readonly UserDto[] = [
  seedUser(USER.planner, 'Rina Planner', 'planner@bmi.test', Role.Planner),
  seedUser(USER.supervisor, 'Budi Supervisor', 'supervisor@bmi.test', Role.Supervisor),
  seedUser(USER.mechanic, 'Agus Mechanic', 'mechanic@bmi.test', Role.Mechanic),
  seedUser(USER.driver, 'Joko Driver', 'driver@bmi.test', Role.Driver),
  seedUser(USER.warehouse, 'Dedi Warehouse', 'warehouse@bmi.test', Role.WarehouseManager),
  // Exactly one System Admin account (BR-14 / uq_one_system_admin).
  seedUser(USER.systemAdmin, 'Sari Admin', 'sysadmin@bmi.test', Role.SystemAdmin),
  // Access Manager owns accounts/roles/permissions + the System-Admin move (RL-5).
  seedUser(USER.accessManager, 'Maya Access', 'access@bmi.test', Role.AccessManager),
];

// --- Vehicle B 1234 ABC (PRD §4.10 AC-VEH-004), billable to the customer -----

const vehicles: readonly VehicleDto[] = [
  {
    id: VEHICLE_ID,
    plate: 'B 1234 ABC',
    classId: VEHICLE_CLASS_ID,
    chassisLayoutId: CHASSIS_LAYOUT_ID,
    odometerKm: 48210,
    // In Repair because WO-0142 is In_Progress and requires downtime (SM-VEH).
    status: VehicleStatus.Repair,
    customerId: CUSTOMER_ID,
    version: 1,
  },
];

// --- Work Order WO-0142 (PRD §4 AC-WO-001 / AC-ENG-007 / AC-WOD-008) ---------

const workOrders: readonly WorkOrderDto[] = [
  {
    id: WORK_ORDER_ID,
    number: 'WO-0142',
    vehicleId: VEHICLE_ID,
    status: WorkOrderStatus.InProgress,
    source: WorkOrderSource.ManualPlanner,
    category: WorkOrderCategory.Corrective,
    priority: WorkOrderPriority.High,
    requiresDowntime: true,
    description: 'Brake service and tyre replacement, axle 2.',
    findingNote: null,
    presetId: null,
    sentForReviewAt: null,
    statusBeforeAmendment: null,
    amendmentNo: 0,
    offDays: 0,
    createdBy: USER.planner,
    createdAt: CREATED_AT,
    // Approved by a Supervisor (four-eyes, BR-03) before going Active/In_Progress.
    approvedBy: USER.supervisor,
    approvedAt: '2026-10-26T02:30:00.000Z',
    activatedAt: '2026-10-26T02:30:00.000Z',
    startedAt: '2026-10-26T03:10:00.000Z',
    completionRequestedAt: null,
    completedAt: null,
    cancelledBy: null,
    cancelReason: null,
    version: 1,
  },
];

// --- The three steps of WO-0142 (SM-STEP): step 1 Submitted, 2/3 locked ------
// Mirrors AC-WO-002 (step 1 Open, 2 & 3 Locked when approved) advanced to the
// in-progress point AC-ENG-007 describes (step 1 submitted at 10:40).

const assignments: readonly AssignmentDto[] = [
  {
    id: toId<'AssignmentId'>(1),
    workOrderId: WORK_ORDER_ID,
    moduleId: MODULE.stock,
    moduleCode: 'Stock',
    sequence: 1,
    status: StepStatus.Submitted,
    stepConfig: {},
    isOptional: false,
    executorRoles: [Role.WarehouseManager],
    verifierRole: Role.Planner,
    isPaused: false,
    team: Team.Internal,
    assigneeId: USER.warehouse,
    claimedAt: '2026-10-26T03:00:00.000Z',
    openedAt: '2026-10-26T03:00:00.000Z',
    executedBy: USER.warehouse,
    startedAt: '2026-10-26T03:10:00.000Z',
    startEntered: false,
    attemptNo: 1,
    workedSeconds: 1800,
    pausedSeconds: 0,
    submittedAt: '2026-10-26T03:40:00.000Z',
    verifiedBy: null,
    verifiedAt: null,
    selfVerified: false,
    returnNote: null,
    skipReason: null,
    version: 1,
  },
  {
    id: toId<'AssignmentId'>(2),
    workOrderId: WORK_ORDER_ID,
    moduleId: MODULE.partPurchase,
    moduleCode: 'Part_Purchase',
    sequence: 2,
    status: StepStatus.Open,
    stepConfig: {},
    isOptional: false,
    executorRoles: [Role.FieldCoordinator],
    verifierRole: Role.Planner,
    isPaused: false,
    team: Team.Internal,
    assigneeId: null,
    claimedAt: null,
    // Opened when step 1 was submitted (REQ-ENG-002); not started yet.
    openedAt: '2026-10-26T03:40:00.000Z',
    executedBy: null,
    startedAt: null,
    startEntered: false,
    attemptNo: 1,
    workedSeconds: null,
    pausedSeconds: null,
    submittedAt: null,
    verifiedBy: null,
    verifiedAt: null,
    selfVerified: false,
    returnNote: null,
    skipReason: null,
    version: 1,
  },
  {
    id: toId<'AssignmentId'>(3),
    workOrderId: WORK_ORDER_ID,
    moduleId: MODULE.mechanicAction,
    moduleCode: 'Mechanic_Action',
    sequence: 3,
    status: StepStatus.Locked,
    stepConfig: {},
    isOptional: false,
    executorRoles: [Role.Mechanic],
    verifierRole: Role.Planner,
    isPaused: false,
    team: Team.Internal,
    assigneeId: USER.mechanic,
    claimedAt: null,
    openedAt: null,
    executedBy: null,
    startedAt: null,
    startEntered: false,
    attemptNo: 1,
    workedSeconds: null,
    pausedSeconds: null,
    submittedAt: null,
    verifiedBy: null,
    verifiedAt: null,
    selfVerified: false,
    returnNote: null,
    skipReason: null,
    version: 1,
  },
];

/**
 * Tyres TY-0101 … TY-0110. The codes come from `@bmi/config`'s running-number
 * generator seeded at 100, so it issues TY-0101 onward — demonstrating the
 * never-reused rule (NFR-15) that production relies on. TY-0110 is Issued to
 * WO-0142 (AC-STK-004); the rest sit In_Stock.
 */
function buildTyres(): readonly TyreDto[] {
  const gen = createDefaultNumberGenerator();
  // Advance the TY sequence to 100 so the first issued code is TY-0101.
  for (let i = 0; i < 100; i += 1) {
    gen.next('TY');
  }
  const tyres: TyreDto[] = [];
  for (let n = 1; n <= 10; n += 1) {
    const code = gen.next('TY'); // TY-0101 … TY-0110
    const isIssuedToWo = n === 10; // TY-0110 → WO-0142 (AC-STK-004)
    tyres.push({
      id: toId<'TyreId'>(n),
      code,
      serialNumber: `SN-${String(100000 + n)}`,
      brand: 'Bridgestone',
      size: '1000R20',
      tyreType: TyreType.Tubeless,
      // tyre_statuses rows are seeded densely in code order (§9.9); In_Stock = 1,
      // Issued = 2, matching the state-set declaration order in @bmi/shared.
      statusId: toId<'TyreStatusId'>(isIssuedToWo ? 2 : 1),
      status: isIssuedToWo ? TyreStatus.Issued : TyreStatus.InStock,
      issuedWorkOrderId: isIssuedToWo ? WORK_ORDER_ID : null,
      version: 1,
    });
  }
  return tyres;
}

// --- Supporting aggregates so WO-0142's graph is complete -------------------

const maintenanceAlerts: readonly MaintenanceAlertDto[] = [
  {
    id: ALERT_ID,
    vehicleId: VEHICLE_ID,
    alertType: AlertType.Tyre,
    status: AlertStatus.ConvertedToWO,
    version: 1,
  },
];

const scheduleCards: readonly ScheduleCardDto[] = [
  {
    id: SCHEDULE_CARD_ID,
    workOrderId: WORK_ORDER_ID,
    plannedDate: '2026-10-26',
    status: ScheduleStatus.Planned,
    isRolledOver: false,
    version: 1,
  },
];

const invoices: readonly InvoiceDto[] = [
  {
    id: INVOICE_ID,
    number: null, // Draft invoice has no number until Issue (DEC-46)
    customerId: CUSTOMER_ID,
    status: InvoiceStatus.Draft,
    version: 1,
  },
];

/** Build a table pre-filled with the given rows and its id sequence advanced. */
function tableOf<T extends Aggregate>(name: string, rows: readonly T[]): AggregateTable<T> {
  const table = emptyTable<T>(name);
  let maxId = 0;
  for (const row of rows) {
    const id = row.id as unknown as number;
    table.rows.set(id, row);
    if (id > maxId) {
      maxId = id;
    }
  }
  table.nextId = maxId;
  return table;
}

/**
 * Create a fresh, fully-seeded in-memory store. Each call returns an independent
 * store (new Maps), so tests never share mutable state.
 */
export function createSeededStore(): DummyStore {
  const tyres = buildTyres();
  const asTable = <T extends Aggregate>(t: AggregateTable<T>): AggregateTable<Aggregate> =>
    t as unknown as AggregateTable<Aggregate>;
  return {
    tables: {
      users: asTable(tableOf('users', users)),
      vehicles: asTable(tableOf('vehicles', vehicles)),
      vehicleDocuments: asTable(tableOf<VehicleDocumentDto>('vehicleDocuments', [])),
      workOrders: asTable(tableOf('workOrders', workOrders)),
      assignments: asTable(tableOf('assignments', assignments)),
      tyres: asTable(tableOf('tyres', tyres)),
      maintenanceAlerts: asTable(tableOf('maintenanceAlerts', maintenanceAlerts)),
      scheduleCards: asTable(tableOf('scheduleCards', scheduleCards)),
      invoices: asTable(tableOf('invoices', invoices)),
    },
    idempotencyKeys: new Set<string>(),
  };
}

/** The fixed example ids, exported so tests and demos can reference the graph. */
export const SEED_IDS = {
  customer: CUSTOMER_ID,
  vehicleClass: VEHICLE_CLASS_ID,
  chassisLayout: CHASSIS_LAYOUT_ID,
  users: USER,
  vehicle: VEHICLE_ID,
  workOrder: WORK_ORDER_ID,
  alert: ALERT_ID,
  scheduleCard: SCHEDULE_CARD_ID,
  invoice: INVOICE_ID,
  modules: MODULE,
} as const;
