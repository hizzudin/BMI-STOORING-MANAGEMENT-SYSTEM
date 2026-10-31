import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

/** The odometer-jump threshold: more than this km per day warns (REQ-PM-006). */
export const ODOMETER_JUMP_KM_PER_DAY = 1500;

/** The odometer source (PRD §9.1 `odo_source_t`). */
export type OdometerSource = 'Admin' | 'Driver' | 'GPS';

/** A persisted odometer reading (PRD §9.3 `odometer_logs`). */
export interface OdometerLog {
  readonly id: number;
  readonly vehicleId: number;
  readonly reading: number;
  /** When it was read (ISO-8601 UTC), not when entered. */
  readonly readingAt: string;
  readonly source: OdometerSource;
  readonly note: string | null;
  /** True when the reading implies more than 1.500 km/day (REQ-VEH-005). */
  readonly jumpWarning: boolean;
  readonly recordedBy: number | null;
  readonly voidedAt: string | null;
  readonly voidedBy: number | null;
  readonly voidReason: string | null;
}

/** The outcome of recording a reading — carries any surfaced jump warning. */
export interface RecordOdometerResult {
  readonly log: OdometerLog;
  /** A human-readable warning when the reading is a suspicious jump (never auto-corrected). */
  readonly warning: string | null;
  /** The vehicle's recomputed current odometer (latest non-voided reading). */
  readonly currentOdometer: number;
}

/**
 * Odometer readings and voids (REQ-VEH-005..007, BR-09).
 *
 * Rules enforced server-side (BR-09):
 *   - a reading must be a positive whole number, else refused (REQ-VEH-005);
 *   - a reading below the last non-voided reading is refused (AC-VEH-001);
 *   - a reading implying more than {@link ODOMETER_JUMP_KM_PER_DAY} km/day is
 *     **warned and saved with a note** — never silently corrected (REQ-VEH-005,
 *     product principle "the system never silently corrects");
 *   - a void keeps the row marked Voided and recomputes the vehicle odometer
 *     from the last valid reading (REQ-VEH-007, AC-VEH-002).
 *
 * Phase 1: the dummy gateway models no `odometer_logs` table, so this is an
 * API-layer in-memory ledger (TASK-103/104/105 precedent); TASK-201 re-homes it
 * behind PRD §9.3 unchanged. The caller (`VehiclesService`) persists the
 * recomputed `vehicles.current_odometer` through the gateway.
 */
@Injectable()
export class OdometerService {
  private readonly logs = new Map<number, OdometerLog>();
  private nextId = 1;

  /**
   * Record a reading (REQ-VEH-005/006). Returns the saved log, any jump warning,
   * and the recomputed current odometer. Refuses a non-positive-whole or
   * decreasing reading; warns-and-saves a suspicious jump.
   */
  record(input: {
    vehicleId: number;
    reading: number;
    readingAt: string;
    source?: OdometerSource;
    note?: string | null;
    recordedBy?: number | null;
  }): RecordOdometerResult {
    const { reading } = input;
    if (!Number.isInteger(reading) || reading <= 0) {
      // REQ-VEH-005: not a positive whole number → refused.
      throw new BadRequestException('Odometer reading must be a positive whole number.');
    }

    const last = this.lastValidReading(input.vehicleId);
    if (last && reading < last.reading) {
      // AC-VEH-001: a reading below the last non-voided reading is refused.
      throw new BadRequestException(
        `Odometer reading ${reading} is below the last reading ${last.reading}.`,
      );
    }

    const { jumpWarning, warning } = this.evaluateJump(last, reading, input.readingAt);

    const note =
      jumpWarning && (input.note === undefined || input.note === null || input.note === '')
        ? (warning ?? 'Odometer jump over the daily threshold.')
        : (input.note ?? null);

    const log: OdometerLog = {
      id: this.nextId,
      vehicleId: input.vehicleId,
      reading,
      readingAt: input.readingAt,
      source: input.source ?? 'Admin',
      note,
      jumpWarning,
      recordedBy: input.recordedBy ?? null,
      voidedAt: null,
      voidedBy: null,
      voidReason: null,
    };
    this.logs.set(log.id, log);
    this.nextId += 1;

    return { log, warning, currentOdometer: this.currentOdometer(input.vehicleId) };
  }

  /**
   * Void a reading (REQ-VEH-007). Keeps the row marked Voided with a reason and
   * recomputes the vehicle odometer from the last valid reading (AC-VEH-002).
   *
   * @throws NotFoundException if the log is unknown.
   * @throws BadRequestException if the log is already voided.
   */
  void(input: {
    logId: number;
    reason: string;
    voidedBy: number | null;
  }): { log: OdometerLog; currentOdometer: number } {
    const existing = this.logs.get(input.logId);
    if (!existing) {
      throw new NotFoundException(`Unknown odometer reading: ${input.logId}`);
    }
    if (existing.voidedAt !== null) {
      throw new BadRequestException('Odometer reading is already voided.');
    }
    const voided: OdometerLog = {
      ...existing,
      voidedAt: new Date().toISOString(),
      voidedBy: input.voidedBy,
      voidReason: input.reason,
    };
    this.logs.set(voided.id, voided);
    return { log: voided, currentOdometer: this.currentOdometer(existing.vehicleId) };
  }

  /** The vehicle's current odometer = the highest non-voided reading, else 0. */
  currentOdometer(vehicleId: number): number {
    let max = 0;
    for (const log of this.logs.values()) {
      if (log.vehicleId === vehicleId && log.voidedAt === null && log.reading > max) {
        max = log.reading;
      }
    }
    return max;
  }

  /** Every reading for a vehicle, newest first (REQ-VEH-006 history). */
  listForVehicle(vehicleId: number): readonly OdometerLog[] {
    return [...this.logs.values()]
      .filter((l) => l.vehicleId === vehicleId)
      .sort((a, b) => b.id - a.id);
  }

  /** A log by id, or `undefined`. */
  getLog(logId: number): OdometerLog | undefined {
    return this.logs.get(logId);
  }

  /** Test-only reset of the ledger. */
  resetForTests(): void {
    this.logs.clear();
    this.nextId = 1;
  }

  /** The latest non-voided reading of a vehicle, by read time then id. */
  private lastValidReading(vehicleId: number): OdometerLog | null {
    const valid = [...this.logs.values()].filter(
      (l) => l.vehicleId === vehicleId && l.voidedAt === null,
    );
    if (valid.length === 0) {
      return null;
    }
    valid.sort((a, b) => {
      const at = Date.parse(a.readingAt) - Date.parse(b.readingAt);
      return at !== 0 ? at : a.id - b.id;
    });
    return valid[valid.length - 1] ?? null;
  }

  /**
   * Decide whether the reading is a suspicious jump (> 1.500 km/day over the gap
   * since the last valid reading). Returns the flag and a warning message when
   * so. Never alters the reading.
   */
  private evaluateJump(
    last: OdometerLog | null,
    reading: number,
    readingAt: string,
  ): { jumpWarning: boolean; warning: string | null } {
    if (!last) {
      return { jumpWarning: false, warning: null };
    }
    const deltaKm = reading - last.reading;
    const deltaMs = Date.parse(readingAt) - Date.parse(last.readingAt);
    // Use whole days, minimum one day, so a same-day jump is still evaluated.
    const days = Math.max(1, Math.ceil(deltaMs / (24 * 60 * 60 * 1000)));
    const perDay = deltaKm / days;
    if (perDay > ODOMETER_JUMP_KM_PER_DAY) {
      return {
        jumpWarning: true,
        warning: `Odometer rose ${deltaKm} km over ${days} day(s) (${Math.round(perDay)} km/day), above the ${ODOMETER_JUMP_KM_PER_DAY} km/day threshold. Saved with a note for review.`,
      };
    }
    return { jumpWarning: false, warning: null };
  }
}
