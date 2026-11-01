import {
  WORK_ORDER_PRIORITY_ORDER,
  idValue,
  type ScheduleCardDto,
  type WorkOrderDto,
} from '@bmi/shared';

/**
 * The Mechanic mobile task list (R2 menu, REQ-MOB-010). A pure projection over
 * the WO list + the schedule cards fetched from the API:
 *
 *   show only WOs **scheduled for today (WIB)** and **assigned to this mechanic**,
 *   ordered by **urgency descending** with **rolled-over / late first**, each
 *   carrying its urgency pill (text label present, WCAG) and rolled-over flag.
 *
 * The backing list/endpoint (schedule cards with `isRolledOver` + `plannedDate`,
 * and the WOs with `priority`) is owned by the API (TASK-114); this is the
 * client-side assembly the R2 screen renders. The continuous mechanic GPS trail
 * (R2 Mobilisasi) is deliberately NOT part of this list.
 */

/** One row in the mechanic's today list. */
export interface MechanicTodayItem {
  readonly workOrderId: number;
  readonly number: string;
  readonly priority: WorkOrderDto['priority'];
  /** Rolled forward from a missed day (REQ-SCH-003, DEC-92). */
  readonly isRolledOver: boolean;
  readonly plannedDate: string;
}

/** A mechanic's identity + the WIB day to filter on. */
export interface MechanicTodayQuery {
  readonly mechanicUserId: number;
  /** `YYYY-MM-DD` WIB day; default is today computed from `now`. */
  readonly wibDayIso?: string;
  readonly now?: Date;
}

/**
 * Build the ordered today list. `assigneeByWorkOrderId` maps a WO id to the
 * user id assigned to its (single relevant) step — the API exposes the
 * assignment's `assigneeId`; the caller resolves the WO→assignee relation and
 * passes it in so this stays a pure function.
 */
export function buildMechanicTodayList(
  workOrders: readonly WorkOrderDto[],
  scheduleCards: readonly ScheduleCardDto[],
  assigneeByWorkOrderId: ReadonlyMap<number, number | null>,
  query: MechanicTodayQuery,
): MechanicTodayItem[] {
  const todayIso = query.wibDayIso ?? wibDayIso(query.now ?? new Date());

  // Cards scheduled for today, keyed by WO id (the latest card wins if several).
  const todayCardByWo = new Map<number, ScheduleCardDto>();
  for (const card of scheduleCards) {
    if (card.plannedDate === todayIso) {
      todayCardByWo.set(idValue(card.workOrderId), card);
    }
  }

  const items: MechanicTodayItem[] = [];
  for (const wo of workOrders) {
    const woId = idValue(wo.id);
    const card = todayCardByWo.get(woId);
    if (!card) {
      continue; // not scheduled for today
    }
    const assignee = assigneeByWorkOrderId.get(woId) ?? null;
    if (assignee !== query.mechanicUserId) {
      continue; // not assigned to this mechanic
    }
    items.push({
      workOrderId: woId,
      number: wo.number,
      priority: wo.priority,
      isRolledOver: card.isRolledOver,
      plannedDate: card.plannedDate,
    });
  }

  return items.sort(compareTodayItems);
}

/**
 * Order: rolled-over / late first, then urgency descending (Urgent → Low per
 * `WORK_ORDER_PRIORITY_ORDER`), then WO number as a stable tiebreak.
 */
export function compareTodayItems(a: MechanicTodayItem, b: MechanicTodayItem): number {
  if (a.isRolledOver !== b.isRolledOver) {
    return a.isRolledOver ? -1 : 1; // rolled-over first
  }
  const ua = WORK_ORDER_PRIORITY_ORDER.indexOf(a.priority);
  const ub = WORK_ORDER_PRIORITY_ORDER.indexOf(b.priority);
  if (ua !== ub) {
    return ua - ub; // lower index = more urgent = first
  }
  return a.number.localeCompare(b.number);
}

/**
 * The WIB calendar day (`YYYY-MM-DD`) a UTC instant falls on. WIB is UTC+7 with
 * no DST (mirrors `@bmi/config` `wibDayOf`/`wibDayToIso`; inlined here to keep
 * the mobile bundle's dependency surface to `@bmi/shared` only).
 */
export function wibDayIso(instant: Date): string {
  const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
  const wib = new Date(instant.getTime() + WIB_OFFSET_MS);
  const yyyy = String(wib.getUTCFullYear()).padStart(4, '0');
  const mm = String(wib.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(wib.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}
