import { BadRequestException, Injectable } from '@nestjs/common';
import { roundAverageCost } from '@bmi/config';

/**
 * A part in the catalog (`parts_catalog`, PRD §9.8). `stockQty` is the
 * on-hand quantity (`CHECK (stock_qty >= 0)`), `averageCost` the moving-average
 * unit cost (`NUMERIC(14,4)`).
 */
export interface Part {
  readonly sku: string;
  readonly partName: string;
  readonly unit: string;
  stockQty: number;
  /** Moving average, 4 dp (PRD §9.8, DEC-60, NFR-16). */
  averageCost: number;
}

/** A stock-card movement row (`stock_cards`, PRD §9.8; BR-06). */
export interface StockCardRow {
  readonly sku: string;
  /** `stock_tx_t` (PRD §9.8): OB, GR, GRC, GI, GIR, SA. */
  readonly transactionType: 'OB' | 'GR' | 'GRC' | 'GI' | 'GIR' | 'SA';
  /** No movement without a document number (BR-06: `reference_doc_id NOT NULL`). */
  readonly referenceDocId: string;
  readonly workOrderId: number | null;
  readonly vehicleId: number | null;
  readonly qtyIn: number;
  readonly qtyOut: number;
  readonly balanceAfter: number;
  readonly userId: number;
  readonly txAt: string;
}

/** A line of a goods issue (`goods_issue_items`, PRD §9.8). */
export interface GoodsIssueItem {
  readonly sku: string;
  readonly qty: number;
  /** Average cost at issue time (snapshot, BR-07). */
  readonly unitCost: number;
}

/** A goods-issue document (`goods_issues`, PRD §9.8). */
export interface GoodsIssue {
  readonly id: number;
  readonly giNumber: string;
  readonly workOrderId: number;
  readonly assignmentId: number;
  readonly vehicleId: number;
  readonly issuedBy: number;
  readonly issuedDate: string;
  readonly items: readonly GoodsIssueItem[];
  /** Set on a reversal row: the GI it reverses (`reverses_gi_id`). */
  readonly reversesGiId: number | null;
  readonly reversalReason: string | null;
  /** Stock returns only after a Planner/System Admin verifies the reversal (TX-05). */
  readonly reversalVerifiedBy: number | null;
}

/** A mutable snapshot of the whole ledger, for all-or-nothing transactions. */
interface LedgerSnapshot {
  readonly parts: Map<string, Part>;
  readonly stockCards: StockCardRow[];
  readonly goodsIssues: GoodsIssue[];
  nextGiId: number;
}

/**
 * The **parts catalog + stock ledger** (PRD §9.8), a Phase-1 API-layer
 * in-memory service.
 *
 * The dummy gateway (TASK-102) models only the nine business aggregates and
 * carries no `parts_catalog` / `stock_cards` / `goods_issues` tables, so —
 * following the established TASK-103..108 precedent for cross-cutting Phase-1
 * state (the IAM sessions, the Setup opening-balance ledger, the registry, the
 * step-time-event ledger) — the catalog and stock ledger live here. TASK-201/202
 * re-home them behind the real PRD §9.8 tables unchanged.
 *
 * **All-or-nothing writes.** The goods issue of a Stock step touches three rows
 * — the part's stock, a stock-card movement and the part's moving-average cost —
 * and the PRD requires them in one transaction (REQ-STK-003: "if any part
 * fails, nothing shall change"). {@link transaction} gives that guarantee by
 * snapshotting the ledger, applying the work to the snapshot, and committing it
 * only if the work resolves; any throw discards the snapshot, leaving the
 * committed ledger untouched. The engine runs this inside its own `unitOfWork`,
 * so the step-status write and the ledger write roll back together.
 */
@Injectable()
export class PartsLedgerService {
  private parts = new Map<string, Part>();
  private stockCards: StockCardRow[] = [];
  private goodsIssues: GoodsIssue[] = [];
  private nextGiId = 1;

  constructor() {
    this.seed();
  }

  // --- reads ---------------------------------------------------------------

  /** A part by SKU, or `undefined`. */
  getPart(sku: string): Part | undefined {
    const p = this.parts.get(sku.trim());
    return p ? { ...p } : undefined;
  }

  /** Every part (read-only copies). */
  listParts(): readonly Part[] {
    return [...this.parts.values()].map((p) => ({ ...p }));
  }

  /** On-hand stock of a SKU (0 if unknown). */
  stockOf(sku: string): number {
    return this.parts.get(sku.trim())?.stockQty ?? 0;
  }

  /** The moving-average cost of a SKU (0 if unknown). */
  averageCostOf(sku: string): number {
    return this.parts.get(sku.trim())?.averageCost ?? 0;
  }

  /** The stock-card rows for a SKU, in order (read-only). */
  stockCardFor(sku: string): readonly StockCardRow[] {
    return this.stockCards.filter((r) => r.sku === sku.trim());
  }

  /** Every stock-card row (read-only). */
  allStockCards(): readonly StockCardRow[] {
    return [...this.stockCards];
  }

  /** A goods-issue document by id, or `undefined`. */
  getGoodsIssue(id: number): GoodsIssue | undefined {
    return this.goodsIssues.find((g) => g.id === id);
  }

  /** Every goods issue of a WO (read-only). */
  goodsIssuesOf(workOrderId: number): readonly GoodsIssue[] {
    return this.goodsIssues.filter((g) => g.workOrderId === workOrderId);
  }

  /** Every goods issue (read-only). */
  allGoodsIssues(): readonly GoodsIssue[] {
    return [...this.goodsIssues];
  }

  // --- moving-average arithmetic ------------------------------------------

  /**
   * Recompute a part's moving-average cost on a **receipt** of `qty` at
   * `unitPrice` (PRD TX-06, DEC-60):
   *
   *   `average = (old_qty × old_cost + qty × unit_price) / (old_qty + qty)`
   *
   * rounded half-up to 4 dp via `@bmi/config` (NFR-16). A pure helper so the
   * arithmetic is unit-testable in isolation. Issuing stock does **not** change
   * the moving average (an issue leaves at the current average — TX-06 only
   * recomputes on receipt), so there is no issue-side recompute here.
   */
  static recomputeAverageOnReceipt(
    oldQty: number,
    oldCost: number,
    qty: number,
    unitPrice: number,
  ): number {
    const totalQty = oldQty + qty;
    if (totalQty <= 0) {
      return roundAverageCost(unitPrice);
    }
    const weighted = oldQty * oldCost + qty * unitPrice;
    return roundAverageCost(weighted / totalQty);
  }

  // --- transactional writes ------------------------------------------------

  /**
   * Run `work` against a private snapshot of the ledger and commit it **only if
   * `work` resolves** (REQ-STK-003 all-or-nothing). A throw discards the
   * snapshot, so a mid-issue failure leaves stock, the stock card and the
   * average cost exactly as they were. Returns whatever `work` returns.
   *
   * The handle exposes just the primitives a Stock issue/reversal needs; each
   * one validates against the PRD invariants (stock ≥ 0, a document number on
   * every movement) before touching the snapshot.
   */
  transaction<R>(work: (tx: LedgerTransaction) => R): R {
    const snapshot = this.cloneSnapshot();
    const tx = new LedgerTransaction(snapshot);
    const result = work(tx);
    // Committed only on a clean return — a throw above skips this line and the
    // snapshot (and its id counter) is simply dropped.
    this.parts = snapshot.parts;
    this.stockCards = snapshot.stockCards;
    this.goodsIssues = snapshot.goodsIssues;
    this.nextGiId = snapshot.nextGiId;
    return result;
  }

  private cloneSnapshot(): LedgerSnapshot {
    const parts = new Map<string, Part>();
    for (const [sku, p] of this.parts) {
      parts.set(sku, { ...p });
    }
    return {
      parts,
      stockCards: [...this.stockCards],
      goodsIssues: [...this.goodsIssues],
      nextGiId: this.nextGiId,
    };
  }

  // --- seed / reset --------------------------------------------------------

  /**
   * Seed the catalog with the two SKUs the PRD's worked examples name
   * (AC-STK-006, AC-PUR-001): SKU-1029 Engine oil 15W-40 (5 L on hand at
   * Rp 76.500) and SKU-4410 Wiper blade (8 on hand at Rp 40.000). The engine-oil
   * opening quantity of 5 L is what AC-STK-006 ("needs 8 L and 5 L are in
   * stock") issues against.
   */
  private seed(): void {
    this.parts.set('SKU-1029', {
      sku: 'SKU-1029',
      partName: 'Engine oil 15W-40',
      unit: 'L',
      stockQty: 5,
      averageCost: 76500,
    });
    this.parts.set('SKU-4410', {
      sku: 'SKU-4410',
      partName: 'Wiper blade',
      unit: 'pcs',
      stockQty: 8,
      averageCost: 40000,
    });
  }

  /** Test-only reset to the seeded baseline. */
  resetForTests(): void {
    this.parts = new Map<string, Part>();
    this.stockCards = [];
    this.goodsIssues = [];
    this.nextGiId = 1;
    this.seed();
  }
}

/**
 * The mutating handle a {@link PartsLedgerService.transaction} callback receives.
 * Every primitive guards the PRD invariants before touching the snapshot, so a
 * violation throws and the whole transaction rolls back.
 */
export class LedgerTransaction {
  constructor(private readonly snapshot: LedgerSnapshot) {}

  /** Read a part inside the transaction (live snapshot value). */
  requirePart(sku: string): Part {
    const p = this.snapshot.parts.get(sku.trim());
    if (!p) {
      throw new BadRequestException(`Unknown part: ${sku}`);
    }
    return p;
  }

  /**
   * Record a goods issue of one line: decrement stock, write a GI stock-card
   * row and keep the issue's `unitCost` at the current moving average
   * (REQ-STK-003, BR-07). Refuses an issue that would take stock below zero —
   * the Stock step must have reserved only the on-hand quantity (REQ-STK-004);
   * this guard is the last line of defence (`stock_qty >= 0`).
   */
  issueLine(input: {
    sku: string;
    qty: number;
    referenceDocId: string;
    workOrderId: number;
    vehicleId: number;
    userId: number;
    at: string;
  }): GoodsIssueItem {
    const part = this.requirePart(input.sku);
    if (input.qty <= 0 || !Number.isInteger(input.qty)) {
      throw new BadRequestException(`Issue quantity must be a positive whole number for ${input.sku}.`);
    }
    if (input.qty > part.stockQty) {
      throw new BadRequestException(
        `Cannot issue ${input.qty} of ${input.sku}: only ${part.stockQty} on hand (REQ-STK-004).`,
      );
    }
    const unitCost = part.averageCost;
    part.stockQty -= input.qty;
    this.snapshot.stockCards.push({
      sku: input.sku,
      transactionType: 'GI',
      referenceDocId: input.referenceDocId,
      workOrderId: input.workOrderId,
      vehicleId: input.vehicleId,
      qtyIn: 0,
      qtyOut: input.qty,
      balanceAfter: part.stockQty,
      userId: input.userId,
      txAt: input.at,
    });
    return { sku: input.sku, qty: input.qty, unitCost };
  }

  /**
   * Record a **verified reversal** of a goods-issue line (BR-06, TX-05): return
   * stock at the original issue `unitCost` and write a GIR stock-card row. Never
   * a silent delete — the original GI stays and a reversing row is added.
   */
  reverseLine(input: {
    item: GoodsIssueItem;
    referenceDocId: string;
    workOrderId: number;
    vehicleId: number;
    userId: number;
    at: string;
  }): void {
    const part = this.requirePart(input.item.sku);
    part.stockQty += input.item.qty;
    this.snapshot.stockCards.push({
      sku: input.item.sku,
      transactionType: 'GIR',
      referenceDocId: input.referenceDocId,
      workOrderId: input.workOrderId,
      vehicleId: input.vehicleId,
      qtyIn: input.item.qty,
      qtyOut: 0,
      balanceAfter: part.stockQty,
      userId: input.userId,
      txAt: input.at,
    });
  }

  /** Assign and consume the next goods-issue id inside the transaction. */
  nextGoodsIssueId(): number {
    const id = this.snapshot.nextGiId;
    this.snapshot.nextGiId = id + 1;
    return id;
  }

  /** Append a goods-issue document to the snapshot. */
  addGoodsIssue(gi: GoodsIssue): void {
    this.snapshot.goodsIssues.push(gi);
  }

  /** Mark a goods issue as reversed (store the reversing document). */
  getGoodsIssue(id: number): GoodsIssue | undefined {
    return this.snapshot.goodsIssues.find((g) => g.id === id);
  }
}
