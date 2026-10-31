import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Role,
  StepStatus,
  StepEvent,
  smStep,
  WorkOrderStatus,
  WorkOrderEvent,
  WorkOrderSource,
  WorkOrderCategory,
  WorkOrderPriority,
  VehicleStatus,
  Team,
  FINDING_NOTE_REQUIRED_SOURCES,
  WORK_ORDER_PRIORITY_ORDER,
  smWorkOrder,
  InvalidTransitionError,
  idValue,
  toId,
  type WorkOrderDto,
  type AssignmentDto,
} from '@bmi/shared';
import type { DataGateway, UnitOfWorkContext } from '@bmi/data-gateway';
import { createDefaultNumberGenerator } from '@bmi/config';
import { DATA_GATEWAY } from '../../core/data-gateway/data-gateway.module.js';
import type { CurrentUser } from '../../core/auth/current-user.js';
import { ModuleRegistryService } from '../registry/module-registry.service.js';
import { PresetService } from '../registry/preset.service.js';
import { ComposerCheckService } from '../registry/composer-check.service.js';
import { StepTimeEventService } from '../assignments/step-time-event.service.js';

/** Roles that may only draft a WO, never activate it (REQ-WO-003/014/016, BR-03). */
const DRAFT_ONLY_ROLES: ReadonlySet<Role> = new Set([
  Role.FieldCoordinator,
  Role.Mechanic,
  Role.Driver,
]);

/** The default WO source for a role that creates a WO directly (REQ-WO-002). */
const SOURCE_BY_ROLE: Partial<Record<Role, WorkOrderSource>> = {
  [Role.Planner]: WorkOrderSource.ManualPlanner,
  [Role.SystemAdmin]: WorkOrderSource.ManualAdmin,
  [Role.Mechanic]: WorkOrderSource.ManualMechanic,
  [Role.FieldCoordinator]: WorkOrderSource.ManualFieldCoordinator,
};

/** A composed step as a WO service input (resolved against the registry). */
export interface StepInput {
  module: string;
  executorRoles: Role[];
  verifierRole: Role;
  isOptional?: boolean;
  stepConfig?: Record<string, unknown>;
}

export interface CreateWorkOrderInput {
  vehicleId: number;
  title: string;
  category: WorkOrderCategory;
  priority?: WorkOrderPriority;
  requiresDowntime?: boolean;
  description: string;
  findingNote?: string;
  source?: WorkOrderSource;
  steps?: StepInput[];
  presetId?: number;
}

/**
 * **Work Order lifecycle** (FG-1, REQ-WO, SM-WO, BR-02, BR-03, DEC-87).
 *
 * Owns create / submit (send-for-review / activate) / approve / reject / cancel
 * / amend, enforcing SM-WO (a transition not in PRD §3.2 is refused), the
 * draft-only discipline (Field Coordinator / Mechanic / Driver draft only;
 * Planner activates, Supervisor approves — §2.2 + BR-03), four-eyes (BR-03:
 * approver ≠ creator unless System Admin), the scope lock (BR-02: once Active
 * its scope is locked, changes go through amendment), the field-finding note
 * rules (REQ-WO-016) and the priority urgency label / ordering (REQ-WO-015).
 *
 * It builds `work_order_assignments` from the composed steps, each step's rules
 * read from its registry row (module-agnostic, REQ-REG-006), may copy a preset
 * version's steps (REQ-ENG-004, never following it), and gates Submit with
 * {@link ComposerCheckService.check} (REQ-REG-004). All writes go through the
 * gateway's version-checked `unitOfWork`; the step engine lives in
 * {@link AssignmentsService} (wired with `forwardRef`).
 */
@Injectable()
export class WorkOrdersService {
  /** Phase-1 WO running-number generator (NFR-15); re-homed behind a sequence later. */
  private numberGen = createDefaultNumberGenerator();

  constructor(
    @Inject(DATA_GATEWAY) private readonly gateway: DataGateway,
    private readonly registry: ModuleRegistryService,
    private readonly presets: PresetService,
    private readonly composer: ComposerCheckService,
    private readonly timeEvents: StepTimeEventService,
  ) {}

  // --- create (SM-WO T1) ---------------------------------------------------

  /**
   * Create a WO (REQ-WO-001) or a review draft (REQ-WO-014/016). A Field
   * Coordinator / Mechanic / Driver may draft only (never activate, BR-03).
   * Refused if the vehicle is Inactive (REQ-WO-013; OFF does NOT block, DEC-92).
   */
  async create(user: CurrentUser, input: CreateWorkOrderInput): Promise<WorkOrderDto> {
    const vehicle = await this.gateway.repos.vehicles.getById(input.vehicleId);
    if (!vehicle) {
      throw new NotFoundException(`Unknown vehicle: ${input.vehicleId}`);
    }
    // REQ-WO-013: only Inactive blocks WO create; OFF does not (DEC-92).
    if (vehicle.status === VehicleStatus.Inactive) {
      throw new ConflictException('Cannot create a WO for an Inactive vehicle (REQ-WO-013).');
    }

    const source = input.source ?? SOURCE_BY_ROLE[user.role] ?? WorkOrderSource.ManualPlanner;
    const steps = this.resolveSteps(input);
    // A FC/Mechanic review draft carries no steps (REQ-WO-016).
    const isDraftOnlyRole = DRAFT_ONLY_ROLES.has(user.role);

    return this.gateway.unitOfWork(async (ctx) => {
      const number = this.nextNumber();
      const created = await ctx.repos.workOrders.insert(
        this.newWorkOrderRow({
          number,
          vehicleId: input.vehicleId,
          source,
          category: input.category,
          priority: input.priority ?? WorkOrderPriority.Normal,
          requiresDowntime: input.requiresDowntime ?? true,
          description: input.description,
          findingNote: input.findingNote ?? null,
          presetId: input.presetId ?? null,
          createdBy: user.userId,
        }),
      );
      if (!isDraftOnlyRole) {
        await this.insertSteps(ctx, idValue(created.id), steps);
      }
      return created;
    });
  }

  /**
   * Create a `Driver_Breakdown` auto-draft pre-seeded with exactly one
   * Mobilisasi step at the driver's captured location (REQ-WO-003, REQ-MBL-001).
   * finding_note is copied from the breakdown description (DEC-91). The Planner
   * composes the remaining steps later; here we build only the one step.
   */
  async createBreakdownDraft(input: {
    vehicleId: number;
    description: string;
    createdBy: number;
    locationLat?: number;
    locationLng?: number;
    breakdownReportId?: number;
  }): Promise<WorkOrderDto> {
    const vehicle = await this.gateway.repos.vehicles.getById(input.vehicleId);
    if (!vehicle) {
      throw new NotFoundException(`Unknown vehicle: ${input.vehicleId}`);
    }
    if (vehicle.status === VehicleStatus.Inactive) {
      throw new ConflictException('Cannot create a WO for an Inactive vehicle (REQ-WO-013).');
    }
    if (!input.description.trim()) {
      throw new BadRequestException('A breakdown report needs a description (REQ-WO-016).');
    }
    const mobilisasi = this.registry.require('Mobilisasi');

    return this.gateway.unitOfWork(async (ctx) => {
      const number = this.nextNumber();
      const created = await ctx.repos.workOrders.insert(
        this.newWorkOrderRow({
          number,
          vehicleId: input.vehicleId,
          source: WorkOrderSource.DriverBreakdown,
          category: WorkOrderCategory.Corrective,
          priority: WorkOrderPriority.High,
          requiresDowntime: true,
          description: input.description.trim(),
          // DEC-91: driver drafts auto-copy finding_note from the breakdown.
          findingNote: input.description.trim(),
          presetId: null,
          createdBy: input.createdBy,
        }),
      );
      // Exactly one pre-seeded Mobilisasi step at the captured location.
      await ctx.repos.assignments.insert(
        this.newAssignmentRow({
          workOrderId: idValue(created.id),
          moduleId: mobilisasi.id,
          moduleCode: mobilisasi.code,
          sequence: 1,
          executorRoles: [...mobilisasi.executorRoles],
          verifierRole: Role.Planner,
          stepConfig: {
            ...(input.locationLat === undefined ? {} : { locationLat: input.locationLat }),
            ...(input.locationLng === undefined ? {} : { locationLng: input.locationLng }),
            ...(input.breakdownReportId === undefined ? {} : { breakdownReportId: input.breakdownReportId }),
          },
        }),
      );
      return created;
    });
  }

  // --- submit (SM-WO T2 / T5) ----------------------------------------------

  /**
   * Submit a draft for approval (Planner / System Admin, SM-WO T2) — "activate".
   * Gated by the composer check (REQ-REG-004 / AC-WO-003: a step with an empty
   * required section or no step refuses submit) and the four-eyes creator stays
   * the creator. A draft-only role cannot reach this (guarded + BR-03).
   */
  async submitForApproval(id: number, user: CurrentUser, version: number): Promise<WorkOrderDto> {
    if (DRAFT_ONLY_ROLES.has(user.role)) {
      throw new ConflictException(
        'A Field Coordinator, Mechanic or Driver may only draft; the Planner submits for approval (REQ-WO-016, BR-03).',
      );
    }
    return this.gateway.unitOfWork(async (ctx) => {
      const wo = await this.loadForWrite(ctx, id, version);
      const steps = await ctx.repos.assignments.findBy('workOrderId', wo.id);
      this.assertComposerAllowsSubmit(steps);
      const nextStatus = this.applyWo(wo, wo.status === WorkOrderStatus.Rejected ? WorkOrderEvent.EditAndResubmit : WorkOrderEvent.Submit);
      return ctx.repos.workOrders.update({ ...wo, status: nextStatus });
    });
  }

  /**
   * Send a draft for review (Field Coordinator / Mechanic, REQ-WO-016). Keeps
   * the WO Draft, marks it Sent for review. A non-empty finding_note is
   * required; the server refuses an empty one.
   */
  async sendForReview(id: number, user: CurrentUser, version: number): Promise<WorkOrderDto> {
    if (!DRAFT_ONLY_ROLES.has(user.role)) {
      throw new ConflictException('Only a Field Coordinator or Mechanic sends a draft for review (REQ-WO-016).');
    }
    return this.gateway.unitOfWork(async (ctx) => {
      const wo = await this.loadForWrite(ctx, id, version);
      if (wo.status !== WorkOrderStatus.Draft) {
        throw new ConflictException('Only a Draft WO can be sent for review (REQ-WO-016).');
      }
      // REQ-WO-016: a FC/Mechanic draft needs a non-empty finding_note.
      if (FINDING_NOTE_REQUIRED_SOURCES.includes(wo.source) && !wo.findingNote?.trim()) {
        throw new BadRequestException(
          'A field-finding note is required before sending the draft for review (REQ-WO-016).',
        );
      }
      return ctx.repos.workOrders.update({ ...wo, sentForReviewAt: new Date().toISOString() });
    });
  }

  // --- approve / reject (SM-WO T3 / T4) ------------------------------------

  /**
   * Approve creation (Approver, SM-WO T3): four-eyes (BR-03 — the approver must
   * differ from the creator unless System Admin, who is marked Self-approved),
   * set the WO Active, freeze its steps, open step 1 and lock the rest
   * (REQ-WO-005). Steps are frozen at this point (scope lock, BR-02).
   */
  async approve(id: number, user: CurrentUser, version: number): Promise<WorkOrderDto> {
    return this.gateway.unitOfWork(async (ctx) => {
      const wo = await this.loadForWrite(ctx, id, version);
      const isSelf = idValue(wo.createdBy) === user.userId;
      // BR-03 four-eyes: approver ≠ creator, unless System Admin (self-approve marked).
      if (isSelf && user.role !== Role.SystemAdmin) {
        throw new ConflictException(
          'The approver may not be the WO creator (BR-03, REQ-WO-006).',
        );
      }
      const steps = await ctx.repos.assignments.findBy('workOrderId', wo.id);
      this.assertComposerAllowsSubmit(steps); // the WO must still be composable
      const nextStatus = this.applyWo(wo, WorkOrderEvent.Approve);
      const now = new Date().toISOString();
      const updated = await ctx.repos.workOrders.update({
        ...wo,
        status: nextStatus,
        approvedBy: toId<'UserId'>(user.userId),
        approvedAt: now,
        activatedAt: now,
      });
      // Open step 1, lock the rest (REQ-WO-005, AC-WO-002).
      await this.openFirstStepOnApproval(idValue(wo.id), ctx);
      return updated;
    });
  }

  /** Reject creation with a reason (Approver, SM-WO T4, AC-WO-005). */
  async reject(id: number, user: CurrentUser, input: { version: number; reason: string }): Promise<WorkOrderDto> {
    if (!input.reason?.trim()) {
      throw new BadRequestException('A rejection needs a reason (REQ-WO-007, AC-WO-005).');
    }
    return this.gateway.unitOfWork(async (ctx) => {
      const wo = await this.loadForWrite(ctx, id, input.version);
      const nextStatus = this.applyWo(wo, WorkOrderEvent.Reject);
      return ctx.repos.workOrders.update({
        ...wo,
        status: nextStatus,
        cancelReason: null,
      });
    });
  }

  // --- cancel (SM-WO T6 / T15) ---------------------------------------------

  /** Cancel a WO with a reason (SM-WO T6/T15). Reason required. */
  async cancel(id: number, user: CurrentUser, input: { version: number; reason: string }): Promise<WorkOrderDto> {
    if (!input.reason?.trim()) {
      throw new BadRequestException('A cancellation needs a reason (REQ-WO-008).');
    }
    return this.gateway.unitOfWork(async (ctx) => {
      const wo = await this.loadForWrite(ctx, id, input.version);
      const nextStatus = this.applyWo(wo, WorkOrderEvent.Cancel);
      // BR-06 reversal of posted issues / Issued tyres is owned by FG-4/FG-8;
      // here we set Cancelled with its reason (the gate and ordering land with
      // the Stock/Tyre reversal tasks).
      return ctx.repos.workOrders.update({
        ...wo,
        status: nextStatus,
        cancelReason: input.reason.trim(),
        cancelledBy: toId<'UserId'>(user.userId),
      });
    });
  }

  // --- amend (SM-WO T8 / T9 / T10) -----------------------------------------

  /**
   * Edit a draft/rejected WO's common fields and steps (REQ-WO-016). The
   * finding_note is PRESERVED even when the Planner edits description (DEC-91).
   * Once Active, the scope is locked (BR-02) — edits go through amendment, not
   * this path; this method refuses a non-draft WO.
   */
  async edit(id: number, user: CurrentUser, input: {
    version: number;
    title?: string;
    category?: WorkOrderCategory;
    priority?: WorkOrderPriority;
    requiresDowntime?: boolean;
    description?: string;
    steps?: StepInput[];
  }): Promise<WorkOrderDto> {
    return this.gateway.unitOfWork(async (ctx) => {
      const wo = await this.loadForWrite(ctx, id, input.version);
      // Scope lock (BR-02): an active/approved WO's scope is locked.
      if (wo.status !== WorkOrderStatus.Draft && wo.status !== WorkOrderStatus.Rejected) {
        throw new ConflictException(
          'The work order is locked; changes go through a change request / amendment (BR-02).',
        );
      }
      const updated = await ctx.repos.workOrders.update({
        ...wo,
        ...(input.category === undefined ? {} : { category: input.category }),
        ...(input.priority === undefined ? {} : { priority: input.priority }),
        ...(input.requiresDowntime === undefined ? {} : { requiresDowntime: input.requiresDowntime }),
        // finding_note is NEVER overwritten by a description edit (DEC-91).
        ...(input.description === undefined ? {} : { description: input.description }),
      });
      if (input.steps !== undefined) {
        await this.replaceSteps(ctx, idValue(wo.id), this.buildSteps(input.steps));
      }
      return updated;
    });
  }

  /** Request completion approval — only when every step is Verified/Skipped (REQ-ENG-006). */
  async requestCompletion(id: number, user: CurrentUser, version: number): Promise<WorkOrderDto> {
    return this.gateway.unitOfWork(async (ctx) => {
      const wo = await this.loadForWrite(ctx, id, version);
      if (wo.status !== WorkOrderStatus.PendingVerification) {
        throw new ConflictException('Completion can be requested only while Pending_Verification.');
      }
      const complete = await this.allStepsComplete(idValue(wo.id), ctx);
      if (!complete) {
        throw new ConflictException(
          'Every step must be Verified or Skipped before completion (REQ-ENG-006, AC-ENG-002, DEC-87).',
        );
      }
      return ctx.repos.workOrders.update({ ...wo, completionRequestedAt: new Date().toISOString() });
    });
  }

  /**
   * Approve completion (Approver, SM-WO T13): four-eyes against the creator,
   * every step Verified/Skipped (BR-05, DEC-87). Sets the WO Completed.
   */
  async approveCompletion(id: number, user: CurrentUser, version: number): Promise<WorkOrderDto> {
    return this.gateway.unitOfWork(async (ctx) => {
      const wo = await this.loadForWrite(ctx, id, version);
      if (wo.completionRequestedAt === null) {
        throw new ConflictException('Completion has not been requested (REQ-ENG-006).');
      }
      const complete = await this.allStepsComplete(idValue(wo.id), ctx);
      if (!complete) {
        throw new ConflictException(
          'Completion gate: every step must be Verified or Skipped (BR-05, DEC-87).',
        );
      }
      const nextStatus = this.applyWo(wo, WorkOrderEvent.CompletionApproved);
      return ctx.repos.workOrders.update({
        ...wo,
        status: nextStatus,
        completedAt: new Date().toISOString(),
      });
    });
  }

  // --- reads ---------------------------------------------------------------

  /** Read a WO, throwing if absent. */
  async require(id: number): Promise<WorkOrderDto> {
    const wo = await this.gateway.repos.workOrders.getById(id);
    if (!wo) {
      throw new NotFoundException(`Unknown work order: ${id}`);
    }
    return wo;
  }

  /** Every step of a WO, in built order (for the WO detail read). */
  async stepsOf(workOrderId: number): Promise<readonly AssignmentDto[]> {
    const steps = await this.gateway.repos.assignments.findBy(
      'workOrderId',
      toId<'WorkOrderId'>(workOrderId),
    );
    return [...steps].sort((a, b) => a.sequence - b.sequence);
  }

  /**
   * List WOs sorted by urgency (REQ-WO-015): Urgent/High first, then by newest.
   * Optionally filter by status.
   */
  async list(filter?: { status?: WorkOrderStatus }): Promise<readonly WorkOrderDto[]> {
    let all = await this.gateway.repos.workOrders.list();
    if (filter?.status) {
      all = all.filter((wo) => wo.status === filter.status);
    }
    return [...all].sort((a, b) => this.comparePriority(a, b));
  }

  // --- step → WO callbacks (invoked by AssignmentsService inside its txn) ---

  /**
   * Add a Part Purchase step right after the Stock step that confirmed a
   * shortfall (REQ-STK-004 / REQ-PUR-008), unless an open Part Purchase step
   * already follows it. The new step is inserted at `stockSequence + 1` and the
   * later steps shift down; it opens at once (its lines are the shortfall
   * quantities as hints). The module is resolved from the registry — never a
   * hard-coded code (REQ-REG-006). Runs inside the caller's transaction so it is
   * atomic with the goods issue that revealed the shortfall.
   *
   * Returns the created Part Purchase step, so the caller can seed its hint
   * lines, or `null` if a Part Purchase step already follows the Stock step.
   */
  async addPartPurchaseStepForShortfall(
    workOrderId: number,
    stockSequence: number,
    shortfalls: readonly { sku: string; partName: string; hintQty: number; unit: string }[],
    ctx: UnitOfWorkContext,
  ): Promise<AssignmentDto | null> {
    const steps = [...(await ctx.repos.assignments.findBy('workOrderId', toId<'WorkOrderId'>(workOrderId)))].sort(
      (a, b) => a.sequence - b.sequence,
    );
    // Already a Part Purchase step right after the Stock step? Do nothing (REQ-PUR-008).
    const immediatelyAfter = steps.find((s) => s.sequence === stockSequence + 1);
    if (immediatelyAfter && immediatelyAfter.moduleCode === 'Part_Purchase') {
      return null;
    }
    const module = this.registry.require('Part_Purchase');
    // Shift every step after the Stock step down by one to make room.
    for (const s of steps.filter((s) => s.sequence > stockSequence).sort((a, b) => b.sequence - a.sequence)) {
      await ctx.repos.assignments.update({ ...s, sequence: s.sequence + 1 });
    }
    const inserted = await ctx.repos.assignments.insert(
      this.newAssignmentRow({
        workOrderId,
        moduleId: module.id,
        moduleCode: module.code,
        sequence: stockSequence + 1,
        executorRoles: [...module.executorRoles],
        verifierRole: Role.Planner,
        stepConfig: {
          shortfallHints: shortfalls.map((s) => ({
            sku: s.sku,
            partName: s.partName,
            hintQty: s.hintQty,
            unit: s.unit,
          })),
        },
      }),
    );
    // The shortfall-added step opens at once so the buyer can act (REQ-PUR-008).
    return ctx.repos.assignments.update({
      ...inserted,
      status: smStep.transition(inserted.status, StepEvent.WoApprovedOrPrevSubmitted),
      openedAt: new Date().toISOString(),
    });
  }

  /** SM-WO T7: first step started drives the WO to In_Progress. */
  async onFirstStepStarted(workOrderId: number, ctx: UnitOfWorkContext): Promise<void> {
    const wo = await ctx.repos.workOrders.requireById(workOrderId);
    if (wo.status === WorkOrderStatus.Active) {
      const nextStatus = smWorkOrder.transition(wo.status, WorkOrderEvent.FirstStepStarted);
      await ctx.repos.workOrders.update({ ...wo, status: nextStatus, startedAt: wo.startedAt ?? new Date().toISOString() });
    }
  }

  /** SM-WO T11: when every step is Submitted/Verified/Skipped, move to Pending_Verification. */
  async onLastStepSubmitted(workOrderId: number, ctx: UnitOfWorkContext): Promise<void> {
    const steps = [...(await ctx.repos.assignments.findBy('workOrderId', toId<'WorkOrderId'>(workOrderId)))];
    const allBeyond =
      steps.length > 0 &&
      steps.every(
        (s) =>
          s.status === StepStatus.Submitted ||
          s.status === StepStatus.Verified ||
          s.status === StepStatus.Skipped,
      );
    if (!allBeyond) {
      return;
    }
    const wo = await ctx.repos.workOrders.requireById(workOrderId);
    if (wo.status === WorkOrderStatus.InProgress) {
      const nextStatus = smWorkOrder.transition(wo.status, WorkOrderEvent.LastStepSubmitted);
      await ctx.repos.workOrders.update({ ...wo, status: nextStatus });
    }
  }

  /** SM-WO T12: a step returned while Pending_Verification takes the WO back to In_Progress. */
  async onStepReturned(workOrderId: number, ctx: UnitOfWorkContext): Promise<void> {
    const wo = await ctx.repos.workOrders.requireById(workOrderId);
    if (wo.status === WorkOrderStatus.PendingVerification) {
      const nextStatus = smWorkOrder.transition(wo.status, WorkOrderEvent.StepReturned);
      await ctx.repos.workOrders.update({ ...wo, status: nextStatus, completionRequestedAt: null });
    }
  }

  /** Test-only reset of the WO running-number generator. */
  resetForTests(): void {
    // A fresh generator so the next created WO starts the sequence again.
    this.numberGen = createDefaultNumberGenerator();
  }

  // --- internals -----------------------------------------------------------

  /**
   * Open step 1 and lock the rest at WO approval (REQ-WO-005 / SM-WO T3). Called
   * inside the approval transaction; records the step-1 Open time event.
   */
  private async openFirstStepOnApproval(workOrderId: number, ctx: UnitOfWorkContext): Promise<void> {
    const steps = [...(await ctx.repos.assignments.findBy('workOrderId', toId<'WorkOrderId'>(workOrderId)))].sort(
      (a, b) => a.sequence - b.sequence,
    );
    for (const step of steps) {
      if (step.sequence === 1) {
        const openedAt = new Date().toISOString();
        await ctx.repos.assignments.update({
          ...step,
          status: smStep.transition(StepStatus.Locked, StepEvent.WoApprovedOrPrevSubmitted),
          openedAt,
        });
        this.timeEvents.append({
          assignmentId: idValue(step.id),
          attemptNo: step.attemptNo,
          event: 'Open',
          at: openedAt,
          actorId: null,
        });
      } else if (step.status !== StepStatus.Locked) {
        await ctx.repos.assignments.update({ ...step, status: StepStatus.Locked });
      }
    }
  }

  /** Whether every step is Verified or Skipped (completion gate, REQ-ENG-006, DEC-87). */
  private async allStepsComplete(workOrderId: number, ctx: UnitOfWorkContext): Promise<boolean> {
    const steps = await ctx.repos.assignments.findBy('workOrderId', toId<'WorkOrderId'>(workOrderId));
    if (steps.length === 0) {
      return false;
    }
    return steps.every(
      (s) => s.status === StepStatus.Verified || s.status === StepStatus.Skipped,
    );
  }

  /** Priority comparator (REQ-WO-015): Urgent/High first, newest within a tier. */
  private comparePriority(a: WorkOrderDto, b: WorkOrderDto): number {
    const pa = WORK_ORDER_PRIORITY_ORDER.indexOf(a.priority);
    const pb = WORK_ORDER_PRIORITY_ORDER.indexOf(b.priority);
    if (pa !== pb) {
      return pa - pb;
    }
    return b.createdAt.localeCompare(a.createdAt);
  }

  /** Resolve the composed steps: explicit steps, else copy a preset version's steps. */
  private resolveSteps(input: CreateWorkOrderInput): StepInput[] {
    if (input.steps && input.steps.length > 0) {
      return input.steps;
    }
    if (input.presetId !== undefined) {
      // Copy the preset version's steps; the WO never follows it (REQ-ENG-004).
      const preset = this.presets.require(input.presetId);
      return preset.steps.map((s) => ({
        module: s.module,
        executorRoles: [...s.executorRoles],
        verifierRole: s.verifierRole,
        isOptional: s.isOptional,
        stepConfig: { ...s.stepConfig },
      }));
    }
    return [];
  }

  /** Validate & resolve a step list against the registry (module-agnostic). */
  private buildSteps(steps: StepInput[]): Array<Required<Omit<StepInput, 'stepConfig'>> & { moduleId: number; moduleCode: string; stepConfig: Record<string, unknown> }> {
    return steps.map((step, i) => {
      if (!this.registry.isActive(step.module)) {
        throw new BadRequestException(
          this.registry.isKnown(step.module)
            ? `Step ${i + 1} uses a deactivated module: ${step.module}`
            : `Step ${i + 1} uses an unknown module: ${step.module}`,
        );
      }
      const moduleRow = this.registry.require(step.module);
      if (step.executorRoles.length === 0) {
        throw new BadRequestException(`Step ${i + 1} (${step.module}) needs an executor role.`);
      }
      if (step.verifierRole !== Role.Planner && step.verifierRole !== Role.SystemAdmin) {
        throw new BadRequestException(`Step ${i + 1} verifier must be Planner or System Admin (REQ-ENG-005).`);
      }
      return {
        module: moduleRow.code,
        moduleId: moduleRow.id,
        moduleCode: moduleRow.code,
        executorRoles: [...step.executorRoles],
        verifierRole: step.verifierRole,
        isOptional: step.isOptional ?? false,
        stepConfig: step.stepConfig ?? {},
      };
    });
  }

  /** Insert the composed steps for a freshly created WO. */
  private async insertSteps(ctx: UnitOfWorkContext, workOrderId: number, steps: StepInput[]): Promise<void> {
    const built = this.buildSteps(steps);
    let sequence = 1;
    for (const s of built) {
      await ctx.repos.assignments.insert(
        this.newAssignmentRow({
          workOrderId,
          moduleId: s.moduleId,
          moduleCode: s.moduleCode,
          sequence,
          executorRoles: s.executorRoles,
          verifierRole: s.verifierRole,
          isOptional: s.isOptional,
          stepConfig: s.stepConfig,
        }),
      );
      sequence += 1;
    }
  }

  /** Replace all steps of a draft WO (REQ-WO-017 edit). */
  private async replaceSteps(
    ctx: UnitOfWorkContext,
    workOrderId: number,
    built: ReturnType<WorkOrdersService['buildSteps']>,
  ): Promise<void> {
    const existing = await ctx.repos.assignments.findBy('workOrderId', toId<'WorkOrderId'>(workOrderId));
    for (const step of existing) {
      await ctx.repos.assignments.remove(idValue(step.id), step.version);
    }
    let sequence = 1;
    for (const s of built) {
      await ctx.repos.assignments.insert(
        this.newAssignmentRow({
          workOrderId,
          moduleId: s.moduleId,
          moduleCode: s.moduleCode,
          sequence,
          executorRoles: s.executorRoles,
          verifierRole: s.verifierRole,
          isOptional: s.isOptional,
          stepConfig: s.stepConfig,
        }),
      );
      sequence += 1;
    }
  }

  /** Gate Submit/Approve with the composer check (REQ-REG-004, AC-WO-003). */
  private assertComposerAllowsSubmit(steps: readonly AssignmentDto[]): void {
    const result = this.composer.check(
      [...steps].sort((a, b) => a.sequence - b.sequence).map((s) => ({ module: s.moduleCode })),
    );
    if (!result.canSubmit) {
      const first = result.findings.find((f) => f.severity === 'error');
      throw new BadRequestException(first?.message ?? 'The work order cannot be submitted (REQ-REG-004).');
    }
  }

  /** Apply an SM-WO event, refusing an unlisted transition (PRD §3.2). */
  private applyWo(
    wo: WorkOrderDto,
    event: Exclude<(typeof WorkOrderEvent)[keyof typeof WorkOrderEvent], 'Create'>,
  ): WorkOrderStatus {
    try {
      return smWorkOrder.transition(wo.status, event);
    } catch (err) {
      if (err instanceof InvalidTransitionError) {
        throw new ConflictException(err.message);
      }
      throw err;
    }
  }

  /** Load a WO inside a transaction and version-check it. */
  private async loadForWrite(ctx: UnitOfWorkContext, id: number, version: number): Promise<WorkOrderDto> {
    const wo = await ctx.repos.workOrders.requireById(id);
    if (wo.version !== version) {
      throw new ConflictException('Work order was modified concurrently; reload and retry.');
    }
    return wo;
  }

  /** Next never-reused WO running number (NFR-15), e.g. `WO-0143`. */
  private nextNumber(): string {
    return this.numberGen.next('WO');
  }

  /** A fresh WO row with lifecycle fields at their create defaults (SM-WO Draft). */
  private newWorkOrderRow(input: {
    number: string;
    vehicleId: number;
    source: WorkOrderSource;
    category: WorkOrderCategory;
    priority: WorkOrderPriority;
    requiresDowntime: boolean;
    description: string;
    findingNote: string | null;
    presetId: number | null;
    createdBy: number;
  }): Omit<WorkOrderDto, 'id' | 'version'> {
    return {
      number: input.number,
      vehicleId: toId<'VehicleId'>(input.vehicleId),
      status: WorkOrderStatus.Draft,
      source: input.source,
      category: input.category,
      priority: input.priority,
      requiresDowntime: input.requiresDowntime,
      description: input.description,
      findingNote: input.findingNote,
      presetId: input.presetId === null ? null : toId<'WoPresetId'>(input.presetId),
      sentForReviewAt: null,
      statusBeforeAmendment: null,
      amendmentNo: 0,
      offDays: 0,
      createdBy: toId<'UserId'>(input.createdBy),
      createdAt: new Date().toISOString(),
      approvedBy: null,
      approvedAt: null,
      activatedAt: null,
      startedAt: null,
      completionRequestedAt: null,
      completedAt: null,
      cancelledBy: null,
      cancelReason: null,
    };
  }

  /** A fresh assignment row at its create defaults (SM-STEP Locked). */
  private newAssignmentRow(input: {
    workOrderId: number;
    moduleId: number;
    moduleCode: string;
    sequence: number;
    executorRoles: Role[];
    verifierRole: Role;
    isOptional?: boolean;
    stepConfig?: Record<string, unknown>;
  }): Omit<AssignmentDto, 'id' | 'version'> {
    return {
      workOrderId: toId<'WorkOrderId'>(input.workOrderId),
      moduleId: toId<'AssignmentModuleId'>(input.moduleId),
      moduleCode: input.moduleCode,
      sequence: input.sequence,
      status: StepStatus.Locked,
      stepConfig: input.stepConfig ?? {},
      isOptional: input.isOptional ?? false,
      executorRoles: input.executorRoles,
      verifierRole: input.verifierRole,
      isPaused: false,
      team: Team.Internal,
      assigneeId: null,
      claimedAt: null,
      openedAt: null,
      executedBy: null,
      startedAt: null,
      startEntered: false,
      attemptNo: 1,
      workedSeconds: null,
      pausedSeconds: null,
      submittedAt: null,
      verifiedBy: null,
      verifiedAt: null,
      selfVerified: false,
      returnNote: null,
      skipReason: null,
    };
  }
}
