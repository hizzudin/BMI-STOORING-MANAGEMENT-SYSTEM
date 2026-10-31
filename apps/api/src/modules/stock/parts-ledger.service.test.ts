import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { PartsLedgerService } from './parts-ledger.service.js';

/**
 * Unit coverage for the parts ledger (FG-4): the moving-average arithmetic
 * (DEC-60, TX-06) and the all-or-nothing transaction (REQ-STK-003).
 */
describe('PartsLedgerService (TASK-109)', () => {
  // --- moving-average cost (DEC-60, TX-06): assert concrete numbers ---------

  describe('moving-average cost on receipt (DEC-60, exact Rp half-up)', () => {
    it('recomputes (old_qty×old_cost + qty×price)/(old_qty+qty)', () => {
      // 5 L @ 76.500 + 3 L @ 82.000 = (382500 + 246000)/8 = 628500/8 = 78562.5
      const avg = PartsLedgerService.recomputeAverageOnReceipt(5, 76500, 3, 82000);
      expect(avg).toBe(78562.5);
    });

    it('rounds half-up to 4 dp', () => {
      // 1 @ 100 + 2 @ 101 = 302/3 = 100.6666... → 100.6667 (4 dp half-up)
      const avg = PartsLedgerService.recomputeAverageOnReceipt(1, 100, 2, 101);
      expect(avg).toBe(100.6667);
    });

    it('first receipt into empty stock sets the average to the unit price', () => {
      const avg = PartsLedgerService.recomputeAverageOnReceipt(0, 0, 10, 55000);
      expect(avg).toBe(55000);
    });
  });

  // --- all-or-nothing transaction (REQ-STK-003) -----------------------------

  describe('transaction atomicity (REQ-STK-003)', () => {
    it('commits every row on success: stock down, one GI card row, cost unchanged on issue', () => {
      const ledger = new PartsLedgerService();
      const before = ledger.stockOf('SKU-1029'); // 5
      const avgBefore = ledger.averageCostOf('SKU-1029'); // 76500

      ledger.transaction((tx) => {
        tx.issueLine({
          sku: 'SKU-1029',
          qty: 2,
          referenceDocId: 'GI-0001',
          workOrderId: 1,
          vehicleId: 1,
          userId: 5,
          at: new Date().toISOString(),
        });
      });

      expect(ledger.stockOf('SKU-1029')).toBe(before - 2); // 3
      // Issuing does not change the moving average (TX-06 recomputes on receipt only).
      expect(ledger.averageCostOf('SKU-1029')).toBe(avgBefore);
      const card = ledger.stockCardFor('SKU-1029');
      expect(card).toHaveLength(1);
      expect(card[0]?.transactionType).toBe('GI');
      expect(card[0]?.qtyOut).toBe(2);
      expect(card[0]?.balanceAfter).toBe(3);
      expect(card[0]?.referenceDocId).toBe('GI-0001'); // a document on every movement (BR-06)
    });

    it('rolls back everything when a later line fails mid-issue: nothing partially written', () => {
      const ledger = new PartsLedgerService();
      const oilBefore = ledger.stockOf('SKU-1029'); // 5
      const wiperBefore = ledger.stockOf('SKU-4410'); // 8

      expect(() =>
        ledger.transaction((tx) => {
          // First line succeeds against the snapshot...
          tx.issueLine({
            sku: 'SKU-1029',
            qty: 2,
            referenceDocId: 'GI-0002',
            workOrderId: 1,
            vehicleId: 1,
            userId: 5,
            at: new Date().toISOString(),
          });
          // ...then a second line over-issues and throws → the whole tx rolls back.
          tx.issueLine({
            sku: 'SKU-4410',
            qty: 999,
            referenceDocId: 'GI-0002',
            workOrderId: 1,
            vehicleId: 1,
            userId: 5,
            at: new Date().toISOString(),
          });
        }),
      ).toThrow();

      // Nothing committed: both stocks unchanged, no stock-card rows, no GI.
      expect(ledger.stockOf('SKU-1029')).toBe(oilBefore);
      expect(ledger.stockOf('SKU-4410')).toBe(wiperBefore);
      expect(ledger.allStockCards()).toHaveLength(0);
      expect(ledger.allGoodsIssues()).toHaveLength(0);
    });

    it('refuses an issue beyond on-hand (stock_qty >= 0 guard)', () => {
      const ledger = new PartsLedgerService();
      expect(() =>
        ledger.transaction((tx) =>
          tx.issueLine({
            sku: 'SKU-1029',
            qty: 6, // only 5 on hand
            referenceDocId: 'GI-0003',
            workOrderId: 1,
            vehicleId: 1,
            userId: 5,
            at: new Date().toISOString(),
          }),
        ),
      ).toThrow();
      expect(ledger.stockOf('SKU-1029')).toBe(5);
    });
  });
});
