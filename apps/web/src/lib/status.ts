/**
 * Status / urgency → pill-variant mapping.
 *
 * The binding rule (DESIGN.md "The Words First Rule" + NFR-A11Y / WCAG 2.2 AA):
 * status is NEVER conveyed by colour alone. Every mapping here returns BOTH a
 * colour `variant` AND a `label` (the status word), and the `<Pill>` component
 * always renders the label text. Colour only reinforces the word.
 *
 * Urgency mapping (DESIGN.md "Urgency / WO priority pill"):
 *   Urgent → danger (red) · High → warning (amber) · Normal → info (petrol) · Low → neutral.
 */

import {
  WorkOrderStatus,
  StepStatus,
  WorkOrderPriority,
  VehicleStatus,
  type WorkOrderPriority as PriorityT,
} from '@bmi/shared';

export type PillVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

export interface PillSpec {
  readonly variant: PillVariant;
  /** The status/urgency word that MUST always be shown (never colour alone). */
  readonly label: string;
}

/** WO priority → pill. Label is the priority word itself (REQ-WO-015). */
export function priorityPill(priority: PriorityT): PillSpec {
  switch (priority) {
    case WorkOrderPriority.Urgent:
      return { variant: 'danger', label: 'Urgent' };
    case WorkOrderPriority.High:
      return { variant: 'warning', label: 'High' };
    case WorkOrderPriority.Normal:
      return { variant: 'info', label: 'Normal' };
    case WorkOrderPriority.Low:
      return { variant: 'neutral', label: 'Low' };
    default: {
      const _exhaustive: never = priority;
      return { variant: 'neutral', label: String(_exhaustive) };
    }
  }
}

/** Humanise an enum value (`Pending_Approval` → `Pending Approval`). */
export function humanize(value: string): string {
  return value.replace(/_/g, ' ');
}

/** WO status → pill. */
export function workOrderStatusPill(status: string): PillSpec {
  const label = humanize(status);
  switch (status) {
    case WorkOrderStatus.Active:
      return { variant: 'success', label };
    case WorkOrderStatus.InProgress:
      return { variant: 'info', label };
    case WorkOrderStatus.PendingApproval:
    case WorkOrderStatus.PendingVerification:
    case WorkOrderStatus.PendingAmendment:
      return { variant: 'warning', label };
    case WorkOrderStatus.Rejected:
    case WorkOrderStatus.Cancelled:
      return { variant: 'danger', label };
    case WorkOrderStatus.Completed:
      return { variant: 'success', label };
    case WorkOrderStatus.Draft:
    default:
      return { variant: 'neutral', label };
  }
}

/** Step status → pill. */
export function stepStatusPill(status: string): PillSpec {
  const label = humanize(status);
  switch (status) {
    case StepStatus.Open:
    case StepStatus.InProgress:
      return { variant: 'info', label };
    case StepStatus.Submitted:
      return { variant: 'warning', label };
    case StepStatus.Verified:
      return { variant: 'success', label };
    case StepStatus.Skipped:
      return { variant: 'neutral', label };
    case StepStatus.Locked:
    default:
      return { variant: 'neutral', label };
  }
}

/** Vehicle derived status → pill (incl. OFF, DEC-92). */
export function vehicleStatusPill(status: string): PillSpec {
  const label = humanize(status);
  switch (status) {
    case VehicleStatus.Active:
      return { variant: 'success', label };
    case VehicleStatus.Repair:
      return { variant: 'warning', label };
    case VehicleStatus.Blocked:
    case VehicleStatus.Inactive:
      return { variant: 'danger', label };
    case VehicleStatus.OFF:
      return { variant: 'info', label };
    default:
      return { variant: 'neutral', label };
  }
}
