import { Inject, Injectable } from '@nestjs/common';
import {
  deriveVehicleStatus,
  WorkOrderCategory,
  WorkOrderStatus,
  ScheduleStatus,
  toId,
  type VehicleStatus,
  type VehicleStatusFacts,
  type WorkOrderDto,
} from '@bmi/shared';
import { wibDayOf, wibDaysEqual } from '@bmi/config';
import type { DataGateway } from '@bmi/data-gateway';
import { DATA_GATEWAY } from '../../core/data-gateway/data-gateway.module.js';

/**
 * WO categories that take the vehicle off the road while being worked
 * ("a WO of a downtime type", PRD §3.4). A Document renewal does not idle the
 * unit, so Document is NOT a downtime type; everything else is.
 */
const DOWNTIME_CATEGORIES: ReadonlySet<WorkOrderCategory> = new Set([
  WorkOrderCategory.PM,
  WorkOrderCategory.Corrective,
  WorkOrderCategory.Tyre,
  WorkOrderCategory.Other,
]);

/** The WO statuses that put a vehicle in Repair (PRD §3.4). */
const REPAIR_WO_STATUSES: ReadonlySet<WorkOrderStatus> = new Set([
  WorkOrderStatus.InProgress,
  WorkOrderStatus.PendingVerification,
  WorkOrderStatus.PendingAmendment,
]);

/** A WO status is final (OFF clears) when Completed or Cancelled. */
function isFinal(status: WorkOrderStatus): boolean {
  return status === WorkOrderStatus.Completed || status === WorkOrderStatus.Cancelled;
}

/**
 * Derives a vehicle's displayed status from the governing conditions (SM-VEH,
 * PRD §3.4, DEC-92) — it is **never a free-set field**. The precedence
 * (Inactive > OFF > Blocked > Repair > Active) is applied by `@bmi/shared`'s
 * pure `deriveVehicleStatus`; this service only gathers the four facts from the
 * gateway (WOs, schedule cards) plus the caller-supplied deactivation/document
 * facts, then returns the single highest-precedence status.
 *
 * **OFF (DEC-92)** = the vehicle is in Repair (a downtime WO In_Progress /
 * Pending_Verification / Pending_Amendment) *and* that WO's scheduled day has
 * overrun (its planned WIB day has ended with the WO not final). OFF holds until
 * the overrunning WO becomes Completed or Cancelled, at which point the Repair
 * fact also clears. OFF does NOT block WO creation/amendment — only Inactive
 * does (REQ-WO-013), which this service expresses purely as the precedence
 * ordering, not as any gate here.
 */
@Injectable()
export class VehicleStatusService {
  constructor(@Inject(DATA_GATEWAY) private readonly gateway: DataGateway) {}

  /**
   * Compute the derived status for a vehicle.
   *
   * @param vehicleId the vehicle
   * @param facts caller-owned facts not held in the WO graph:
   *   - `isDeactivated` — the System Admin deactivated it (REQ-VEH-004).
   *   - `hasBlockingDocument` — a required document is Missing/Expired (REQ-DOC-005).
   * @param now the evaluation instant (WIB day boundary for the overrun check).
   */
  async computeStatus(
    vehicleId: number,
    facts: { isDeactivated: boolean; hasBlockingDocument: boolean },
    now: Date = new Date(),
  ): Promise<VehicleStatus> {
    const wos = await this.gateway.repos.workOrders.findBy(
      'vehicleId',
      toId<'VehicleId'>(vehicleId),
    );

    const repairWos = wos.filter(
      (wo) =>
        DOWNTIME_CATEGORIES.has(wo.category) && REPAIR_WO_STATUSES.has(wo.status),
    );
    const hasActiveRepair = repairWos.length > 0;

    // OFF: at least one in-Repair WO has overrun its scheduled WIB day.
    let hasOverrunWhileInRepair = false;
    for (const wo of repairWos) {
      if (await this.hasOverrun(wo, now)) {
        hasOverrunWhileInRepair = true;
        break;
      }
    }

    const statusFacts: VehicleStatusFacts = {
      isDeactivated: facts.isDeactivated,
      hasOverrunWhileInRepair,
      hasBlockingDocument: facts.hasBlockingDocument,
      hasActiveRepair,
    };
    return deriveVehicleStatus(statusFacts);
  }

  /**
   * Whether a (still-open, in-Repair) WO has overrun its scheduled day: it has a
   * schedule card whose planned WIB day has already ended (before today's WIB
   * day) and the WO is not yet final. A Completed/Cancelled WO never overruns.
   */
  private async hasOverrun(wo: WorkOrderDto, now: Date): Promise<boolean> {
    if (isFinal(wo.status)) {
      return false;
    }
    const cards = await this.gateway.repos.scheduleCards.findBy('workOrderId', wo.id);
    if (cards.length === 0) {
      return false;
    }
    const todayWib = wibDayOf(now);
    for (const card of cards) {
      // A card still open (Planned or Missed) whose planned day is before today
      // means the WO ran past its planned WIB day (REQ-SCH-003, DEC-92).
      if (card.status === ScheduleStatus.NotPlanned) {
        continue;
      }
      const planned = this.parsePlannedDay(card.plannedDate);
      if (!planned) {
        continue;
      }
      const plannedBeforeToday =
        !wibDaysEqual(planned, todayWib) && this.isBefore(planned, todayWib);
      if (plannedBeforeToday || card.status === ScheduleStatus.Missed) {
        return true;
      }
    }
    return false;
  }

  /** Parse a `YYYY-MM-DD` planned date into WIB-day parts. */
  private parsePlannedDay(
    plannedDate: string,
  ): { year: number; month: number; day: number } | null {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(plannedDate);
    if (!match) {
      return null;
    }
    return {
      year: Number(match[1]),
      month: Number(match[2]),
      day: Number(match[3]),
    };
  }

  /** True when WIB day `a` falls strictly before WIB day `b`. */
  private isBefore(
    a: { year: number; month: number; day: number },
    b: { year: number; month: number; day: number },
  ): boolean {
    if (a.year !== b.year) return a.year < b.year;
    if (a.month !== b.month) return a.month < b.month;
    return a.day < b.day;
  }
}
