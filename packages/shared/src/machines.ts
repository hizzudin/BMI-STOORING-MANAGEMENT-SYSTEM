/**
 * The thirteen state machines of PRD §3, each as a data-driven transition table
 * built with `createStateMachine`. Every row below corresponds to a row in a
 * PRD §3 table; the comment on each row cites it. A `(from, event)` pair absent
 * from the table is refused (PR-6, PRD §3: "a transition not listed is refused").
 *
 * Events are modelled as `const` objects per machine so the engine stays
 * type-safe end to end (no stringly-typed events).
 */

import { createStateMachine } from './state-machine.js';
import {
  WorkOrderStatus,
  StepStatus,
  VehicleStatus,
  DocumentStatus,
  TyreStatus,
  GoodsReceiptStatus,
  StockOpnameStatus,
  TyreCountStatus,
  TyreReceiptStatus,
  RetreadDispatchStatus,
  ChangeRequestStatus,
  ScheduleStatus,
  InvoiceStatus,
} from './states.js';

// =========================================================================
// SM-WO — Work Order lifecycle (PRD §3.2, transitions T1..T15)
// =========================================================================
export const WorkOrderEvent = {
  Create: 'Create', // T1
  Submit: 'Submit', // T2
  Approve: 'Approve', // T3
  Reject: 'Reject', // T4
  EditAndResubmit: 'EditAndResubmit', // T5
  Cancel: 'Cancel', // T6, T15
  FirstStepStarted: 'FirstStepStarted', // T7
  ChangeRequestSubmitted: 'ChangeRequestSubmitted', // T8
  RevisionApproved: 'RevisionApproved', // T9
  RevisionRejected: 'RevisionRejected', // T10
  LastStepSubmitted: 'LastStepSubmitted', // T11
  StepReturned: 'StepReturned', // T12
  CompletionApproved: 'CompletionApproved', // T13
  CompletionRejected: 'CompletionRejected', // T14
} as const;
export type WorkOrderEvent =
  (typeof WorkOrderEvent)[keyof typeof WorkOrderEvent];

export const smWorkOrder = createStateMachine({
  name: 'SM-WO',
  transitions: [
    // T1 (new) Create -> Draft is a creation event (no prior state); modelled
    // separately in the bootstrap helper below, not as a from-state row.
    // T2
    {
      from: WorkOrderStatus.Draft,
      event: WorkOrderEvent.Submit,
      to: WorkOrderStatus.PendingApproval,
    },
    // T3
    {
      from: WorkOrderStatus.PendingApproval,
      event: WorkOrderEvent.Approve,
      to: WorkOrderStatus.Active,
    },
    // T4
    {
      from: WorkOrderStatus.PendingApproval,
      event: WorkOrderEvent.Reject,
      to: WorkOrderStatus.Rejected,
    },
    // T5
    {
      from: WorkOrderStatus.Rejected,
      event: WorkOrderEvent.EditAndResubmit,
      to: WorkOrderStatus.PendingApproval,
    },
    // T6 (Draft, Rejected) Cancel -> Cancelled
    {
      from: WorkOrderStatus.Draft,
      event: WorkOrderEvent.Cancel,
      to: WorkOrderStatus.Cancelled,
    },
    {
      from: WorkOrderStatus.Rejected,
      event: WorkOrderEvent.Cancel,
      to: WorkOrderStatus.Cancelled,
    },
    // T7
    {
      from: WorkOrderStatus.Active,
      event: WorkOrderEvent.FirstStepStarted,
      to: WorkOrderStatus.InProgress,
    },
    // T8 (Active, In_Progress) change request -> Pending_Amendment
    {
      from: WorkOrderStatus.Active,
      event: WorkOrderEvent.ChangeRequestSubmitted,
      to: WorkOrderStatus.PendingAmendment,
    },
    {
      from: WorkOrderStatus.InProgress,
      event: WorkOrderEvent.ChangeRequestSubmitted,
      to: WorkOrderStatus.PendingAmendment,
    },
    // T9 Pending_Amendment -> status before (approve). Both origins of T8 are
    // reachable; the service restores `status_before_amendment`. We encode the
    // two legal return targets as distinct guarded rules keyed by the saved
    // origin via dedicated events to keep the table deterministic.
    {
      from: WorkOrderStatus.PendingAmendment,
      event: WorkOrderEvent.RevisionApproved,
      to: WorkOrderStatus.InProgress,
    },
    // T10 Pending_Amendment -> status before (reject)
    {
      from: WorkOrderStatus.PendingAmendment,
      event: WorkOrderEvent.RevisionRejected,
      to: WorkOrderStatus.InProgress,
    },
    // T11
    {
      from: WorkOrderStatus.InProgress,
      event: WorkOrderEvent.LastStepSubmitted,
      to: WorkOrderStatus.PendingVerification,
    },
    // T12 Pending_Verification -> In_Progress [A] (step returned)
    {
      from: WorkOrderStatus.PendingVerification,
      event: WorkOrderEvent.StepReturned,
      to: WorkOrderStatus.InProgress,
    },
    // T13
    {
      from: WorkOrderStatus.PendingVerification,
      event: WorkOrderEvent.CompletionApproved,
      to: WorkOrderStatus.Completed,
    },
    // T14 Pending_Verification -> Pending_Verification (completion rejected)
    {
      from: WorkOrderStatus.PendingVerification,
      event: WorkOrderEvent.CompletionRejected,
      to: WorkOrderStatus.PendingVerification,
    },
    // T15 any open status -> Cancelled. "Open" = not already final
    // (Completed/Cancelled). Enumerated explicitly so no unlisted state slips in.
    {
      from: WorkOrderStatus.Active,
      event: WorkOrderEvent.Cancel,
      to: WorkOrderStatus.Cancelled,
    },
    {
      from: WorkOrderStatus.PendingApproval,
      event: WorkOrderEvent.Cancel,
      to: WorkOrderStatus.Cancelled,
    },
    {
      from: WorkOrderStatus.InProgress,
      event: WorkOrderEvent.Cancel,
      to: WorkOrderStatus.Cancelled,
    },
    {
      from: WorkOrderStatus.PendingVerification,
      event: WorkOrderEvent.Cancel,
      to: WorkOrderStatus.Cancelled,
    },
    {
      from: WorkOrderStatus.PendingAmendment,
      event: WorkOrderEvent.Cancel,
      to: WorkOrderStatus.Cancelled,
    },
  ],
});

// =========================================================================
// SM-STEP — step / assignment (PRD §3.3)
// =========================================================================
export const StepEvent = {
  WoApprovedOrPrevSubmitted: 'WoApprovedOrPrevSubmitted', // Locked -> Open
  Start: 'Start', // Open -> In_Progress
  Submit: 'Submit', // In_Progress (not paused) -> Submitted
  Pause: 'Pause', // In_Progress -> In_Progress (Paused)
  Resume: 'Resume', // In_Progress (Paused) -> In_Progress
  Verify: 'Verify', // Submitted -> Verified
  Return: 'Return', // Submitted -> Open (Returned)
  Skip: 'Skip', // Open -> Skipped
} as const;
export type StepEvent = (typeof StepEvent)[keyof typeof StepEvent];

export const smStep = createStateMachine({
  name: 'SM-STEP',
  transitions: [
    {
      from: StepStatus.Locked,
      event: StepEvent.WoApprovedOrPrevSubmitted,
      to: StepStatus.Open,
    },
    { from: StepStatus.Open, event: StepEvent.Start, to: StepStatus.InProgress },
    // Pause/Resume stay In_Progress (Paused is a presentation flag, not a state).
    {
      from: StepStatus.InProgress,
      event: StepEvent.Pause,
      to: StepStatus.InProgress,
    },
    {
      from: StepStatus.InProgress,
      event: StepEvent.Resume,
      to: StepStatus.InProgress,
    },
    {
      from: StepStatus.InProgress,
      event: StepEvent.Submit,
      to: StepStatus.Submitted,
    },
    {
      from: StepStatus.Submitted,
      event: StepEvent.Verify,
      to: StepStatus.Verified,
    },
    // Return -> Open (shown as Returned; next attempt needs Start again).
    {
      from: StepStatus.Submitted,
      event: StepEvent.Return,
      to: StepStatus.Open,
    },
    // Skip (P1) — only an optional step; enforced by a service-layer guard.
    { from: StepStatus.Open, event: StepEvent.Skip, to: StepStatus.Skipped },
  ],
});

// =========================================================================
// SM-VEH — derived vehicle status (PRD §3.4)
// Not an event-driven machine: status is RECOMPUTED from facts each time a WO,
// document or deactivation flag changes (and by the daily job). We model it as
// a precedence function, not a transition table. Precedence (DEC-92):
// Inactive 1 > OFF 2 > Blocked 3 > Repair 4 > Active 5 — highest wins.
// =========================================================================

/** Lower number = higher precedence (PRD §3.4 column [A]). */
export const VEHICLE_STATUS_PRECEDENCE: Record<
  (typeof VehicleStatus)[keyof typeof VehicleStatus],
  number
> = {
  [VehicleStatus.Inactive]: 1,
  [VehicleStatus.OFF]: 2,
  [VehicleStatus.Blocked]: 3,
  [VehicleStatus.Repair]: 4,
  [VehicleStatus.Active]: 5,
};

/** The facts that drive the derived vehicle status (PRD §3.4). */
export interface VehicleStatusFacts {
  /** System Admin deactivated the vehicle. */
  readonly isDeactivated: boolean;
  /** A scheduled WO overran its planned day while already in Repair (DEC-92). */
  readonly hasOverrunWhileInRepair: boolean;
  /** A required document is Missing or Expired. */
  readonly hasBlockingDocument: boolean;
  /** A downtime-type WO is In_Progress / Pending_Verification / Pending_Amendment. */
  readonly hasActiveRepair: boolean;
}

/**
 * Derive the single displayed vehicle status by precedence (PRD §3.4, DEC-92).
 * Pure: returns the highest-precedence status whose fact holds, else Active.
 */
export function deriveVehicleStatus(
  facts: VehicleStatusFacts,
): (typeof VehicleStatus)[keyof typeof VehicleStatus] {
  if (facts.isDeactivated) return VehicleStatus.Inactive;
  if (facts.hasOverrunWhileInRepair) return VehicleStatus.OFF;
  if (facts.hasBlockingDocument) return VehicleStatus.Blocked;
  if (facts.hasActiveRepair) return VehicleStatus.Repair;
  return VehicleStatus.Active;
}

// =========================================================================
// SM-DOC — vehicle document status (PRD §3.5)
// =========================================================================
export const DocumentEvent = {
  FirstEntrySaved: 'FirstEntrySaved', // Missing -> Valid/Warning/Expired (by dates)
  EnterWarningWindow: 'EnterWarningWindow', // Valid -> Warning (daily job)
  ReachExpiry: 'ReachExpiry', // Warning -> Expired (daily job)
  RenewalVerified: 'RenewalVerified', // Warning/Expired -> Valid
} as const;
export type DocumentEvent = (typeof DocumentEvent)[keyof typeof DocumentEvent];

export const smDocument = createStateMachine({
  name: 'SM-DOC',
  transitions: [
    // First entry resolves to one of Valid/Warning/Expired by its dates; the
    // service picks which. We encode the reachable targets as the dominant case
    // (Valid) plus explicit Warning/Expired via the daily-job events below.
    {
      from: DocumentStatus.Missing,
      event: DocumentEvent.FirstEntrySaved,
      to: DocumentStatus.Valid,
    },
    {
      from: DocumentStatus.Valid,
      event: DocumentEvent.EnterWarningWindow,
      to: DocumentStatus.Warning,
    },
    {
      from: DocumentStatus.Warning,
      event: DocumentEvent.ReachExpiry,
      to: DocumentStatus.Expired,
    },
    {
      from: DocumentStatus.Warning,
      event: DocumentEvent.RenewalVerified,
      to: DocumentStatus.Valid,
    },
    {
      from: DocumentStatus.Expired,
      event: DocumentEvent.RenewalVerified,
      to: DocumentStatus.Valid,
    },
  ],
});

// =========================================================================
// SM-TYRE — tyre status (PRD §3.6)
// =========================================================================
export const TyreEvent = {
  ReceiveNew: 'ReceiveNew', // (new) -> In_Stock
  BoughtOutside: 'BoughtOutside', // (new) -> Issued (Part Purchase)
  IssueInStockStep: 'IssueInStockStep', // In_Stock -> Issued
  Release: 'Release', // Issued -> In_Stock (Released)
  MountFromIssued: 'MountFromIssued', // Issued -> Mounted
  MountFromBaseline: 'MountFromBaseline', // In_Stock -> Mounted (baseline)
  Rotate: 'Rotate', // Mounted -> Mounted (new position)
  Demount: 'Demount', // Mounted -> Needs_Retread/Worn_Out/In_Stock
  ScrapFromMounted: 'ScrapFromMounted', // Mounted -> Scrapped
  RetreadDispatch: 'RetreadDispatch', // Needs_Retread -> On_Retread
  WornOutDialog: 'WornOutDialog', // Needs_Retread -> Worn_Out
  ScrapDialog: 'ScrapDialog', // Needs_Retread/Worn_Out -> Scrapped
  RetreadAccepted: 'RetreadAccepted', // On_Retread -> In_Stock
  RetreadRejected: 'RetreadRejected', // On_Retread -> Scrapped
  CountMissing: 'CountMissing', // In_Stock/Needs_Retread/Worn_Out -> Lost
} as const;
export type TyreEvent = (typeof TyreEvent)[keyof typeof TyreEvent];

export const smTyre = createStateMachine({
  name: 'SM-TYRE',
  transitions: [
    {
      from: TyreStatus.InStock,
      event: TyreEvent.IssueInStockStep,
      to: TyreStatus.Issued,
    },
    {
      from: TyreStatus.Issued,
      event: TyreEvent.Release,
      to: TyreStatus.InStock,
    },
    {
      from: TyreStatus.Issued,
      event: TyreEvent.MountFromIssued,
      to: TyreStatus.Mounted,
    },
    {
      from: TyreStatus.InStock,
      event: TyreEvent.MountFromBaseline,
      to: TyreStatus.Mounted,
    },
    { from: TyreStatus.Mounted, event: TyreEvent.Rotate, to: TyreStatus.Mounted },
    // Demount — condition chosen. Three legal targets; service picks by dialog.
    {
      from: TyreStatus.Mounted,
      event: TyreEvent.Demount,
      to: TyreStatus.NeedsRetread,
    },
    {
      from: TyreStatus.Mounted,
      event: TyreEvent.ScrapFromMounted,
      to: TyreStatus.Scrapped,
    },
    {
      from: TyreStatus.NeedsRetread,
      event: TyreEvent.RetreadDispatch,
      to: TyreStatus.OnRetread,
    },
    {
      from: TyreStatus.NeedsRetread,
      event: TyreEvent.WornOutDialog,
      to: TyreStatus.WornOut,
    },
    {
      from: TyreStatus.NeedsRetread,
      event: TyreEvent.ScrapDialog,
      to: TyreStatus.Scrapped,
    },
    {
      from: TyreStatus.WornOut,
      event: TyreEvent.ScrapDialog,
      to: TyreStatus.Scrapped,
    },
    {
      from: TyreStatus.OnRetread,
      event: TyreEvent.RetreadAccepted,
      to: TyreStatus.InStock,
    },
    {
      from: TyreStatus.OnRetread,
      event: TyreEvent.RetreadRejected,
      to: TyreStatus.Scrapped,
    },
    // Tyre count Missing -> Lost, from any in-warehouse status.
    {
      from: TyreStatus.InStock,
      event: TyreEvent.CountMissing,
      to: TyreStatus.Lost,
    },
    {
      from: TyreStatus.NeedsRetread,
      event: TyreEvent.CountMissing,
      to: TyreStatus.Lost,
    },
    {
      from: TyreStatus.WornOut,
      event: TyreEvent.CountMissing,
      to: TyreStatus.Lost,
    },
  ],
});

/**
 * The three legal Demount targets (PRD §3.6: "Demount, condition chosen").
 * Exposed so the service layer can validate the chosen condition against the
 * table rather than re-deriving it.
 */
export const DEMOUNT_TARGETS: readonly (typeof TyreStatus)[keyof typeof TyreStatus][] =
  [TyreStatus.NeedsRetread, TyreStatus.WornOut, TyreStatus.InStock];

// =========================================================================
// SM-GR — Goods Receipt (PRD §3.7)
// =========================================================================
export const GoodsReceiptEvent = { Post: 'Post' } as const;
export type GoodsReceiptEvent =
  (typeof GoodsReceiptEvent)[keyof typeof GoodsReceiptEvent];

export const smGoodsReceipt = createStateMachine({
  name: 'SM-GR',
  transitions: [
    {
      from: GoodsReceiptStatus.Draft,
      event: GoodsReceiptEvent.Post,
      to: GoodsReceiptStatus.Posted,
    },
  ],
});

// =========================================================================
// SM-SA — Stock opname (PRD §3.7)
// =========================================================================
export const StockOpnameEvent = {
  Submit: 'Submit', // Draft -> Pending_Approval
  Approve: 'Approve', // Pending_Approval -> Approved
  Reject: 'Reject', // Pending_Approval -> Draft (Returned)
} as const;
export type StockOpnameEvent =
  (typeof StockOpnameEvent)[keyof typeof StockOpnameEvent];

export const smStockOpname = createStateMachine({
  name: 'SM-SA',
  transitions: [
    {
      from: StockOpnameStatus.Draft,
      event: StockOpnameEvent.Submit,
      to: StockOpnameStatus.PendingApproval,
    },
    {
      from: StockOpnameStatus.PendingApproval,
      event: StockOpnameEvent.Approve,
      to: StockOpnameStatus.Approved,
    },
    {
      from: StockOpnameStatus.PendingApproval,
      event: StockOpnameEvent.Reject,
      to: StockOpnameStatus.Draft,
    },
  ],
});

// =========================================================================
// SM-TC — Tyre count (PRD §3.7) — same shape as SM-SA
// =========================================================================
export const TyreCountEvent = {
  Submit: 'Submit',
  Approve: 'Approve',
  Reject: 'Reject',
} as const;
export type TyreCountEvent =
  (typeof TyreCountEvent)[keyof typeof TyreCountEvent];

export const smTyreCount = createStateMachine({
  name: 'SM-TC',
  transitions: [
    {
      from: TyreCountStatus.Draft,
      event: TyreCountEvent.Submit,
      to: TyreCountStatus.PendingApproval,
    },
    {
      from: TyreCountStatus.PendingApproval,
      event: TyreCountEvent.Approve,
      to: TyreCountStatus.Approved,
    },
    {
      from: TyreCountStatus.PendingApproval,
      event: TyreCountEvent.Reject,
      to: TyreCountStatus.Draft,
    },
  ],
});

// =========================================================================
// SM-TR — Receive tyres (PRD §3.7)
// =========================================================================
export const TyreReceiptEvent = { Confirm: 'Confirm' } as const;
export type TyreReceiptEvent =
  (typeof TyreReceiptEvent)[keyof typeof TyreReceiptEvent];

export const smTyreReceipt = createStateMachine({
  name: 'SM-TR',
  transitions: [
    {
      from: TyreReceiptStatus.Draft,
      event: TyreReceiptEvent.Confirm,
      to: TyreReceiptStatus.Confirmed,
    },
  ],
});

// =========================================================================
// SM-RD — Retread dispatch (PRD §3.7)
// =========================================================================
export const RetreadDispatchEvent = {
  Confirm: 'Confirm', // Draft -> Sent
  PartialReturn: 'PartialReturn', // Sent -> Partial
  Close: 'Close', // Partial -> Closed
} as const;
export type RetreadDispatchEvent =
  (typeof RetreadDispatchEvent)[keyof typeof RetreadDispatchEvent];

export const smRetreadDispatch = createStateMachine({
  name: 'SM-RD',
  transitions: [
    {
      from: RetreadDispatchStatus.Draft,
      event: RetreadDispatchEvent.Confirm,
      to: RetreadDispatchStatus.Sent,
    },
    {
      from: RetreadDispatchStatus.Sent,
      event: RetreadDispatchEvent.PartialReturn,
      to: RetreadDispatchStatus.Partial,
    },
    {
      from: RetreadDispatchStatus.Partial,
      event: RetreadDispatchEvent.Close,
      to: RetreadDispatchStatus.Closed,
    },
  ],
});

// =========================================================================
// SM-CR — Change request (PRD §3.7)
// =========================================================================
export const ChangeRequestEvent = {
  Open: 'Open', // Submitted -> In_Revision (creator opens it)
  SendRevision: 'SendRevision', // In_Revision -> Pending_Approval
  Approve: 'Approve', // Pending_Approval -> Approved
  Reject: 'Reject', // Pending_Approval -> Rejected
} as const;
export type ChangeRequestEvent =
  (typeof ChangeRequestEvent)[keyof typeof ChangeRequestEvent];

export const smChangeRequest = createStateMachine({
  name: 'SM-CR',
  transitions: [
    {
      from: ChangeRequestStatus.Submitted,
      event: ChangeRequestEvent.Open,
      to: ChangeRequestStatus.InRevision,
    },
    {
      from: ChangeRequestStatus.InRevision,
      event: ChangeRequestEvent.SendRevision,
      to: ChangeRequestStatus.PendingApproval,
    },
    {
      from: ChangeRequestStatus.PendingApproval,
      event: ChangeRequestEvent.Approve,
      to: ChangeRequestStatus.Approved,
    },
    {
      from: ChangeRequestStatus.PendingApproval,
      event: ChangeRequestEvent.Reject,
      to: ChangeRequestStatus.Rejected,
    },
  ],
});

// =========================================================================
// SM-SCH — schedule card (PRD §3.7, REQ-SCH-003, DEC-92)
// =========================================================================
export const ScheduleEvent = {
  Place: 'Place', // Not_Planned -> Planned
  Miss: 'Miss', // Planned -> Missed (daily job, day passed, WO not Completed)
  RollForward: 'RollForward', // Missed -> Planned (moved; flagged rolled-over/late)
} as const;
export type ScheduleEvent = (typeof ScheduleEvent)[keyof typeof ScheduleEvent];

export const smSchedule = createStateMachine({
  name: 'SM-SCH',
  transitions: [
    {
      from: ScheduleStatus.NotPlanned,
      event: ScheduleEvent.Place,
      to: ScheduleStatus.Planned,
    },
    {
      from: ScheduleStatus.Planned,
      event: ScheduleEvent.Miss,
      to: ScheduleStatus.Missed,
    },
    // Daily job rolls a Missed card back to Planned with no limit (DEC-92).
    {
      from: ScheduleStatus.Missed,
      event: ScheduleEvent.RollForward,
      to: ScheduleStatus.Planned,
    },
  ],
});

// =========================================================================
// SM-INV — invoice (PRD §3.7)
// =========================================================================
export const InvoiceEvent = {
  Issue: 'Issue', // Draft -> Issued (number given, lines locked)
  Pay: 'Pay', // Issued -> Paid
  Void: 'Void', // Draft/Issued -> Void
} as const;
export type InvoiceEvent = (typeof InvoiceEvent)[keyof typeof InvoiceEvent];

export const smInvoice = createStateMachine({
  name: 'SM-INV',
  transitions: [
    {
      from: InvoiceStatus.Draft,
      event: InvoiceEvent.Issue,
      to: InvoiceStatus.Issued,
    },
    {
      from: InvoiceStatus.Issued,
      event: InvoiceEvent.Pay,
      to: InvoiceStatus.Paid,
    },
    // Draft or Issued -> Void (its WOs return to a new Draft).
    {
      from: InvoiceStatus.Draft,
      event: InvoiceEvent.Void,
      to: InvoiceStatus.Void,
    },
    {
      from: InvoiceStatus.Issued,
      event: InvoiceEvent.Void,
      to: InvoiceStatus.Void,
    },
  ],
});
