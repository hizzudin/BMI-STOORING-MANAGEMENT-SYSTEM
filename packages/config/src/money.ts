/**
 * Money helpers (NFR-16, ASM-54).
 *
 * Rules from the PRD:
 * - Amounts are stored with 2 decimals; average costs with 4 decimals.
 * - A marked-up invoice price is rounded **half up** to a whole rupiah **per unit**
 *   BEFORE the line is multiplied by quantity.
 * - PPN (tax) is computed on the subtotal and rounded **half up** to a whole rupiah.
 *
 * JavaScript `number` arithmetic is not decimal-safe (e.g. `1.005 * 100` is not `100.5`),
 * so every rounding path here scales to integers and rounds on the scaled value with a
 * tiny epsilon correction, rather than relying on `Math.round` of a raw product.
 */

/** Number of decimals the ledger stores for ordinary amounts (rupiah has whole-rupiah display, cents kept internally). */
export const AMOUNT_DECIMALS = 2;
/** Number of decimals the ledger stores for moving-average costs. */
export const AVERAGE_COST_DECIMALS = 4;

/**
 * Round a value **half up** (away from zero at the .5 boundary for positive values)
 * to the given number of decimal places.
 *
 * Half-up here means 0.5 rounds up to 1, 2.5 rounds to 3, 1.005 (2 dp) rounds to 1.01.
 * The value is scaled to an integer domain before rounding to sidestep binary
 * floating-point representation error; a small epsilon nudges values that are a hair
 * below an exact half due to that representation (e.g. 1.005 stored as 1.00499999…).
 *
 * @param value    the amount to round
 * @param decimals number of decimal places to keep (default 0 = whole rupiah)
 */
export function roundHalfUp(value: number, decimals = 0): number {
  if (!Number.isFinite(value)) {
    throw new RangeError(`roundHalfUp: value must be finite, received ${value}`);
  }
  if (!Number.isInteger(decimals) || decimals < 0) {
    throw new RangeError(`roundHalfUp: decimals must be a non-negative integer, received ${decimals}`);
  }

  const factor = 10 ** decimals;
  const scaled = value * factor;
  // Epsilon relative to magnitude pulls a value that is marginally under an exact
  // half (binary representation error) back onto the half so it rounds up.
  const epsilon = Math.sign(scaled) * Math.abs(scaled) * Number.EPSILON * 8;
  const corrected = scaled + epsilon;
  const rounded = Math.floor(Math.abs(corrected) + 0.5) * Math.sign(corrected);
  // `|| 0` normalises a possible `-0`.
  return (rounded / factor) || 0;
}

/** Round an amount to the stored amount precision (2 dp). */
export function roundAmount(value: number): number {
  return roundHalfUp(value, AMOUNT_DECIMALS);
}

/** Round a moving-average cost to its stored precision (4 dp). */
export function roundAverageCost(value: number): number {
  return roundHalfUp(value, AVERAGE_COST_DECIMALS);
}

/**
 * Apply a markup percentage to a unit cost and round the result **half up to a whole
 * rupiah** — the per-unit marked-up price used on an invoice line (NFR-16, REQ-BIL-003).
 *
 * @param unitCost     the cost of one unit on the WO (average cost, purchase or workshop price)
 * @param markupPercent markup from Settings as a percentage (e.g. 50 for +50%)
 * @returns the marked-up unit price, a whole rupiah
 */
export function applyMarkupPerUnit(unitCost: number, markupPercent: number): number {
  if (!Number.isFinite(unitCost) || unitCost < 0) {
    throw new RangeError(`applyMarkupPerUnit: unitCost must be a non-negative finite number, received ${unitCost}`);
  }
  if (!Number.isFinite(markupPercent) || markupPercent < 0) {
    throw new RangeError(`applyMarkupPerUnit: markupPercent must be a non-negative finite number, received ${markupPercent}`);
  }
  const marked = unitCost * (1 + markupPercent / 100);
  return roundHalfUp(marked, 0);
}

/**
 * Compute a single invoice line amount: round the marked-up unit price half-up to a
 * whole rupiah FIRST (per unit), then multiply by quantity (NFR-16).
 *
 * @returns `{ unitPrice, amount }` where `unitPrice` is the rounded per-unit price and
 *          `amount` is `unitPrice × quantity`.
 */
export function lineAmountWithMarkup(
  unitCost: number,
  markupPercent: number,
  quantity: number,
): { unitPrice: number; amount: number } {
  if (!Number.isFinite(quantity) || quantity < 0) {
    throw new RangeError(`lineAmountWithMarkup: quantity must be a non-negative finite number, received ${quantity}`);
  }
  const unitPrice = applyMarkupPerUnit(unitCost, markupPercent);
  return { unitPrice, amount: unitPrice * quantity };
}

/**
 * Compute a line amount at cost with **no markup** (services, document renewals,
 * stooring fees, OFF-unit lines — REQ-BIL-003). The unit price is rounded half-up to a
 * whole rupiah per unit, then multiplied by quantity.
 */
export function lineAmountAtCost(
  unitPrice: number,
  quantity: number,
): { unitPrice: number; amount: number } {
  return lineAmountWithMarkup(unitPrice, 0, quantity);
}

/**
 * Compute PPN (tax) on a subtotal, rounded **half up** to a whole rupiah (NFR-16).
 *
 * @param subtotal   the invoice subtotal (sum of line amounts)
 * @param taxPercent tax rate from Settings (PPN 11%, may be 0)
 */
export function computeTax(subtotal: number, taxPercent: number): number {
  if (!Number.isFinite(subtotal) || subtotal < 0) {
    throw new RangeError(`computeTax: subtotal must be a non-negative finite number, received ${subtotal}`);
  }
  if (!Number.isFinite(taxPercent) || taxPercent < 0) {
    throw new RangeError(`computeTax: taxPercent must be a non-negative finite number, received ${taxPercent}`);
  }
  return roundHalfUp(subtotal * (taxPercent / 100), 0);
}

/** An invoice line as summed into a total. */
export interface InvoiceLineTotal {
  readonly amount: number;
}

/**
 * Compute `{ subtotal, tax, grandTotal }` for an invoice (REQ-BIL-004).
 * Subtotal is the sum of the (already per-unit-rounded) line amounts; tax is PPN on the
 * subtotal rounded half-up; grand total is subtotal + tax.
 */
export function computeInvoiceTotals(
  lines: readonly InvoiceLineTotal[],
  taxPercent: number,
): { subtotal: number; tax: number; grandTotal: number } {
  const subtotal = lines.reduce((sum, line) => sum + line.amount, 0);
  const tax = computeTax(subtotal, taxPercent);
  return { subtotal, tax, grandTotal: subtotal + tax };
}
