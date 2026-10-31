import { wibDayOf, wibDayStartUtc } from '@bmi/config';
import type { PartAgeSignal } from '@bmi/shared';

/** The default early-failure tolerance (percent) when a type sets none (DEC-47). */
export const DEFAULT_EARLY_FAILURE_TOLERANCE_PCT = 80;

/**
 * The replacement facts the review needs to compute the part-age / early-failure
 * signal for one part item or tyre position (REQ-APR-011, REQ-BSL-009, DQ-07).
 *
 * `lastReplacedDate` / `lastReplacedOdometer` are the previous fitment; the
 * current odometer and the WO's "as of" date (submit or now) give km/days used.
 * `normalLifeKm` / `normalLifeDays` come from the part-item type (or the tyre
 * position's life); `tolerancePct` defaults to 80 (DEC-47,
 * `app_settings.tyre_early_failure_pct` for tyres). A towed unit has no
 * odometer, so its km fields are null and only days drive the signal (DEC-68).
 */
export interface PartAgeInput {
  readonly label: string;
  readonly kind: 'Part' | 'Tyre';
  readonly lastReplacedDate: string | null;
  readonly lastReplacedOdometer: number | null;
  readonly currentOdometer: number | null;
  /** The instant the WO is reviewed (submit/now) — days used counts to here. */
  readonly asOf: string;
  readonly normalLifeKm: number | null;
  readonly normalLifeDays: number | null;
  readonly tolerancePct?: number;
}

/**
 * Compute the part-age / early-failure signal for one replacement (REQ-BSL-009):
 *
 *   life used = max( km used ÷ normal life km , days used ÷ normal life days )
 *
 * Only the ratios that can be computed (both the numerator and a positive
 * denominator present) contribute; a missing side is skipped (a towed unit with
 * no odometer uses days only, DEC-68). The Early-failure flag is raised when the
 * life used is **below** the type's tolerance (default 80%), mirroring "replaced
 * before the tolerance of its normal life". The flag never blocks the WO.
 *
 * Days used counts WIB calendar days between the last replacement and the review
 * instant (NFR-14), so it never drifts with the host timezone. `lifeUsedPct` is
 * rounded to a whole percent for display (AC-APR-005: 200 ÷ 730 → 27%).
 */
export function computePartAgeSignal(input: PartAgeInput): PartAgeSignal {
  const tolerancePct = input.tolerancePct ?? DEFAULT_EARLY_FAILURE_TOLERANCE_PCT;

  const kmUsed =
    input.lastReplacedOdometer !== null && input.currentOdometer !== null
      ? Math.max(0, input.currentOdometer - input.lastReplacedOdometer)
      : null;
  const daysUsed =
    input.lastReplacedDate !== null ? Math.max(0, wibDaysBetween(input.lastReplacedDate, input.asOf)) : null;

  const ratios: number[] = [];
  if (kmUsed !== null && input.normalLifeKm !== null && input.normalLifeKm > 0) {
    ratios.push(kmUsed / input.normalLifeKm);
  }
  if (daysUsed !== null && input.normalLifeDays !== null && input.normalLifeDays > 0) {
    ratios.push(daysUsed / input.normalLifeDays);
  }

  const lifeUsedFraction = ratios.length > 0 ? Math.max(...ratios) : null;
  const lifeUsedPct = lifeUsedFraction === null ? null : Math.round(lifeUsedFraction * 100);
  // Early failure: replaced before the tolerance of its normal life (REQ-BSL-009).
  const earlyFailure = lifeUsedFraction !== null && lifeUsedFraction * 100 < tolerancePct;

  return {
    label: input.label,
    kind: input.kind,
    lastReplacedDate: input.lastReplacedDate,
    lastReplacedOdometer: input.lastReplacedOdometer,
    kmUsed,
    daysUsed,
    normalLifeKm: input.normalLifeKm,
    normalLifeDays: input.normalLifeDays,
    lifeUsedPct,
    tolerancePct,
    earlyFailure,
  };
}

/** Whole WIB calendar days between two instants (NFR-14), never negative. */
function wibDaysBetween(fromIso: string, toIso: string): number {
  const from = wibDayStartUtc(wibDayOf(new Date(fromIso))).getTime();
  const to = wibDayStartUtc(wibDayOf(new Date(toIso))).getTime();
  const ms = to - from;
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}
