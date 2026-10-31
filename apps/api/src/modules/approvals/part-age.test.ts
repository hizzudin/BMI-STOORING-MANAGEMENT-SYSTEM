import { describe, expect, it } from 'vitest';
import { computePartAgeSignal, DEFAULT_EARLY_FAILURE_TOLERANCE_PCT } from './part-age.js';

/**
 * Unit coverage for the DQ-07 / REQ-BSL-009 part-age computation used by the
 * approvals review (REQ-APR-011). life used = max(km ÷ normal-life-km,
 * days ÷ normal-life-days); Early-failure when below the tolerance (default 80%).
 */
describe('computePartAgeSignal (DQ-07, REQ-BSL-009)', () => {
  it('AC-APR-005 — a battery fitted 200 days ago with a 730-day life shows 27% and Early failure', () => {
    const fittedAt = new Date('2026-01-01T00:00:00.000Z');
    const asOf = new Date(fittedAt.getTime() + 200 * 24 * 60 * 60 * 1000);
    const signal = computePartAgeSignal({
      label: 'Battery',
      kind: 'Part',
      lastReplacedDate: fittedAt.toISOString(),
      lastReplacedOdometer: null,
      currentOdometer: null,
      asOf: asOf.toISOString(),
      normalLifeKm: null,
      normalLifeDays: 730,
    });
    expect(signal.daysUsed).toBe(200);
    expect(signal.lifeUsedPct).toBe(27); // 200/730 = 27.4% → 27
    expect(signal.earlyFailure).toBe(true);
    expect(signal.tolerancePct).toBe(DEFAULT_EARLY_FAILURE_TOLERANCE_PCT);
  });

  it('AC-BSL-005 — front brake pads at 18.000 km / 120 days against 40.000 km / 365 days → 45%, Early failure', () => {
    const fittedAt = new Date('2026-01-01T00:00:00.000Z');
    const asOf = new Date(fittedAt.getTime() + 120 * 24 * 60 * 60 * 1000);
    const signal = computePartAgeSignal({
      label: 'Front brake pads',
      kind: 'Part',
      lastReplacedDate: fittedAt.toISOString(),
      lastReplacedOdometer: 100000,
      currentOdometer: 118000,
      asOf: asOf.toISOString(),
      normalLifeKm: 40000,
      normalLifeDays: 365,
    });
    expect(signal.kmUsed).toBe(18000);
    expect(signal.daysUsed).toBe(120);
    // max(18000/40000=45%, 120/365=33%) = 45%
    expect(signal.lifeUsedPct).toBe(45);
    expect(signal.earlyFailure).toBe(true);
  });

  it('does not flag a part replaced at or above its tolerance (normal end of life)', () => {
    const fittedAt = new Date('2026-01-01T00:00:00.000Z');
    const asOf = new Date(fittedAt.getTime() + 700 * 24 * 60 * 60 * 1000);
    const signal = computePartAgeSignal({
      label: 'Battery',
      kind: 'Part',
      lastReplacedDate: fittedAt.toISOString(),
      lastReplacedOdometer: null,
      currentOdometer: null,
      asOf: asOf.toISOString(),
      normalLifeKm: null,
      normalLifeDays: 730,
    });
    // 700/730 = 95.9% ≥ 80% tolerance → not an early failure.
    expect(signal.lifeUsedPct).toBe(96);
    expect(signal.earlyFailure).toBe(false);
  });

  it('takes the larger of km and days used (km dominates)', () => {
    const fittedAt = new Date('2026-01-01T00:00:00.000Z');
    const asOf = new Date(fittedAt.getTime() + 10 * 24 * 60 * 60 * 1000);
    const signal = computePartAgeSignal({
      label: 'Oil filter',
      kind: 'Part',
      lastReplacedDate: fittedAt.toISOString(),
      lastReplacedOdometer: 0,
      currentOdometer: 9000,
      asOf: asOf.toISOString(),
      normalLifeKm: 10000,
      normalLifeDays: 365,
    });
    // max(9000/10000=90%, 10/365=3%) = 90% ≥ 80% → not early.
    expect(signal.lifeUsedPct).toBe(90);
    expect(signal.earlyFailure).toBe(false);
  });

  it('returns a null life-used when nothing can be computed (no facts)', () => {
    const signal = computePartAgeSignal({
      label: 'Unknown',
      kind: 'Tyre',
      lastReplacedDate: null,
      lastReplacedOdometer: null,
      currentOdometer: null,
      asOf: new Date().toISOString(),
      normalLifeKm: null,
      normalLifeDays: null,
    });
    expect(signal.lifeUsedPct).toBeNull();
    expect(signal.earlyFailure).toBe(false);
  });

  it('honours a tyre-specific tolerance override (app_settings.tyre_early_failure_pct)', () => {
    const fittedAt = new Date('2026-01-01T00:00:00.000Z');
    const asOf = new Date(fittedAt.getTime() + 300 * 24 * 60 * 60 * 1000);
    const signal = computePartAgeSignal({
      label: 'A1_L',
      kind: 'Tyre',
      lastReplacedDate: fittedAt.toISOString(),
      lastReplacedOdometer: null,
      currentOdometer: null,
      asOf: asOf.toISOString(),
      normalLifeKm: null,
      normalLifeDays: 365,
      tolerancePct: 70,
    });
    // 300/365 = 82% ≥ 70% → not early with the override (would be early at 80%).
    expect(signal.lifeUsedPct).toBe(82);
    expect(signal.earlyFailure).toBe(false);
  });
});
