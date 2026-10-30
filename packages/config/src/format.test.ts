import { describe, it, expect } from 'vitest';
import {
  formatNumber,
  formatWithUnit,
  formatRupiah,
  formatDateWib,
  formatTimeWib,
  formatDateTimeWib,
} from './format.js';

describe('Indonesian number format (NFR-08, NFR-09)', () => {
  it('produces exactly "48.210 km"', () => {
    expect(formatWithUnit(48210, 'km')).toBe('48.210 km');
    expect(formatNumber(48210, { unit: 'km' })).toBe('48.210 km');
  });

  it('produces exactly "Rp 1.240.000"', () => {
    expect(formatRupiah(1240000)).toBe('Rp 1.240.000');
  });

  it('produces exactly "2,4 mm"', () => {
    expect(formatWithUnit(2.4, 'mm', 1)).toBe('2,4 mm');
    expect(formatNumber(2.4, { decimals: 1, unit: 'mm' })).toBe('2,4 mm');
  });

  it('groups thousands with "." and uses "," for the decimal mark', () => {
    expect(formatNumber(0)).toBe('0');
    expect(formatNumber(999)).toBe('999');
    expect(formatNumber(1000)).toBe('1.000');
    expect(formatNumber(1234567)).toBe('1.234.567');
    expect(formatNumber(1234.5, { decimals: 2 })).toBe('1.234,50');
  });

  it('rounds half-up to the requested decimals', () => {
    expect(formatNumber(2.35, { decimals: 1 })).toBe('2,4');
    expect(formatNumber(2.44, { decimals: 1 })).toBe('2,4');
  });

  it('formats negatives with a leading minus', () => {
    expect(formatNumber(-1500)).toBe('-1.500');
    expect(formatRupiah(-250000)).toBe('Rp -250.000');
  });

  it('rejects non-finite input', () => {
    expect(() => formatNumber(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });
});

describe('WIB date/time format (NFR-09)', () => {
  // 2026-10-25T17:00:00Z is WIB midnight of 2026-10-26.
  const instant = new Date('2026-10-25T17:00:00.000Z');

  it('formats the WIB date as YYYY-MM-DD', () => {
    expect(formatDateWib(instant)).toBe('2026-10-26');
  });

  it('formats the WIB time as HH:MM:SS', () => {
    expect(formatTimeWib(instant)).toBe('00:00:00');
    expect(formatTimeWib(new Date('2026-10-26T06:07:08.000Z'))).toBe('13:07:08');
  });

  it('formats combined WIB date-time', () => {
    expect(formatDateTimeWib(instant)).toBe('2026-10-26 00:00:00');
  });
});
