/**
 * State sets for every state machine in PRD §3, plus the shared enumerations
 * from PRD §9.1 that the machines reference.
 *
 * Values match PRD §9.1 / §3 / §9.9 EXACTLY (e.g. `wo_status_t`, `asg_status_t`,
 * `vehicle_status_t` incl. `'OFF'` per DEC-92, and the `tyre_statuses.code`
 * seed). Per the typescript-pro skill we use `const` objects with `as const`
 * rather than TS `enum`s, so the values tree-shake and the union types are
 * plain string literals.
 */

// =========================================================================
// SM-WO — Work Order lifecycle (PRD §3.2, enum wo_status_t §9.1)
// =========================================================================
export const WorkOrderStatus = {
  Draft: 'Draft',
  PendingApproval: 'Pending_Approval',
  Rejected: 'Rejected',
  Active: 'Active',
  InProgress: 'In_Progress',
  PendingVerification: 'Pending_Verification',
  PendingAmendment: 'Pending_Amendment',
  Completed: 'Completed',
  Cancelled: 'Cancelled',
} as const;
export type WorkOrderStatus =
  (typeof WorkOrderStatus)[keyof typeof WorkOrderStatus];

// =========================================================================
// SM-STEP — step / assignment (PRD §3.3, enum asg_status_t §9.1)
// =========================================================================
export const StepStatus = {
  Locked: 'Locked',
  Open: 'Open',
  InProgress: 'In_Progress',
  Submitted: 'Submitted',
  Verified: 'Verified',
  Skipped: 'Skipped',
} as const;
export type StepStatus = (typeof StepStatus)[keyof typeof StepStatus];

// =========================================================================
// SM-VEH — derived vehicle status (PRD §3.4, enum vehicle_status_t §9.1)
// Precedence (DEC-92): Inactive 1 > OFF 2 > Blocked 3 > Repair 4 > Active 5.
// =========================================================================
export const VehicleStatus = {
  Active: 'Active',
  Repair: 'Repair',
  Blocked: 'Blocked',
  OFF: 'OFF',
  Inactive: 'Inactive',
} as const;
export type VehicleStatus = (typeof VehicleStatus)[keyof typeof VehicleStatus];

// =========================================================================
// SM-DOC — vehicle document status (PRD §3.5, enum doc_status_t §9.1)
// =========================================================================
export const DocumentStatus = {
  Missing: 'Missing',
  Valid: 'Valid',
  Warning: 'Warning',
  Expired: 'Expired',
} as const;
export type DocumentStatus =
  (typeof DocumentStatus)[keyof typeof DocumentStatus];

// =========================================================================
// SM-TYRE — tyre status (PRD §3.6; values are tyre_statuses.code seed §9.9)
// =========================================================================
export const TyreStatus = {
  InStock: 'In_Stock',
  Issued: 'Issued',
  Mounted: 'Mounted',
  NeedsRetread: 'Needs_Retread',
  WornOut: 'Worn_Out',
  OnRetread: 'On_Retread',
  Scrapped: 'Scrapped',
  Lost: 'Lost',
} as const;
export type TyreStatus = (typeof TyreStatus)[keyof typeof TyreStatus];

// =========================================================================
// SM-GR — Goods Receipt (PRD §3.7)
// =========================================================================
export const GoodsReceiptStatus = {
  Draft: 'Draft',
  Posted: 'Posted',
} as const;
export type GoodsReceiptStatus =
  (typeof GoodsReceiptStatus)[keyof typeof GoodsReceiptStatus];

// =========================================================================
// SM-SA — Stock opname (PRD §3.7; stock_adjustments status §9.8)
// Pending_Approval -> Draft on Reject (shown as Returned).
// =========================================================================
export const StockOpnameStatus = {
  Draft: 'Draft',
  PendingApproval: 'Pending_Approval',
  Approved: 'Approved',
} as const;
export type StockOpnameStatus =
  (typeof StockOpnameStatus)[keyof typeof StockOpnameStatus];

// =========================================================================
// SM-TC — Tyre count (PRD §3.7; tyre_counts.status §9.9)
// Same shape as SM-SA.
// =========================================================================
export const TyreCountStatus = {
  Draft: 'Draft',
  PendingApproval: 'Pending_Approval',
  Approved: 'Approved',
} as const;
export type TyreCountStatus =
  (typeof TyreCountStatus)[keyof typeof TyreCountStatus];

// =========================================================================
// SM-TR — Receive tyres (PRD §3.7; tyre_receipts.status §9.9)
// =========================================================================
export const TyreReceiptStatus = {
  Draft: 'Draft',
  Confirmed: 'Confirmed',
} as const;
export type TyreReceiptStatus =
  (typeof TyreReceiptStatus)[keyof typeof TyreReceiptStatus];

// =========================================================================
// SM-RD — Retread dispatch (PRD §3.7; retread_orders.status §9.9)
// =========================================================================
export const RetreadDispatchStatus = {
  Draft: 'Draft',
  Sent: 'Sent',
  Partial: 'Partial',
  Closed: 'Closed',
} as const;
export type RetreadDispatchStatus =
  (typeof RetreadDispatchStatus)[keyof typeof RetreadDispatchStatus];

// =========================================================================
// SM-CR — Change request (PRD §3.7; enum cr_status_t §9.1)
// =========================================================================
export const ChangeRequestStatus = {
  Submitted: 'Submitted',
  InRevision: 'In_Revision',
  PendingApproval: 'Pending_Approval',
  Approved: 'Approved',
  Rejected: 'Rejected',
} as const;
export type ChangeRequestStatus =
  (typeof ChangeRequestStatus)[keyof typeof ChangeRequestStatus];

// =========================================================================
// SM-SCH — schedule card (PRD §3.7)
// "Not planned" is the pre-placement state; the daily job rolls a Missed card
// back to Planned (flagged rolled-over) with no limit (REQ-SCH-003, DEC-92).
// =========================================================================
export const ScheduleStatus = {
  NotPlanned: 'Not_Planned',
  Planned: 'Planned',
  Missed: 'Missed',
} as const;
export type ScheduleStatus =
  (typeof ScheduleStatus)[keyof typeof ScheduleStatus];

// =========================================================================
// SM-INV — invoice (PRD §3.7; enum invoice_status_t §9.1)
// =========================================================================
export const InvoiceStatus = {
  Draft: 'Draft',
  Issued: 'Issued',
  Paid: 'Paid',
  Void: 'Void',
} as const;
export type InvoiceStatus = (typeof InvoiceStatus)[keyof typeof InvoiceStatus];
