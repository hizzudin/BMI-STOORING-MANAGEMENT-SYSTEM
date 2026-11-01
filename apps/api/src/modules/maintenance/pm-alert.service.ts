import { Inject, Injectable } from '@nestjs/common';
import {
  AlertStatus,
  WorkOrderCategory,
  WorkOrderPriority,
  WorkOrderSource,
  idValue,
  toId,
  type MaintenanceAlertDto,
  type WorkOrderDto,
} from '@bmi/shared';
import type { DataGateway } from '@bmi/data-gateway';
import { DATA_GATEWAY } from '../../core/data-gateway/data-gateway.module.js';
import { WorkOrdersService } from '../work-orders/work-orders.service.js';
import {
  AlertRuleAction,
  AlertRuleKind,
  alertTypeOfRule,
  AlertRuleService,
  type AlertRule,
} from './alert-rule.service.js';
import { NotificationKind, NotificationService } from './notification.service.js';

/**
 * The reason an alert fired (REQ-PM-001 AC — "reason Mileage"). Carried on the
 * API-layer alert context; the alert DTO itself only holds type + status.
 */
export const AlertReason = {
  Mileage: 'Mileage',
  Days: 'Days',
  Tread: 'Tread',
  Expiry: 'Expiry',
  Life: 'Life',
  Fail: 'Fail',
  Report: 'Report',
} as const;
export type AlertReason = (typeof AlertReason)[keyof typeof AlertReason];

/**
 * Side context for an alert the dummy gateway's `MaintenanceAlertDto` does not
 * model (source key for de-dup, the rule kind, reason and the drafted WO link).
 * Phase-1 only; TASK-201/202 re-home it behind `maintenance_alerts` columns.
 */
interface AlertContext {
  readonly alertId: number;
  readonly ruleKind: AlertRuleKind;
  readonly reason: AlertReason;
  /** The source key: vehicle + rule kind + package/doc/tyre/part key (REQ-PM-009). */
  readonly sourceKey: string;
  draftedWorkOrderId: number | null;
}

/** Input to trigger one alert evaluation (a due PM package, a worn tyre, …). */
export interface TriggerAlertInput {
  vehicleId: number;
  ruleKind: AlertRuleKind;
  reason: AlertReason;
  /** The package / document type / tyre / part key the alert is about (de-dup). */
  sourceRef: string;
  /** WO title for the drafted WO (REQ-PM-009). */
  title: string;
  category?: WorkOrderCategory;
  requiresDowntime?: boolean;
  /** A finding narrative carried to the draft (e.g. the breakdown description). */
  findingNote?: string | null;
  /** Override the rule's preset (e.g. PM uses the package's preset, REQ-PM-008). */
  presetId?: number | null;
  createdBy: number;
}

/** The result of triggering an alert. */
export interface TriggerAlertResult {
  readonly alert: MaintenanceAlertDto;
  readonly reason: AlertReason;
  readonly draftedWorkOrder: WorkOrderDto | null;
  /** True when this call created a new alert; false when it de-duped to an open one. */
  readonly created: boolean;
}

/**
 * **PM / alert engine** (FG-12, REQ-PM-001..010, DEC-86).
 *
 * Raises PM / part-item / tyre / document alerts and, when the alert rule says
 * so, drafts exactly one Draft WO from the alert (never Active, REQ-PM-009),
 * **reusing the WO-lifecycle owner** `WorkOrdersService.createAlertDraft` — it
 * never re-implements WO creation. It de-duplicates: no second pending alert and
 * no second draft for the same vehicle + source while one is open (REQ-PM-001 /
 * REQ-PM-009). A rule whose preset is inactive raises the alert WITHOUT a draft
 * and notifies the System Admin (REQ-PM-010).
 *
 * **Phase-1 modelling:** the alert rows are real gateway `maintenance_alerts`
 * aggregates; the alert's source key / reason / drafted-WO link that the dummy
 * `MaintenanceAlertDto` does not carry live in this API-layer in-memory context
 * map (TASK-103..113 precedent); TASK-201/202 re-home them behind the PRD §9
 * columns unchanged.
 */
@Injectable()
export class PmAlertService {
  /** alertId → side context (source key, reason, drafted WO). */
  private readonly contexts = new Map<number, AlertContext>();

  constructor(
    @Inject(DATA_GATEWAY) private readonly gateway: DataGateway,
    private readonly workOrders: WorkOrdersService,
    private readonly rules: AlertRuleService,
    private readonly notifications: NotificationService,
  ) {}

  /**
   * Trigger one alert evaluation. Raises a pending alert (unless one is already
   * open for the same vehicle + source) and, per its rule, drafts one WO.
   */
  async trigger(input: TriggerAlertInput, now: Date = new Date()): Promise<TriggerAlertResult> {
    const rule = this.rules.require(input.ruleKind);
    const sourceKey = this.sourceKey(input.vehicleId, input.ruleKind, input.sourceRef);

    // De-dup: an alert already open for this vehicle + source (REQ-PM-001).
    const existing = this.openContextFor(sourceKey);
    if (existing) {
      const alert = await this.gateway.repos.maintenanceAlerts.requireById(existing.alertId);
      const draftedWorkOrder =
        existing.draftedWorkOrderId === null
          ? null
          : await this.gateway.repos.workOrders.getById(existing.draftedWorkOrderId);
      return { alert, reason: existing.reason, draftedWorkOrder, created: false };
    }

    const alert = await this.gateway.unitOfWork((ctx) =>
      ctx.repos.maintenanceAlerts.insert({
        vehicleId: toId<'VehicleId'>(input.vehicleId),
        alertType: alertTypeOfRule(input.ruleKind),
        status: AlertStatus.Pending,
      } as Omit<MaintenanceAlertDto, 'id' | 'version'>),
    );
    const alertId = idValue(alert.id);

    const context: AlertContext = {
      alertId,
      ruleKind: input.ruleKind,
      reason: input.reason,
      sourceKey,
      draftedWorkOrderId: null,
    };
    this.contexts.set(alertId, context);

    const draftedWorkOrder = await this.maybeDraft(rule, input, context, now);
    const finalAlert =
      draftedWorkOrder === null
        ? alert
        : await this.markConverted(alertId);

    this.notifyRule(rule, input, now);

    return { alert: finalAlert, reason: input.reason, draftedWorkOrder, created: true };
  }

  /** Every alert without a WO (the alert list, REQ-PM-003). */
  async pendingAlerts(): Promise<readonly MaintenanceAlertDto[]> {
    const all = await this.gateway.repos.maintenanceAlerts.list();
    return all.filter((a) => a.status === AlertStatus.Pending);
  }

  /** The reason an alert fired, for the list (REQ-PM-001 AC "reason Mileage"). */
  reasonOf(alertId: number): AlertReason | null {
    return this.contexts.get(alertId)?.reason ?? null;
  }

  /** The WO drafted from an alert, or `null` (REQ-PM-009 link). */
  draftedWorkOrderIdOf(alertId: number): number | null {
    return this.contexts.get(alertId)?.draftedWorkOrderId ?? null;
  }

  /** Test-only reset of the in-memory alert context map. */
  resetForTests(): void {
    this.contexts.clear();
  }

  // --- internals -----------------------------------------------------------

  /** Draft a WO when the rule says so and its preset is usable (REQ-PM-009/010). */
  private async maybeDraft(
    rule: AlertRule,
    input: TriggerAlertInput,
    context: AlertContext,
    now: Date,
  ): Promise<WorkOrderDto | null> {
    if (rule.action !== AlertRuleAction.ShowAndDraft) {
      return null;
    }
    const presetId = input.presetId ?? rule.presetId;
    // REQ-PM-010: an inactive preset raises the alert without a draft and
    // notifies the System Admin; it does not block the alert.
    if (presetId !== null && presetId !== undefined && !rule.presetActive) {
      this.notifications.create(
        {
          kind: NotificationKind.Alert,
          // System Admin is user 6 in the seed graph; the matrix routes this to SA.
          userId: 6,
          message: `Alert for vehicle ${input.vehicleId} could not draft a WO: its preset is inactive (REQ-PM-010).`,
          dedupeKey: context.sourceKey,
        },
        now,
      );
      return null;
    }

    const draft = await this.workOrders.createAlertDraft({
      vehicleId: input.vehicleId,
      source: this.sourceOfKind(input.ruleKind),
      category: input.category ?? this.categoryOfKind(input.ruleKind),
      priority: rule.priority as WorkOrderPriority,
      requiresDowntime: input.requiresDowntime ?? true,
      title: input.title,
      findingNote: input.findingNote ?? null,
      createdBy: input.createdBy,
      presetId: presetId ?? null,
    });
    context.draftedWorkOrderId = idValue(draft.id);
    return draft;
  }

  /** Notify the roles the rule names (REQ-PM-009). Phase-1: by role→seed-user. */
  private notifyRule(rule: AlertRule, input: TriggerAlertInput, now: Date): void {
    for (const role of rule.notifyRoles) {
      // Phase-1 role→user mapping is the seed graph; the real routing is the
      // §2.2 recipient matrix (REQ-NTF-005), re-homed in TASK-201/202.
      const userId = SEED_USER_BY_ROLE[role];
      if (userId === undefined) {
        continue;
      }
      this.notifications.create(
        {
          kind: NotificationKind.Alert,
          userId,
          message: `New ${input.ruleKind} alert for vehicle ${input.vehicleId}.`,
          dedupeKey: this.sourceKey(input.vehicleId, input.ruleKind, input.sourceRef),
        },
        now,
      );
    }
  }

  /** Flag the alert converted once a draft exists (SM alert → Converted_To_WO). */
  private async markConverted(alertId: number): Promise<MaintenanceAlertDto> {
    return this.gateway.unitOfWork(async (ctx) => {
      const alert = await ctx.repos.maintenanceAlerts.requireById(alertId);
      return ctx.repos.maintenanceAlerts.update({
        ...alert,
        status: AlertStatus.ConvertedToWO,
      });
    });
  }

  /** The open alert context for a source key, or `undefined`. */
  private openContextFor(sourceKey: string): AlertContext | undefined {
    return [...this.contexts.values()].find((c) => c.sourceKey === sourceKey);
  }

  private sourceKey(vehicleId: number, kind: AlertRuleKind, sourceRef: string): string {
    return `${vehicleId}|${kind}|${sourceRef}`;
  }

  private sourceOfKind(kind: AlertRuleKind): WorkOrderSource {
    switch (kind) {
      case AlertRuleKind.PmDue:
        return WorkOrderSource.SystemPM;
      case AlertRuleKind.TyreTread:
        return WorkOrderSource.TyreAlert;
      case AlertRuleKind.DocumentExpiry:
        return WorkOrderSource.DocumentAlert;
      default:
        return WorkOrderSource.SystemPM;
    }
  }

  private categoryOfKind(kind: AlertRuleKind): WorkOrderCategory {
    switch (kind) {
      case AlertRuleKind.PmDue:
        return WorkOrderCategory.PM;
      case AlertRuleKind.TyreTread:
        return WorkOrderCategory.Tyre;
      case AlertRuleKind.DocumentExpiry:
        return WorkOrderCategory.Document;
      default:
        return WorkOrderCategory.Corrective;
    }
  }
}

/** Phase-1 role→seed-user mapping used for rule notifications (REQ-PM-009). */
const SEED_USER_BY_ROLE: Readonly<Record<string, number>> = {
  Planner: 1,
  Supervisor: 2,
  Mechanic: 3,
  Driver: 4,
  Warehouse_Manager: 5,
  System_Admin: 6,
  Access_Manager: 7,
  Field_Coordinator: 1,
  GM: 2,
  Accounting: 2,
};
