import { describe, it, expect } from 'vitest';
import {
  roundHalfUp,
  roundAmount,
  roundAverageCost,
  applyMarkupPerUnit,
  lineAmountWithMarkup,
  lineAmountAtCost,
  computeTax,
  computeInvoiceTotals,
} from './money.js';

describe('roundHalfUp (NFR-16, ASM-54)', () => {
  it('rounds the .5 boundary up to whole numbers', () => {
    expect(roundHalfUp(0.5)).toBe(1);
    expect(roundHalfUp(1.5)).toBe(2);
    expect(roundHalfUp(2.5)).toBe(3);
    expect(roundHalfUp(2.49)).toBe(2);
  });

  it('rounds half-up at decimal precision, surviving float representation error', () => {
    // 1.005 is stored as 1.00499999…; half-up must still yield 1.01.
    expect(roundHalfUp(1.005, 2)).toBe(1.01);
    expect(roundHalfUp(2.675, 2)).toBe(2.68);
    expect(roundHalfUp(0.615, 2)).toBe(0.62);
  });

  it('keeps whole rupiah by default', () => {
    expect(roundHalfUp(95999.5)).toBe(96000);
    expect(roundHalfUp(95999.49)).toBe(95999);
  });

  it('normalises -0 and handles negatives half-away-from-zero', () => {
    expect(Object.is(roundHalfUp(-0.0001), 0)).toBe(true);
    expect(roundHalfUp(-2.5)).toBe(-3);
  });

  it('rejects invalid input', () => {
    expect(() => roundHalfUp(Number.NaN)).toThrow(RangeError);
    expect(() => roundHalfUp(1, -1)).toThrow(RangeError);
  });
});

describe('roundAmount / roundAverageCost precision (NFR-16)', () => {
  it('amounts keep 2 decimals', () => {
    expect(roundAmount(1240000.004)).toBe(1240000);
    expect(roundAmount(10.005)).toBe(10.01);
  });

  it('average cost keeps 4 decimals', () => {
    expect(roundAverageCost(64000.12345)).toBe(64000.1235);
    expect(roundAverageCost(0.00005)).toBe(0.0001);
  });
});

describe('applyMarkupPerUnit (REQ-BIL-003)', () => {
  it('applies the 50% part markup and rounds half-up per unit', () => {
    // AC-BIL-005: oil filter average cost Rp 64.000, +50% markup = Rp 96.000.
    expect(applyMarkupPerUnit(64000, 50)).toBe(96000);
  });

  it('rounds the marked-up unit price half-up to a whole rupiah', () => {
    // 333 * 1.5 = 499.5 -> half up -> 500
    expect(applyMarkupPerUnit(333, 50)).toBe(500);
    // 99.0 * 1.5 = 148.5 -> 149
    expect(applyMarkupPerUnit(99, 50)).toBe(149);
  });

  it('rejects negative input', () => {
    expect(() => applyMarkupPerUnit(-1, 50)).toThrow(RangeError);
    expect(() => applyMarkupPerUnit(100, -5)).toThrow(RangeError);
  });
});

describe('invoice line amounts: round per unit BEFORE multiply (NFR-16)', () => {
  it('AC-BIL-005: oil filter 1 x Rp 96.000', () => {
    const line = lineAmountWithMarkup(64000, 50, 1);
    expect(line.unitPrice).toBe(96000);
    expect(line.amount).toBe(96000);
  });

  it('AC-BIL-005: service SVC-010 1 x Rp 150.000 with no markup', () => {
    const line = lineAmountAtCost(150000, 1);
    expect(line.unitPrice).toBe(150000);
    expect(line.amount).toBe(150000);
  });

  it('rounds per unit then multiplies (not multiply then round)', () => {
    // unit cost 333, +50% = 499.5 -> 500 per unit; x 3 = 1500.
    // Multiplying first would give 999 * 1.5 = 1498.5 -> 1499 (wrong).
    const line = lineAmountWithMarkup(333, 50, 3);
    expect(line.unitPrice).toBe(500);
    expect(line.amount).toBe(1500);
  });
});

describe('computeTax — PPN on subtotal half-up (NFR-16, REQ-BIL-004)', () => {
  it('computes PPN 11% on the AC-BIL-005 subtotal and rounds half-up', () => {
    const subtotal = 96000 + 150000; // 246000
    expect(computeTax(subtotal, 11)).toBe(27060); // 246000 * 0.11 = 27060
  });

  it('rounds a fractional PPN half-up to a whole rupiah', () => {
    // 100005 * 0.11 = 11000.55 -> 11001
    expect(computeTax(100005, 11)).toBe(11001);
    // 50 * 0.11 = 5.5 -> 6
    expect(computeTax(50, 11)).toBe(6);
  });

  it('supports a 0% rate', () => {
    expect(computeTax(246000, 0)).toBe(0);
  });
});

describe('computeInvoiceTotals (AC-BIL-005 end-to-end)', () => {
  it('produces subtotal, PPN 11% and grand total for the AC-BIL-005 invoice', () => {
    const oilFilter = lineAmountWithMarkup(64000, 50, 1); // 96000
    const service = lineAmountAtCost(150000, 1); // 150000
    const totals = computeInvoiceTotals([oilFilter, service], 11);
    expect(totals.subtotal).toBe(246000);
    expect(totals.tax).toBe(27060);
    expect(totals.grandTotal).toBe(273060);
  });
});
