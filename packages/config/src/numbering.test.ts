import { describe, it, expect } from 'vitest';
import {
  InMemorySequenceSource,
  RunningNumberGenerator,
  createDefaultNumberGenerator,
  renderNumber,
  DEFAULT_NUMBER_FORMATS,
  type NumberFormat,
} from './numbering.js';

describe('renderNumber (NFR-15)', () => {
  it('pads a prefix format to 4 digits by default', () => {
    expect(renderNumber({ kind: 'prefix', prefix: 'WO-' }, 142)).toBe('WO-0142');
    expect(renderNumber({ kind: 'prefix', prefix: 'TY-' }, 1)).toBe('TY-0001');
  });

  it('widens past 4 digits when the number is larger', () => {
    expect(renderNumber({ kind: 'prefix', prefix: 'WO-' }, 12345)).toBe('WO-12345');
  });

  it('renders the invoice format NNNN/BMI/dd-mm-yy', () => {
    // issue date passed as WIB wall-clock instant; 2026-10-26.
    const issueDate = new Date(Date.UTC(2026, 9, 26));
    expect(renderNumber({ kind: 'invoice', middle: 'BMI' }, 102, issueDate)).toBe('0102/BMI/26-10-26');
  });

  it('requires an issue date for invoices', () => {
    expect(() => renderNumber({ kind: 'invoice' }, 1)).toThrow(RangeError);
  });

  it('rejects a non-positive sequence value', () => {
    expect(() => renderNumber({ kind: 'prefix', prefix: 'WO-' }, 0)).toThrow(RangeError);
  });
});

describe('never-reused running numbers across configured formats (NFR-15)', () => {
  it('advances each document type independently and never repeats', () => {
    const gen = createDefaultNumberGenerator();
    expect(gen.next('WO')).toBe('WO-0001');
    expect(gen.next('WO')).toBe('WO-0002');
    expect(gen.next('WO')).toBe('WO-0003');
    // A different type has its own sequence.
    expect(gen.next('GR')).toBe('GR-0001');
    expect(gen.next('GI')).toBe('GI-0001');
    expect(gen.next('WO')).toBe('WO-0004');
  });

  it('issues unique numbers for every default format', () => {
    const gen = createDefaultNumberGenerator();
    const issueDate = new Date(Date.UTC(2026, 9, 26));
    const issued = new Set<string>();
    for (const type of Object.keys(DEFAULT_NUMBER_FORMATS) as Array<keyof typeof DEFAULT_NUMBER_FORMATS>) {
      for (let i = 0; i < 5; i++) {
        const num = gen.next(type, { issueDate });
        expect(issued.has(num)).toBe(false);
        issued.add(num);
      }
    }
    // 12 document types x 5 each = 60 distinct numbers.
    expect(issued.size).toBe(60);
  });

  it('a cancel/void does NOT reuse a number — the next issue skips the gap', () => {
    const gen = createDefaultNumberGenerator();
    const first = gen.next('WO'); // WO-0001, imagine this WO is later cancelled
    const second = gen.next('WO'); // WO-0002
    const third = gen.next('WO'); // WO-0003
    expect(first).toBe('WO-0001');
    expect(second).toBe('WO-0002');
    expect(third).toBe('WO-0003');
    // Cancelling WO-0002 does not call the sequence source, so the next number is 0004,
    // never 0002 again.
    const fourth = gen.next('WO');
    expect(fourth).toBe('WO-0004');
    expect(fourth).not.toBe(second);
  });

  it('invoice running number never resets even across days (DEC-46)', () => {
    const gen = createDefaultNumberGenerator();
    const day1 = new Date(Date.UTC(2026, 9, 26));
    const day2 = new Date(Date.UTC(2026, 9, 27));
    expect(gen.next('INVOICE', { issueDate: day1 })).toBe('0001/BMI/26-10-26');
    expect(gen.next('INVOICE', { issueDate: day2 })).toBe('0002/BMI/27-10-26');
  });
});

describe('InMemorySequenceSource', () => {
  it('counts from 1 and never repeats per key', () => {
    const src = new InMemorySequenceSource();
    expect(src.next('WO')).toBe(1);
    expect(src.next('WO')).toBe(2);
    expect(src.next('GR')).toBe(1);
    expect(src.peek('WO')).toBe(2);
  });

  it('honours an initial seed so a running number can continue a prior count', () => {
    const src = new InMemorySequenceSource({ WO: 141 });
    expect(src.next('WO')).toBe(142);
  });
});

describe('configurable / data-driven formats (NFR-15)', () => {
  it('accepts a custom format table without any code change', () => {
    const formats = {
      SPK: { kind: 'prefix', prefix: 'SPK/', width: 3 },
    } as const satisfies Record<string, NumberFormat>;
    const gen = new RunningNumberGenerator(new InMemorySequenceSource(), formats);
    expect(gen.next('SPK')).toBe('SPK/001');
    expect(gen.next('SPK')).toBe('SPK/002');
  });

  it('throws on an unknown document type', () => {
    const gen = createDefaultNumberGenerator();
    // @ts-expect-error unknown type is a compile-time and runtime error
    expect(() => gen.next('NOPE')).toThrow(RangeError);
  });
});
