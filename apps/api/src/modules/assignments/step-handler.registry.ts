import { Injectable } from '@nestjs/common';
import type { AssignmentDto } from '@bmi/shared';
import type { UnitOfWorkContext } from '@bmi/data-gateway';
import type { CurrentUser } from '../../core/auth/current-user.js';

/**
 * A module-specific side-effect handler for a step kind (FG-4..FG-6).
 *
 * The {@link AssignmentsService} engine is **module-agnostic** (PR-6,
 * REQ-REG-006): it drives the SM-STEP lifecycle for every step the same way and
 * never branches on a module code. The *domain consequences* of a transition —
 * what happens to stock/cost when a Stock step is submitted, what a Part
 * Purchase step records — are the concern of each module, not the engine. A
 * module expresses those consequences by registering a handler under its
 * registry `code` ({@link StepHandlerRegistry}); the engine invokes the matching
 * handler, if any, **inside the same `unitOfWork`** as the SM-STEP write, so the
 * side effects commit or roll back atomically with the status change (NFR-01).
 *
 * Every hook is optional — a module that has no extra side effect on an event
 * simply does not implement it (and most modules register no handler at all, so
 * the engine's behaviour for them is unchanged).
 */
export interface StepHandler {
  /**
   * Run the module's side effects when a step of this kind is **submitted**
   * (SM-STEP In_Progress → Submitted), in the engine's transaction. A throw
   * here rolls back the whole submit — the step stays In_Progress and no
   * partial domain state survives (REQ-STK-003 "if any part fails, nothing
   * changes").
   *
   * @param step the step *before* the submit write (its id/version are stable)
   * @param user the executor submitting the step
   * @param ctx  the engine's unit-of-work context (shared transaction)
   */
  onSubmit?(step: AssignmentDto, user: CurrentUser, ctx: UnitOfWorkContext): Promise<void> | void;

  /**
   * Run the module's side effects when a step of this kind is **verified**
   * (SM-STEP Submitted → Verified), in the engine's transaction. Used by the
   * Stock step for the *verified reversal* path (BR-06, TX-05): a pending
   * reversal returns stock only once the step that carries it is verified.
   */
  onVerify?(step: AssignmentDto, user: CurrentUser, ctx: UnitOfWorkContext): Promise<void> | void;
}

/**
 * The engine's **step-handler registry** — a neutral seam the module-agnostic
 * {@link AssignmentsService} depends on. A feature module (Stock, Part Purchase,
 * …) registers its {@link StepHandler} under its registry `code`
 * (`assignment_modules.code`, e.g. `Stock`, `Part_Purchase`) at module init; the
 * engine looks a handler up **by the step's own `moduleCode`** and never names a
 * code itself, so adding a module's side effects is a registration, not an
 * engine edit (PR-6, REQ-REG-006).
 */
@Injectable()
export class StepHandlerRegistry {
  private readonly handlers = new Map<string, StepHandler>();

  /** Register (or replace) the handler for a module code. */
  register(moduleCode: string, handler: StepHandler): void {
    this.handlers.set(moduleCode.trim().toUpperCase(), handler);
  }

  /** The handler registered for a module code, or `undefined` if none. */
  get(moduleCode: string): StepHandler | undefined {
    return this.handlers.get(moduleCode.trim().toUpperCase());
  }

  /** Invoke the submit hook for a step's module, if a handler is registered. */
  async runSubmit(step: AssignmentDto, user: CurrentUser, ctx: UnitOfWorkContext): Promise<void> {
    await this.get(step.moduleCode)?.onSubmit?.(step, user, ctx);
  }

  /** Invoke the verify hook for a step's module, if a handler is registered. */
  async runVerify(step: AssignmentDto, user: CurrentUser, ctx: UnitOfWorkContext): Promise<void> {
    await this.get(step.moduleCode)?.onVerify?.(step, user, ctx);
  }

  /** Test-only reset so a suite starts from no registered handlers. */
  resetForTests(): void {
    this.handlers.clear();
  }
}
