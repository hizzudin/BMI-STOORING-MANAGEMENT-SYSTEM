import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { createDefaultNumberGenerator, roundAmount } from '@bmi/config';
import { PartsLedgerService, type Part, type StockCardRow } from '../stock/parts-ledger.service.js';

/** A posted Goods Receipt header (`goods_receipts`, PRD §9.8; SM-GR Posted). */
export interface GoodsReceipt {
  readonly id: number;
  readonly grNumber: string;
  readonly supplier: string | null;
  readonly invoiceNumber: string | null;
  readonly receiptDate: string;
  readonly postedBy: number;
  readonly postedAt: string;
  readonly lines: readonly {
    readonly sku: string;
    readonly qty: number;
    readonly unitPrice: number;
    readonly lineTotal: number;
  }[];
  readonly total: number;
  readonly corrections: GoodsReceiptCorrection[];
}

/** A GR correction (`gr_corrections`, PRD §9.8; a correcting movement, BR-06). */
export interface GoodsReceiptCorrection {
  readonly id: number;
  readonly grcNumber: string;
  readonly goodsReceiptId: number;
  readonly sku: string;
  readonly qtyDelta: number;
  readonly unitPrice: number | null;
  readonly reason: string;
  readonly postedBy: number;
  readonly postedAt: string;
}

/** A stock-opname document (`stock_adjustments`, PRD §9.8; SM-SA). */
export interface StockOpname {
  readonly id: number;
  readonly saNumber: string;
  status: 'Draft' | 'Pending_Approval' | 'Approved';
  readonly createdBy: number;
  readonly createdAt: string;
  submittedBy: number | null;
  approvedBy: number | null;
  approvedAt: string | null;
  selfApproved: boolean;
  returnedReason: string | null;
  readonly rows: readonly StockOpnameRow[];
}

/** One opname row (`stock_adjustment_items`, PRD §9.8). */
export interface StockOpnameRow {
  readonly sku: string;
  readonly systemQty: number;
  readonly physicalQty: number;
  readonly variance: number;
  readonly reasonCode: string | null;
  readonly note: string | null;
}

/**
 * **Parts inventory** (FG-8, REQ-BSL/REQ-INV): the ongoing parts catalog +
 * baseline master data, Goods Receipts & corrections, the stock card, and the
 * stock-opname approval flow.
 *
 * **Reuse, not reimplement.** The catalog and the moving-average rule live in
 * the Stock module's {@link PartsLedgerService} (TASK-109, DEC-60); this service
 * **consumes** it — Goods Receipt posts call `ledger.transaction(...).receiveLine`,
 * which recomputes the moving average through the single DEC-60 helper. The
 * Setup one-time opening balance (TASK-105 `OpeningBalanceService`) is a
 * **separate** path and is not duplicated here; this task owns the ongoing
 * lifecycle only.
 *
 * **Every stock change has a document (BR-06).** A Goods Receipt, a GR
 * correction and an approved stock-opname adjustment each carry a generated
 * running number (via `@bmi/config`, never reused, NFR-15) and write an
 * append-only stock-card row. A stock opname does **not** change stock until it
 * is approved (four-eyes, REQ-INV-011, BR-03/BR-12).
 *
 * Phase-1 modelling (recorded in design.md): the dummy gateway (TASK-102) carries
 * no `goods_receipts` / `gr_corrections` / `stock_adjustments` tables, so — as
 * with TASK-103..111 — the GR/GRC/opname documents live here as API-layer
 * in-memory state; the catalog + stock card are the reused `PartsLedgerService`.
 * TASK-201/202 re-home them behind the real PRD §9.8 tables unchanged.
 */
@Injectable()
export class PartsInventoryService {
  private readonly numbers = createDefaultNumberGenerator();
  private goodsReceipts: GoodsReceipt[] = [];
  private opnames: StockOpname[] = [];
  private nextGrId = 1;
  private nextGrcId = 1;
  private nextOpnameId = 1;

  constructor(private readonly ledger: PartsLedgerService) {}

  // --- catalog master data (REQ-INV-001/002/003) --------------------------

  listParts(): readonly Part[] {
    return this.ledger.listParts();
  }

  getPart(sku: string): Part {
    const part = this.ledger.getPart(sku);
    if (!part) {
      throw new NotFoundException(`Unknown part: ${sku}`);
    }
    return part;
  }

  addPart(input: Parameters<PartsLedgerService['addPart']>[0]): Part {
    return this.ledger.addPart(input);
  }

  editPart(sku: string, changes: Parameters<PartsLedgerService['updatePart']>[1]): Part {
    return this.ledger.updatePart(sku, changes);
  }

  deactivatePart(sku: string): Part {
    return this.ledger.deactivatePart(sku);
  }

  // --- stock card (REQ-INV-007) -------------------------------------------

  /** The running stock card of a SKU, newest first (REQ-INV-007). */
  stockCardOf(sku: string): readonly StockCardRow[] {
    if (!this.ledger.hasPart(sku)) {
      throw new NotFoundException(`Unknown part: ${sku}`);
    }
    return [...this.ledger.stockCardFor(sku)].reverse();
  }

  // --- Goods Receipt (REQ-INV-004, DEC-60, BR-06) -------------------------

  /** A posted Goods Receipt by id, or `undefined`. */
  goodsReceipt(id: number): GoodsReceipt | undefined {
    return this.goodsReceipts.find((g) => g.id === id);
  }

  listGoodsReceipts(): readonly GoodsReceipt[] {
    return [...this.goodsReceipts];
  }

  /**
   * Create and **post** a Goods Receipt (REQ-INV-004, no approval): raise stock,
   * recompute the moving-average cost (DEC-60) and write a GR stock-card row for
   * every line — all inside one ledger transaction so a bad line posts nothing
   * (all-or-nothing). Refuses an unknown or inactive SKU. Returns the posted
   * receipt.
   */
  postGoodsReceipt(
    input: {
      supplier?: string;
      invoiceNumber?: string;
      receiptDate?: string;
      lines: readonly { sku: string; qty: number; unitPrice: number; rack?: string }[];
    },
    userId: number,
  ): GoodsReceipt {
    if (input.lines.length === 0) {
      throw new BadRequestException('A Goods Receipt needs at least one line (REQ-INV-004).');
    }
    for (const line of input.lines) {
      const part = this.ledger.getPart(line.sku);
      if (!part) {
        throw new BadRequestException(`Unknown part: ${line.sku} (add it first, REQ-INV-002).`);
      }
      if (part.isActive === false) {
        throw new BadRequestException(`Part ${line.sku} is deactivated.`);
      }
    }
    const grNumber = this.numbers.next('GR');
    const at = input.receiptDate ?? new Date().toISOString();
    const lines = this.ledger.transaction((tx) =>
      input.lines.map((line) => {
        tx.receiveLine({
          sku: line.sku,
          qty: line.qty,
          unitPrice: line.unitPrice,
          referenceDocId: grNumber,
          userId,
          at,
        });
        if (line.rack !== undefined) {
          this.ledger.updatePart(line.sku, { rack: line.rack });
        }
        return {
          sku: line.sku,
          qty: line.qty,
          unitPrice: line.unitPrice,
          lineTotal: roundAmount(line.qty * line.unitPrice),
        };
      }),
    );
    const receipt: GoodsReceipt = {
      id: this.nextGrId++,
      grNumber,
      supplier: input.supplier ?? null,
      invoiceNumber: input.invoiceNumber ?? null,
      receiptDate: at,
      postedBy: userId,
      postedAt: new Date().toISOString(),
      lines,
      total: roundAmount(lines.reduce((sum, l) => sum + l.lineTotal, 0)),
      corrections: [],
    };
    this.goodsReceipts.push(receipt);
    return receipt;
  }

  /**
   * Post a **GR correction** against a posted receipt (REQ-INV-005, BR-06). A
   * posted receipt is never silently edited — the correction is a new, posted
   * correcting movement (GRC stock-card row) that adjusts stock, the average
   * cost and links back to the receipt. Refuses a SKU not on the original
   * receipt.
   */
  correctGoodsReceipt(
    goodsReceiptId: number,
    input: { sku: string; qtyDelta: number; unitPrice?: number; reason: string },
    userId: number,
  ): GoodsReceiptCorrection {
    const receipt = this.goodsReceipt(goodsReceiptId);
    if (!receipt) {
      throw new NotFoundException(`Unknown Goods Receipt: ${goodsReceiptId}`);
    }
    if (!receipt.lines.some((l) => l.sku === input.sku)) {
      throw new BadRequestException(
        `${input.sku} is not on Goods Receipt ${receipt.grNumber} (REQ-INV-005).`,
      );
    }
    if (input.qtyDelta === 0) {
      throw new BadRequestException('A GR correction must change the quantity (REQ-INV-005).');
    }
    const grcNumber = this.numbers.next('GRC');
    const at = new Date().toISOString();
    this.ledger.transaction((tx) =>
      tx.correctLine({
        sku: input.sku,
        qtyDelta: input.qtyDelta,
        unitPrice: input.unitPrice ?? null,
        referenceDocId: grcNumber,
        userId,
        at,
      }),
    );
    const correction: GoodsReceiptCorrection = {
      id: this.nextGrcId++,
      grcNumber,
      goodsReceiptId,
      sku: input.sku,
      qtyDelta: input.qtyDelta,
      unitPrice: input.unitPrice ?? null,
      reason: input.reason,
      postedBy: userId,
      postedAt: at,
    };
    receipt.corrections.push(correction);
    return correction;
  }

  // --- Stock opname (REQ-INV-010/011, BR-12, SM-SA) -----------------------

  opname(id: number): StockOpname | undefined {
    return this.opnames.find((o) => o.id === id);
  }

  listOpnames(): readonly StockOpname[] {
    return [...this.opnames];
  }

  /**
   * Create a **Draft** stock opname (REQ-INV-010). Each row's variance is
   * physical − system; a non-zero variance needs a reason code (else Submit is
   * refused later). Creating the Draft changes **no stock**.
   */
  createOpname(
    rows: readonly { sku: string; physicalQty: number; reasonCode?: string; note?: string }[],
    userId: number,
  ): StockOpname {
    if (rows.length === 0) {
      throw new BadRequestException('A stock opname needs at least one row (REQ-INV-010).');
    }
    const opnameRows: StockOpnameRow[] = rows.map((r) => {
      const part = this.ledger.getPart(r.sku);
      if (!part) {
        throw new BadRequestException(`Unknown part: ${r.sku}`);
      }
      const systemQty = part.stockQty;
      return {
        sku: r.sku,
        systemQty,
        physicalQty: r.physicalQty,
        variance: r.physicalQty - systemQty,
        reasonCode: r.reasonCode ?? null,
        note: r.note ?? null,
      };
    });
    const opname: StockOpname = {
      id: this.nextOpnameId++,
      saNumber: this.numbers.next('SA'),
      status: 'Draft',
      createdBy: userId,
      createdAt: new Date().toISOString(),
      submittedBy: null,
      approvedBy: null,
      approvedAt: null,
      selfApproved: false,
      returnedReason: null,
      rows: opnameRows,
    };
    this.opnames.push(opname);
    return opname;
  }

  /**
   * Submit a Draft opname for approval (SM-SA Submit). Refuses when any non-zero
   * variance has no reason code (REQ-INV-010, AC-INV-003). Still changes no
   * stock — the adjustment posts only on approval.
   */
  submitOpname(id: number, userId: number): StockOpname {
    const opname = this.requireOpname(id);
    if (opname.status !== 'Draft') {
      throw new BadRequestException(`Opname ${opname.saNumber} is not a Draft.`);
    }
    const missing = opname.rows.find((r) => r.variance !== 0 && !r.reasonCode);
    if (missing) {
      throw new BadRequestException(
        `${missing.sku} has a variance with no reason code (REQ-INV-010, AC-INV-003).`,
      );
    }
    opname.status = 'Pending_Approval';
    opname.submittedBy = userId;
    return opname;
  }

  /**
   * **Approve** a submitted opname (REQ-INV-011, BR-12): now — and only now —
   * set each system quantity to its physical quantity and write an SA stock-card
   * row for every non-zero variance, all in one ledger transaction. Four-eyes
   * (BR-03): the approver may not be the person who counted/submitted unless a
   * System Admin, who is marked self-approved. Returns the approved document.
   */
  approveOpname(id: number, approverId: number, isSystemAdmin: boolean): StockOpname {
    const opname = this.requireOpname(id);
    if (opname.status !== 'Pending_Approval') {
      throw new BadRequestException(`Opname ${opname.saNumber} is not awaiting approval.`);
    }
    const counter = opname.submittedBy ?? opname.createdBy;
    const isSelf = counter === approverId;
    if (isSelf && !isSystemAdmin) {
      throw new BadRequestException(
        'The person who counted cannot approve the opname (four-eyes, BR-03, AC-INV-004).',
      );
    }
    const at = new Date().toISOString();
    this.ledger.transaction((tx) => {
      for (const row of opname.rows) {
        if (row.variance === 0) {
          continue;
        }
        tx.adjustToPhysical({
          sku: row.sku,
          physicalQty: row.physicalQty,
          referenceDocId: opname.saNumber,
          userId: approverId,
          at,
        });
      }
    });
    opname.status = 'Approved';
    opname.approvedBy = approverId;
    opname.approvedAt = at;
    opname.selfApproved = isSelf && isSystemAdmin;
    return opname;
  }

  /** Reject a submitted opname with a reason (SM-SA, returns to Draft marked Returned). */
  rejectOpname(id: number, reason: string): StockOpname {
    const opname = this.requireOpname(id);
    if (opname.status !== 'Pending_Approval') {
      throw new BadRequestException(`Opname ${opname.saNumber} is not awaiting approval.`);
    }
    opname.status = 'Draft';
    opname.returnedReason = reason;
    return opname;
  }

  // --- test reset ----------------------------------------------------------

  resetForTests(): void {
    this.ledger.resetForTests();
    this.goodsReceipts = [];
    this.opnames = [];
    this.nextGrId = 1;
    this.nextGrcId = 1;
    this.nextOpnameId = 1;
  }

  private requireOpname(id: number): StockOpname {
    const opname = this.opname(id);
    if (!opname) {
      throw new NotFoundException(`Unknown stock opname: ${id}`);
    }
    return opname;
  }
}
