import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { roundAverageCost } from '@bmi/config';
import { AppSettingsService } from '../iam/app-settings.service.js';

/** A persisted opening-balance stock-card row (`stock_cards.movement_type = 'OB'`). */
export interface OpeningBalanceRow {
  readonly sku: string;
  readonly quantity: number;
  readonly unitCost: number;
  readonly rack: string;
  /** Movement type — always `OB` for an opening balance (REQ-INV-013). */
  readonly movementType: 'OB';
}

/** The result of saving the opening balance. */
export interface OpeningBalanceResult {
  /** The OB stock-card rows written (one per SKU). */
  readonly rows: readonly OpeningBalanceRow[];
  /** Per-SKU resulting stock and average cost. */
  readonly stock: ReadonlyMap<string, { quantity: number; averageCost: number }>;
}

/**
 * The one-time opening balance (REQ-INV-013 / AC-INV-006), **Setup-mode only**.
 *
 * The Phase-1 dummy gateway (TASK-102) does not yet model `parts_catalog`,
 * `stock_cards` or `stock_adjustments`, so — following the TASK-103/104
 * precedent for cross-cutting Phase-1 state — the OB ledger is an API-layer
 * in-memory service. Its contract (one `OB` stock-card row per SKU, stock set to
 * the physical quantity, average cost set to the unit cost, no approval) is the
 * one TASK-201/202 re-home behind the real `stock_cards` / `stock_adjustments`
 * tables unchanged.
 *
 * WHILE Setup: saving sets stock + average cost and writes OB rows, no approval.
 * WHEN Live: any opening balance is refused (REQ-INV-013 / AC-INV-006).
 */
@Injectable()
export class OpeningBalanceService {
  /** Per-SKU latest opening balance (last write per SKU wins within the save). */
  private readonly ledger = new Map<string, OpeningBalanceRow>();
  /** Whether an opening balance has already been saved. */
  private saved = false;

  constructor(private readonly settings: AppSettingsService) {}

  /**
   * Save the opening balance (REQ-INV-013). Setup-mode only. Validates rows,
   * sets stock and average cost per SKU, and writes one OB row per SKU. No
   * approval is involved. Refused once the system is Live.
   *
   * @throws ConflictException when the system is already Live.
   * @throws BadRequestException when a SKU is duplicated in the submission.
   */
  save(
    rows: readonly { sku: string; quantity: number; unitCost: number; rack: string }[],
  ): OpeningBalanceResult {
    if (this.settings.isLive()) {
      throw new ConflictException('The system is live. Opening balance is Setup-mode only.');
    }

    // Validate server-side: no duplicate SKU within the submission.
    const seen = new Set<string>();
    for (const row of rows) {
      const sku = row.sku.trim();
      if (seen.has(sku)) {
        throw new BadRequestException(`Duplicate SKU in opening balance: ${sku}`);
      }
      seen.add(sku);
    }

    const written: OpeningBalanceRow[] = [];
    const stock = new Map<string, { quantity: number; averageCost: number }>();
    for (const row of rows) {
      const sku = row.sku.trim();
      const obRow: OpeningBalanceRow = {
        sku,
        quantity: row.quantity,
        // Average cost is stored at 4 dp, rounded half-up (NFR-16).
        unitCost: roundAverageCost(row.unitCost),
        rack: row.rack.trim(),
        movementType: 'OB',
      };
      this.ledger.set(sku, obRow);
      written.push(obRow);
      // Opening balance sets both stock and the moving-average cost directly.
      stock.set(sku, { quantity: obRow.quantity, averageCost: obRow.unitCost });
    }

    this.saved = true;
    return { rows: written, stock };
  }

  /** The OB row saved for a SKU, or `undefined`. */
  getRow(sku: string): OpeningBalanceRow | undefined {
    return this.ledger.get(sku.trim());
  }

  /** Every OB row saved so far (read-only). */
  allRows(): readonly OpeningBalanceRow[] {
    return [...this.ledger.values()];
  }

  /** Whether an opening balance has been saved. */
  hasSaved(): boolean {
    return this.saved;
  }

  /** Test-only reset of the in-memory ledger. */
  resetForTests(): void {
    this.ledger.clear();
    this.saved = false;
  }
}
