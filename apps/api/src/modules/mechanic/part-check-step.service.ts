import { BadRequestException, Injectable } from '@nestjs/common';
import {
  idValue,
  Role,
  Team,
  WorkOrderCategory,
  WorkOrderPriority,
  type AssignmentDto,
} from '@bmi/shared';
import type { UnitOfWorkContext } from '@bmi/data-gateway';
import { roundAmount } from '@bmi/config';
import type { CurrentUser } from '../../core/auth/current-user.js';
import { WorkOrdersService, type StepInput } from '../work-orders/work-orders.service.js';
import { PartsLedgerService } from '../stock/parts-ledger.service.js';
import { ServiceCatalogService } from './service-catalog.service.js';

/** A part the Planner/System Admin listed to check in Create WO (REQ-CHK-001). */
export interface CheckItem {
  readonly lineNo: number;
  /** A catalog SKU, a tyre position or a described part (at least one). */
  readonly sku: string | null;
  readonly tyrePosition: string | null;
  /** What the line shows, e.g. "Air brake hose, axle 2" (`label`). */
  readonly label: string;
  readonly whatToCheck: string | null;
  readonly addedByExecutor: boolean;
}

/** The executor's outcome for one checked part (REQ-CHK-002). */
export interface CheckResult {
  readonly lineNo: number;
  readonly label: string;
  readonly sku: string | null;
  readonly tyrePosition: string | null;
  readonly conditionNote: string;
  readonly decision: 'Good' | 'Repair' | 'Replace';
  readonly unsafeToDrive: boolean;
  readonly photos: readonly string[];
  readonly addedByExecutor: boolean;
}

/** An external check-service line input (REQ-CHK-007). */
export interface ExternalCheckLine {
  readonly description: string;
  readonly price: number;
}

/** Staged submit input for a Part Check step (REQ-CHK-002/007). */
export interface StagePartCheckInput {
  readonly team: Team;
  readonly results: readonly {
    lineNo: number;
    conditionNote: string;
    decision: 'Good' | 'Repair' | 'Replace';
    unsafeToDrive?: boolean;
    photos?: readonly string[];
  }[];
  readonly addedParts?: readonly {
    label: string;
    sku?: string;
    tyrePosition?: string;
    conditionNote: string;
    decision: 'Good' | 'Repair' | 'Replace';
    unsafeToDrive?: boolean;
    photos?: readonly string[];
  }[];
  readonly internalServices?: readonly { serviceCode: string }[];
  readonly vendor?: string;
  readonly externalServices?: readonly ExternalCheckLine[];
  readonly invoiceImages?: readonly string[];
}

/** A submitted Part Check (the completed results + the check service). */
export interface PartCheckSubmission {
  readonly stepId: number;
  readonly workOrderId: number;
  readonly team: Team;
  readonly results: readonly CheckResult[];
  /** The check-service cost billed with the check WO (REQ-CHK-007). */
  readonly serviceCost: number;
  readonly hasUnsafe: boolean;
}

/**
 * **Part Check step** business rules (FG-5, REQ-CHK, DEC-88, DEC-89).
 *
 * Troubleshooting: the Planner lists parts to check (REQ-CHK-001); the executor
 * writes each part's condition, decides Good/Repair/Replace, adds at least one
 * photo and MAY mark a Repair/Replace Unsafe to drive (REQ-CHK-002). Submit is
 * refused until every listed part is complete. The check's own cost is a check
 * **service** (internal catalog or external vendor, REQ-CHK-007) billed with the
 * check WO; repairs found are billed with the follow-up WO, never the check.
 *
 * **On VERIFY**, when at least one part is Repair or Replace, the step creates
 * **one follow-up Draft WO** (source `Part_Check`, linked to this step) for the
 * same vehicle with the not-good findings (REQ-CHK-003, DEC-88/89): a Replace
 * part becomes a Stock line when in stock or a Part Purchase line when not, a
 * tyre to replace adds a Part Replacement step, and each Repair becomes a line in
 * a Mechanic Action step. A Good-only check makes **no** draft. The draft is
 * created through {@link WorkOrdersService.createFollowUpDraftFromCheck} inside
 * the engine's verify `unitOfWork`, so it is **atomic** with the verification.
 * A draft is created **once** per step — a re-verify (or a discarded draft) makes
 * no new one (REQ-CHK-004).
 *
 * Phase-1 modelling: the listed check items, the submitted results, the check
 * service cost and the follow-up link are API-layer in-memory state keyed by
 * assignment / work-order id (the dummy gateway carries no
 * `work_order_check_items`); TASK-201/202 re-home them behind the PRD §9.6 table.
 */
@Injectable()
export class PartCheckStepService {
  /** The parts listed to check per Part-Check-step assignment id (REQ-CHK-001). */
  private readonly items = new Map<number, CheckItem[]>();
  /** Staged submit input per step id. */
  private readonly staged = new Map<number, StagePartCheckInput>();
  /** The submitted check per step id. */
  private readonly submissions = new Map<number, PartCheckSubmission>();
  /** The follow-up draft WO id created from a step (so it is made only once). */
  private readonly followUpByStep = new Map<number, number>();
  /** The check-service cost accumulated per check WO id (REQ-CHK-007). */
  private readonly serviceCost = new Map<number, number>();

  constructor(
    private readonly workOrders: WorkOrdersService,
    private readonly ledger: PartsLedgerService,
    private readonly catalog: ServiceCatalogService,
  ) {}

  /**
   * Set the parts the Planner listed to check on a step (REQ-CHK-001). At least
   * one line is required; Phase-1 this is seeded here, in production it is set in
   * Create WO.
   */
  setItems(stepId: number, items: readonly Omit<CheckItem, 'addedByExecutor'>[]): void {
    if (items.length === 0) {
      throw new BadRequestException('A Part Check lists at least one part to check (REQ-CHK-001).');
    }
    this.items.set(
      stepId,
      items.map((i) => ({ ...i, addedByExecutor: false })),
    );
  }

  /** The listed check items of a step (empty if none). */
  itemsOf(stepId: number): readonly CheckItem[] {
    return this.items.get(stepId) ?? [];
  }

  /** The submitted check of a step, or `undefined`. */
  submissionOf(stepId: number): PartCheckSubmission | undefined {
    return this.submissions.get(stepId);
  }

  /** The follow-up draft WO id created from a step, or `undefined`. */
  followUpWorkOrderIdOf(stepId: number): number | undefined {
    return this.followUpByStep.get(stepId);
  }

  /** The check-service cost accumulated for a check WO (0 if none). */
  serviceCostOf(workOrderId: number): number {
    return this.serviceCost.get(workOrderId) ?? 0;
  }

  /** Stage the step's submit input (before the engine submit runs). */
  stage(stepId: number, input: StagePartCheckInput): void {
    this.staged.set(stepId, input);
  }

  /** The staged input of a step, or `undefined`. */
  stagedOf(stepId: number): StagePartCheckInput | undefined {
    return this.staged.get(stepId);
  }

  /**
   * Validate and record a Part Check submission (REQ-CHK-002/007). Every listed
   * part must have a condition, a decision and at least one photo; a part marked
   * Unsafe must be Repair/Replace; the check service (internal catalog or
   * external vendor) must have at least one line. Returns the submission.
   */
  submit(step: AssignmentDto, input: StagePartCheckInput): PartCheckSubmission {
    const stepId = idValue(step.id);
    const workOrderId = idValue(step.workOrderId);
    const listed = this.itemsOf(stepId);
    const byLine = new Map(input.results.map((r) => [r.lineNo, r]));

    const results: CheckResult[] = [];
    // Every listed part must be completed (REQ-CHK-002, AC-CHK-001).
    for (const item of listed) {
      const r = byLine.get(item.lineNo);
      if (!r) {
        throw new BadRequestException(`"${item.label}" has no result; complete every part (REQ-CHK-002).`);
      }
      results.push(this.validateResult(item.label, item.sku, item.tyrePosition, r, false));
    }
    // Parts added by the executor follow the same rules (REQ-CHK-002).
    for (const a of input.addedParts ?? []) {
      results.push(
        this.validateResult(
          a.label,
          a.sku ?? null,
          a.tyrePosition ?? null,
          {
            lineNo: -1,
            conditionNote: a.conditionNote,
            decision: a.decision,
            ...(a.unsafeToDrive === undefined ? {} : { unsafeToDrive: a.unsafeToDrive }),
            ...(a.photos === undefined ? {} : { photos: a.photos }),
          },
          true,
        ),
      );
    }

    // The check service (REQ-CHK-007): at least one line, internal or external.
    const serviceCost = this.computeServiceCost(input);

    const submission: PartCheckSubmission = {
      stepId,
      workOrderId,
      team: input.team,
      results,
      serviceCost,
      hasUnsafe: results.some((r) => r.unsafeToDrive),
    };
    this.submissions.set(stepId, submission);
    this.serviceCost.set(workOrderId, roundAmount(this.serviceCostOf(workOrderId) + serviceCost));
    return submission;
  }

  // --- handler hooks (run inside the engine transaction) -------------------

  /** The engine **submit** hook: record the staged Part Check (REQ-CHK-002/007). */
  onSubmit(step: AssignmentDto): void {
    const stepId = idValue(step.id);
    const input = this.staged.get(stepId);
    if (!input) {
      throw new BadRequestException('Fill the Part Check step before submitting (REQ-CHK-002).');
    }
    this.submit(step, input);
    this.staged.delete(stepId);
  }

  /**
   * The engine **verify** hook (REQ-CHK-003, DEC-88/89). When at least one part
   * is Repair or Replace, create **one** follow-up Draft WO from the findings —
   * atomically within the engine's verify `unitOfWork`. A Good-only check makes
   * no draft; a draft is created only once per step (a re-verify is a no-op,
   * REQ-CHK-004).
   */
  async onVerify(step: AssignmentDto, user: CurrentUser, ctx: UnitOfWorkContext): Promise<void> {
    const stepId = idValue(step.id);
    const submission = this.submissions.get(stepId);
    if (!submission) {
      // Nothing was submitted for this step — nothing to follow up.
      return;
    }
    // REQ-CHK-004: a draft is created only once per check step.
    if (this.followUpByStep.has(stepId)) {
      return;
    }
    const notGood = submission.results.filter((r) => r.decision !== 'Good');
    if (notGood.length === 0) {
      // Good-only: no follow-up draft (REQ-CHK-003, AC-CHK-002).
      return;
    }

    const checkWorkOrderId = idValue(step.workOrderId);
    const checkWo = await ctx.repos.workOrders.requireById(checkWorkOrderId);
    const steps = this.buildFollowUpSteps(notGood);

    // Category Tyre when only tyres are not-good, else Corrective (REQ-CHK-003).
    const onlyTyres = notGood.every((r) => r.tyrePosition !== null);
    const category = onlyTyres ? WorkOrderCategory.Tyre : WorkOrderCategory.Corrective;
    // Priority Urgent when any finding is Unsafe, else the check WO's priority.
    const priority = submission.hasUnsafe ? WorkOrderPriority.Urgent : checkWo.priority;
    const findingNote = notGood
      .map((r) => `${r.label}: ${r.decision}${r.unsafeToDrive ? ' (Unsafe to drive)' : ''} — ${r.conditionNote}`)
      .join('\n');

    const draft = await this.workOrders.createFollowUpDraftFromCheck(
      {
        vehicleId: idValue(checkWo.vehicleId),
        checkWorkOrderId,
        sourceAssignmentId: stepId,
        category,
        priority,
        requiresDowntime: checkWo.requiresDowntime,
        description: `Follow-up from Part Check ${checkWo.number}`,
        findingNote,
        createdBy: user.userId,
        steps,
      },
      ctx,
    );
    this.followUpByStep.set(stepId, idValue(draft.id));
  }

  // --- internals -----------------------------------------------------------

  /**
   * Build the follow-up WO's steps from the not-good findings (REQ-CHK-003):
   *  - a Replace part → a Stock line (in stock) or a Part Purchase line (not);
   *  - a tyre to replace → a Part Replacement step for its position;
   *  - each Repair → a line of work in a (single) Mechanic Action step.
   * Modules are resolved by code against the registry in the WO service; here we
   * only name the module code and its executor/verifier roles (REQ-REG-006).
   */
  private buildFollowUpSteps(notGood: readonly CheckResult[]): StepInput[] {
    const steps: StepInput[] = [];

    // Tyre replacements → one Part Replacement step per tyre position.
    const tyreReplacements = notGood.filter((r) => r.decision === 'Replace' && r.tyrePosition !== null);
    for (const t of tyreReplacements) {
      steps.push({
        module: 'Part_Replacement',
        executorRoles: [Role.Mechanic],
        verifierRole: Role.Planner,
        stepConfig: { tyrePosition: t.tyrePosition, fromCheckLabel: t.label },
      });
    }

    // Non-tyre Replace parts → a Stock step (in stock) and/or a Part Purchase step.
    const replaceParts = notGood.filter((r) => r.decision === 'Replace' && r.tyrePosition === null);
    const inStock = replaceParts.filter((r) => r.sku !== null && this.ledger.stockOf(r.sku) > 0);
    const notInStock = replaceParts.filter((r) => !(r.sku !== null && this.ledger.stockOf(r.sku) > 0));
    if (inStock.length > 0) {
      steps.push({
        module: 'Stock',
        executorRoles: [Role.WarehouseManager],
        verifierRole: Role.Planner,
        stepConfig: {
          requiredParts: inStock.map((r) => ({ sku: r.sku, partName: r.label })),
        },
      });
    }
    if (notInStock.length > 0) {
      steps.push({
        module: 'Part_Purchase',
        executorRoles: [Role.WarehouseManager],
        verifierRole: Role.Planner,
        stepConfig: {
          purchaseParts: notInStock.map((r) => ({ sku: r.sku, partName: r.label })),
        },
      });
    }

    // Each Repair → a line of work in ONE Mechanic Action step (REQ-CHK-003).
    const repairs = notGood.filter((r) => r.decision === 'Repair');
    if (repairs.length > 0) {
      steps.push({
        module: 'Mechanic_Action',
        executorRoles: [Role.Mechanic],
        verifierRole: Role.Planner,
        stepConfig: {
          repairJobs: repairs.map((r) => ({ label: r.label, conditionNote: r.conditionNote })),
        },
      });
    }

    // A defensive guard: a not-good finding always yields at least one step.
    if (steps.length === 0) {
      steps.push({
        module: 'Mechanic_Action',
        executorRoles: [Role.Mechanic],
        verifierRole: Role.Planner,
        stepConfig: { repairJobs: notGood.map((r) => ({ label: r.label, conditionNote: r.conditionNote })) },
      });
    }
    return steps;
  }

  /** Validate one result line against the submit rules (REQ-CHK-002). */
  private validateResult(
    label: string,
    sku: string | null,
    tyrePosition: string | null,
    r: StagePartCheckInput['results'][number],
    addedByExecutor: boolean,
  ): CheckResult {
    if (!r.conditionNote?.trim()) {
      throw new BadRequestException(`"${label}" needs a condition note (REQ-CHK-002).`);
    }
    const unsafe = r.unsafeToDrive ?? false;
    if (unsafe && r.decision === 'Good') {
      throw new BadRequestException(`"${label}" cannot be Good and Unsafe to drive (REQ-CHK-002).`);
    }
    // At least one Check_Photo per line (REQ-CHK-002, AC-CHK-001).
    if ((r.photos ?? []).length === 0) {
      throw new BadRequestException(`"${label}" needs at least one photo (REQ-CHK-002).`);
    }
    return {
      lineNo: r.lineNo,
      label,
      sku,
      tyrePosition,
      conditionNote: r.conditionNote.trim(),
      decision: r.decision,
      unsafeToDrive: unsafe,
      photos: [...(r.photos ?? [])],
      addedByExecutor,
    };
  }

  /** The check-service cost (internal catalog or external vendor, REQ-CHK-007). */
  private computeServiceCost(input: StagePartCheckInput): number {
    if (input.team === Team.Internal) {
      const services = input.internalServices ?? [];
      if (services.length === 0) {
        throw new BadRequestException(
          'A Part Check needs at least one catalog check service (REQ-CHK-007, AC-CHK-004).',
        );
      }
      return roundAmount(
        services.reduce((sum, s) => sum + this.catalog.require(s.serviceCode).standardPrice, 0),
      );
    }
    const services = input.externalServices ?? [];
    if (!input.vendor?.trim()) {
      throw new BadRequestException('An external check needs a vendor (REQ-CHK-007).');
    }
    if (services.length === 0) {
      throw new BadRequestException('An external check needs at least one service line (REQ-CHK-007).');
    }
    if ((input.invoiceImages ?? []).length === 0) {
      throw new BadRequestException('An external check needs at least one invoice image (REQ-CHK-007).');
    }
    return roundAmount(services.reduce((sum, s) => sum + Math.max(0, s.price), 0));
  }

  /** Test-only reset of all Part Check state. */
  resetForTests(): void {
    this.items.clear();
    this.staged.clear();
    this.submissions.clear();
    this.followUpByStep.clear();
    this.serviceCost.clear();
  }
}
