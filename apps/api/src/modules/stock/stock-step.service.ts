import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { idValue, Role, StepStatus, type AssignmentDto } from '@bmi/shared';
import type { UnitOfWorkContext } from '@bmi/data-gateway';
import { createDefaultNumberGenerator } from '@bmi/config';
import type { CurrentUser } from '../../core/auth/current-user.js';
import { WorkOrdersService } from '../work-orders/work-orders.service.js';
import {
  GoodsIssue,
  GoodsIssueItem,
  PartsLedgerService,
} from './parts-ledger.service.js';
import { PartPurchaseStepService } from './part-purchase-step.service.js';

/** One warehouse line the executor stages on a Stock step (REQ-STK-002). */
export interface StagedIssueLine {
  /** Must be a SKU on the WO's required list (REQ-STK-002, AC-STK-003). */
  readonly sku: string;
  /** Quantity to issue from the warehouse. */
  readonly qty: number;
}

/** A confirmed shortfall for a line (REQ-STK-004, AC-STK-006). */
export interface ShortfallLine {
  readonly sku: string;
  readonly partName: string;
  /** The quantity that could not be issued (needed − on hand). */
  readonly missingQty: number;
  readonly unit: string;
}

/** The staged state of a Stock step before submit. */
interface StagedStock {
  /** Lines to issue from the warehouse (within the on-hand quantity). */
  readonly issueLines: readonly StagedIssueLine[];
  /** Shortfalls the Warehouse Manager confirmed (REQ-STK-004). */
  readonly shortfalls: readonly ShortfallLine[];
  /** At least one invoice/photo on the transaction (REQ-STK-009). */
  readonly hasAttachment: boolean;
  /** Set when a reversal of the posted issue is requested (REQ-STK-008). */
  readonly pendingReversalReason: string | null;
}

/** The WO required part list per step (`work_order_parts`, PRD §9.8). */
interface RequiredList {
  readonly sku: string;
  readonly partName: string;
  readonly unit: string;
}

/**
 * **Stock step** business rules (FG-4, REQ-STK, BR-01, BR-06, DEC-60).
 *
 * The Stock step cuts stock from the warehouse: issuing a line decrements stock,
 * writes a stock-card movement and keeps the line at the moving-average cost —
 * all in ONE transaction (REQ-STK-003). Issuing more than on hand is refused and
 * the Warehouse Manager confirms a shortfall, which adds a Part Purchase step
 * (REQ-STK-004, REQ-PUR-008). A posted issue is only ever undone through a
 * **verified reversal** (BR-06, TX-05) — never a silent delete.
 *
 * Phase-1 modelling: the staged issue lines, the WO required list per step and
 * the pending-reversal flag are API-layer in-memory state (the dummy gateway
 * carries no `work_order_parts` / `goods_issues`), keyed by assignment id;
 * TASK-201/202 re-home them behind the PRD §9.8 tables.
 */
@Injectable()
export class StockStepService {
  /** Staged state per Stock-step assignment id. */
  private readonly staged = new Map<number, StagedStock>();
  /** The WO required part list per Stock-step assignment id. */
  private readonly requiredLists = new Map<number, readonly RequiredList[]>();
  /** The goods-issue id posted by a step (so a reversal can find it). */
  private readonly postedGiByStep = new Map<number, number>();
  /** GI running-number generator (NFR-15; never reused across a cancel). */
  private numberGen = createDefaultNumberGenerator();

  constructor(
    private readonly ledger: PartsLedgerService,
    private readonly workOrders: WorkOrdersService,
    private readonly partPurchase: PartPurchaseStepService,
  ) {}

  /**
   * Set the WO's required part list for a Stock step (the parts the Planner put
   * on the WO). The executor may later issue only these SKUs (REQ-STK-002).
   * Seeded here in Phase-1; in production it is set in Create WO.
   */
  setRequiredList(stepId: number, list: readonly RequiredList[]): void {
    this.requiredLists.set(stepId, [...list]);
  }

  /** The required list of a step (empty if none set). */
  requiredListOf(stepId: number): readonly RequiredList[] {
    return this.requiredLists.get(stepId) ?? [];
  }

  /**
   * Stage the lines to issue on a Stock step (REQ-STK-002/004). Each SKU must be
   * on the WO required list; a quantity above the on-hand stock is refused for
   * the missing part — the Warehouse Manager confirms the shortfall, which
   * records a shortfall line (added as a Part Purchase step on submit, REQ-PUR-008).
   *
   * @throws BadRequestException on a SKU not on the list, or an over-issue with
   *         no shortfall confirmation (AC-STK-001).
   */
  stageIssue(
    step: AssignmentDto,
    input: {
      lines: readonly StagedIssueLine[];
      confirmShortfall?: boolean;
      hasAttachment?: boolean;
    },
  ): void {
    const stepId = idValue(step.id);
    const list = this.requiredListOf(stepId);
    const listSkus = new Set(list.map((l) => l.sku));

    const issueLines: StagedIssueLine[] = [];
    const shortfalls: ShortfallLine[] = [];
    for (const line of input.lines) {
      const sku = line.sku.trim();
      if (!listSkus.has(sku)) {
        // A part not on the WO list is not selectable (REQ-STK-002, AC-STK-003).
        throw new BadRequestException(
          `${sku} is not on the WO required list; raise a change request (REQ-STK-002).`,
        );
      }
      if (line.qty <= 0 || !Number.isInteger(line.qty)) {
        throw new BadRequestException(`Quantity must be a positive whole number for ${sku}.`);
      }
      const onHand = this.ledger.stockOf(sku);
      if (line.qty > onHand) {
        if (!input.confirmShortfall) {
          // Refuse the missing quantity (AC-STK-001: stock stays, no GI).
          throw new BadRequestException(
            `Only ${onHand} of ${sku} on hand (need ${line.qty}). Confirm a shortfall to buy the rest (REQ-STK-004).`,
          );
        }
        // Issue what is on hand; the rest is a confirmed shortfall (AC-STK-006).
        const part = this.ledger.getPart(sku);
        if (onHand > 0) {
          issueLines.push({ sku, qty: onHand });
        }
        shortfalls.push({
          sku,
          partName: part?.partName ?? sku,
          missingQty: line.qty - onHand,
          unit: part?.unit ?? 'pcs',
        });
      } else {
        issueLines.push({ sku, qty: line.qty });
      }
    }

    this.staged.set(stepId, {
      issueLines,
      shortfalls,
      hasAttachment: input.hasAttachment ?? false,
      pendingReversalReason: null,
    });
  }

  /** The staged state of a step (for the UI / tests). */
  stagedOf(stepId: number): StagedStock | undefined {
    return this.staged.get(stepId);
  }

  /**
   * Request a reversal of the step's posted goods issue with a reason
   * (REQ-STK-008). Stock does NOT change yet — it returns only when a Planner or
   * System Admin verifies the step/reversal (BR-06, TX-05, AC-STK-005).
   */
  requestReversal(step: AssignmentDto, reason: string): void {
    const stepId = idValue(step.id);
    if (!reason.trim()) {
      throw new BadRequestException('A reversal needs a reason (REQ-STK-008).');
    }
    if (!this.postedGiByStep.has(stepId)) {
      throw new ConflictException('No posted goods issue to reverse on this step.');
    }
    const current = this.staged.get(stepId) ?? {
      issueLines: [],
      shortfalls: [],
      hasAttachment: true,
      pendingReversalReason: null,
    };
    this.staged.set(stepId, { ...current, pendingReversalReason: reason.trim() });
  }

  // --- handler hooks (run inside the engine transaction) -------------------

  /**
   * The Stock step **submit** side effect (REQ-STK-003). Posts the goods issue
   * atomically: one `goods_issues` document, a stock-card GI row per line and a
   * decremented stock, all committed together by the ledger transaction; a
   * confirmed shortfall adds a Part Purchase step after this one (REQ-PUR-008).
   *
   * Runs inside the engine's `unitOfWork` (via the step-handler registry), so a
   * throw rolls back BOTH the ledger and the step-status write (REQ-STK-003
   * "nothing shall change").
   */
  async onSubmit(step: AssignmentDto, user: CurrentUser, ctx: UnitOfWorkContext): Promise<void> {
    const stepId = idValue(step.id);
    const staged = this.staged.get(stepId);
    // A Stock step with no staged warehouse lines and no shortfall is a no-op
    // issue (nothing to cut) — allowed (a step may carry only tyres, handled
    // elsewhere). Nothing to post.
    if (!staged || (staged.issueLines.length === 0 && staged.shortfalls.length === 0)) {
      return;
    }
    if (staged.issueLines.length > 0 && !staged.hasAttachment) {
      throw new BadRequestException('A Stock issue needs at least one invoice image (REQ-STK-009).');
    }
    const workOrderId = idValue(step.workOrderId);
    const wo = await ctx.repos.workOrders.requireById(workOrderId);
    const vehicleId = idValue(wo.vehicleId);
    const at = new Date().toISOString();

    if (staged.issueLines.length > 0) {
      const giNumber = this.numberGen.next('GI');
      const posted = this.ledger.transaction((tx) => {
        const giId = tx.nextGoodsIssueId();
        const items: GoodsIssueItem[] = staged.issueLines.map((line) =>
          tx.issueLine({
            sku: line.sku,
            qty: line.qty,
            referenceDocId: giNumber,
            workOrderId,
            vehicleId,
            userId: user.userId,
            at,
          }),
        );
        const gi: GoodsIssue = {
          id: giId,
          giNumber,
          workOrderId,
          assignmentId: stepId,
          vehicleId,
          issuedBy: user.userId,
          issuedDate: at,
          items,
          reversesGiId: null,
          reversalReason: null,
          reversalVerifiedBy: null,
        };
        tx.addGoodsIssue(gi);
        return gi;
      });
      this.postedGiByStep.set(stepId, posted.id);
    }

    // A confirmed shortfall adds a Part Purchase step right after this one
    // (REQ-STK-004 / REQ-PUR-008), with the missing quantities as its hint.
    if (staged.shortfalls.length > 0) {
      const purchaseStep = await this.workOrders.addPartPurchaseStepForShortfall(
        workOrderId,
        step.sequence,
        staged.shortfalls.map((s) => ({
          sku: s.sku,
          partName: s.partName,
          hintQty: s.missingQty,
          unit: s.unit,
        })),
        ctx,
      );
      if (purchaseStep) {
        this.partPurchase.setHints(
          idValue(purchaseStep.id),
          staged.shortfalls.map((s) => ({
            sku: s.sku,
            partName: s.partName,
            hintQty: s.missingQty,
            unit: s.unit,
          })),
        );
      }
    }
  }

  /**
   * The Stock step **verify** side effect — the *verified reversal* (BR-06,
   * TX-05, AC-STK-005). When a reversal was requested, verifying the step
   * returns the stock at the original unit cost and writes a reversing (GIR)
   * stock-card row; the original goods issue is kept, never deleted. A
   * verifier must be a Planner or System Admin (enforced by the engine).
   */
  onVerify(step: AssignmentDto, user: CurrentUser): void {
    const stepId = idValue(step.id);
    const staged = this.staged.get(stepId);
    if (!staged?.pendingReversalReason) {
      return;
    }
    if (!(user.role === Role.Planner || user.role === Role.SystemAdmin)) {
      throw new ConflictException('Only a Planner or System Admin may verify a reversal (REQ-STK-008).');
    }
    const giId = this.postedGiByStep.get(stepId);
    const original = giId === undefined ? undefined : this.ledger.getGoodsIssue(giId);
    if (!original) {
      throw new ConflictException('No posted goods issue to reverse.');
    }
    const workOrderId = idValue(step.workOrderId);
    const vehicleId = original.vehicleId;
    const reversalNumber = this.numberGen.next('GI');
    const at = new Date().toISOString();
    this.ledger.transaction((tx) => {
      for (const item of original.items) {
        tx.reverseLine({
          item,
          referenceDocId: reversalNumber,
          workOrderId,
          vehicleId,
          userId: user.userId,
          at,
        });
      }
      tx.addGoodsIssue({
        id: tx.nextGoodsIssueId(),
        giNumber: reversalNumber,
        workOrderId,
        assignmentId: stepId,
        vehicleId,
        issuedBy: user.userId,
        issuedDate: at,
        items: original.items,
        reversesGiId: original.id,
        reversalReason: staged.pendingReversalReason,
        reversalVerifiedBy: user.userId,
      });
    });
    // Clear the pending reversal so a re-verify is a no-op.
    this.staged.set(stepId, { ...staged, pendingReversalReason: null });
  }

  /** The goods-issue id this step posted, if any (for tests / the UI). */
  postedGoodsIssueIdOf(stepId: number): number | undefined {
    return this.postedGiByStep.get(stepId);
  }

  /** Test-only reset of staged state (the ledger resets separately). */
  resetForTests(): void {
    this.staged.clear();
    this.requiredLists.clear();
    this.postedGiByStep.clear();
    this.numberGen = createDefaultNumberGenerator();
  }

  /** Validate that a step is a Stock step in a state that can be staged. */
  assertStageable(step: AssignmentDto): void {
    if (step.moduleCode !== 'Stock') {
      throw new BadRequestException('Not a Stock step.');
    }
    if (step.status !== StepStatus.InProgress && step.status !== StepStatus.Open) {
      throw new ConflictException('Stage the Stock step while it is Open or In_Progress.');
    }
  }

  /** Read a step via the engine-independent gateway path (for the controller). */
  requireStep(step: AssignmentDto | null, id: number): AssignmentDto {
    if (!step) {
      throw new NotFoundException(`Unknown step: ${id}`);
    }
    return step;
  }
}
