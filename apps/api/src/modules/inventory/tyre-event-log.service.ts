import { Injectable } from '@nestjs/common';
import type { TyreEvent, TyreStatus } from '@bmi/shared';

/**
 * One tyre-history event (`tyre_events`, PRD §9.9; REQ-TYR-013).
 *
 * Every SM-TYRE (§3.6) transition — wherever it happens — writes exactly one of
 * these rows with the document that caused it (WO, tyre receipt, retread
 * dispatch or tyre count), the user and the time.
 */
export interface TyreEventRow {
  readonly id: number;
  readonly tyreId: number;
  readonly event: TyreEvent;
  readonly fromStatus: TyreStatus | null;
  readonly toStatus: TyreStatus;
  /** The document that caused the change (WO number / receipt / dispatch / count, BR-06). */
  readonly referenceDoc: string;
  readonly reason: string | null;
  readonly at: string;
  readonly byUserId: number;
}

/**
 * **Unified tyre-event log** (REQ-TYR-013, SM-TYRE §3.6).
 *
 * PRD §3.6 states plainly: *"Every transition writes one `tyre_events` row with
 * the document, user and time."* Tyre status moves happen in two places —
 * {@link TyreRegisterService} (warehouse side: receive / retread / worn-out /
 * scrap / count) and the Placement module (chassis side: mount / rotate /
 * demount / scrap, TASK-111). Before TASK-120 only the warehouse side wrote
 * events, so a tyre's history was missing its WO-driven mount/demount/rotate/
 * scrap rows — a REQ-TYR-013 divergence.
 *
 * This service is the single append-only store both sides write to, so the
 * complete status history of a tyre is one ordered list. It has **no
 * dependencies**, so either module may inject it with no import cycle (the
 * warehouse register is in `InventoryModule`, placement in `PlacementModule`;
 * both import only this small module).
 *
 * Phase-1 modelling (recorded in design.md, unchanged by this task): the dummy
 * gateway (TASK-102) has no `tyre_events` table, so the log is API-layer
 * in-memory state following the TASK-103..112 precedent; TASK-201/202 re-home it
 * behind the real PRD §9.9 `tyre_events` table unchanged.
 */
@Injectable()
export class TyreEventLogService {
  private readonly events: TyreEventRow[] = [];
  private nextEventId = 1;

  /** Append one `tyre_events` row (one per SM-TYRE transition, REQ-TYR-013). */
  append(input: Omit<TyreEventRow, 'id'>): TyreEventRow {
    const row: TyreEventRow = { id: this.nextEventId++, ...input };
    this.events.push(row);
    return row;
  }

  /** The append-only event history of a tyre, in insertion order (REQ-TYR-013). */
  historyOf(tyreId: number): readonly TyreEventRow[] {
    return this.events.filter((e) => e.tyreId === tyreId);
  }

  /** Reset the in-memory log (test seam; mirrors the other module reset seams). */
  resetForTests(): void {
    this.events.length = 0;
    this.nextEventId = 1;
  }
}
