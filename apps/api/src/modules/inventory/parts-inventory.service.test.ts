import 'reflect-metadata';
import { beforeEach, describe, expect, it } from 'vitest';
import { PartsLedgerService } from '../stock/parts-ledger.service.js';
import { PartsInventoryService } from './parts-inventory.service.js';

/**
 * Unit coverage for parts inventory (FG-8, REQ-BSL/REQ-INV) against a fresh
 * ledger: Goods Receipt moving-average (AC-INV-001, DEC-60, exact Rp half-up),
 * GR correction as a correcting movement (AC-INV-002/REQ-INV-005), the
 * append-only stock card with a running balance + doc number (REQ-INV-007,
 * BR-06), the stock-opname approval gate (AC-INV-003/004, REQ-INV-011), and the
 * part-deactivation guard (AC-INV-005).
 */
describe('PartsInventoryService (TASK-112)', () => {
  let ledger: PartsLedgerService;
  let parts: PartsInventoryService;
  const WHM = 7; // warehouse manager user id
  const SUP = 4; // supervisor user id

  beforeEach(() => {
    ledger = new PartsLedgerService();
    parts = new PartsInventoryService(ledger);
  });

  // --- Goods Receipt + moving average (AC-INV-001, DEC-60) ------------------

  describe('Goods Receipt recomputes the moving-average (AC-INV-001, BR-06)', () => {
    it('a receipt of 10 at Rp 100.000 onto 10 at Rp 80.000 → avg Rp 90.000, stock 20', () => {
      // Seed the catalog with 10 @ 80.000 via a first receipt (part opens at 0).
      parts.addPart({ sku: 'SKU-OIL', partName: 'Oil', unit: 'L' });
      parts.postGoodsReceipt(
        { lines: [{ sku: 'SKU-OIL', qty: 10, unitPrice: 80000 }] },
        WHM,
      );
      expect(ledger.stockOf('SKU-OIL')).toBe(10);
      expect(ledger.averageCostOf('SKU-OIL')).toBe(80000);

      parts.postGoodsReceipt(
        { lines: [{ sku: 'SKU-OIL', qty: 10, unitPrice: 100000 }] },
        WHM,
      );
      // (10×80000 + 10×100000) / 20 = 1.800.000 / 20 = 90.000
      expect(ledger.averageCostOf('SKU-OIL')).toBe(90000);
      expect(ledger.stockOf('SKU-OIL')).toBe(20);
    });

    it('writes an append-only stock-card row with a running balance and a GR doc number (BR-06)', () => {
      parts.addPart({ sku: 'SKU-OIL', partName: 'Oil', unit: 'L' });
      const gr1 = parts.postGoodsReceipt({ lines: [{ sku: 'SKU-OIL', qty: 10, unitPrice: 80000 }] }, WHM);
      const gr2 = parts.postGoodsReceipt({ lines: [{ sku: 'SKU-OIL', qty: 10, unitPrice: 100000 }] }, WHM);

      const card = parts.stockCardOf('SKU-OIL'); // newest first
      expect(card).toHaveLength(2);
      expect(card[0]?.transactionType).toBe('GR');
      expect(card[0]?.referenceDocId).toBe(gr2.grNumber);
      expect(card[0]?.balanceAfter).toBe(20); // running balance
      expect(card[1]?.referenceDocId).toBe(gr1.grNumber);
      expect(card[1]?.balanceAfter).toBe(10);
      // Never-reused running numbers (NFR-15): the two receipts carry different GR numbers.
      expect(gr1.grNumber).not.toBe(gr2.grNumber);
    });

    it('refuses a receipt for an unknown SKU', () => {
      expect(() =>
        parts.postGoodsReceipt({ lines: [{ sku: 'SKU-NONE', qty: 1, unitPrice: 1 }] }, WHM),
      ).toThrow();
    });
  });

  // --- GR correction (AC-INV-002, REQ-INV-005) -----------------------------

  describe('GR correction is a correcting movement, never a silent edit (REQ-INV-005)', () => {
    it('a negative correction writes a GRC row and lowers stock; the original GR row stays', () => {
      parts.addPart({ sku: 'SKU-OIL', partName: 'Oil', unit: 'L' });
      const gr = parts.postGoodsReceipt({ lines: [{ sku: 'SKU-OIL', qty: 10, unitPrice: 80000 }] }, WHM);
      const correction = parts.correctGoodsReceipt(gr.id, { sku: 'SKU-OIL', qtyDelta: -3, reason: 'over-received' }, WHM);

      expect(ledger.stockOf('SKU-OIL')).toBe(7);
      const card = parts.stockCardOf('SKU-OIL');
      expect(card).toHaveLength(2); // GR row untouched + a new GRC row
      expect(card[0]?.transactionType).toBe('GRC');
      expect(card[0]?.qtyOut).toBe(3);
      expect(card[0]?.balanceAfter).toBe(7);
      expect(card[0]?.referenceDocId).toBe(correction.grcNumber);
      expect(card[1]?.transactionType).toBe('GR'); // original kept, never deleted
    });

    it('refuses a correction for a SKU not on the receipt', () => {
      parts.addPart({ sku: 'SKU-OIL', partName: 'Oil', unit: 'L' });
      parts.addPart({ sku: 'SKU-OTHER', partName: 'Other', unit: 'pcs' });
      const gr = parts.postGoodsReceipt({ lines: [{ sku: 'SKU-OIL', qty: 10, unitPrice: 80000 }] }, WHM);
      expect(() =>
        parts.correctGoodsReceipt(gr.id, { sku: 'SKU-OTHER', qtyDelta: -1, reason: 'x' }, WHM),
      ).toThrow();
    });
  });

  // --- Stock opname approval gate (AC-INV-003/004, REQ-INV-011) -------------

  describe('stock opname adjustment requires approval before it posts (REQ-INV-011)', () => {
    it('an unapproved (submitted) opname does NOT change stock', () => {
      parts.addPart({ sku: 'SKU-OIL', partName: 'Oil', unit: 'L' });
      parts.postGoodsReceipt({ lines: [{ sku: 'SKU-OIL', qty: 10, unitPrice: 80000 }] }, WHM);

      const opname = parts.createOpname([{ sku: 'SKU-OIL', physicalQty: 8, reasonCode: 'Damaged', note: 'two leaked' }], WHM);
      parts.submitOpname(opname.id, WHM);

      // Submitted, awaiting approval — stock is still the system quantity.
      expect(ledger.stockOf('SKU-OIL')).toBe(10);
      // No SA row has been written yet.
      expect(parts.stockCardOf('SKU-OIL').some((r) => r.transactionType === 'SA')).toBe(false);
    });

    it('an approved opname sets stock to the physical quantity and writes one SA row', () => {
      parts.addPart({ sku: 'SKU-OIL', partName: 'Oil', unit: 'L' });
      parts.postGoodsReceipt({ lines: [{ sku: 'SKU-OIL', qty: 10, unitPrice: 80000 }] }, WHM);
      const opname = parts.createOpname([{ sku: 'SKU-OIL', physicalQty: 8, reasonCode: 'Damaged', note: 'two leaked' }], WHM);
      parts.submitOpname(opname.id, WHM);

      const approved = parts.approveOpname(opname.id, SUP, false);
      expect(approved.status).toBe('Approved');
      expect(ledger.stockOf('SKU-OIL')).toBe(8);
      const sa = parts.stockCardOf('SKU-OIL').filter((r) => r.transactionType === 'SA');
      expect(sa).toHaveLength(1);
      expect(sa[0]?.qtyOut).toBe(2); // variance −2
      expect(sa[0]?.balanceAfter).toBe(8);
      expect(sa[0]?.referenceDocId).toBe(opname.saNumber);
    });

    it('AC-INV-003 — Submit is refused when a variance row has no reason code', () => {
      parts.addPart({ sku: 'SKU-OIL', partName: 'Oil', unit: 'L' });
      parts.postGoodsReceipt({ lines: [{ sku: 'SKU-OIL', qty: 10, unitPrice: 80000 }] }, WHM);
      const opname = parts.createOpname([{ sku: 'SKU-OIL', physicalQty: 8 }], WHM); // variance −2, no reason
      expect(() => parts.submitOpname(opname.id, WHM)).toThrow();
    });

    it('AC-INV-004 — the person who counted cannot approve; a System Admin who counted may (self-approved)', () => {
      parts.addPart({ sku: 'SKU-OIL', partName: 'Oil', unit: 'L' });
      parts.postGoodsReceipt({ lines: [{ sku: 'SKU-OIL', qty: 10, unitPrice: 80000 }] }, WHM);
      const opname = parts.createOpname([{ sku: 'SKU-OIL', physicalQty: 8, reasonCode: 'Damaged' }], WHM);
      parts.submitOpname(opname.id, WHM);

      // The counter (WHM) approving as a non-SA → refused (four-eyes).
      expect(() => parts.approveOpname(opname.id, WHM, false)).toThrow();

      // A System Admin who counted may self-approve.
      const opname2 = parts.createOpname([{ sku: 'SKU-OIL', physicalQty: 9, reasonCode: 'Found' }], 99);
      parts.submitOpname(opname2.id, 99);
      const approved = parts.approveOpname(opname2.id, 99, true);
      expect(approved.status).toBe('Approved');
      expect(approved.selfApproved).toBe(true);
    });

    it('a rejected opname returns to Draft marked Returned and changes no stock', () => {
      parts.addPart({ sku: 'SKU-OIL', partName: 'Oil', unit: 'L' });
      parts.postGoodsReceipt({ lines: [{ sku: 'SKU-OIL', qty: 10, unitPrice: 80000 }] }, WHM);
      const opname = parts.createOpname([{ sku: 'SKU-OIL', physicalQty: 8, reasonCode: 'Damaged' }], WHM);
      parts.submitOpname(opname.id, WHM);
      const rejected = parts.rejectOpname(opname.id, 'recount please');
      expect(rejected.status).toBe('Draft');
      expect(rejected.returnedReason).toBe('recount please');
      expect(ledger.stockOf('SKU-OIL')).toBe(10);
    });
  });

  // --- catalog lifecycle (REQ-INV-002/003) ---------------------------------

  describe('parts catalog master data (REQ-BSL, REQ-INV-002/003)', () => {
    it('a new part opens at quantity 0 with no stock-card row (a catalog add is not a movement)', () => {
      const part = parts.addPart({ sku: 'SKU-NEW', partName: 'New', unit: 'pcs' });
      expect(part.stockQty).toBe(0);
      expect(parts.stockCardOf('SKU-NEW')).toHaveLength(0);
    });

    it('locks the unit once the part has moved (REQ-INV-002)', () => {
      parts.addPart({ sku: 'SKU-OIL', partName: 'Oil', unit: 'L' });
      // Editable before any movement.
      parts.editPart('SKU-OIL', { unit: 'litre' });
      parts.postGoodsReceipt({ lines: [{ sku: 'SKU-OIL', qty: 1, unitPrice: 80000 }] }, WHM);
      // Locked after a movement.
      expect(() => parts.editPart('SKU-OIL', { unit: 'drum' })).toThrow();
      // Other fields still editable.
      expect(() => parts.editPart('SKU-OIL', { rack: 'B-02' })).not.toThrow();
    });

    it('AC-INV-005 — deactivating a part with quantity 3 is refused', () => {
      parts.addPart({ sku: 'SKU-OIL', partName: 'Oil', unit: 'L' });
      parts.postGoodsReceipt({ lines: [{ sku: 'SKU-OIL', qty: 3, unitPrice: 80000 }] }, WHM);
      expect(() => parts.deactivatePart('SKU-OIL')).toThrow();
      // A zero-quantity part deactivates.
      parts.addPart({ sku: 'SKU-ZERO', partName: 'Zero', unit: 'pcs' });
      expect(parts.deactivatePart('SKU-ZERO').isActive).toBe(false);
    });
  });
});
