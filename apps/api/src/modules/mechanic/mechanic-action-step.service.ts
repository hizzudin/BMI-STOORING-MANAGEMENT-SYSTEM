import { BadRequestException, Injectable } from '@nestjs/common';
import { idValue, Team, type AssignmentDto } from '@bmi/shared';
import { roundAmount } from '@bmi/config';
import { ServiceCatalogService } from './service-catalog.service.js';

/** A saved Mechanic Action service line (`work_order_services`, PRD §9.7). */
export interface WorkOrderServiceLine {
  readonly team: Team;
  /** Internal: the catalog service id/code; null for External. */
  readonly serviceCode: string | null;
  /** External: the vendor/workshop name; null for Internal. */
  readonly vendorName: string | null;
  readonly description: string;
  /** Price snapshot (BR-07): catalog price for Internal, free price for External. */
  readonly price: number;
}

/** Input to stage a Mechanic Action step (REQ-MEC-001..003). */
export interface StageMechanicActionInput {
  readonly team: Team;
  readonly internalServices?: readonly { serviceCode: string }[];
  readonly vendor?: string;
  readonly externalServices?: readonly { description: string; price: number }[];
  readonly photos?: readonly string[];
}

/** A submitted Mechanic Action (`work_order_services` set + labor cost). */
export interface MechanicAction {
  readonly stepId: number;
  readonly workOrderId: number;
  readonly team: Team;
  readonly lines: readonly WorkOrderServiceLine[];
  /** Sum of the line prices (REQ-MEC-004). */
  readonly laborCost: number;
  readonly photos: readonly string[];
  /**
   * DEC-90: a Mechanic Action step adds **Rp 0** stooring and holds **no**
   * location. These are recorded explicitly so a reader (and AC-MEC-004/005)
   * can see the retirement, not an omission; the stooring fee is produced by the
   * WO's Mobilisasi step instead (TASK-110a).
   */
  readonly stooringCost: 0;
  readonly location: null;
}

/**
 * **Mechanic Action step** business rules (FG-5, REQ-MEC, BR-07, DEC-90).
 *
 * Records the services performed on a WO with proof and price. The executor
 * chooses the team first (Internal or External, REQ-MEC-001). Internal takes
 * services and prices **only** from the service catalog (price read-only,
 * REQ-MEC-002) and needs at least one repair photo; External takes a vendor, a
 * free description and a free price (REQ-MEC-003) and needs at least one invoice
 * image. Labor cost is the sum of the service lines (REQ-MEC-004). Each line's
 * price is snapshotted at submit so a later catalog change never moves it (BR-07,
 * AC-MEC-003).
 *
 * **DEC-90 retirement (REQ-MEC-007..009 retired).** This step captures **no
 * device position** (AC-MEC-004) and charges **Rp 0 stooring** (AC-MEC-005).
 * There is no location field or stooring calculation anywhere in this service —
 * the work location lives on the WO's Mobilisasi step and the stooring fee is
 * produced there (TASK-110a).
 *
 * Phase-1 modelling: the staged input and the submitted action (`work_order_services`
 * + the WO labor cost) are API-layer in-memory state keyed by assignment /
 * work-order id (the dummy gateway carries no `work_order_services`);
 * TASK-201/202 re-home them behind the PRD §9.7 columns.
 */
@Injectable()
export class MechanicActionStepService {
  /** Staged input per Mechanic-Action-step assignment id. */
  private readonly staged = new Map<number, StageMechanicActionInput>();
  /** Submitted action per step id. */
  private readonly actions = new Map<number, MechanicAction>();
  /** Accumulated labor cost per WO id (REQ-MEC-004). */
  private readonly laborCost = new Map<number, number>();

  constructor(private readonly catalog: ServiceCatalogService) {}

  /** Stage the step's input (before the engine submit runs). */
  stage(stepId: number, input: StageMechanicActionInput): void {
    this.staged.set(stepId, input);
  }

  /** The staged input of a step, or `undefined`. */
  stagedOf(stepId: number): StageMechanicActionInput | undefined {
    return this.staged.get(stepId);
  }

  /** The submitted action of a step, or `undefined`. */
  actionOf(stepId: number): MechanicAction | undefined {
    return this.actions.get(stepId);
  }

  /** The accumulated labor cost of a WO (0 if none). */
  laborCostOf(workOrderId: number): number {
    return this.laborCost.get(workOrderId) ?? 0;
  }

  /**
   * The **submit** side effect of a Mechanic Action step (REQ-MEC-001..004,
   * BR-07, DEC-90). Builds the service lines (Internal from the catalog with the
   * price read-only and snapshotted, External with a free price), requires the
   * right photo (repair for Internal, invoice for External), sums the labor cost
   * onto the WO, and records **Rp 0 stooring + no location** (the retirement).
   * Changes no stock and no catalog.
   *
   * Runs inside the engine transaction via the step-handler registry, but only
   * mutates in-memory service state — it never touches the warehouse ledger.
   */
  submit(step: AssignmentDto, input: StageMechanicActionInput): MechanicAction {
    const stepId = idValue(step.id);
    const workOrderId = idValue(step.workOrderId);
    const lines: WorkOrderServiceLine[] = [];

    if (input.team === Team.Internal) {
      const services = input.internalServices ?? [];
      if (services.length === 0) {
        throw new BadRequestException(
          'An Internal Mechanic Action needs at least one catalog service (REQ-MEC-002).',
        );
      }
      for (const s of services) {
        // Price is READ-ONLY from the catalog and snapshotted now (BR-07, AC-MEC-001/003).
        const svc = this.catalog.require(s.serviceCode);
        lines.push({
          team: Team.Internal,
          serviceCode: svc.serviceCode,
          vendorName: null,
          description: svc.serviceName,
          price: svc.standardPrice,
        });
      }
      // REQ-MEC-002: at least one repair photo.
      if ((input.photos ?? []).length === 0) {
        throw new BadRequestException('An Internal Mechanic Action needs at least one repair photo (REQ-MEC-002).');
      }
    } else {
      const services = input.externalServices ?? [];
      if (!input.vendor?.trim()) {
        throw new BadRequestException('An External Mechanic Action needs a vendor (REQ-MEC-003).');
      }
      if (services.length === 0) {
        throw new BadRequestException(
          'An External Mechanic Action needs at least one service line (REQ-MEC-003).',
        );
      }
      for (const s of services) {
        if (!s.description.trim()) {
          throw new BadRequestException('An external service needs a description (REQ-MEC-003).');
        }
        if (s.price < 0) {
          throw new BadRequestException('An external service price must not be negative (REQ-MEC-003).');
        }
        lines.push({
          team: Team.External,
          serviceCode: null,
          vendorName: input.vendor.trim(),
          description: s.description.trim(),
          price: roundAmount(s.price),
        });
      }
      // REQ-MEC-003: at least one invoice image (carried as a photo reference here).
      if ((input.photos ?? []).length === 0) {
        throw new BadRequestException('An External Mechanic Action needs at least one invoice image (REQ-MEC-003, AC-MEC-002).');
      }
    }

    const laborCost = roundAmount(lines.reduce((sum, l) => sum + l.price, 0));
    const action: MechanicAction = {
      stepId,
      workOrderId,
      team: input.team,
      lines,
      laborCost,
      photos: [...(input.photos ?? [])],
      // DEC-90: never a stooring charge, never a location on a Mechanic Action.
      stooringCost: 0,
      location: null,
    };
    this.actions.set(stepId, action);
    this.laborCost.set(workOrderId, roundAmount(this.laborCostOf(workOrderId) + laborCost));
    return action;
  }

  /**
   * The engine **submit** hook: record the staged Mechanic Action for this step.
   * Runs inside the engine transaction via the step-handler registry.
   *
   * A step with nothing staged is treated as a **no-op** (the engine's generic
   * lifecycle is not blocked), mirroring the Stock handler: the executor's
   * module-specific validation (team, services, photos — REQ-MEC-001..003) fires
   * when they *fill* the step, not as a hard engine block for a step that was
   * never filled. The real execution flow always stages before submit.
   */
  onSubmit(step: AssignmentDto): void {
    const stepId = idValue(step.id);
    const input = this.staged.get(stepId);
    if (!input) {
      return;
    }
    this.submit(step, input);
    this.staged.delete(stepId);
  }

  /** Test-only reset of all Mechanic Action state. */
  resetForTests(): void {
    this.staged.clear();
    this.actions.clear();
    this.laborCost.clear();
  }
}
