import { describe, it, expect } from 'vitest';
import { formatInt, formatRupiah, formatKm, formatWibDate } from './format';

/** Indonesian presentation conventions (mirrors @bmi/config: 48.210 km, Rp …). */
describe('Indonesian formatters', () => {
  it('groups integers with dots', () => {
    expect(formatInt(48210)).toBe('48.210');
    expect(formatInt(1240000)).toBe('1.240.000');
  });

  it('formats rupiah with the Rp prefix and dot grouping', () => {
    expect(formatRupiah(1240000)).toBe('Rp 1.240.000');
  });

  it('formats odometer with the km unit', () => {
    expect(formatKm(48210)).toBe('48.210 km');
  });

  it('renders a bare YYYY-MM-DD on the WIB day', () => {
    // 2026-10-26 is a WIB calendar date and must not drift to the 25th.
    expect(formatWibDate('2026-10-26')).toMatch(/26/);
    expect(formatWibDate(null)).toBe('—');
  });
});
