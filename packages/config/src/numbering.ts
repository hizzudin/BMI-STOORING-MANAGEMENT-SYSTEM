/**
 * Running-number generator (NFR-15, DEC-46, ASM-53).
 *
 * Document numbers are running numbers that are **never reused**, even after a cancel or
 * void: the sequence only ever advances. Formats are configurable/data-driven so the
 * product owner can change them after the build without a code change — they live in a
 * numbering configuration, not in logic.
 *
 * This module is pure and dependency-free. Persistence of the counters is the
 * `DataGateway`'s job in later tasks; here the generator takes an **injected sequence
 * source** (`SequenceSource`) so it stays testable in isolation. The source is the only
 * place a number is "consumed"; a cancel/void never calls it, which is why numbers are
 * never reused.
 */

/** Zero-padding minimum width of the running number; widens automatically when exceeded. */
export const DEFAULT_RUNNING_WIDTH = 4;

/**
 * A format template.
 *
 * - `prefix`  → `${prefix}${paddedNumber}`, e.g. `WO-` + `0142` = `WO-0142`.
 * - `invoice` → `${paddedNumber}/BMI/${dd-mm-yy of a supplied date}`, e.g.
 *               `0102/BMI/26-10-26`.
 */
export type NumberFormat =
  | {
      readonly kind: 'prefix';
      /** Literal prefix, e.g. `WO-`, `GR-`, `TY-`. */
      readonly prefix: string;
      /** Minimum zero-pad width; widens when the number needs more digits. */
      readonly width?: number;
    }
  | {
      readonly kind: 'invoice';
      /** Fixed middle segment, defaults to `BMI`. */
      readonly middle?: string;
      /** Minimum zero-pad width. */
      readonly width?: number;
    };

/**
 * The default numbering configuration from NFR-15. Keyed by document type. Editable as
 * data by the product owner post-build.
 */
export const DEFAULT_NUMBER_FORMATS = {
  WO: { kind: 'prefix', prefix: 'WO-' },
  CR: { kind: 'prefix', prefix: 'CR-' },
  GR: { kind: 'prefix', prefix: 'GR-' },
  GRC: { kind: 'prefix', prefix: 'GRC-' },
  GI: { kind: 'prefix', prefix: 'GI-' },
  SA: { kind: 'prefix', prefix: 'SA-' },
  OB: { kind: 'prefix', prefix: 'OB-' },
  TR: { kind: 'prefix', prefix: 'TR-' },
  RD: { kind: 'prefix', prefix: 'RD-' },
  TC: { kind: 'prefix', prefix: 'TC-' },
  TY: { kind: 'prefix', prefix: 'TY-' },
  INVOICE: { kind: 'invoice', middle: 'BMI' },
} as const satisfies Record<string, NumberFormat>;

/** The document-type keys of the default configuration. */
export type DocumentType = keyof typeof DEFAULT_NUMBER_FORMATS;

/**
 * A monotonic sequence source. `next(key)` returns the next unused counter value for the
 * named sequence and advances it. Implementations must never return a value twice for the
 * same key (a DB `SEQUENCE` satisfies this; so does the in-memory one below). It is called
 * once per issued number and never on cancel/void.
 */
export interface SequenceSource {
  next(key: string): number;
}

/**
 * A pure in-memory sequence source for tests and the dummy gateway (Phase 1). Counts from
 * 1 upward per key and never repeats. Not safe across processes — the real source in
 * Setup/Go-live is a Postgres `SEQUENCE`.
 */
export class InMemorySequenceSource implements SequenceSource {
  private readonly counters = new Map<string, number>();

  constructor(initial: Readonly<Record<string, number>> = {}) {
    for (const [key, value] of Object.entries(initial)) {
      this.counters.set(key, value);
    }
  }

  next(key: string): number {
    const current = this.counters.get(key) ?? 0;
    const value = current + 1;
    this.counters.set(key, value);
    return value;
  }

  /** Inspect the last issued value for a key (0 if none issued yet). Test aid. */
  peek(key: string): number {
    return this.counters.get(key) ?? 0;
  }
}

function pad(n: number, width: number): string {
  return String(n).padStart(width, '0');
}

function ddmmyy(date: Date): string {
  // dd-mm-yy of the given date's UTC-day parts. Callers pass the WIB wall-clock instant
  // (see format/time helpers) so the printed day matches the issue day.
  const dd = pad(date.getUTCDate(), 2);
  const mm = pad(date.getUTCMonth() + 1, 2);
  const yy = pad(date.getUTCFullYear() % 100, 2);
  return `${dd}-${mm}-${yy}`;
}

/** Render a single format against a sequence value (and, for invoices, an issue date). */
export function renderNumber(format: NumberFormat, value: number, issueDate?: Date): string {
  if (!Number.isInteger(value) || value < 1) {
    throw new RangeError(`renderNumber: value must be a positive integer, received ${value}`);
  }
  const width = format.width ?? DEFAULT_RUNNING_WIDTH;
  if (format.kind === 'prefix') {
    return `${format.prefix}${pad(value, width)}`;
  }
  if (!issueDate) {
    throw new RangeError('renderNumber: invoice format requires an issueDate');
  }
  const middle = format.middle ?? 'BMI';
  return `${pad(value, width)}/${middle}/${ddmmyy(issueDate)}`;
}

/** Options the generator understands per call. */
export interface GenerateOptions {
  /**
   * The issue date for an invoice number (the dd-mm-yy segment). Pass the WIB wall-clock
   * instant of the issue day (e.g. via `utcToWib`). Ignored by prefix formats.
   */
  readonly issueDate?: Date;
}

/**
 * A configurable running-number generator. Holds a format table (defaults to NFR-15) and
 * draws its monotonic counters from the injected {@link SequenceSource}. The sequence key
 * is the document type, so each type counts independently and never resets.
 */
export class RunningNumberGenerator<TFormats extends Record<string, NumberFormat>> {
  constructor(
    private readonly source: SequenceSource,
    private readonly formats: TFormats,
  ) {}

  /** The configured format for a type (throws if the type is unknown). */
  formatFor(type: keyof TFormats): NumberFormat {
    const format = this.formats[type];
    if (!format) {
      throw new RangeError(`RunningNumberGenerator: unknown document type "${String(type)}"`);
    }
    return format;
  }

  /**
   * Issue the next running number for a document type. Consumes one value from the
   * sequence source (advancing it), so the returned number is never reused.
   */
  next(type: keyof TFormats, options: GenerateOptions = {}): string {
    const format = this.formatFor(type);
    const value = this.source.next(String(type));
    return renderNumber(format, value, options.issueDate);
  }
}

/**
 * Convenience factory: a generator over the default NFR-15 formats, backed by a fresh
 * in-memory sequence source unless one is supplied.
 */
export function createDefaultNumberGenerator(
  source: SequenceSource = new InMemorySequenceSource(),
): RunningNumberGenerator<typeof DEFAULT_NUMBER_FORMATS> {
  return new RunningNumberGenerator(source, DEFAULT_NUMBER_FORMATS);
}
