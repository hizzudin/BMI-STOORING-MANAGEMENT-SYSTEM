import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ChangeRequestEvent,
  ChangeRequestStatus,
  InvalidTransitionError,
  Role,
  smChangeRequest,
  StepStatus,
  WorkOrderCategory,
  WorkOrderPriority,
  WorkOrderStatus,
  idValue,
  toId,
  type AssignmentDto,
  type ChangeRequestDto,
  type WorkOrderDto,
} from '@bmi/shared';
import type { DataGateway } from '@bmi/data-gateway';
import { DATA_GATEWAY } from '../../core/data-gateway/data-gateway.module.js';
import type { CurrentUser } from '../../core/auth/current-user.js';
import { WorkOrdersService, type StepInput } from '../work-orders/work-orders.service.js';
import { AssignmentsService } from '../assignments/assignments.service.js';

/** The executor's raise payload (REQ-CR-001). */
export interface RaiseChangeRequestInput {
  assignmentId: number;
  whatChanges: string;
  requestedChange: string;
  reason: string;
}

/**
 * The creator's revision (REQ-CR-003). A revision may change the open step and
 * the steps after it (content + add/remove/move not-started steps); it may
 * NEVER switch the vehicle (REQ-CR-003, AC-CR-004), and it may not touch a step
 * that is already submitted or verified (REQ-CR-008, AC-CR-005).
 */
export interface ReviseInput {
  category?: WorkOrderCategory;
  priority?: WorkOrderPriority;
  requiresDowntime?: boolean;
  description?: string;
  /** The not-yet-submitted steps the revision replaces (REQ-CR-003/008). */
  revisedSteps?: StepInput[];
  /** Refused if present (REQ-CR-003/AC-CR-004 — switch vehicle = cancel & recreate). */
  vehicleId?: number;
}

/** A kept snapshot of the WO content before a revision (REQ-CR-004 history). */
interface RevisionHistory {
  readonly changeRequestId: number;
  readonly amendmentNo: number;
  readonly capturedAt: string;
  readonly category: WorkOrderCategory;
  readonly priority: WorkOrderPriority;
  readonly requiresDowntime: boolean;
  readonly description: string;
  readonly steps: readonly {
    readonly moduleCode: string;
    readonly sequence: number;
    readonly status: StepStatus;
    readonly stepConfig: Record<string, unknown>;
  }[];
}

/**
 * **Change requests & amendments** (FG-9, REQ-CR, SM-CR §3.7, BR-02, BR-03).
 *
 * The open step's executor **raises** a change request (REQ-CR-001) — the WO
 * creator (Planner / System Admin) **decides** it (REQ-CR-004/005): executor
 * raises, creator decides. Raising moves the WO to Pending_Amendment via the
 * WO-lifecycle owner ({@link WorkOrdersService.enterAmendment}, SM-WO T8) and
 * freezes the open step (the engine refuses step edits while Pending_Amendment,
 * TASK-108 — not re-checked here). The CR itself walks SM-CR through the shared
 * {@link smChangeRequest} guard (Submitted → In_Revision → Pending_Approval →
 * Approved/Rejected); an unlisted transition is refused.
 *
 * An approved scope-changing revision is applied through
 * {@link WorkOrdersService.applyAmendment} (SM-WO T9): the amendment number
 * rises and the earlier content is kept in history (REQ-CR-004). The scope lock
 * (BR-02) means scope changes flow **only** through this CR/amendment path.
 *
 * Phase-1 modelling: the dummy gateway models only the nine business
 * aggregates, so — following the TASK-103..112 precedent — `wo_change_requests`
 * and the revision history live here as API-layer in-memory state; TASK-201/202
 * re-home them behind the PRD §9 `wo_change_requests` table unchanged. The WO
 * status move and step revision run inside the gateway's `unitOfWork`, so the
 * CR decision and the WO change commit or roll back together.
 */
@Injectable()
export class ChangeRequestsService {
  private readonly changeRequests = new Map<number, ChangeRequestDto>();
  private readonly history: RevisionHistory[] = [];
  private nextId = 1;

  constructor(
    @Inject(DATA_GATEWAY) private readonly gateway: DataGateway,
    private readonly workOrders: WorkOrdersService,
    private readonly assignments: AssignmentsService,
  ) {}

  // --- reads ---------------------------------------------------------------

  /** A change request by id, throwing a 404 if unknown. */
  require(id: number): ChangeRequestDto {
    const cr = this.changeRequests.get(id);
    if (!cr) {
      throw new NotFoundException(`Unknown change request: ${id}`);
    }
    return cr;
  }

  /** Change requests for a WO, newest first. */
  listForWorkOrder(workOrderId: number): readonly ChangeRequestDto[] {
    return [...this.changeRequests.values()]
      .filter((cr) => idValue(cr.workOrderId) === workOrderId)
      .sort((a, b) => b.raisedAt.localeCompare(a.raisedAt));
  }

  /** Change requests awaiting a creator decision (SM-CR Pending_Approval). */
  listAwaitingDecision(): readonly ChangeRequestDto[] {
    return [...this.changeRequests.values()].filter(
      (cr) => cr.status === ChangeRequestStatus.PendingApproval,
    );
  }

  /** The kept content history for a WO (REQ-CR-004). */
  historyForWorkOrder(workOrderId: number): readonly RevisionHistory[] {
    const ids = new Set(
      this.listForWorkOrder(workOrderId).map((cr) => idValue(cr.id)),
    );
    return this.history.filter((h) => ids.has(h.changeRequestId));
  }

  // --- raise (SM-CR Submitted, SM-WO T8) -----------------------------------

  /**
   * The **open step's executor raises** a change request (REQ-CR-001, BR-03).
   * Refused when the caller is not an executor of that open step. Moves the WO
   * to Pending_Amendment (SM-WO T8) — a WO that is not Active/In_Progress (e.g.
   * Pending_Verification) is refused by the machine (REQ-CR-007). The WO status
   * move and the CR insert run in one transaction.
   */
  async raise(user: CurrentUser, input: RaiseChangeRequestInput): Promise<ChangeRequestDto> {
    if (!input.whatChanges.trim() || !input.requestedChange.trim() || !input.reason.trim()) {
      throw new BadRequestException(
        'A change request needs what changes, the requested change and a reason (REQ-CR-001).',
      );
    }
    const step = await this.assignments.require(input.assignmentId);
    this.assertOpenStepExecutor(step, user);

    return this.gateway.unitOfWork(async (ctx) => {
      // Enter Pending_Amendment first (SM-WO T8) — this refuses the WO if it is
      // not Active/In_Progress (REQ-CR-007), before we create the CR row.
      const wo = await this.workOrders.enterAmendment(idValue(step.workOrderId), ctx);
      const now = new Date().toISOString();
      const id = this.nextId++;
      const cr: ChangeRequestDto = {
        id: toId<'ChangeRequestId'>(id),
        workOrderId: step.workOrderId,
        assignmentId: step.id,
        status: ChangeRequestStatus.Submitted,
        whatChanges: input.whatChanges.trim(),
        requestedChange: input.requestedChange.trim(),
        reason: input.reason.trim(),
        raisedBy: toId<'UserId'>(user.userId),
        raisedAt: now,
        statusBeforeAmendment: wo.statusBeforeAmendment ?? WorkOrderStatus.Active,
        openedBy: null,
        revisionSentAt: null,
        decidedBy: null,
        decidedAt: null,
        rejectReason: null,
        version: 1,
      };
      this.changeRequests.set(id, cr);
      return cr;
    });
  }

  // --- creator opens & sends the revision (SM-CR Open / SendRevision) -------

  /**
   * The **WO creator opens** the change request for revision (SM-CR Open,
   * Submitted → In_Revision). Only the WO creator (or a System Admin) may do
   * this — executor raises, creator decides (REQ-CR-001). Captures the current
   * WO content so the earlier version is kept in history (REQ-CR-004).
   */
  async open(id: number, user: CurrentUser): Promise<ChangeRequestDto> {
    const cr = this.require(id);
    const wo = await this.workOrders.require(idValue(cr.workOrderId));
    this.assertWoCreatorOrAdmin(wo, user);
    const nextStatus = this.applyCr(cr, ChangeRequestEvent.Open);
    await this.captureHistory(cr, wo);
    const updated: ChangeRequestDto = {
      ...cr,
      status: nextStatus,
      openedBy: toId<'UserId'>(user.userId),
      version: cr.version + 1,
    };
    this.changeRequests.set(id, updated);
    return updated;
  }

  /**
   * The creator **revises** the WO content and sends it for approval (REQ-CR-003,
   * SM-CR SendRevision, In_Revision → Pending_Approval). Refuses a vehicle
   * switch (REQ-CR-003, AC-CR-004) and a change to an already-submitted/verified
   * step (REQ-CR-008, AC-CR-005). The revision is STAGED on the CR, not applied
   * to the WO until an Approver approves it (REQ-CR-004) — so a reject leaves the
   * original content intact (AC-CR-002). We stash the staged revision alongside
   * the CR for the approve step.
   */
  async sendRevision(id: number, user: CurrentUser, revision: ReviseInput): Promise<ChangeRequestDto> {
    const cr = this.require(id);
    const wo = await this.workOrders.require(idValue(cr.workOrderId));
    this.assertWoCreatorOrAdmin(wo, user);
    if (revision.vehicleId !== undefined && revision.vehicleId !== idValue(wo.vehicleId)) {
      // REQ-CR-003 / AC-CR-004: a change request may not switch the vehicle.
      throw new ConflictException(
        'A change request cannot switch the vehicle; cancel and recreate instead (REQ-CR-003, AC-CR-004).',
      );
    }
    if (revision.revisedSteps !== undefined) {
      await this.assertRevisionTouchesNoSubmittedStep(idValue(wo.id), revision.revisedSteps);
    }
    const nextStatus = this.applyCr(cr, ChangeRequestEvent.SendRevision);
    const updated: ChangeRequestDto = {
      ...cr,
      status: nextStatus,
      revisionSentAt: new Date().toISOString(),
      version: cr.version + 1,
    };
    this.changeRequests.set(id, updated);
    this.stagedRevisions.set(id, revision);
    return updated;
  }

  // --- decide (SM-CR Approve / Reject, SM-WO T9 / T10) ---------------------

  /**
   * An **Approver approves** the revision (REQ-CR-004, SM-CR Approve). Applies
   * the staged revision, raises the amendment number and restores the earlier WO
   * status via {@link WorkOrdersService.applyAmendment} (SM-WO T9), all in one
   * transaction. Four-eyes (BR-03) is enforced at the inbox routing layer; here
   * we drive SM-CR + SM-WO.
   */
  async approveRevision(id: number, user: CurrentUser): Promise<ChangeRequestDto> {
    const cr = this.require(id);
    const wo = await this.workOrders.require(idValue(cr.workOrderId));
    this.assertWoCreatorOrAdmin(wo, user);
    const revision = this.stagedRevisions.get(id) ?? {};
    const updated = await this.gateway.unitOfWork(async (ctx) => {
      await this.workOrders.applyAmendment(idValue(cr.workOrderId), ctx, {
        ...(revision.category === undefined ? {} : { category: revision.category }),
        ...(revision.priority === undefined ? {} : { priority: revision.priority }),
        ...(revision.requiresDowntime === undefined ? {} : { requiresDowntime: revision.requiresDowntime }),
        ...(revision.description === undefined ? {} : { description: revision.description }),
        ...(revision.revisedSteps === undefined ? {} : { revisedSteps: revision.revisedSteps }),
      });
      const nextStatus = this.applyCr(cr, ChangeRequestEvent.Approve);
      const next: ChangeRequestDto = {
        ...cr,
        status: nextStatus,
        decidedBy: toId<'UserId'>(user.userId),
        decidedAt: new Date().toISOString(),
        version: cr.version + 1,
      };
      return next;
    });
    this.changeRequests.set(id, updated);
    this.stagedRevisions.delete(id);
    return updated;
  }

  /**
   * An **Approver rejects** the revision with a reason (REQ-CR-005, SM-CR
   * Reject). Discards the staged revision, restores the earlier WO status via
   * {@link WorkOrdersService.discardAmendment} (SM-WO T10) and records the
   * rejection — the original content stays and the step resumes (AC-CR-002).
   */
  async rejectRevision(id: number, user: CurrentUser, reason: string): Promise<ChangeRequestDto> {
    if (!reason?.trim()) {
      throw new BadRequestException('A rejection needs a reason (REQ-CR-005, AC-APR-004).');
    }
    const cr = this.require(id);
    const wo = await this.workOrders.require(idValue(cr.workOrderId));
    this.assertWoCreatorOrAdmin(wo, user);
    const updated = await this.gateway.unitOfWork(async (ctx) => {
      await this.workOrders.discardAmendment(idValue(cr.workOrderId), ctx);
      const nextStatus = this.applyCr(cr, ChangeRequestEvent.Reject);
      const next: ChangeRequestDto = {
        ...cr,
        status: nextStatus,
        decidedBy: toId<'UserId'>(user.userId),
        decidedAt: new Date().toISOString(),
        rejectReason: reason.trim(),
        version: cr.version + 1,
      };
      return next;
    });
    this.changeRequests.set(id, updated);
    this.stagedRevisions.delete(id);
    return updated;
  }

  /** Test-only reset. */
  resetForTests(): void {
    this.changeRequests.clear();
    this.stagedRevisions.clear();
    this.history.length = 0;
    this.nextId = 1;
  }

  // --- helpers -------------------------------------------------------------

  /** Staged revisions, applied only on approve (REQ-CR-004 — not before). */
  private readonly stagedRevisions = new Map<number, ReviseInput>();

  /** Apply an SM-CR event, refusing an unlisted transition (PRD §3.7). */
  private applyCr(cr: ChangeRequestDto, event: ChangeRequestEvent): ChangeRequestStatus {
    try {
      return smChangeRequest.transition(cr.status, event);
    } catch (err) {
      if (err instanceof InvalidTransitionError) {
        throw new ConflictException(err.message);
      }
      throw err;
    }
  }

  /**
   * Only the **open step's executor** may raise a CR (REQ-CR-001, BR-03). The
   * step must be Open/In_Progress and the caller must be in its executor roles
   * (a System Admin may always execute, mirroring the engine's rule).
   */
  private assertOpenStepExecutor(step: AssignmentDto, user: CurrentUser): void {
    if (step.status !== StepStatus.Open && step.status !== StepStatus.InProgress) {
      throw new ConflictException(
        'A change request can be raised only from the open step (REQ-CR-001).',
      );
    }
    const isExecutor =
      user.role === Role.SystemAdmin || step.executorRoles.includes(user.role);
    if (!isExecutor) {
      throw new ConflictException(
        'Only the open step\u2019s executor may raise a change request (REQ-CR-001, BR-03).',
      );
    }
  }

  /** Only the WO creator (or a System Admin) decides the amendment (REQ-CR-001). */
  private assertWoCreatorOrAdmin(wo: WorkOrderDto, user: CurrentUser): void {
    const isCreator = idValue(wo.createdBy) === user.userId;
    if (!isCreator && user.role !== Role.SystemAdmin) {
      throw new ConflictException(
        'Only the WO creator (Planner or System Admin) decides the amendment (REQ-CR-001).',
      );
    }
  }

  /**
   * Refuse a revision that would change the content of a step that is already
   * submitted or verified (REQ-CR-008, AC-CR-005). The revision replaces only
   * the not-yet-submitted steps; if it supplies fewer steps than the kept
   * (submitted/verified) ones, or would drop a submitted step, we refuse — a
   * submitted step is corrected by a return, posted stock by a reversal.
   */
  private async assertRevisionTouchesNoSubmittedStep(
    workOrderId: number,
    revisedSteps: readonly StepInput[],
  ): Promise<void> {
    const steps = await this.workOrders.stepsOf(workOrderId);
    const submitted = steps.filter(
      (s) =>
        s.status === StepStatus.Submitted ||
        s.status === StepStatus.Verified ||
        s.status === StepStatus.Skipped,
    );
    // The revised list must keep every submitted/verified step unchanged, in the
    // same order, as its leading entries (REQ-CR-008).
    for (let i = 0; i < submitted.length; i += 1) {
      const kept = submitted[i];
      const proposed = revisedSteps[i];
      if (!kept) {
        continue;
      }
      if (!proposed || proposed.module !== kept.moduleCode) {
        throw new ConflictException(
          'A revision cannot change a step that is already submitted or verified; return it or reverse posted stock instead (REQ-CR-008, AC-CR-005).',
        );
      }
    }
  }

  /** Capture the current WO content before a revision (REQ-CR-004 history). */
  private async captureHistory(cr: ChangeRequestDto, wo: WorkOrderDto): Promise<void> {
    const steps = await this.workOrders.stepsOf(idValue(wo.id));
    this.history.push({
      changeRequestId: idValue(cr.id),
      amendmentNo: wo.amendmentNo,
      capturedAt: new Date().toISOString(),
      category: wo.category,
      priority: wo.priority,
      requiresDowntime: wo.requiresDowntime,
      description: wo.description,
      steps: steps.map((s) => ({
        moduleCode: s.moduleCode,
        sequence: s.sequence,
        status: s.status,
        stepConfig: { ...s.stepConfig },
      })),
    });
  }
}
