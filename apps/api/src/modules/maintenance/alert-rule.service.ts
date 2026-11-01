import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AlertType, WorkOrderPriority } from '@bmi/shared';

/**
 * The alert kinds a rule can be set for (REQ-PM-007). Inspection fail, Breakdown
 * and Field report ALWAYS draft a WO (they cannot be "show only").
 */
export const AlertRuleKind = {
  PmDue: 'PM_Due',
  DocumentExpiry: 'Document_Expiry',
  TyreTread: 'Tyre_Tread',
  PartItemLife: 'Part_Item_Life',
  InspectionFail: 'Inspection_Fail',
  Breakdown: 'Breakdown',
  FieldReport: 'Field_Report',
} as const;
export type AlertRuleKind = (typeof AlertRuleKind)[keyof typeof AlertRuleKind];

/** Kinds that always draft a WO and may never be set to "show only" (REQ-PM-007). */
const ALWAYS_DRAFTS: ReadonlySet<AlertRuleKind> = new Set([
  AlertRuleKind.InspectionFail,
  AlertRuleKind.Breakdown,
  AlertRuleKind.FieldReport,
]);

/** The action a rule takes when it triggers (REQ-PM-007). */
export const AlertRuleAction = {
  ShowOnly: 'Show_Only',
  ShowAndDraft: 'Show_And_Draft',
} as const;
export type AlertRuleAction =
  (typeof AlertRuleAction)[keyof typeof AlertRuleAction];

/**
 * An alert rule (`alert_rules`, PRD §9, REQ-PM-007/008/010, DEC-86). The preset
 * for PM and Document alerts is taken from the package / document type as one
 * setting (REQ-PM-008); here `presetId` carries the resolved preset version the
 * draft will use, and `presetActive` whether it is still usable at trigger time
 * (REQ-PM-010).
 */
export interface AlertRule {
  readonly id: number;
  readonly kind: AlertRuleKind;
  readonly action: AlertRuleAction;
  /** The preset version a drafted WO starts from, or `null` (no steps, DEC-85). */
  readonly presetId: number | null;
  /** Whether the resolved preset is still active at trigger time (REQ-PM-010). */
  readonly presetActive: boolean;
  readonly priority: WorkOrderPriority;
  /** Roles notified when the rule triggers (REQ-PM-009). */
  readonly notifyRoles: readonly string[];
  readonly version: number;
}

export interface SaveAlertRuleInput {
  kind: AlertRuleKind;
  action: AlertRuleAction;
  presetId?: number | null;
  presetActive?: boolean;
  priority?: WorkOrderPriority;
  notifyRoles?: readonly string[];
}

/** Map an alert rule kind to the `maintenance_alerts.alert_type` it raises. */
export function alertTypeOfRule(kind: AlertRuleKind): AlertType {
  switch (kind) {
    case AlertRuleKind.PmDue:
      return AlertType.PM;
    case AlertRuleKind.DocumentExpiry:
      return AlertType.Document;
    case AlertRuleKind.TyreTread:
      return AlertType.Tyre;
    default:
      return AlertType.PartItem;
  }
}

/**
 * **Alert rules** (FG-12, REQ-PM-007/008/010, DEC-86).
 *
 * Configures, per alert kind, whether to only show the alert or also draft a WO,
 * the preset, priority and the roles notified. Save is refused when a rule that
 * drafts WOs resolves to no preset while the kind requires one (REQ-PM-010), and
 * Inspection fail / Breakdown / Field report are forced to always draft
 * (REQ-PM-007).
 *
 * **Phase-1 modelling:** the dummy gateway carries no `alert_rules` table, so —
 * following the TASK-103..113 precedent — rules live in this API-layer in-memory
 * service seeded with sensible defaults; TASK-201/202 re-home it behind the real
 * PRD §9 table unchanged.
 */
@Injectable()
export class AlertRuleService {
  private readonly rules = new Map<AlertRuleKind, AlertRule>();
  private nextId = 1;

  constructor() {
    this.seed();
  }

  /** Every configured rule. */
  list(): readonly AlertRule[] {
    return [...this.rules.values()].sort((a, b) => a.id - b.id);
  }

  /** A rule by kind, throwing if absent. */
  require(kind: AlertRuleKind): AlertRule {
    const rule = this.rules.get(kind);
    if (!rule) {
      throw new NotFoundException(`No alert rule for kind: ${kind}`);
    }
    return rule;
  }

  /**
   * Save (overwrite) the rule for a kind. Refused per REQ-PM-010 when the rule
   * drafts WOs but resolves to no preset for a kind that needs one; the three
   * always-draft kinds are forced to `ShowAndDraft` and default to no preset.
   */
  save(input: SaveAlertRuleInput): AlertRule {
    const forcedDraft = ALWAYS_DRAFTS.has(input.kind);
    const action = forcedDraft ? AlertRuleAction.ShowAndDraft : input.action;
    const presetId = input.presetId ?? null;

    // REQ-PM-010: a PM/Document rule that drafts must have a preset resolved
    // from its package / document type. The always-draft kinds default to no
    // preset (DEC-85 — the Planner composes the steps).
    const needsPreset =
      action === AlertRuleAction.ShowAndDraft &&
      (input.kind === AlertRuleKind.PmDue || input.kind === AlertRuleKind.DocumentExpiry);
    if (needsPreset && presetId === null) {
      throw new BadRequestException(
        `Alert rule ${input.kind} drafts WOs but its package/document type has no preset (REQ-PM-010).`,
      );
    }

    const existing = this.rules.get(input.kind);
    const rule: AlertRule = {
      id: existing?.id ?? this.nextId++,
      kind: input.kind,
      action,
      presetId,
      presetActive: input.presetActive ?? true,
      priority: input.priority ?? WorkOrderPriority.Normal,
      notifyRoles: input.notifyRoles ?? existing?.notifyRoles ?? [],
      version: (existing?.version ?? 0) + 1,
    };
    this.rules.set(input.kind, rule);
    return rule;
  }

  /** Test-only reset to the seeded defaults. */
  resetForTests(): void {
    this.rules.clear();
    this.nextId = 1;
    this.seed();
  }

  private seed(): void {
    const defaults: SaveAlertRuleInput[] = [
      { kind: AlertRuleKind.PmDue, action: AlertRuleAction.ShowAndDraft, presetId: 1, priority: WorkOrderPriority.Normal },
      { kind: AlertRuleKind.DocumentExpiry, action: AlertRuleAction.ShowAndDraft, presetId: 1, priority: WorkOrderPriority.Normal },
      { kind: AlertRuleKind.TyreTread, action: AlertRuleAction.ShowAndDraft, presetId: null, priority: WorkOrderPriority.High },
      { kind: AlertRuleKind.PartItemLife, action: AlertRuleAction.ShowAndDraft, presetId: null, priority: WorkOrderPriority.Normal },
      { kind: AlertRuleKind.InspectionFail, action: AlertRuleAction.ShowAndDraft, presetId: null, priority: WorkOrderPriority.High },
      { kind: AlertRuleKind.Breakdown, action: AlertRuleAction.ShowAndDraft, presetId: null, priority: WorkOrderPriority.High },
      { kind: AlertRuleKind.FieldReport, action: AlertRuleAction.ShowAndDraft, presetId: null, priority: WorkOrderPriority.Normal },
    ];
    for (const rule of defaults) {
      this.save(rule);
    }
  }
}
