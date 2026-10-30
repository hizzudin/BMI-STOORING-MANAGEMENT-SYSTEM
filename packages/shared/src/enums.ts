/**
 * Shared enumerations from PRD §9.1 that are NOT themselves state-machine state
 * sets (those live in `states.ts`). Values match the PostgreSQL `CREATE TYPE`
 * definitions in §9.1 exactly. Modelled as `const` objects (typescript-pro
 * skill: prefer `as const` over TS `enum`).
 */

/** role_t (§9.1) — the ten roles; exactly one per user (BR-14). */
export const Role = {
  Planner: 'Planner',
  Mechanic: 'Mechanic',
  WarehouseManager: 'Warehouse_Manager',
  Supervisor: 'Supervisor',
  GM: 'GM',
  SystemAdmin: 'System_Admin',
  AccessManager: 'Access_Manager',
  Driver: 'Driver',
  FieldCoordinator: 'Field_Coordinator',
  Accounting: 'Accounting',
} as const;
export type Role = (typeof Role)[keyof typeof Role];

/** wo_source_t (§9.1) — what originated the WO. */
export const WorkOrderSource = {
  SystemPM: 'System_PM',
  TyreAlert: 'Tyre_Alert',
  DocumentAlert: 'Document_Alert',
  DriverDVIR: 'Driver_DVIR',
  DriverBreakdown: 'Driver_Breakdown',
  PartCheck: 'Part_Check',
  ManualPlanner: 'Manual_Planner',
  ManualMechanic: 'Manual_Mechanic',
  ManualFieldCoordinator: 'Manual_Field_Coordinator',
  ManualAdmin: 'Manual_Admin',
} as const;
export type WorkOrderSource =
  (typeof WorkOrderSource)[keyof typeof WorkOrderSource];

/**
 * Field-originated sources whose drafts require a non-empty `finding_note`
 * at send-for-review (REQ-WO-016, DEC-91). Kept as a typed tuple so the
 * service layer can test membership without duplicating the two literals.
 */
export const FINDING_NOTE_REQUIRED_SOURCES: readonly WorkOrderSource[] = [
  WorkOrderSource.ManualFieldCoordinator,
  WorkOrderSource.ManualMechanic,
];

/** wo_category_t (§9.1, DEC-85). */
export const WorkOrderCategory = {
  PM: 'PM',
  Corrective: 'Corrective',
  Tyre: 'Tyre',
  Document: 'Document',
  Other: 'Other',
} as const;
export type WorkOrderCategory =
  (typeof WorkOrderCategory)[keyof typeof WorkOrderCategory];

/**
 * WO urgency label (REQ-WO-015, DEC-92). Drives list/inbox ordering and the
 * colour-coded urgency pill (text always present for WCAG). Ordered from most
 * to least urgent in `WORK_ORDER_PRIORITY_ORDER`.
 */
export const WorkOrderPriority = {
  Urgent: 'Urgent',
  High: 'High',
  Normal: 'Normal',
  Low: 'Low',
} as const;
export type WorkOrderPriority =
  (typeof WorkOrderPriority)[keyof typeof WorkOrderPriority];

/** Urgency sort order: Urgent first, Low last (REQ-WO-015). */
export const WORK_ORDER_PRIORITY_ORDER: readonly WorkOrderPriority[] = [
  WorkOrderPriority.Urgent,
  WorkOrderPriority.High,
  WorkOrderPriority.Normal,
  WorkOrderPriority.Low,
];

/** approval_stage_t (§9.1). */
export const ApprovalStage = {
  Creation: 'Creation',
  Completion: 'Completion',
  Amendment: 'Amendment',
} as const;
export type ApprovalStage = (typeof ApprovalStage)[keyof typeof ApprovalStage];

/** approval_action_t (§9.1). */
export const ApprovalAction = {
  Submit: 'Submit',
  Approve: 'Approve',
  Reject: 'Reject',
  Cancel: 'Cancel',
  RequestCompletion: 'Request_Completion',
} as const;
export type ApprovalAction =
  (typeof ApprovalAction)[keyof typeof ApprovalAction];

/** alert_type_t (§9.1). */
export const AlertType = {
  PM: 'PM',
  PartItem: 'Part_Item',
  Tyre: 'Tyre',
  Document: 'Document',
} as const;
export type AlertType = (typeof AlertType)[keyof typeof AlertType];

/** alert_status_t (§9.1). */
export const AlertStatus = {
  Pending: 'Pending',
  ConvertedToWO: 'Converted_To_WO',
  Dismissed: 'Dismissed',
} as const;
export type AlertStatus = (typeof AlertStatus)[keyof typeof AlertStatus];

/** odo_source_t (§9.1). */
export const OdometerSource = {
  Admin: 'Admin',
  Driver: 'Driver',
  GPS: 'GPS',
} as const;
export type OdometerSource =
  (typeof OdometerSource)[keyof typeof OdometerSource];

/** team_t (§9.1) — internal vs external workshop. */
export const Team = {
  Internal: 'Internal',
  External: 'External',
} as const;
export type Team = (typeof Team)[keyof typeof Team];

/** tyre_type_t (§9.1). */
export const TyreType = {
  Tube: 'Tube',
  Tubeless: 'Tubeless',
} as const;
export type TyreType = (typeof TyreType)[keyof typeof TyreType];

/** placement_act_t (§9.1). */
export const PlacementAction = {
  Baseline: 'Baseline',
  Mount: 'Mount',
  Rotate: 'Rotate',
  Demount: 'Demount',
  Scrap: 'Scrap',
} as const;
export type PlacementAction =
  (typeof PlacementAction)[keyof typeof PlacementAction];

/** location_capture_t (§9.1). */
export const LocationCapture = {
  Captured: 'Captured',
  Denied: 'Denied',
  Unavailable: 'Unavailable',
} as const;
export type LocationCapture =
  (typeof LocationCapture)[keyof typeof LocationCapture];
