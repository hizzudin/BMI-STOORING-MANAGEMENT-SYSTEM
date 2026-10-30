import { describe, it, expect } from 'vitest';
import {
  WIB_OFFSET_HOURS,
  utcToWib,
  wibToUtc,
  wibDayOf,
  wibDayStartUtc,
  wibDayEndUtc,
  wibDayBoundsUtc,
  wibDaysEqual,
  wibDayToIso,
} from './time.js';

describe('UTC↔WIB conversion (NFR-14)', () => {
  it('WIB is a fixed UTC+7 offset', () => {
    expect(WIB_OFFSET_HOURS).toBe(7);
  });

  it('shifts a UTC instant forward 7 hours to WIB wall clock', () => {
    const utc = new Date('2026-10-26T00:00:00.000Z');
    const wib = utcToWib(utc);
    // 00:00 UTC == 07:00 WIB on the same date.
    expect(wib.getUTCFullYear()).toBe(2026);
    expect(wib.getUTCMonth() + 1).toBe(10);
    expect(wib.getUTCDate()).toBe(26);
    expect(wib.getUTCHours()).toBe(7);
  });

  it('round-trips UTC -> WIB -> UTC', () => {
    const utc = new Date('2026-01-15T13:45:30.000Z');
    expect(wibToUtc(utcToWib(utc)).toISOString()).toBe(utc.toISOString());
  });
});

describe('WIB day of an instant (NFR-14)', () => {
  it('17:00 UTC falls on the NEXT WIB calendar day (WIB midnight)', () => {
    // 2026-10-25T17:00:00Z == 2026-10-26T00:00:00 WIB.
    expect(wibDayOf(new Date('2026-10-25T17:00:00.000Z'))).toEqual({
      year: 2026,
      month: 10,
      day: 26,
    });
  });

  it('16:59 UTC is still the previous WIB day', () => {
    expect(wibDayOf(new Date('2026-10-25T16:59:59.999Z'))).toEqual({
      year: 2026,
      month: 10,
      day: 25,
    });
  });
});

describe('WIB-day boundaries: midnight WIB = 17:00 UTC previous day (NFR-14)', () => {
  const day = { year: 2026, month: 10, day: 26 };

  it('day start is 17:00 UTC of the previous calendar day', () => {
    expect(wibDayStartUtc(day).toISOString()).toBe('2026-10-25T17:00:00.000Z');
  });

  it('day end is the next WIB midnight (exclusive upper bound)', () => {
    expect(wibDayEndUtc(day).toISOString()).toBe('2026-10-26T17:00:00.000Z');
  });

  it('bounds form a half-open 24h range [start, end)', () => {
    const { start, end } = wibDayBoundsUtc(day);
    expect(end.getTime() - start.getTime()).toBe(24 * 60 * 60 * 1000);
    // An instant exactly at the start is in the day; exactly at the end is the next day.
    expect(wibDayOf(start)).toEqual(day);
    expect(wibDaysEqual(wibDayOf(end), day)).toBe(false);
  });

  it('every instant inside the bounds maps back to the same WIB day', () => {
    const { start, end } = wibDayBoundsUtc(day);
    const mid = new Date((start.getTime() + end.getTime()) / 2);
    expect(wibDayOf(mid)).toEqual(day);
    // One ms before end is still the same day.
    expect(wibDayOf(new Date(end.getTime() - 1))).toEqual(day);
  });
});

describe('wibDayToIso (NFR-09)', () => {
  it('formats a WIB day as YYYY-MM-DD', () => {
    expect(wibDayToIso({ year: 2026, month: 1, day: 5 })).toBe('2026-01-05');
  });
});
