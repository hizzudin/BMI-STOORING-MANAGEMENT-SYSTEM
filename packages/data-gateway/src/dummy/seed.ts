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
} as const;

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

const users: readonly UserDto[] = [
  { id: USER.planner, fullName: 'Rina Planner', role: Role.Planner, isActive: true, version: 1 },
  {
    id: USER.supervisor,
    fullName: 'Budi Supervisor',
    role: Role.Supervisor,
    isActive: true,
    version: 1,
  },
  { id: USER.mechanic, fullName: 'Agus Mechanic', role: Role.Mechanic, isActive: true, version: 1 },
  { id: USER.driver, fullName: 'Joko Driver', role: Role.Driver, isActive: true, version: 1 },
  {
    id: USER.warehouse,
    fullName: 'Dedi Warehouse',
    role: Role.WarehouseManager,
    isActive: true,
    version: 1,
  },
  {
    id: USER.systemAdmin,
    fullName: 'Sari Admin',
    role: Role.SystemAdmin,
    isActive: true,
    version: 1,
  },
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
    description: 'Brake service and tyre replacement, axle 2.',
    findingNote: null,
    offDays: 0,
    createdBy: USER.planner,
    createdAt: CREATED_AT,
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
    sequence: 1,
    status: StepStatus.Submitted,
    isPaused: false,
    team: Team.Internal,
    assigneeId: USER.warehouse,
    openedAt: '2026-10-26T03:00:00.000Z',
    startedAt: '2026-10-26T03:10:00.000Z',
    version: 1,
  },
  {
    id: toId<'AssignmentId'>(2),
    workOrderId: WORK_ORDER_ID,
    moduleId: MODULE.partPurchase,
    sequence: 2,
    status: StepStatus.Locked,
    isPaused: false,
    team: Team.Internal,
    assigneeId: null,
    openedAt: null,
    startedAt: null,
    version: 1,
  },
  {
    id: toId<'AssignmentId'>(3),
    workOrderId: WORK_ORDER_ID,
    moduleId: MODULE.mechanicAction,
    sequence: 3,
    status: StepStatus.Locked,
    isPaused: false,
    team: Team.Internal,
    assigneeId: USER.mechanic,
    openedAt: null,
    startedAt: null,
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
