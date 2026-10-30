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

/** User account — exactly one role (BR-14). */
export interface UserDto {
  readonly id: UserId;
  readonly fullName: string;
  readonly role: Role;
  readonly isActive: boolean;
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

/** Work Order aggregate (SM-WO). */
export interface WorkOrderDto {
  readonly id: WorkOrderId;
  /** Running number, e.g. `WO-0142`. */
  readonly number: string;
  readonly vehicleId: VehicleId;
  readonly status: WorkOrderStatus;
  readonly source: WorkOrderSource;
  readonly category: WorkOrderCategory;
  readonly priority: WorkOrderPriority;
  readonly description: string;
  /** Originator's field-finding narrative (REQ-WO-016, DEC-91). */
  readonly findingNote: string | null;
  /** OFF-unit day counter (DEC-92). */
  readonly offDays: number;
  readonly createdBy: UserId;
  readonly createdAt: IsoTimestamp;
  readonly version: number;
}

/** One WO step / assignment (SM-STEP). */
export interface AssignmentDto {
  readonly id: AssignmentId;
  readonly workOrderId: WorkOrderId;
  readonly moduleId: AssignmentModuleId;
  readonly sequence: number;
  readonly status: StepStatus;
  /** Set only while Paused (presentation flag, not a state). */
  readonly isPaused: boolean;
  readonly team: Team;
  readonly assigneeId: UserId | null;
  readonly openedAt: IsoTimestamp | null;
  readonly startedAt: IsoTimestamp | null;
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
