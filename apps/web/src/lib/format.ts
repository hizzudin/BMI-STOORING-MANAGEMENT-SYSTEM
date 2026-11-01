/**
 * Presentation formatters for the web client (Indonesian conventions).
 *
 * The AUTHORITATIVE formatting/money/time helpers live in `packages/config`
 * (steering: Indonesian number/date format, UTC↔WIB). The API already returns
 * computed, formatted business values (money totals, running numbers) where it
 * matters; these web-side helpers only format display-side primitives (plain
 * counts, odometers, dates) for the UI and intentionally mirror the
 * `@bmi/config` conventions (`48.210 km`, `Rp 1.240.000`, WIB dates). They are
 * not a re-derivation of business money rounding (that stays server-side).
 */

/** Indonesian grouped integer, e.g. 48210 → "48.210". */
export function formatInt(value: number): string {
  return new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(value);
}

/** Rupiah, e.g. 1240000 → "Rp 1.240.000". */
export function formatRupiah(value: number): string {
  return `Rp ${formatInt(Math.round(value))}`;
}

/** Odometer with unit, e.g. 48210 → "48.210 km". */
export function formatKm(value: number): string {
  return `${formatInt(value)} km`;
}

/**
 * ISO date/timestamp rendered on the WIB day (Asia/Jakarta), e.g.
 * "2026-10-26" → "26 Okt 2026". A null value renders an em-dash.
 */
export function formatWibDate(value: string | null | undefined): string {
  if (!value) {
    return '—';
  }
  // A bare YYYY-MM-DD is a WIB calendar date; parse at WIB midnight.
  const iso = value.length === 10 ? `${value}T00:00:00+07:00` : value;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(d);
}

/** ISO timestamp → WIB date + time, e.g. "26 Okt 2026, 10.40". */
export function formatWibDateTime(value: string | null | undefined): string {
  if (!value) {
    return '—';
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}
