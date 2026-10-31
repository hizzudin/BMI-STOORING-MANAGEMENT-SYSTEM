import { BadRequestException, Injectable } from '@nestjs/common';

/** The step time-event kinds (`step_time_events.event`, PRD §9.6, DEC-87). */
export type StepTimeEventKind =
  | 'Open'
  | 'Start'
  | 'Pause'
  | 'Resume'
  | 'Submit'
  | 'Return'
  | 'Verify'
  | 'Skip';

/** The pause reasons (`step_time_events.pause_reason`, PRD §9.6, REQ-ENG-013). */
export const PAUSE_REASONS = [
  'Waiting_Parts',
  'Waiting_Vehicle',
  'Waiting_Vendor_Agency',
  'Break_Shift_End',
  'Change_Request',
  'Other',
] as const;
export type PauseReason = (typeof PAUSE_REASONS)[number];

/** One recorded step time event (`step_time_events`, PRD §9.6, DEC-87). */
export interface StepTimeEvent {
  readonly id: number;
  readonly assignmentId: number;
  readonly attemptNo: number;
  readonly event: StepTimeEventKind;
  /** When it happened (ISO-8601 UTC); server time or synced phone time. */
  readonly at: string;
  readonly recordedAt: string;
  readonly pauseReason: PauseReason | null;
  readonly note: string | null;
  /** Start entered from an earlier time, ≤ 2 h back, never before Open (REQ-ENG-014). */
  readonly enteredLate: boolean;
  readonly actorId: number | null;
  readonly onBehalfOf: string | null;
}

/** Input to append a time event. */
export interface AppendEventInput {
  assignmentId: number;
  attemptNo: number;
  event: StepTimeEventKind;
  at: string;
  pauseReason?: PauseReason | null;
  note?: string | null;
  enteredLate?: boolean;
  actorId?: number | null;
  onBehalfOf?: string | null;
}

/** The worked/paused seconds computed for one attempt (or all attempts). */
export interface StepDuration {
  readonly workedSeconds: number;
  readonly pausedSeconds: number;
}

/**
 * **Step time-event ledger** (FG-2, DEC-87, REQ-ENG-012..015).
 *
 * Records every Open / Start / Pause / Resume / Submit / Return / Verify / Skip
 * of a step (`step_time_events`, PRD §9.6) and derives the worked / paused
 * durations from them. Work time runs between Start (or Resume) and the next
 * Pause / Submit; paused time runs between Pause and the next Resume
 * (REQ-ENG-013). Durations are summed across every attempt of the step
 * (REQ-ENG-015) using WIB-independent instant arithmetic (the instants are
 * stored UTC; `@bmi/config` owns WIB rendering, NFR-14).
 *
 * Phase 1: the dummy gateway (TASK-102) models only the nine business
 * aggregates and carries no `step_time_events` table, so — following the
 * TASK-103..107 precedent for cross-cutting Phase-1 state — this is an
 * API-layer in-memory ledger. TASK-201/202 re-home it behind the PRD §9.6
 * `step_time_events` / `step_time_corrections` tables unchanged.
 */
@Injectable()
export class StepTimeEventService {
  private readonly events: StepTimeEvent[] = [];
  private nextId = 1;

  /** Append one event, validating the DEC-87 invariants the DB CHECKs enforce. */
  append(input: AppendEventInput): StepTimeEvent {
    if (input.event === 'Pause' && !input.pauseReason) {
      throw new BadRequestException('A pause needs a reason (REQ-ENG-013).');
    }
    if (input.pauseReason === 'Other' && !input.note?.trim()) {
      throw new BadRequestException('Pause reason "Other" needs a note (REQ-ENG-013).');
    }
    const row: StepTimeEvent = {
      id: this.nextId,
      assignmentId: input.assignmentId,
      attemptNo: input.attemptNo,
      event: input.event,
      at: input.at,
      recordedAt: new Date().toISOString(),
      pauseReason: input.pauseReason ?? null,
      note: input.note?.trim() ?? null,
      enteredLate: input.enteredLate ?? false,
      actorId: input.actorId ?? null,
      onBehalfOf: input.onBehalfOf ?? null,
    };
    this.events.push(row);
    this.nextId += 1;
    return row;
  }

  /** Every event of a step (all attempts), oldest first. */
  forAssignment(assignmentId: number): readonly StepTimeEvent[] {
    return this.events
      .filter((e) => e.assignmentId === assignmentId)
      .sort((a, b) => a.at.localeCompare(b.at));
  }

  /** The latest Open event of the current attempt, if any (REQ-ENG-014 lower bound). */
  openedAtOfAttempt(assignmentId: number, attemptNo: number): string | null {
    const open = this.events
      .filter((e) => e.assignmentId === assignmentId && e.attemptNo === attemptNo && e.event === 'Open')
      .sort((a, b) => a.at.localeCompare(b.at));
    return open.length === 0 ? null : open[open.length - 1]!.at;
  }

  /**
   * Compute worked / paused seconds for a step across all its attempts
   * (REQ-ENG-013/015). Worked time accrues while running (after a Start or
   * Resume) until the next Pause or Submit; paused time accrues between a Pause
   * and the next Resume.
   */
  durationOf(assignmentId: number): StepDuration {
    const events = this.forAssignment(assignmentId);
    let workedMs = 0;
    let pausedMs = 0;
    let runningSince: number | null = null;
    let pausedSince: number | null = null;
    for (const e of events) {
      const t = Date.parse(e.at);
      switch (e.event) {
        case 'Start':
        case 'Resume':
          if (pausedSince !== null) {
            pausedMs += t - pausedSince;
            pausedSince = null;
          }
          runningSince = t;
          break;
        case 'Pause':
          if (runningSince !== null) {
            workedMs += t - runningSince;
            runningSince = null;
          }
          pausedSince = t;
          break;
        case 'Submit':
          if (runningSince !== null) {
            workedMs += t - runningSince;
            runningSince = null;
          }
          if (pausedSince !== null) {
            pausedMs += t - pausedSince;
            pausedSince = null;
          }
          break;
        case 'Return':
          // A return closes the attempt; any dangling running/paused window ends.
          runningSince = null;
          pausedSince = null;
          break;
        default:
          break;
      }
    }
    return {
      workedSeconds: Math.round(workedMs / 1000),
      pausedSeconds: Math.round(pausedMs / 1000),
    };
  }

  /** Test-only reset to empty. */
  resetForTests(): void {
    this.events.length = 0;
    this.nextId = 1;
  }
}
