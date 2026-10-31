import { Injectable } from '@nestjs/common';
import { Role } from '@bmi/shared';
import {
  PERMISSION_MATRIX,
  type Capability,
  type Grant,
} from '../../core/auth/permission-matrix.js';
import {
  AppSettingsService,
  type PlannerApprovalKind,
  type PlannerApprovalState,
} from './app-settings.service.js';

/** One cell of the §2.2 matrix as served to the Access Manager UI. */
export interface PermissionCell {
  readonly capability: Capability;
  readonly grant: Grant;
  /**
   * Whether the Access Manager may change this cell. `L`-locked cells (approvals,
   * account management, Setup/Go-live) are immutable (REQ-IAM-005, BR-04/14).
   */
  readonly locked: boolean;
}

/** The matrix for one role. */
export interface RolePermissions {
  readonly role: Role;
  readonly cells: readonly PermissionCell[];
}

/**
 * Capabilities whose §2.2 cell is locked by a business rule (REQ-IAM-005): the
 * Access Manager can read them but never change them. Approvals stay with
 * Supervisor/GM/System Admin, account management stays with Access Managers, and
 * the System Admin keeps every operational permission.
 */
const LOCKED_CAPABILITIES: ReadonlySet<Capability> = new Set<Capability>([
  'wo.approve',
  'count.approve',
  'accounts.manage',
  'iam.planner_approval_switch',
  'setup.golive',
]);

/**
 * The editable-but-locked permission matrix (REQ-IAM-005) and the
 * Planner-approval switch (REQ-IAM-008).
 *
 * The matrix itself is the server-authoritative §2.2 encoding the guard already
 * consults ({@link PERMISSION_MATRIX}); this service exposes it read-only to the
 * Access Manager with each cell's locked flag, and owns the Planner-approval
 * switch state. It does not re-derive the matrix (steering: reuse
 * `permission-matrix.ts`).
 */
@Injectable()
export class PermissionsService {
  constructor(private readonly settings: AppSettingsService) {}

  /** The full matrix, role by role, with locked flags (REQ-IAM-005). */
  readMatrix(): readonly RolePermissions[] {
    return Object.values(Role).map((role) => this.readRole(role));
  }

  /** One role's cells. */
  readRole(role: Role): RolePermissions {
    const entries = PERMISSION_MATRIX[role] ?? {};
    const cells: PermissionCell[] = Object.entries(entries).map(([capability, grant]) => ({
      capability,
      grant: grant as Grant,
      locked: LOCKED_CAPABILITIES.has(capability),
    }));
    return { role, cells };
  }

  /** Current Planner-approval switch state (REQ-IAM-008). */
  getPlannerApproval(now: Date = new Date()): PlannerApprovalState {
    return this.settings.getPlannerApproval(now);
  }

  /** Switch Planner approval on/off (REQ-IAM-008, Access Manager only). */
  setPlannerApproval(input: {
    on: boolean;
    until: string | null;
    kinds: readonly PlannerApprovalKind[];
  }): PlannerApprovalState {
    const state: PlannerApprovalState = input.on
      ? { on: true, until: input.until, kinds: input.kinds }
      : { on: false, until: null, kinds: [] };
    this.settings.setPlannerApproval(state);
    return this.settings.getPlannerApproval();
  }

  /**
   * Whether a Planner is currently an Approver for a given approval kind
   * (REQ-IAM-008). A Planner approves only while the switch is on, has not
   * expired, and ticks that kind. Any other role defers to the static matrix.
   */
  plannerMayApprove(kind: PlannerApprovalKind, now: Date = new Date()): boolean {
    const state = this.settings.getPlannerApproval(now);
    return state.on && state.kinds.includes(kind);
  }
}
