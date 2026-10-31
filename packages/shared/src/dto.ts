/**
 * Core domain DTOs — the shared contract shape for the aggregates referenced
 * across FG-1..FG-18. These INDEX the domain for the API/clients; they are NOT
 * the full PRD §9 schema (that lives in `db/` migrations). Only the fields the
 * state machines and cross-cutting contracts need are modelled here, so the
 * shared package stays stable as the DB schema evolves.
 *
 * `version` on each mutable aggregate carries the optimistic-lock column
 * (NFR-03). IDs are branded (`ids.ts`); statuses/enums come from
 * `states.ts` / `enums.ts`.
 */

import type {
  UserId,
  VehicleId,
  VehicleClassId,
  ChassisLayoutId,
  DocumentTypeId,
  VehicleDocumentId,
  WorkOrderId,
  WoPresetId,
  AssignmentId,
  AssignmentModuleId,
  TyreId,
  TyreStatusId,
  CustomerId,
  InvoiceId,
  ScheduleCardId,
  MaintenanceAlertId,
} from './ids.js';
import type {
  WorkOrderStatus,
  StepStatus,
  VehicleStatus,
  DocumentStatus,
  TyreStatus,
  ScheduleStatus,
  InvoiceStatus,
} from './states.js';
import type {
  Role,
  WorkOrderSource,
  WorkOrderCategory,
  WorkOrderPriority,
  AlertType,
  AlertStatus,
  Team,
  TyreType,
} from './enums.js';

/** ISO-8601 instant string (UTC). Formatting to WIB is `@bmi/config`'s job. */
export type IsoTimestamp = string;
/** ISO-8601 calendar date (YYYY-MM-DD), interpreted on WIB-day boundaries. */
export type IsoDate = string;

/**
 * User account — exactly one role (BR-14). Indexes the PRD §9.2 `users` row
 * together with the single `user_roles.role` the account holds; the auth
 * columns (`email`, `password_hash`, `failed_logins`, `must_change_password`,
 * `locked_until`) carry the sign-in / lockout / first-change state the IAM
 * module (FG-13, NFR-05) needs. `fullName` indexes `users.name`.
 */
export interface UserDto {
  readonly id: UserId;
  readonly fullName: string;
  readonly role: Role;
  readonly isActive: boolean;
  /** Login identity (PRD §9.2 `users.email`, UNIQUE). */
  readonly email: string;
  /**
   * Hashed password only — never a plaintext value (PRD §9.2
   * `users.password_hash`, NFR-05). The algorithm/format is the IAM hasher's
   * concern; the gateway only stores and returns the opaque string.
   */
  readonly passwordHash: string;
  /** Force a new password at next sign-in (PRD §9.2 `must_change_password`, REQ-IAM-009). */
  readonly mustChangePassword: boolean;
  /** Consecutive failed sign-ins (PRD §9.2 `failed_logins`); 5 locks the account. */
  readonly failedLogins: number;
  /** Lockout expiry (PRD §9.2 `locked_until`), ISO-8601 UTC, or `null` when unlocked. */
  readonly lockedUntil: IsoTimestamp | null;
  readonly version: number;
}

/** Vehicle with its derived status (SM-VEH). */
export interface VehicleDto {
  readonly id: VehicleId;
  /** Plate, e.g. `B 1234 ABC`. */
  readonly plate: string;
  readonly classId: VehicleClassId;
  readonly chassisLayoutId: ChassisLayoutId;
  readonly odometerKm: number;
  /** Highest-precedence derived status (incl. OFF, DEC-92). */
  readonly status: VehicleStatus;
  readonly customerId: CustomerId | null;
  readonly version: number;
}

/** Vehicle document (SM-DOC). */
export interface VehicleDocumentDto {
  readonly id: VehicleDocumentId;
  readonly vehicleId: VehicleId;
  readonly documentTypeId: DocumentTypeId;
  readonly status: DocumentStatus;
  readonly expiryDate: IsoDate | null;
  readonly version: number;
}

/**
 * Work Order aggregate (SM-WO). Indexes the PRD §9.6 `work_orders` row; the
 * lifecycle columns the engine (TASK-108) walks are modelled faithfully to §9.6
 * (an extension of the TASK-103 scaffold shape, not a re-derivation of the
 * schema). Cost columns, the OFF/invoice columns beyond `offDays`, the Part
 * Check / Document / alert source keys and the mobilisation columns stay in the
 * DB migrations until the task that needs them comes online.
 */
export interface WorkOrderDto {
  readonly id: WorkOrderId;
  /** Running number, e.g. `WO-0142`. */
  readonly number: string;
  readonly vehicleId: VehicleId;
  readonly status: WorkOrderStatus;
  readonly source: WorkOrderSource;
  readonly category: WorkOrderCategory;
  readonly priority: WorkOrderPriority;
  /** Vehicle goes to the workshop — drives SM-VEH Repair (REQ-WO-009). */
  readonly requiresDowntime: boolean;
  readonly description: string;
  /** Originator's field-finding narrative (REQ-WO-016, DEC-91). */
  readonly findingNote: string | null;
  /** The preset version the steps started from; `null` = built from blank. Never followed afterwards (REQ-ENG-004). */
  readonly presetId: WoPresetId | null;
  /** Set when a Mechanic/Field Coordinator sends the draft for review (REQ-WO-016). */
  readonly sentForReviewAt: IsoTimestamp | null;
  /** Saved origin status while Pending_Amendment (SM-WO T8); restored on T9/T10. */
  readonly statusBeforeAmendment: WorkOrderStatus | null;
  /** Amendment counter (SM-WO T9). */
  readonly amendmentNo: number;
  /** OFF-unit day counter (DEC-92). */
  readonly offDays: number;
  readonly createdBy: UserId;
  readonly createdAt: IsoTimestamp;
  /** Four-eyes approver of creation (BR-03); `null` until approved. */
  readonly approvedBy: UserId | null;
  readonly approvedAt: IsoTimestamp | null;
  /** When the WO went Active (T3). */
  readonly activatedAt: IsoTimestamp | null;
  /** When the first step was started (T7). */
  readonly startedAt: IsoTimestamp | null;
  /** When completion was requested — only when every step is Verified/Skipped (REQ-ENG-006). */
  readonly completionRequestedAt: IsoTimestamp | null;
  readonly completedAt: IsoTimestamp | null;
  readonly cancelledBy: UserId | null;
  readonly cancelReason: string | null;
  readonly version: number;
}

/**
 * One WO step / assignment (SM-STEP). Indexes the PRD §9.6
 * `work_order_assignments` row; the engine (TASK-108) reads the module, the
 * executor/verifier identity rules, the claim/assign/time fields and the verify
 * stamps from here. `moduleCode` carries `assignment_modules.code` — the engine
 * resolves the module's rules from its registry row and never branches on a
 * code (REQ-REG-006). `step_time_events` and the mobilisation trail live in the
 * API layer (Phase 1) / their own tables (later).
 */
export interface AssignmentDto {
  readonly id: AssignmentId;
  readonly workOrderId: WorkOrderId;
  readonly moduleId: AssignmentModuleId;
  /** `assignment_modules.code` — the module registry key (REQ-REG-006). */
  readonly moduleCode: string;
  readonly sequence: number;
  readonly status: StepStatus;
  /** Saved step details rendered from the module's creation section (REQ-WO-017). */
  readonly stepConfig: Readonly<Record<string, unknown>>;
  /** Only an optional step may be Skipped (REQ-ENG-009). */
  readonly isOptional: boolean;
  /** Roles that may execute this step (set per step in Create WO, REQ-ENG-003). */
  readonly executorRoles: readonly Role[];
  /** Verifier role — Planner or System Admin (REQ-ENG-005). */
  readonly verifierRole: Role;
  /** Set only while Paused (presentation flag, not a state). */
  readonly isPaused: boolean;
  readonly team: Team;
  /** Named executor (REQ-ENG-011); set by Planner/SA or by the first claim. */
  readonly assigneeId: UserId | null;
  readonly claimedAt: IsoTimestamp | null;
  /** Locked → Open; waiting-to-start counts from here (DEC-87). */
  readonly openedAt: IsoTimestamp | null;
  /** Who actually ran the current attempt (REQ-ENG-007 verifier ≠ executor). */
  readonly executedBy: UserId | null;
  /** Set only by Start, of the current attempt (REQ-ENG-012). */
  readonly startedAt: IsoTimestamp | null;
  /** Start was entered from an earlier time (REQ-ENG-014). */
  readonly startEntered: boolean;
  /** +1 after each return (REQ-ENG-015). */
  readonly attemptNo: number;
  /** Cached from step_time_events at submit (all attempts). */
  readonly workedSeconds: number | null;
  readonly pausedSeconds: number | null;
  readonly submittedAt: IsoTimestamp | null;
  readonly verifiedBy: UserId | null;
  readonly verifiedAt: IsoTimestamp | null;
  /** Self-verified when System Admin verifies own step (REQ-ENG-007). */
  readonly selfVerified: boolean;
  /** Set when returned; shown as Returned (REQ-ENG-005). */
  readonly returnNote: string | null;
  readonly skipReason: string | null;
  readonly version: number;
}

/** Tyre asset (SM-TYRE). `statusId` references the `tyre_statuses` row (§9.9). */
export interface TyreDto {
  readonly id: TyreId;
  /** Generated code, e.g. `TY-0001`. */
  readonly code: string;
  readonly serialNumber: string;
  readonly brand: string;
  readonly size: string;
  readonly tyreType: TyreType;
  readonly statusId: TyreStatusId;
  /** Status code mirror for convenience (SM-TYRE state). */
  readonly status: TyreStatus;
  readonly issuedWorkOrderId: WorkOrderId | null;
  readonly version: number;
}

/** Maintenance alert that can draft a WO (SM-WO T1). */
export interface MaintenanceAlertDto {
  readonly id: MaintenanceAlertId;
  readonly vehicleId: VehicleId;
  readonly alertType: AlertType;
  readonly status: AlertStatus;
  readonly version: number;
}

/** Schedule card (SM-SCH). */
export interface ScheduleCardDto {
  readonly id: ScheduleCardId;
  readonly workOrderId: WorkOrderId;
  readonly plannedDate: IsoDate;
  readonly status: ScheduleStatus;
  /** Rolled forward from a missed day (REQ-SCH-003, DEC-92). */
  readonly isRolledOver: boolean;
  readonly version: number;
}

/** Invoice (SM-INV). */
export interface InvoiceDto {
  readonly id: InvoiceId;
  /** Running number, e.g. `0001/BMI/04-11-26`. */
  readonly number: string | null;
  readonly customerId: CustomerId;
  readonly status: InvoiceStatus;
  readonly version: number;
}
