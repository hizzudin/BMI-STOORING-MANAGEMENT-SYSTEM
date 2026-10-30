/**
 * Time helpers (NFR-14, ASM-52, DEC-55).
 *
 * Rule: every instant is stored in UTC and shown in Asia/Jakarta (WIB). WIB is a fixed
 * UTC+7 offset with **no daylight saving**, so the conversion is a constant 7-hour shift
 * and never depends on the host timezone. A "day" anywhere in the product (invoice day,
 * stooring day, schedule day, the daily job) is a **WIB calendar day**; its UTC
 * boundaries are WIB-midnight (00:00 WIB = 17:00 UTC the previous day) to the next
 * WIB-midnight.
 */

/** WIB offset ahead of UTC, in hours (fixed, no DST). */
export const WIB_OFFSET_HOURS = 7;
/** WIB offset ahead of UTC, in minutes. */
export const WIB_OFFSET_MINUTES = WIB_OFFSET_HOURS * 60;
const WIB_OFFSET_MS = WIB_OFFSET_MINUTES * 60 * 1000;
/** Daily job run time, as "HH:MM" WIB (NFR-14). */
export const DAILY_JOB_WIB_TIME = '00:30';

/** A WIB calendar day expressed as its parts (all in the WIB wall clock). */
export interface WibDay {
  readonly year: number;
  /** 1–12 */
  readonly month: number;
  /** 1–31 */
  readonly day: number;
}

function asDate(instant: Date | number): Date {
  const d = instant instanceof Date ? instant : new Date(instant);
  if (Number.isNaN(d.getTime())) {
    throw new RangeError('time: invalid instant');
  }
  return d;
}

/**
 * Convert a UTC instant to the WIB wall-clock instant. The returned `Date`'s UTC fields
 * read as the WIB wall clock (use its `getUTC*` accessors), which keeps the conversion
 * independent of the host machine's local timezone.
 */
export function utcToWib(instant: Date | number): Date {
  return new Date(asDate(instant).getTime() + WIB_OFFSET_MS);
}

/**
 * Convert a WIB wall-clock instant (a `Date` whose UTC fields hold WIB wall-clock values)
 * back to the true UTC instant.
 */
export function wibToUtc(wibWallClock: Date | number): Date {
  return new Date(asDate(wibWallClock).getTime() - WIB_OFFSET_MS);
}

/**
 * Given any UTC instant, return the WIB calendar day it falls on.
 */
export function wibDayOf(instant: Date | number): WibDay {
  const wib = utcToWib(instant);
  return {
    year: wib.getUTCFullYear(),
    month: wib.getUTCMonth() + 1,
    day: wib.getUTCDate(),
  };
}

/**
 * The UTC instant of WIB-midnight that starts the given WIB calendar day.
 * 00:00 WIB == 17:00 UTC of the previous calendar day.
 */
export function wibDayStartUtc(day: WibDay): Date {
  const wibMidnightMs = Date.UTC(day.year, day.month - 1, day.day, 0, 0, 0, 0);
  return new Date(wibMidnightMs - WIB_OFFSET_MS);
}

/**
 * The UTC instant that ends the given WIB calendar day — i.e. the start of the NEXT WIB
 * day (exclusive upper bound). Ranges are half-open `[start, end)`.
 */
export function wibDayEndUtc(day: WibDay): Date {
  const start = wibDayStartUtc(day);
  return new Date(start.getTime() + 24 * 60 * 60 * 1000);
}

/**
 * The half-open UTC range `[start, end)` that covers a whole WIB calendar day.
 */
export function wibDayBoundsUtc(day: WibDay): { start: Date; end: Date } {
  return { start: wibDayStartUtc(day), end: wibDayEndUtc(day) };
}

/** Two WIB days are equal when all three parts match. */
export function wibDaysEqual(a: WibDay, b: WibDay): boolean {
  return a.year === b.year && a.month === b.month && a.day === b.day;
}

/** Format a WIB day as an ISO calendar date `YYYY-MM-DD` (NFR-09). */
export function wibDayToIso(day: WibDay): string {
  const yyyy = String(day.year).padStart(4, '0');
  const mm = String(day.month).padStart(2, '0');
  const dd = String(day.day).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}
