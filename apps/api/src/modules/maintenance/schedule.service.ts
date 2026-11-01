import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ScheduleEvent,
  ScheduleStatus,
  smSchedule,
  idValue,
  toId,
  type ScheduleCardDto,
} from '@bmi/shared';
import type { DataGateway } from '@bmi/data-gateway';
import { DATA_GATEWAY } from '../../core/data-gateway/data-gateway.module.js';

/** A `wo_schedule_log` entry (REQ-SCH-006): every placement and move. */
export interface ScheduleLogEntry {
  readonly id: number;
  readonly scheduleCardId: number;
  readonly workOrderId: number;
  readonly oldDay: string | null;
  readonly newDay: string;
  /** `Placed` | `Moved` (REQ-SCH-003/006). */
  readonly action: 'Placed' | 'Moved';
  readonly userId: number | null;
  readonly at: string;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * **Maintenance schedule** (FG-12, REQ-SCH-001..006, SM-SCH, BR-13).
 *
 * The schedule is a **plan only** — placing, moving or missing a card never
 * changes, blocks or cancels its WO (BR-13). Placement/move drive SM-SCH through
 * `@bmi/shared`'s `smSchedule` guard (Not_Planned → Planned → Missed → Planned),
 * and every placement and move is logged (REQ-SCH-006). The Missed → Planned
 * roll-forward (REQ-SCH-003) is the daily job's job (see {@link DailyJobService});
 * this service owns the manual place/move.
 *
 * Schedule cards are a real gateway aggregate (`wo_schedule`, optimistic-locked);
 * the `wo_schedule_log` is a Phase-1 API-layer in-memory ledger (TASK-103..113
 * precedent), re-homed behind PRD §9 unchanged by TASK-201/202.
 */
@Injectable()
export class ScheduleService {
  private readonly log: ScheduleLogEntry[] = [];
  private nextLogId = 1;

  constructor(@Inject(DATA_GATEWAY) private readonly gateway: DataGateway) {}

  /** Every schedule card (newest planned day first is the client's concern). */
  async list(): Promise<readonly ScheduleCardDto[]> {
    return this.gateway.repos.scheduleCards.list();
  }

  /** Cards for one WO. */
  async cardsForWorkOrder(workOrderId: number): Promise<readonly ScheduleCardDto[]> {
    return this.gateway.repos.scheduleCards.findBy('workOrderId', toId<'WorkOrderId'>(workOrderId));
  }

  /**
   * Place a WO's card onto a day (REQ-SCH-002, SM-SCH Place). Creates the card
   * at `Planned` and logs `Placed`. Several WOs may share a day (AC-SCH-002). A
   * WO that already has a card is moved instead (use {@link move}).
   */
  async place(input: { workOrderId: number; plannedDate: string; userId: number }, now: Date = new Date()): Promise<ScheduleCardDto> {
    this.assertIsoDate(input.plannedDate);
    const wo = await this.gateway.repos.workOrders.getById(input.workOrderId);
    if (!wo) {
      throw new NotFoundException(`Unknown work order: ${input.workOrderId}`);
    }
    const existing = await this.cardsForWorkOrder(input.workOrderId);
    if (existing.length > 0) {
      throw new ConflictException(
        `WO ${input.workOrderId} already has a schedule card; move it instead (REQ-SCH-002).`,
      );
    }
    // SM-SCH Not_Planned → Planned (guard refuses anything else).
    const nextStatus = smSchedule.transition(ScheduleStatus.NotPlanned, ScheduleEvent.Place);
    const card = await this.gateway.unitOfWork((ctx) =>
      ctx.repos.scheduleCards.insert({
        workOrderId: toId<'WorkOrderId'>(input.workOrderId),
        plannedDate: input.plannedDate,
        status: nextStatus,
        isRolledOver: false,
      } as Omit<ScheduleCardDto, 'id' | 'version'>),
    );
    this.appendLog({
      scheduleCardId: idValue(card.id),
      workOrderId: input.workOrderId,
      oldDay: null,
      newDay: input.plannedDate,
      action: 'Placed',
      userId: input.userId,
      at: now.toISOString(),
    });
    return card;
  }

  /**
   * Move a card to another day at any time (REQ-SCH-002). A Missed card is
   * rolled back to Planned via SM-SCH RollForward; a Planned card simply changes
   * its day. Either way the move never touches the WO (BR-13) and is logged
   * (REQ-SCH-006). A manual move clears the rolled-over flag (it is a fresh plan).
   */
  async move(
    input: { scheduleCardId: number; newDay: string; userId: number },
    now: Date = new Date(),
  ): Promise<ScheduleCardDto> {
    this.assertIsoDate(input.newDay);
    const card = await this.requireCard(input.scheduleCardId);
    const oldDay = card.plannedDate;

    const nextStatus =
      card.status === ScheduleStatus.Missed
        ? smSchedule.transition(ScheduleStatus.Missed, ScheduleEvent.RollForward)
        : card.status;

    const updated = await this.gateway.unitOfWork((ctx) =>
      ctx.repos.scheduleCards.update({
        ...card,
        plannedDate: input.newDay,
        status: nextStatus,
        // A manual move is a fresh plan: clear the rolled-over / late flag.
        isRolledOver: false,
      }),
    );
    this.appendLog({
      scheduleCardId: input.scheduleCardId,
      workOrderId: idValue(card.workOrderId),
      oldDay,
      newDay: input.newDay,
      action: 'Moved',
      userId: input.userId,
      at: now.toISOString(),
    });
    return updated;
  }

  /** A card by id, throwing if absent. */
  async requireCard(id: number): Promise<ScheduleCardDto> {
    const card = await this.gateway.repos.scheduleCards.getById(id);
    if (!card) {
      throw new NotFoundException(`Unknown schedule card: ${id}`);
    }
    return card;
  }

  /** The placement / move log, newest first (REQ-SCH-006). */
  logEntries(): readonly ScheduleLogEntry[] {
    return [...this.log].sort((a, b) => b.id - a.id);
  }

  /** Append one log entry (used by {@link DailyJobService} for roll-forward). */
  appendLog(entry: Omit<ScheduleLogEntry, 'id'>): ScheduleLogEntry {
    const row: ScheduleLogEntry = { id: this.nextLogId++, ...entry };
    this.log.push(row);
    return row;
  }

  /** Test-only reset of the in-memory schedule log. */
  resetForTests(): void {
    this.log.length = 0;
    this.nextLogId = 1;
  }

  // --- internals -----------------------------------------------------------

  private assertIsoDate(value: string): void {
    if (!ISO_DATE.test(value)) {
      throw new BadRequestException(`Planned date must be YYYY-MM-DD; got "${value}".`);
    }
  }
}
