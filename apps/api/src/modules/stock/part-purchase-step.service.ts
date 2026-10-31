import { BadRequestException, Injectable } from '@nestjs/common';
import { idValue, type AssignmentDto } from '@bmi/shared';
import { roundAmount } from '@bmi/config';

/** A hint line pre-filled on the step (planned part, or a Stock shortfall). */
export interface PurchaseHint {
  readonly sku: string;
  readonly partName: string;
  /** The suggested quantity (shortfall) shown as a hint; may be exceeded (REQ-PUR-002). */
  readonly hintQty: number | null;
  readonly unit: string;
}

/** A typed purchase line (`work_order_purchase_lines`, PRD §9.8). */
export interface PurchaseLineInput {
  readonly sku: string;
  readonly quantity: number;
  readonly unitPrice: number;
}

/** A computed purchase line with its live total (REQ-PUR-003). */
export interface PurchaseLine {
  readonly sku: string;
  readonly itemName: string;
  readonly quantity: number;
  readonly unit: string;
  readonly unitPrice: number;
  /** `quantity × unit_price`, 2 dp half-up (NFR-16). */
  readonly lineTotal: number;
}

/** A submitted Part Purchase document (`work_order_purchases`, PRD §9.8). */
export interface WorkOrderPurchase {
  readonly stepId: number;
  readonly workOrderId: number;
  readonly vendor: string;
  readonly receiptNumber: string | null;
  readonly receiptDate: string;
  readonly lines: readonly PurchaseLine[];
  /** Sum of the line totals (REQ-PUR-003). */
  readonly calculatedTotal: number;
  /** Set when submitted with no lines (REQ-PUR-007). */
  readonly nothingBoughtReason: string | null;
}

/** Input to submit a Part Purchase step (REQ-PUR-002..007). */
export interface SubmitPurchaseInput {
  readonly lines: readonly PurchaseLineInput[];
  readonly vendor?: string;
  readonly receiptNumber?: string;
  readonly receiptDate?: string;
  /** At least one receipt photo reference (REQ-PUR-004). */
  readonly receiptPhoto?: string;
  /** Reason, required when there are no lines (REQ-PUR-007). */
  readonly nothingBoughtReason?: string;
}

/**
 * **Part Purchase step** business rules (FG-4, REQ-PUR, DEC-60, TX-21).
 *
 * Records parts bought outside for one WO as they appear on the shop's receipt.
 * The executor types the quantity actually bought and each unit price; the step
 * shows each line total and a calculated grand total (REQ-PUR-003) computed with
 * `@bmi/config` money rounding (half-up, Rp — never an ad-hoc rounding). On
 * submit it stores the purchase, requires a vendor + receipt date + a receipt
 * photo (unless nothing was bought, REQ-PUR-007), and **adds the total to the WO
 * parts cost** — it NEVER touches warehouse stock, the stock card or the parts
 * catalog (REQ-PUR-006, BR-06, TX-21).
 *
 * Phase-1 modelling: the hint lines, the submitted purchase and the WO parts
 * cost are API-layer in-memory state (the dummy gateway carries no
 * `work_order_purchases` / `work_orders.parts_cost`), keyed by assignment /
 * work-order id; TASK-201/202 re-home them behind the PRD §9.8 columns.
 */
@Injectable()
export class PartPurchaseStepService {
  /** Hint lines per Part-Purchase-step assignment id. */
  private readonly hints = new Map<number, readonly PurchaseHint[]>();
  /** Staged submit input per step id (set before the engine submit). */
  private readonly staged = new Map<number, SubmitPurchaseInput>();
  /** Submitted purchase per step id. */
  private readonly purchases = new Map<number, WorkOrderPurchase>();
  /** Accumulated parts cost per WO id (REQ-PUR-006). */
  private readonly partsCost = new Map<number, number>();

  /** Set (or extend) the hint lines of a Part Purchase step. */
  setHints(stepId: number, hints: readonly PurchaseHint[]): void {
    const existing = this.hints.get(stepId) ?? [];
    this.hints.set(stepId, [...existing, ...hints]);
  }

  /** The hint lines of a step (empty if none). */
  hintsOf(stepId: number): readonly PurchaseHint[] {
    return this.hints.get(stepId) ?? [];
  }

  /** Stage the submit input for a step (before the engine submit runs). */
  stage(stepId: number, input: SubmitPurchaseInput): void {
    this.staged.set(stepId, input);
  }

  /** The staged submit input of a step, or `undefined`. */
  stagedOf(stepId: number): SubmitPurchaseInput | undefined {
    return this.staged.get(stepId);
  }

  /**
   * Compute each line total and the grand total **without saving** (REQ-PUR-003,
   * AC-PUR-001/002) — the figure that updates live as the buyer types. Each line
   * total is `quantity × unit_price` rounded half-up to a whole rupiah; the grand
   * total is the sum.
   */
  computeTotals(lines: readonly PurchaseLineInput[]): { lines: PurchaseLine[]; total: number } {
    const computed: PurchaseLine[] = lines.map((line) => {
      if (line.quantity <= 0) {
        throw new BadRequestException(`Quantity must be positive for ${line.sku}.`);
      }
      if (line.unitPrice < 0) {
        throw new BadRequestException(`Unit price must not be negative for ${line.sku}.`);
      }
      const lineTotal = roundAmount(line.quantity * line.unitPrice);
      return {
        sku: line.sku,
        itemName: line.sku,
        quantity: line.quantity,
        unit: 'pcs',
        unitPrice: line.unitPrice,
        lineTotal,
      };
    });
    const total = roundAmount(computed.reduce((sum, l) => sum + l.lineTotal, 0));
    return { lines: computed, total };
  }

  /**
   * The **submit** side effect of a Part Purchase step (REQ-PUR-002..006,
   * TX-21). Validates the typed lines against the step's hint list (a line's SKU
   * must be a planned/hinted part — a wrong part needs a change request,
   * REQ-PUR-002), requires a vendor + receipt date + receipt photo (unless
   * nothing was bought), stores the purchase with its calculated total, and adds
   * that total to the WO parts cost. It performs **no stock change**.
   *
   * Runs inside the engine transaction via the step-handler registry, but it
   * only mutates in-memory purchase state — by design it never touches the
   * ledger (REQ-PUR-006).
   */
  submit(step: AssignmentDto, input: SubmitPurchaseInput): WorkOrderPurchase {
    const stepId = idValue(step.id);
    const workOrderId = idValue(step.workOrderId);
    const hintSkus = new Set(this.hintsOf(stepId).map((h) => h.sku));

    if (input.lines.length === 0) {
      // Nothing had to be bought — allowed with a reason (REQ-PUR-007).
      if (!input.nothingBoughtReason?.trim()) {
        throw new BadRequestException('Submitting with no lines needs a reason (REQ-PUR-007).');
      }
      const purchase: WorkOrderPurchase = {
        stepId,
        workOrderId,
        vendor: input.vendor?.trim() ?? 'Other',
        receiptNumber: input.receiptNumber?.trim() ?? null,
        receiptDate: input.receiptDate ?? new Date().toISOString().slice(0, 10),
        lines: [],
        calculatedTotal: 0,
        nothingBoughtReason: input.nothingBoughtReason.trim(),
      };
      this.purchases.set(stepId, purchase);
      return purchase;
    }

    // With lines: vendor, receipt date and at least one receipt photo required
    // (REQ-PUR-004).
    if (!input.vendor?.trim()) {
      throw new BadRequestException('A vendor is required (REQ-PUR-004).');
    }
    if (!input.receiptDate?.trim()) {
      throw new BadRequestException('A receipt date is required (REQ-PUR-004).');
    }
    if (!input.receiptPhoto?.trim()) {
      throw new BadRequestException('At least one receipt photo is required (REQ-PUR-004).');
    }
    // Every line's SKU must be on the hint list — the executor may not add a
    // part that is not on the WO (REQ-PUR-002, AC-PUR-006).
    for (const line of input.lines) {
      if (hintSkus.size > 0 && !hintSkus.has(line.sku.trim())) {
        throw new BadRequestException(
          `${line.sku} is not on the WO purchase list; raise a change request (REQ-PUR-002).`,
        );
      }
    }

    const { lines, total } = this.computeTotals(input.lines);
    // Name each line from its hint when available (snapshot, REQ-PUR-002).
    const hintByKey = new Map(this.hintsOf(stepId).map((h) => [h.sku, h]));
    const named: PurchaseLine[] = lines.map((l) => {
      const hint = hintByKey.get(l.sku);
      return hint ? { ...l, itemName: hint.partName, unit: hint.unit } : l;
    });

    const purchase: WorkOrderPurchase = {
      stepId,
      workOrderId,
      vendor: input.vendor.trim(),
      receiptNumber: input.receiptNumber?.trim() ?? null,
      receiptDate: input.receiptDate,
      lines: named,
      calculatedTotal: total,
      nothingBoughtReason: null,
    };
    this.purchases.set(stepId, purchase);
    // Add the calculated total to the WO parts cost (REQ-PUR-006) — the only
    // state a purchase changes besides its own rows; NO stock movement.
    this.partsCost.set(workOrderId, roundAmount((this.partsCost.get(workOrderId) ?? 0) + total));
    return purchase;
  }

  /**
   * The engine **submit** hook: record the staged purchase for this step
   * (REQ-PUR, TX-21). Runs inside the engine transaction via the step-handler
   * registry; it changes no warehouse stock (REQ-PUR-006). A missing stage is a
   * programming error surfaced as a 400.
   */
  onSubmit(step: AssignmentDto): void {
    const stepId = idValue(step.id);
    const input = this.staged.get(stepId);
    if (!input) {
      throw new BadRequestException('Stage the Part Purchase lines before submitting (REQ-PUR-002).');
    }
    this.submit(step, input);
    this.staged.delete(stepId);
  }

  /** The submitted purchase of a step, or `undefined`. */
  purchaseOf(stepId: number): WorkOrderPurchase | undefined {
    return this.purchases.get(stepId);
  }

  /** The accumulated parts cost of a WO (0 if none). */
  partsCostOf(workOrderId: number): number {
    return this.partsCost.get(workOrderId) ?? 0;
  }

  /** Test-only reset of all purchase state. */
  resetForTests(): void {
    this.hints.clear();
    this.staged.clear();
    this.purchases.clear();
    this.partsCost.clear();
  }
}
