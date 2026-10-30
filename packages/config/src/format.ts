/**
 * Formatting helpers (NFR-08, NFR-09, DEC-30).
 *
 * Indonesian number format: thousands separator is a dot `.`, decimal separator is a
 * comma `,`. Examples the product must produce exactly:
 *   - `48.210 km`  (integer with a unit suffix)
 *   - `Rp 1.240.000` (currency, no decimals)
 *   - `2,4 mm`     (one decimal, comma separator)
 * Dates are `YYYY-MM-DD`; times are `HH:MM:SS`.
 *
 * These helpers do the grouping by hand (not `Intl`) so the output is deterministic and
 * independent of the host's installed locale data.
 */

import { roundHalfUp } from './money.js';
import { utcToWib } from './time.js';

/** Options for {@link formatNumber}. */
export interface NumberFormatOptions {
  /** Exact number of decimal places to show. Default `0`. */
  readonly decimals?: number;
  /** A unit suffix appended after a single space, e.g. `km`, `mm`. */
  readonly unit?: string;
}

const THOUSANDS_SEP = '.';
const DECIMAL_SEP = ',';

/**
 * Format a number in Indonesian style: `.` groups thousands, `,` is the decimal mark.
 * The value is rounded half-up to `decimals` places first, so `2.35` at 1 dp → `2,4`.
 *
 * @example formatNumber(48210) // "48.210"
 * @example formatNumber(2.4, { decimals: 1, unit: 'mm' }) // "2,4 mm"
 */
export function formatNumber(value: number, options: NumberFormatOptions = {}): string {
  const { decimals = 0, unit } = options;
  if (!Number.isFinite(value)) {
    throw new RangeError(`formatNumber: value must be finite, received ${value}`);
  }
  if (!Number.isInteger(decimals) || decimals < 0) {
    throw new RangeError(`formatNumber: decimals must be a non-negative integer, received ${decimals}`);
  }

  const rounded = roundHalfUp(value, decimals);
  const negative = rounded < 0;
  const abs = Math.abs(rounded);

  // Split into integer and fractional strings against the requested precision.
  const fixed = abs.toFixed(decimals);
  const [intPart, fracPart] = fixed.split('.');

  const groupedInt = (intPart ?? '0').replace(/\B(?=(\d{3})+(?!\d))/g, THOUSANDS_SEP);
  let out = groupedInt;
  if (decimals > 0 && fracPart !== undefined) {
    out += DECIMAL_SEP + fracPart;
  }
  if (negative && rounded !== 0) {
    out = `-${out}`;
  }
  if (unit) {
    out += ` ${unit}`;
  }
  return out;
}

/**
 * Format a value with a unit suffix (convenience over {@link formatNumber}).
 * @example formatWithUnit(48210, 'km') // "48.210 km"
 */
export function formatWithUnit(value: number, unit: string, decimals = 0): string {
  return formatNumber(value, { decimals, unit });
}

/**
 * Format a rupiah amount: `Rp ` prefix, dot-grouped thousands, no decimals by default
 * (whole rupiah is how money is displayed — NFR-16).
 * @example formatRupiah(1240000) // "Rp 1.240.000"
 */
export function formatRupiah(amount: number, decimals = 0): string {
  return `Rp ${formatNumber(amount, { decimals })}`;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * Format the WIB calendar date of a UTC instant as `YYYY-MM-DD` (NFR-09).
 */
export function formatDateWib(instant: Date | number): string {
  const wib = utcToWib(instant);
  const yyyy = String(wib.getUTCFullYear()).padStart(4, '0');
  return `${yyyy}-${pad2(wib.getUTCMonth() + 1)}-${pad2(wib.getUTCDate())}`;
}

/**
 * Format the WIB wall-clock time of a UTC instant as `HH:MM:SS` (NFR-09).
 */
export function formatTimeWib(instant: Date | number): string {
  const wib = utcToWib(instant);
  return `${pad2(wib.getUTCHours())}:${pad2(wib.getUTCMinutes())}:${pad2(wib.getUTCSeconds())}`;
}

/**
 * Format the WIB date and time of a UTC instant as `YYYY-MM-DD HH:MM:SS` (NFR-09).
 */
export function formatDateTimeWib(instant: Date | number): string {
  return `${formatDateWib(instant)} ${formatTimeWib(instant)}`;
}
