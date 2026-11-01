import { Inject, Injectable } from '@nestjs/common';
import {
  ScheduleEvent,
  ScheduleStatus,
  WorkOrderStatus,
  smSchedule,
  idValue,
  type ScheduleCardDto,
  type WorkOrderDto,
} from '@bmi/shared';
import { wibDayOf, wibDayStartUtc, wibDayToIso, wibDaysEqual, type WibDay } from '@bmi/config';
import type { DataGateway } from '@bmi/data-gateway';
import { DATA_GATEWAY } from '../../core/data-gateway/data-gateway.module.js';
import { VehiclesService } from '../vehicles/vehicles.service.js';
import { ScheduleService } from './schedule.service.js';
import { NotificationKind, NotificationService } from './notification.service.js';

/** A WO is final (OFF clears, schedule stops rolling) when Completed or Cancelled. */
function isFinal(status: WorkOrderStatus): boolean {
  return status === WorkOrderStatus.Completed || status === WorkOrderStatus.Cancelled;
}

/** The outcome of one daily-job run (for logging and test assertions, NFR-14). */
export interface DailyJobResult {
  /** The WIB day the job ran for (YYYY-MM-DD). */
  readonly wibDay: string;
  /** Schedule cards rolled forward this run (REQ-SCH-003). */
  readonly rolledForwardCardIds: readonly number[];
  /** WOs whose `off_days` was incremented this run (DEC-92). */
  readonly offCountedWorkOrderIds: readonly number[];
  /** Vehicles whose derived status was recalculated (SM-VEH, DEC-92). */
  readonly recalculatedVehicleIds: readonly number[];
}

/**
 * **Simulated daily job** (FG-12, REQ-SCH-003, SM-SCH, SM-VEH, DEC-92, NFR-14).
 *
 * A runnable function (not an HTTP endpoint) that mirrors the 00:30 WIB daily
 * job. In Phase 1 it is invoked manually / by a test; TASK-205 re-homes the same
 * behaviour behind a real scheduled worker. It is **idempotent**: re-running it
 * for the same WIB day yields identical state.
 *
 * Each run, for every open schedule card whose planned WIB day is before today
 * and whose WO is not Completed/Cancelled:
 *   1. Marks the card Missed then rolls it forward to **today's** WIB day
 *      (SM-SCH Miss → RollForward, with no limit, BR-13 — never blocking or
 *      cancelling the WO), flags `wo_schedule.is_rolled_over`, logs the move
 *      (REQ-SCH-003/006), and sends the missed/late alerts (REQ-SCH-004/007).
 *      Rolling to today (not one day past the old planned day) is what makes the
 *      job idempotent — a second run the same day finds the card already on
 *      today and does nothing.
 *   2. Increments the overrunning WO's `work_orders.off_days` **exactly once per
 *      WIB day**, guarded by `off_last_counted_date` (the last WIB day already
 *      counted, an API-layer map in Phase 1). A re-run the same day never
 *      double-counts (DEC-92).
 *   3. Recalculates the derived vehicle status (including OFF) by **reusing the
 *      TASK-106 derivation seam** `VehiclesService.recomputeStatus(id, now)` —
 *      the OFF/precedence logic is never duplicated here.
 */
@Injectable()
export class DailyJobService {
  /**
   * workOrderId → the last WIB day (`off_last_counted_date`) the OFF day was
   * counted for. Phase-1 in-memory guard; TASK-201/202 re-home it behind
   * `work_orders.off_last_counted_date` unchanged.
   */
  private readonly offLastCountedDate = new Map<number, string>();

  constructor(
    @Inject(DATA_GATEWAY) private readonly gateway: DataGateway,
    private readonly vehicles: VehiclesService,
    private readonly schedule: ScheduleService,
    private readonly notifications: NotificationService,
  ) {}

  /** The `off_last_counted_date` for a WO (for test assertions / UI). */
  offLastCountedDateOf(workOrderId: number): string | null {
    return this.offLastCountedDate.get(workOrderId) ?? null;
  }

  /** Test-only reset of the OFF idempotency guard. */
  resetForTests(): void {
    this.offLastCountedDate.clear();
  }

  /**
   * Run the daily job for the WIB day of `now` (default: real time). Idempotent:
   * running it twice for the same WIB day leaves identical state.
   */
  async run(now: Date = new Date()): Promise<DailyJobResult> {
    const today = wibDayOf(now);
    const todayIso = wibDayToIso(today);

    const rolledForwardCardIds: number[] = [];
    const offCountedWorkOrderIds: number[] = [];
    const recalculatedVehicleIds = new Set<number>();

    const cards = [...(await this.gateway.repos.scheduleCards.list())];

    // --- 1. Roll missed cards forward + count OFF days ----------------------
    for (const card of cards) {
      const wo = await this.gateway.repos.workOrders.getById(idValue(card.workOrderId));
      if (!wo || isFinal(wo.status)) {
        // A Completed/Cancelled (or missing) WO stops rolling (REQ-SCH-003, BR-13).
        continue;
      }
      if (!this.isOverdue(card, today)) {
        continue;
      }

      // SM-SCH: Planned → Missed → Planned(moved). Re-validate through the guard
      // so an unlisted transition is refused. A card already Missed (a prior run
      // left it Missed) rolls straight forward.
      await this.rollForward(card, todayIso, now);
      rolledForwardCardIds.push(idValue(card.id));

      // The overrun's only consequence: one OFF day, counted once per WIB day.
      if (this.countOffDayOnce(wo, todayIso)) {
        const after = await this.incrementOffDays(idValue(wo.id));
        offCountedWorkOrderIds.push(idValue(after.id));
      }

      // Notify: missed/late alert to the Field Coordinator + the late-alert
      // recipients (REQ-SCH-004/007). De-duped per (WO, WIB day) so a re-run
      // adds nothing.
      this.notifyMissed(wo, todayIso, now);
    }

    // --- 2. Recalculate every vehicle's derived status (incl. OFF) ----------
    const vehicles = await this.gateway.repos.vehicles.list();
    for (const vehicle of vehicles) {
      await this.vehicles.recomputeStatus(idValue(vehicle.id), now);
      recalculatedVehicleIds.add(idValue(vehicle.id));
    }

    return {
      wibDay: todayIso,
      rolledForwardCardIds,
      offCountedWorkOrderIds,
      recalculatedVehicleIds: [...recalculatedVehicleIds],
    };
  }

  // --- internals -----------------------------------------------------------

  /** A card is overdue when it is still open and its planned day is before today. */
  private isOverdue(card: ScheduleCardDto, today: WibDay): boolean {
    if (card.status === ScheduleStatus.NotPlanned) {
      return false;
    }
    const planned = this.parseDay(card.plannedDate);
    if (!planned) {
      return false;
    }
    if (wibDaysEqual(planned, today)) {
      return false;
    }
    return this.isBefore(planned, today);
  }

  /**
   * Mark the card Missed (if Planned) then roll it forward to today, flag it
   * rolled-over and log the move. Both SM-SCH steps go through the guard.
   */
  private async rollForward(card: ScheduleCardDto, todayIso: string, now: Date): Promise<void> {
    const oldDay = card.plannedDate;
    // Planned → Missed (the day passed). A card already Missed skips this step.
    const missedStatus =
      card.status === ScheduleStatus.Planned
        ? smSchedule.transition(ScheduleStatus.Planned, ScheduleEvent.Miss)
        : card.status;
    // Missed → Planned (moved, flagged rolled-over), with no limit (REQ-SCH-003).
    const rolledStatus = smSchedule.transition(missedStatus, ScheduleEvent.RollForward);

    await this.gateway.unitOfWork((ctx) =>
      ctx.repos.scheduleCards.update({
        ...card,
        status: rolledStatus,
        plannedDate: todayIso,
        isRolledOver: true,
      }),
    );
    this.schedule.appendLog({
      scheduleCardId: idValue(card.id),
      workOrderId: idValue(card.workOrderId),
      oldDay,
      newDay: todayIso,
      action: 'Moved',
      userId: null,
      at: now.toISOString(),
    });
  }

  /**
   * Whether this WO's OFF day should be counted now: true only when it has not
   * already been counted for today's WIB day (the `off_last_counted_date`
   * idempotency guard, DEC-92). Marks it counted as a side effect.
   */
  private countOffDayOnce(wo: WorkOrderDto, todayIso: string): boolean {
    const last = this.offLastCountedDate.get(idValue(wo.id));
    if (last === todayIso) {
      return false; // already counted today — never double-count on re-run.
    }
    this.offLastCountedDate.set(idValue(wo.id), todayIso);
    return true;
  }

  /** Increment `work_orders.off_days` by one (optimistic-locked gateway write). */
  private async incrementOffDays(workOrderId: number): Promise<WorkOrderDto> {
    return this.gateway.unitOfWork(async (ctx) => {
      const wo = await ctx.repos.workOrders.requireById(workOrderId);
      return ctx.repos.workOrders.update({ ...wo, offDays: wo.offDays + 1 });
    });
  }

  /** Send the missed / late alerts once per (WO, WIB day) (REQ-SCH-004/007). */
  private notifyMissed(wo: WorkOrderDto, todayIso: string, now: Date): void {
    const dedupeKey = `${idValue(wo.id)}|${todayIso}`;
    // REQ-SCH-007: creator, open step executor, Planners, Field Coordinators, GM.
    const recipients = this.lateAlertRecipients(wo);
    this.notifications.createForMany(
      recipients,
      {
        kind: NotificationKind.ScheduleLate,
        message: `WO ${wo.number} missed its planned day and was rolled forward (REQ-SCH-003/007).`,
        workOrderId: idValue(wo.id),
        dedupeKey,
      },
      now,
    );
  }

  /** The late-alert recipient user ids (REQ-SCH-007). Phase-1 seed-graph roles. */
  private lateAlertRecipients(wo: WorkOrderDto): readonly number[] {
    const creator = idValue(wo.createdBy);
    // Planner=1, Field Coordinator→1, GM=2 in the seed graph; plus the creator.
    return [creator, 1, 2];
  }

  private parseDay(value: string): WibDay | null {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) {
      return null;
    }
    return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
  }

  private isBefore(a: WibDay, b: WibDay): boolean {
    return wibDayStartUtc(a).getTime() < wibDayStartUtc(b).getTime();
  }
}
