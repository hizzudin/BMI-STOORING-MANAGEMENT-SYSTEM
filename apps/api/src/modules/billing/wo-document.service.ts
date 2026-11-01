import { Injectable } from '@nestjs/common';
import {
  WorkOrderStatus,
  idValue,
  type AssignmentDto,
  type WorkOrderDto,
} from '@bmi/shared';
import { formatDateTimeWib } from '@bmi/config';
import { WorkOrdersService } from '../work-orders/work-orders.service.js';
import { StepTimeEventService } from '../assignments/step-time-event.service.js';
import { PlacementService, type PlacementSnapshot } from '../placement/placement.service.js';

/**
 * One phase of the execution-time table (REQ-WOD-008). Durations are seconds.
 */
export interface ExecutionTimePhase {
  readonly key:
    | 'waited_to_start'
    | 'worked'
    | 'paused'
    | 'waited_for_verification';
  readonly label: string;
  readonly seconds: number;
}

/** The execution-time row for one step (REQ-WOD-008, AC-WOD-008). */
export interface ExecutionTimeRow {
  readonly assignmentId: number;
  readonly sequence: number;
  readonly moduleCode: string;
  readonly openedAt: string | null;
  readonly startedAt: string | null;
  readonly submittedAt: string | null;
  readonly verifiedAt: string | null;
  /** The number of returns (REQ-ENG-015). */
  readonly returns: number;
  /** Whether the start was entered from an earlier time (REQ-ENG-014, marked). */
  readonly startEntered: boolean;
  readonly phases: readonly ExecutionTimePhase[];
}

/** One line of the approval block (REQ-WOD-003). */
export interface ApprovalLine {
  readonly kind: 'creation' | 'completion';
  readonly name: string | null;
  readonly role: string | null;
  readonly at: string | null;
  readonly selfApproved: boolean;
  /** The completion line stays empty until granted (REQ-WOD-003). */
  readonly granted: boolean;
}

/** The renderable WO document model (REQ-WOD-002/003/007/008). */
export interface WorkOrderDocumentModel {
  readonly workOrderId: number;
  readonly number: string;
  readonly status: WorkOrderStatus;
  readonly category: string;
  readonly priority: string;
  readonly source: string;
  readonly description: string;
  readonly vehicleId: number;
  /** Approval block: creation + completion lines (REQ-WOD-003). */
  readonly approvalBlock: readonly ApprovalLine[];
  /** Per-step execution-time table (REQ-WOD-008). */
  readonly executionTime: readonly ExecutionTimeRow[];
  /** The phase (step + phase key) with the longest duration, marked (REQ-WOD-008). */
  readonly longestPhase: { assignmentId: number; phaseKey: string; seconds: number } | null;
  /** B/W placement snapshots (one per Part_Replacement step), REQ-PLC-014/REQ-WOD-007. */
  readonly placementSnapshots: readonly PlacementSnapshot[];
}

/** A generated (stub) PDF artifact for the WO document (REQ-WOD-001). */
export interface RenderedDocument {
  readonly kind: 'pdf';
  readonly fileName: string;
  /** Stub — the renderable model serialized as text; TASK-206 produces real PDF bytes. */
  readonly placeholder: true;
  readonly content: string;
}

/**
 * **WO document renderer** (FG-11, REQ-WOD, DEC-33, DEC-87).
 *
 * Builds the renderable WO document model — the approval block (REQ-WOD-003),
 * the per-step execution-time table with the longest phase and entered-start
 * times marked (REQ-WOD-008), and the black-and-white placement snapshot
 * reused from the Placement module (REQ-PLC-014/REQ-WOD-007) — and a
 * **PDF-generation stub**.
 *
 * The execution-time table is derived from the `step_time_events` ledger
 * ({@link StepTimeEventService}) exactly once, here; these times are part of the
 * WO document and **never appear on any invoice** (DEC-87, AC-WOD-008) — the
 * {@link InvoiceService} never reads them.
 *
 * Real PDF rendering is deliberately deferred to TASK-206: pulling a heavy PDF
 * engine into Phase 1 is out of scope, so {@link render} returns a lightweight
 * placeholder artifact that serializes the model. The model itself is complete
 * and print-ready (B/W, statuses as words, DEC-33).
 */
@Injectable()
export class WoDocumentService {
  constructor(
    private readonly workOrders: WorkOrdersService,
    private readonly stepTimes: StepTimeEventService,
    private readonly placement: PlacementService,
  ) {}

  /** Build the renderable document model for a WO (REQ-WOD-002..008). */
  async buildModel(workOrderId: number): Promise<WorkOrderDocumentModel> {
    const wo = await this.workOrders.require(workOrderId);
    const steps = await this.workOrders.stepsOf(workOrderId);

    const executionTime = steps.map((s) => this.executionRow(s));
    const longestPhase = this.longestPhaseOf(executionTime);
    const placementSnapshots = this.placementSnapshotsOf(steps);

    return {
      workOrderId: idValue(wo.id),
      number: wo.number,
      status: wo.status,
      category: wo.category,
      priority: wo.priority,
      source: wo.source,
      description: wo.description,
      vehicleId: idValue(wo.vehicleId),
      approvalBlock: this.approvalBlock(wo),
      executionTime,
      longestPhase,
      placementSnapshots,
    };
  }

  /**
   * Render the WO document to a (stub) PDF artifact (REQ-WOD-001). Phase 1: a
   * placeholder that serializes the model; TASK-206 swaps in real PDF bytes.
   */
  async render(workOrderId: number): Promise<RenderedDocument> {
    const model = await this.buildModel(workOrderId);
    return {
      kind: 'pdf',
      fileName: `${model.number}.pdf`,
      placeholder: true,
      content: JSON.stringify(model, null, 2),
    };
  }

  // --- execution-time table (REQ-WOD-008) ---------------------------------

  /** Build the execution-time row for one step from its time-event ledger. */
  private executionRow(step: AssignmentDto): ExecutionTimeRow {
    const events = this.stepTimes.forAssignment(idValue(step.id));
    const duration = this.stepTimes.durationOf(idValue(step.id));

    const openAt = this.firstEventAt(events, 'Open');
    const startAt = this.firstEventAt(events, 'Start');
    const submitAt = this.lastEventAt(events, 'Submit');
    const verifyAt = this.lastEventAt(events, 'Verify');
    const returns = events.filter((e) => e.event === 'Return').length;

    const waitedToStart = this.diffSeconds(openAt, startAt);
    const waitedForVerification = this.diffSeconds(submitAt, verifyAt);

    const phases: ExecutionTimePhase[] = [
      { key: 'waited_to_start', label: 'Waited to start', seconds: waitedToStart },
      { key: 'worked', label: 'Worked', seconds: duration.workedSeconds },
      { key: 'paused', label: 'Paused', seconds: duration.pausedSeconds },
      { key: 'waited_for_verification', label: 'Waited for verification', seconds: waitedForVerification },
    ];

    return {
      assignmentId: idValue(step.id),
      sequence: step.sequence,
      moduleCode: step.moduleCode,
      openedAt: openAt,
      startedAt: startAt,
      submittedAt: submitAt,
      verifiedAt: verifyAt,
      returns,
      startEntered: step.startEntered,
      phases,
    };
  }

  /** The single longest phase across all steps (REQ-WOD-008 "the longest phase... marked"). */
  private longestPhaseOf(
    rows: readonly ExecutionTimeRow[],
  ): { assignmentId: number; phaseKey: string; seconds: number } | null {
    let best: { assignmentId: number; phaseKey: string; seconds: number } | null = null;
    for (const row of rows) {
      for (const phase of row.phases) {
        if (phase.seconds > 0 && (best === null || phase.seconds > best.seconds)) {
          best = { assignmentId: row.assignmentId, phaseKey: phase.key, seconds: phase.seconds };
        }
      }
    }
    return best;
  }

  // --- approval block (REQ-WOD-003) ---------------------------------------

  /** Creation + completion approval lines; completion stays empty until granted. */
  private approvalBlock(wo: WorkOrderDto): readonly ApprovalLine[] {
    const creationGranted = wo.approvedBy !== null;
    const completionGranted = wo.status === WorkOrderStatus.Completed && wo.completedAt !== null;
    return [
      {
        kind: 'creation',
        name: creationGranted ? `User ${idValue(wo.approvedBy!)}` : null,
        role: creationGranted ? 'Approver' : null,
        at: wo.approvedAt ? formatDateTimeWib(new Date(wo.approvedAt)) : null,
        selfApproved: creationGranted && idValue(wo.approvedBy!) === idValue(wo.createdBy),
        granted: creationGranted,
      },
      {
        kind: 'completion',
        name: completionGranted ? 'Approver' : null,
        role: completionGranted ? 'Approver' : null,
        at: completionGranted && wo.completedAt ? formatDateTimeWib(new Date(wo.completedAt)) : null,
        selfApproved: false,
        granted: completionGranted,
      },
    ];
  }

  // --- placement snapshot (REQ-PLC-014 / REQ-WOD-007) ---------------------

  /** The B/W placement snapshots captured by the Part_Replacement steps. */
  private placementSnapshotsOf(steps: readonly AssignmentDto[]): readonly PlacementSnapshot[] {
    const snapshots: PlacementSnapshot[] = [];
    for (const step of steps) {
      const snapshot = this.placement.snapshotOf(idValue(step.id));
      if (snapshot) {
        snapshots.push(snapshot);
      }
    }
    return snapshots;
  }

  // --- helpers -------------------------------------------------------------

  private firstEventAt(
    events: readonly { event: string; at: string }[],
    kind: string,
  ): string | null {
    const match = events.find((e) => e.event === kind);
    return match ? match.at : null;
  }

  private lastEventAt(
    events: readonly { event: string; at: string }[],
    kind: string,
  ): string | null {
    const matches = events.filter((e) => e.event === kind);
    return matches.length === 0 ? null : matches[matches.length - 1]!.at;
  }

  private diffSeconds(from: string | null, to: string | null): number {
    if (!from || !to) {
      return 0;
    }
    const seconds = Math.round((Date.parse(to) - Date.parse(from)) / 1000);
    return seconds > 0 ? seconds : 0;
  }
}
