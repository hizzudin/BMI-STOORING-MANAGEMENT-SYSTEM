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
  InvalidTransitionError,
  idValue,
  toId,
  type AssignmentDto,
} from '@bmi/shared';
import type { DataGateway, UnitOfWorkContext } from '@bmi/data-gateway';
import { DATA_GATEWAY } from '../../core/data-gateway/data-gateway.module.js';
import type { CurrentUser } from '../../core/auth/current-user.js';
import { ModuleRegistryService } from '../registry/module-registry.service.js';
import { WorkOrdersService } from '../work-orders/work-orders.service.js';
import { StepTimeEventService } from './step-time-event.service.js';

/** Max minutes a Start may be entered earlier than now (REQ-ENG-014). */
const MAX_ENTERED_START_MINUTES = 120;

/**
 * **Assignment engine & step lifecycle** (FG-2, REQ-ENG, SM-STEP, DEC-87).
 *
 * Runs a WO's steps in built order (REQ-ENG-001), opens the next step on submit
 * without waiting for verification (REQ-ENG-002), enforces executor/verifier
 * identity rules (REQ-ENG-003/007, BR-03), supports claim / assign / reassign /
 * release (REQ-ENG-011) and records Open/Start/Pause/Resume/Submit/Return/Verify
 * time events per attempt (REQ-ENG-012..015). Every transition is checked
 * against the SM-STEP table in `@bmi/shared`; a move not listed is refused
 * (PRD §3.3).
 *
 * **Module-agnostic (PR-6, REQ-REG-006):** the engine reads each step's executor
 * roles, verifier role and (via the registry) scope / completion / cost rules
 * from the step's own `moduleCode` row — it never branches on a specific module
 * code. A new module (TASK-107 registry) runs through the same path with no edit.
 *
 * All writes go through the gateway's version-checked `unitOfWork`
 * (NFR-INTEGRITY / NFR-CONCURRENCY). WO-level consequences of a step event
 * (T7 first step started, T11 last step submitted, T12 step returned) are
 * delegated back to {@link WorkOrdersService} (wired with `forwardRef` because
 * the two collaborate intrinsically).
 */
@Injectable()
export class AssignmentsService {
  constructor(
    @Inject(DATA_GATEWAY) private readonly gateway: DataGateway,
    private readonly registry: ModuleRegistryService,
    private readonly timeEvents: StepTimeEventService,
    private readonly workOrders: WorkOrdersService,
  ) {}

  /** Read a step, throwing if absent. */
  async require(id: number): Promise<AssignmentDto> {
    const step = await this.gateway.repos.assignments.getById(id);
    if (!step) {
      throw new NotFoundException(`Unknown step: ${id}`);
    }
    return step;
  }

  /** Every step of a WO, in built order. */
  async forWorkOrder(workOrderId: number): Promise<readonly AssignmentDto[]> {
    const steps = await this.gateway.repos.assignments.findBy(
      'workOrderId',
      toId<'WorkOrderId'>(workOrderId),
    );
    return [...steps].sort((a, b) => a.sequence - b.sequence);
  }

  /**
   * Start a step (SM-STEP Open → In_Progress, REQ-ENG-012). Start claims an
   * unassigned step (REQ-ENG-011), sets `started_at` of the current attempt and
   * makes the form editable. Opening/viewing never starts the clock. An
   * entered-earlier start is at most 2 h back and never before Open (REQ-ENG-014).
   */
  async start(id: number, user: CurrentUser, input: { version: number; startedAt?: string; reason?: string }): Promise<AssignmentDto> {
    return this.gateway.unitOfWork(async (ctx) => {
      const step = await this.loadForWrite(ctx, id, input.version);
      await this.assertWorkOrderNotFrozen(step);
      this.assertMayExecute(step, user);
      this.assertNotClaimedByOther(step, user);

      const now = new Date();
      const startedAt = this.resolveStartTime(step, input, now);
      const nextStatus = this.applyStep(step, StepEvent.Start);

      this.timeEvents.append({
        assignmentId: id,
        attemptNo: step.attemptNo,
        event: 'Start',
        at: startedAt,
        enteredLate: input.startedAt !== undefined,
        ...(input.reason === undefined ? {} : { note: input.reason }),
        actorId: user.userId,
      });

      const updated = await ctx.repos.assignments.update({
        ...step,
        status: nextStatus,
        isPaused: false,
        assigneeId: step.assigneeId ?? toId<'UserId'>(user.userId),
        claimedAt: step.claimedAt ?? now.toISOString(),
        executedBy: toId<'UserId'>(user.userId),
        startedAt,
        startEntered: input.startedAt !== undefined,
      });
      // First step started drives the WO In_Progress (SM-WO T7).
      await this.workOrders.onFirstStepStarted(idValue(step.workOrderId), ctx);
      return updated;
    });
  }

  /** Pause a started step with a reason (REQ-ENG-013). Work time stops. */
  async pause(id: number, user: CurrentUser, input: { version: number; pauseReason: string; note?: string }): Promise<AssignmentDto> {
    return this.gateway.unitOfWork(async (ctx) => {
      const step = await this.loadForWrite(ctx, id, input.version);
      await this.assertWorkOrderNotFrozen(step);
      this.assertMayExecute(step, user);
      if (step.isPaused) {
        throw new ConflictException('Step is already paused.');
      }
      // Pause/Resume keep the step In_Progress (Paused is a presentation flag).
      this.applyStep(step, StepEvent.Pause);
      this.timeEvents.append({
        assignmentId: id,
        attemptNo: step.attemptNo,
        event: 'Pause',
        at: new Date().toISOString(),
        pauseReason: input.pauseReason as never,
        ...(input.note === undefined ? {} : { note: input.note }),
        actorId: user.userId,
      });
      return ctx.repos.assignments.update({ ...step, isPaused: true });
    });
  }

  /** Resume a paused step (REQ-ENG-013). Work time runs again. */
  async resume(id: number, user: CurrentUser, input: { version: number }): Promise<AssignmentDto> {
    return this.gateway.unitOfWork(async (ctx) => {
      const step = await this.loadForWrite(ctx, id, input.version);
      await this.assertWorkOrderNotFrozen(step);
      this.assertMayExecute(step, user);
      if (!step.isPaused) {
        throw new ConflictException('Step is not paused.');
      }
      this.applyStep(step, StepEvent.Resume);
      this.timeEvents.append({
        assignmentId: id,
        attemptNo: step.attemptNo,
        event: 'Resume',
        at: new Date().toISOString(),
        actorId: user.userId,
      });
      return ctx.repos.assignments.update({ ...step, isPaused: false });
    });
  }

  /**
   * Submit a started step (SM-STEP In_Progress → Submitted, REQ-ENG-002). The
   * next step opens at once (never waiting for verification); if this was the
   * last step the WO moves to Pending_Verification (SM-WO T11). Submit is
   * refused while the step is paused (REQ-ENG-013).
   */
  async submit(id: number, user: CurrentUser, input: { version: number }): Promise<AssignmentDto> {
    return this.gateway.unitOfWork(async (ctx) => {
      const step = await this.loadForWrite(ctx, id, input.version);
      await this.assertWorkOrderNotFrozen(step);
      this.assertMayExecute(step, user);
      if (step.isPaused) {
        throw new ConflictException('Resume the step before submitting it (REQ-ENG-013).');
      }
      if (step.startedAt === null) {
        throw new BadRequestException('Press Start before submitting the step (REQ-ENG-012).');
      }
      const nextStatus = this.applyStep(step, StepEvent.Submit);
      const submittedAt = new Date().toISOString();
      this.timeEvents.append({
        assignmentId: id,
        attemptNo: step.attemptNo,
        event: 'Submit',
        at: submittedAt,
        actorId: user.userId,
      });
      const duration = this.timeEvents.durationOf(id);
      const updated = await ctx.repos.assignments.update({
        ...step,
        status: nextStatus,
        submittedAt,
        workedSeconds: duration.workedSeconds,
        pausedSeconds: duration.pausedSeconds,
      });
      // Open the next step at once (REQ-ENG-002); if none remains, the WO moves
      // to Pending_Verification (SM-WO T11) — both handled by the WO service.
      await this.openNextOrRequireVerification(step, ctx);
      return updated;
    });
  }

  /**
   * Verify a submitted step (SM-STEP Submitted → Verified, REQ-ENG-005). The
   * verifier must not be the step's executor unless System Admin (REQ-ENG-007,
   * BR-03); a System Admin self-verification is marked Self-verified.
   */
  async verify(id: number, user: CurrentUser, input: { version: number }): Promise<AssignmentDto> {
    return this.gateway.unitOfWork(async (ctx) => {
      const step = await this.loadForWrite(ctx, id, input.version);
      this.assertMayVerify(step, user);
      const nextStatus = this.applyStep(step, StepEvent.Verify);
      const selfVerified =
        user.role === Role.SystemAdmin &&
        step.executedBy !== null &&
        idValue(step.executedBy) === user.userId;
      this.timeEvents.append({
        assignmentId: id,
        attemptNo: step.attemptNo,
        event: 'Verify',
        at: new Date().toISOString(),
        actorId: user.userId,
      });
      return ctx.repos.assignments.update({
        ...step,
        status: nextStatus,
        verifiedBy: toId<'UserId'>(user.userId),
        verifiedAt: new Date().toISOString(),
        selfVerified,
      });
    });
  }

  /**
   * Return a submitted step to its executor with a required note (REQ-ENG-005).
   * The step goes back to Open shown as Returned; a new attempt begins that
   * needs Start again (REQ-ENG-015). Later steps are NOT re-locked. If the WO
   * was Pending_Verification, a return takes it back to In_Progress (SM-WO T12).
   */
  async return(id: number, user: CurrentUser, input: { version: number; note: string }): Promise<AssignmentDto> {
    if (!input.note?.trim()) {
      throw new BadRequestException('A return needs a note (REQ-ENG-005, AC-ENG-005).');
    }
    return this.gateway.unitOfWork(async (ctx) => {
      const step = await this.loadForWrite(ctx, id, input.version);
      this.assertMayVerify(step, user);
      const nextStatus = this.applyStep(step, StepEvent.Return);
      this.timeEvents.append({
        assignmentId: id,
        attemptNo: step.attemptNo,
        event: 'Return',
        at: new Date().toISOString(),
        note: input.note.trim(),
        actorId: user.userId,
      });
      const updated = await ctx.repos.assignments.update({
        ...step,
        status: nextStatus,
        attemptNo: step.attemptNo + 1,
        // The new attempt needs Start again (REQ-ENG-015): clear the run stamps.
        startedAt: null,
        startEntered: false,
        isPaused: false,
        returnNote: input.note.trim(),
      });
      // A return while Pending_Verification drives the WO back to In_Progress.
      await this.workOrders.onStepReturned(idValue(step.workOrderId), ctx);
      return updated;
    });
  }

  /**
   * Assign or reassign a step to a named user holding one of its executor roles
   * (REQ-ENG-011). A reassign needs a reason. The step's draft moves with it.
   */
  async assign(id: number, user: CurrentUser, input: { version: number; assigneeId: number; reason?: string }): Promise<AssignmentDto> {
    if (!(user.role === Role.Planner || user.role === Role.SystemAdmin)) {
      throw new ConflictException('Only a Planner or System Admin may assign a step (REQ-ENG-011).');
    }
    return this.gateway.unitOfWork(async (ctx) => {
      const step = await this.loadForWrite(ctx, id, input.version);
      const assignee = await ctx.repos.users.getById(input.assigneeId);
      if (!assignee) {
        throw new NotFoundException(`Unknown user: ${input.assigneeId}`);
      }
      if (!this.registry.mayExecute(step.moduleCode, assignee.role)) {
        throw new BadRequestException(
          `User role ${assignee.role} may not execute a ${step.moduleCode} step (REQ-ENG-011).`,
        );
      }
      const isReassign = step.assigneeId !== null;
      if (isReassign && !input.reason?.trim()) {
        throw new BadRequestException('A reassign needs a reason (REQ-ENG-011).');
      }
      return ctx.repos.assignments.update({
        ...step,
        assigneeId: toId<'UserId'>(input.assigneeId),
        claimedAt: step.claimedAt ?? new Date().toISOString(),
      });
    });
  }

  /**
   * Release a claimed step (REQ-ENG-011): the assignee gives it up with a
   * reason, the step becomes unassigned and its draft stays.
   */
  async release(id: number, user: CurrentUser, input: { version: number; reason: string }): Promise<AssignmentDto> {
    if (!input.reason?.trim()) {
      throw new BadRequestException('A release needs a reason (REQ-ENG-011).');
    }
    return this.gateway.unitOfWork(async (ctx) => {
      const step = await this.loadForWrite(ctx, id, input.version);
      if (step.assigneeId === null) {
        throw new ConflictException('Step has no assignee to release.');
      }
      const isAssignee = idValue(step.assigneeId) === user.userId;
      const isPlanner = user.role === Role.Planner || user.role === Role.SystemAdmin;
      if (!isAssignee && !isPlanner) {
        throw new ConflictException('Only the assignee or a Planner may release the step.');
      }
      return ctx.repos.assignments.update({ ...step, assigneeId: null, claimedAt: null });
    });
  }

  // --- internals -----------------------------------------------------------

  /** Load a step inside a transaction and version-check it. */
  private async loadForWrite(
    ctx: UnitOfWorkContext,
    id: number,
    version: number,
  ): Promise<AssignmentDto> {
    const step = await ctx.repos.assignments.requireById(id);
    if (step.version !== version) {
      throw new ConflictException('Step was modified concurrently; reload and retry.');
    }
    return step;
  }

  /** Apply an SM-STEP event, refusing an unlisted transition (PRD §3.3). */
  private applyStep(step: AssignmentDto, event: (typeof StepEvent)[keyof typeof StepEvent]): StepStatus {
    try {
      return smStep.transition(step.status, event);
    } catch (err) {
      if (err instanceof InvalidTransitionError) {
        throw new ConflictException(err.message);
      }
      throw err;
    }
  }

  /** Executor-identity rule (REQ-ENG-003): one of the step's executor roles, or SA. */
  private assertMayExecute(step: AssignmentDto, user: CurrentUser): void {
    if (user.role === Role.SystemAdmin) {
      return;
    }
    if (!step.executorRoles.includes(user.role)) {
      throw new ConflictException(
        `Role ${user.role} may not execute this ${step.moduleCode} step (REQ-ENG-003).`,
      );
    }
  }

  /** Claim rule (REQ-ENG-011): a claimed step is read-only to everyone but its assignee (or SA). */
  private assertNotClaimedByOther(step: AssignmentDto, user: CurrentUser): void {
    if (step.assigneeId === null || user.role === Role.SystemAdmin) {
      return;
    }
    if (idValue(step.assigneeId) !== user.userId) {
      throw new ConflictException('This step is claimed by another user (REQ-ENG-011).');
    }
  }

  /** Verifier-identity rule (REQ-ENG-005/007, BR-03): Planner/SA, and not the executor unless SA. */
  private assertMayVerify(step: AssignmentDto, user: CurrentUser): void {
    const isVerifierRole =
      user.role === Role.Planner ||
      user.role === Role.SystemAdmin ||
      user.role === step.verifierRole;
    if (!isVerifierRole) {
      throw new ConflictException('Only a Planner or System Admin may verify a step (REQ-ENG-005).');
    }
    if (
      user.role !== Role.SystemAdmin &&
      step.executedBy !== null &&
      idValue(step.executedBy) === user.userId
    ) {
      throw new ConflictException(
        'The verifier may not be the step executor (BR-03, REQ-ENG-007).',
      );
    }
  }

  /** A step is editable only while its WO is not Pending_Amendment (PRD §3.3). */
  private async assertWorkOrderNotFrozen(step: AssignmentDto): Promise<void> {
    const wo = await this.gateway.repos.workOrders.getById(idValue(step.workOrderId));
    if (wo && wo.status === WorkOrderStatus.PendingAmendment) {
      throw new ConflictException(
        'The work order is pending amendment; its open step is frozen (PRD §3.3).',
      );
    }
  }

  /** Resolve the Start instant, validating an entered-earlier time (REQ-ENG-014). */
  private resolveStartTime(
    step: AssignmentDto,
    input: { startedAt?: string; reason?: string },
    now: Date,
  ): string {
    if (input.startedAt === undefined) {
      return now.toISOString();
    }
    if (!input.reason?.trim()) {
      throw new BadRequestException('An entered-earlier start needs a reason (REQ-ENG-014).');
    }
    const entered = Date.parse(input.startedAt);
    if (Number.isNaN(entered)) {
      throw new BadRequestException('Invalid start time.');
    }
    if (entered > now.getTime()) {
      throw new BadRequestException('A start cannot be in the future (REQ-ENG-014).');
    }
    const earliestAllowed = now.getTime() - MAX_ENTERED_START_MINUTES * 60 * 1000;
    if (entered < earliestAllowed) {
      throw new BadRequestException('A start may be entered at most 2 hours back (REQ-ENG-014).');
    }
    // Never before the step opened (REQ-ENG-014).
    const openedAt = this.timeEvents.openedAtOfAttempt(idValue(step.id), step.attemptNo) ?? step.openedAt;
    if (openedAt !== null && entered < Date.parse(openedAt)) {
      throw new BadRequestException('A start cannot be earlier than when the step opened (REQ-ENG-014).');
    }
    return new Date(entered).toISOString();
  }

  /**
   * On submit, open the next locked step at once (REQ-ENG-002) and record its
   * Open time event; if no step remains locked, ask the WO service to move to
   * Pending_Verification when every step is now Submitted/Verified/Skipped
   * (SM-WO T11).
   */
  private async openNextOrRequireVerification(
    step: AssignmentDto,
    ctx: UnitOfWorkContext,
  ): Promise<void> {
    const siblings = [...(await ctx.repos.assignments.findBy('workOrderId', step.workOrderId))].sort(
      (a, b) => a.sequence - b.sequence,
    );
    const next = siblings.find((s) => s.sequence > step.sequence && s.status === StepStatus.Locked);
    if (next) {
      const openedAt = new Date().toISOString();
      const opened = await ctx.repos.assignments.update({
        ...next,
        status: smStep.transition(next.status, StepEvent.WoApprovedOrPrevSubmitted),
        openedAt,
      });
      this.timeEvents.append({
        assignmentId: idValue(opened.id),
        attemptNo: opened.attemptNo,
        event: 'Open',
        at: openedAt,
        actorId: null,
      });
      return;
    }
    // No locked step remains: the WO may now be ready for verification (T11).
    await this.workOrders.onLastStepSubmitted(idValue(step.workOrderId), ctx);
  }
}
