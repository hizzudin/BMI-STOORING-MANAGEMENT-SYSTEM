import { Role } from '@bmi/shared';

/**
 * Server-side encoding of the PRD §2.2 permission matrix.
 *
 * This is the single source the global {@link RolesGuard} consults so role
 * checks are server-authoritative (NFR-04 / REQ-IAM-006: "check the role on
 * every action on the server, not only in the interface"). Capability codes
 * mirror the `role_permissions.permission_code` convention in PRD §9
 * (e.g. `wo.create`, `stock.issue`).
 *
 * In Phase 1 this is a static map seeded from §2.2. TASK-104 (IAM) makes it
 * editable through `role_permissions` with the §2.2 cells that are **locked**
 * (`BR-04`, `BR-14`) kept immutable; the guard's contract does not change.
 */

/** A permission/capability code (the `role_permissions.permission_code` value). */
export type Capability = string;

/**
 * How a cell in the §2.2 matrix grants a capability.
 *   - `allow`     → X: the role may perform the action.
 *   - `view`      → V: read-only; not a grant for a mutating action.
 *   - `switchable`→ S: off by default (Planner approval, REQ-IAM-008); not
 *                   granted until an Access Manager switches it on. Treated as
 *                   NOT granted in the scaffold (the switch lands in TASK-104).
 */
export type Grant = 'allow' | 'view' | 'switchable';

/** The §2.2 capability catalogue used by the current scaffold + feature modules. */
export const Capabilities = {
  // WO lifecycle (FG-1)
  WoCreate: 'wo.create',
  WoApprove: 'wo.approve',
  WoCancel: 'wo.cancel',
  // Steps / engine (FG-2)
  StepVerify: 'step.verify',
  StepRequestCompletion: 'step.request_completion',
  StepAssign: 'step.assign',
  // Stock & purchase (FG-4)
  StockIssue: 'stock.issue',
  PurchaseLine: 'purchase.line',
  // Mechanic / placement / mobilisasi (FG-5, FG-5a, FG-6)
  MechanicExecute: 'mechanic.execute',
  MobilisasiExecute: 'mobilisasi.execute',
  DocStepExecute: 'docstep.execute',
  // Change requests (FG-9)
  ChangeRequestRaise: 'changerequest.raise',
  // Registry / presets (FG-3)
  RegistryManage: 'registry.manage',
  // Master data (FG-7, FG-8, FG-17)
  MasterData: 'masterdata.manage',
  VehicleManage: 'vehicle.manage',
  OdometerManual: 'odometer.manual',
  InventoryManage: 'inventory.manage',
  TyreManage: 'tyre.manage',
  CountApprove: 'count.approve',
  // Schedule (FG-12)
  ScheduleManage: 'schedule.manage',
  // Invoices (FG-11)
  InvoiceManage: 'invoice.manage',
  // IAM (FG-13)
  AccountsManage: 'accounts.manage',
  PlannerApprovalSwitch: 'iam.planner_approval_switch',
  // Setup (FG-14)
  SetupGoLive: 'setup.golive',
} as const;
export type CapabilityCode = (typeof Capabilities)[keyof typeof Capabilities];

/**
 * The matrix: `role → capability → grant`. Each entry is one §2.2 cell. Absent
 * entries mean "not allowed" (blank in §2.2). `L` (locked) cells are recorded
 * as `allow`; their immutability is enforced by TASK-104, not the grant kind.
 */
type RoleMatrix = Readonly<Record<Role, Readonly<Record<Capability, Grant>>>>;

export const PERMISSION_MATRIX: RoleMatrix = {
  // PLN — Planner
  [Role.Planner]: {
    [Capabilities.WoCreate]: 'allow',
    [Capabilities.WoApprove]: 'switchable', // S: Planner approval off by default (RL-7)
    [Capabilities.StepVerify]: 'allow',
    [Capabilities.StepRequestCompletion]: 'allow',
    [Capabilities.StepAssign]: 'allow',
    [Capabilities.RegistryManage]: 'allow',
    [Capabilities.OdometerManual]: 'allow',
    [Capabilities.CountApprove]: 'switchable',
    [Capabilities.ScheduleManage]: 'allow',
  },
  // MEC — Mechanic
  [Role.Mechanic]: {
    [Capabilities.WoCreate]: 'allow',
    [Capabilities.MechanicExecute]: 'allow',
    [Capabilities.MobilisasiExecute]: 'allow',
    [Capabilities.ChangeRequestRaise]: 'allow',
  },
  // WHM — Warehouse Manager
  [Role.WarehouseManager]: {
    [Capabilities.StockIssue]: 'allow',
    [Capabilities.PurchaseLine]: 'allow',
    [Capabilities.ChangeRequestRaise]: 'allow',
    [Capabilities.InventoryManage]: 'allow',
    [Capabilities.TyreManage]: 'allow',
  },
  // SUP — Supervisor
  [Role.Supervisor]: {
    [Capabilities.WoApprove]: 'allow', // X L
    [Capabilities.WoCancel]: 'allow',
    [Capabilities.CountApprove]: 'allow', // X L
    [Capabilities.InvoiceManage]: 'allow',
  },
  // GM — General Manager (every right of Supervisor)
  [Role.GM]: {
    [Capabilities.WoApprove]: 'allow', // X L
    [Capabilities.WoCancel]: 'allow',
    [Capabilities.CountApprove]: 'allow', // X L
    [Capabilities.InvoiceManage]: 'view',
  },
  // SA — System Admin (every operational permission; RL-3)
  [Role.SystemAdmin]: {
    [Capabilities.WoCreate]: 'allow',
    [Capabilities.WoApprove]: 'allow', // X L
    [Capabilities.WoCancel]: 'allow',
    [Capabilities.StepVerify]: 'allow',
    [Capabilities.StepRequestCompletion]: 'allow',
    [Capabilities.StepAssign]: 'allow',
    [Capabilities.StockIssue]: 'allow',
    [Capabilities.PurchaseLine]: 'allow',
    [Capabilities.MechanicExecute]: 'allow',
    [Capabilities.MobilisasiExecute]: 'allow',
    [Capabilities.DocStepExecute]: 'allow',
    [Capabilities.ChangeRequestRaise]: 'allow',
    [Capabilities.RegistryManage]: 'allow',
    [Capabilities.MasterData]: 'allow',
    [Capabilities.VehicleManage]: 'allow',
    [Capabilities.OdometerManual]: 'allow',
    [Capabilities.InventoryManage]: 'allow',
    [Capabilities.TyreManage]: 'allow',
    [Capabilities.CountApprove]: 'allow', // X L
    [Capabilities.ScheduleManage]: 'allow',
    [Capabilities.InvoiceManage]: 'allow',
    [Capabilities.SetupGoLive]: 'allow', // X L
  },
  // AM — Access Manager (accounts/roles/permissions only; no operational work, RL-5)
  [Role.AccessManager]: {
    [Capabilities.AccountsManage]: 'allow', // X L
    [Capabilities.PlannerApprovalSwitch]: 'allow', // X L
  },
  // DRV — Driver (mobile field only)
  [Role.Driver]: {
    // Driver field actions (inspection/breakdown/odometer/request) are modelled
    // on the mobile endpoints in TASK-118; no office capability here.
  },
  // FC — Field Coordinator
  [Role.FieldCoordinator]: {
    [Capabilities.WoCreate]: 'allow', // drafts only; draft-vs-activate enforced in TASK-108
    [Capabilities.PurchaseLine]: 'allow',
    [Capabilities.ChangeRequestRaise]: 'allow',
    [Capabilities.ScheduleManage]: 'view',
  },
  // ACC — Accounting
  [Role.Accounting]: {
    [Capabilities.InvoiceManage]: 'allow',
  },
};

/**
 * Server-authoritative decision: may `role` perform the action guarded by
 * `capability`? Only an `allow` grant qualifies for a mutating action — `view`
 * and a not-yet-switched-on `switchable` cell do not. Unknown roles/capabilities
 * are refused (default-deny).
 */
export function roleHasCapability(role: Role, capability: Capability): boolean {
  const grant = PERMISSION_MATRIX[role]?.[capability];
  return grant === 'allow';
}
