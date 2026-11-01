import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { idValue } from '@bmi/shared';
import { SEED_IDS } from '@bmi/data-gateway';
import { DataGatewayModule } from '../../core/data-gateway/data-gateway.module.js';
import { AuditModule } from '../../core/audit/audit.module.js';
import { WorkOrdersModule } from '../work-orders/work-orders.module.js';
import { PlacementModule } from '../placement/placement.module.js';
import { WorkOrdersService } from '../work-orders/work-orders.service.js';
import { StepTimeEventService } from '../assignments/step-time-event.service.js';
import { WoDocumentService } from './wo-document.service.js';

/**
 * Unit coverage for the WO document renderer (TASK-115, REQ-WOD, AC-WOD-008,
 * DEC-87). The seed WO-0142 has three steps; step 2 is the one AC-WOD-008
 * describes waiting 18 h 11 min for verification. The time-event ledger drives
 * the execution-time table; these times must never leak onto an invoice.
 */
describe('WoDocumentService (TASK-115)', () => {
  let docs: WoDocumentService;
  let workOrders: WorkOrdersService;
  let stepTimes: StepTimeEventService;

  const woId = idValue(SEED_IDS.workOrder);

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [DataGatewayModule, AuditModule, WorkOrdersModule, PlacementModule],
      providers: [WoDocumentService],
    }).compile();
    // Placement handlers register on init.
    await moduleRef.init();
    docs = moduleRef.get(WoDocumentService);
    workOrders = moduleRef.get(WorkOrdersService);
    stepTimes = moduleRef.get(StepTimeEventService);
    workOrders.resetForTests();
    stepTimes.resetForTests();
  });

  afterEach(() => {
    workOrders.resetForTests();
    stepTimes.resetForTests();
  });

  it('AC-WOD-008 — the execution-time table marks step 2 waiting 18 h 11 min as the longest phase', async () => {
    const steps = await workOrders.stepsOf(woId);
    const step2 = steps[1]!;
    const step2Id = idValue(step2.id);

    // Step 1: a quick worked window (10 min), opened→started 2 min.
    const step1Id = idValue(steps[0]!.id);
    stepTimes.append({ assignmentId: step1Id, attemptNo: 1, event: 'Open', at: '2026-10-26T03:00:00.000Z' });
    stepTimes.append({ assignmentId: step1Id, attemptNo: 1, event: 'Start', at: '2026-10-26T03:02:00.000Z' });
    stepTimes.append({ assignmentId: step1Id, attemptNo: 1, event: 'Submit', at: '2026-10-26T03:12:00.000Z' });
    stepTimes.append({ assignmentId: step1Id, attemptNo: 1, event: 'Verify', at: '2026-10-26T03:20:00.000Z' });

    // Step 2: submitted, then waited 18 h 11 min (65.460 s) for verification.
    stepTimes.append({ assignmentId: step2Id, attemptNo: 1, event: 'Open', at: '2026-10-26T03:20:00.000Z' });
    stepTimes.append({ assignmentId: step2Id, attemptNo: 1, event: 'Start', at: '2026-10-26T03:25:00.000Z' });
    stepTimes.append({ assignmentId: step2Id, attemptNo: 1, event: 'Submit', at: '2026-10-26T04:00:00.000Z' });
    stepTimes.append({ assignmentId: step2Id, attemptNo: 1, event: 'Verify', at: '2026-10-26T22:11:00.000Z' });

    const model = await docs.buildModel(woId);

    const row2 = model.executionTime.find((r) => r.assignmentId === step2Id)!;
    const waited = row2.phases.find((p) => p.key === 'waited_for_verification')!;
    expect(waited.seconds).toBe(18 * 3600 + 11 * 60); // 18 h 11 min

    // The longest phase across the whole table is step 2's wait-for-verification.
    expect(model.longestPhase).not.toBeNull();
    expect(model.longestPhase!.assignmentId).toBe(step2Id);
    expect(model.longestPhase!.phaseKey).toBe('waited_for_verification');
    expect(model.longestPhase!.seconds).toBe(18 * 3600 + 11 * 60);
  });

  it('builds the approval block with a creation line and an empty completion line until granted (REQ-WOD-003)', async () => {
    const model = await docs.buildModel(woId);
    const creation = model.approvalBlock.find((l) => l.kind === 'creation')!;
    const completion = model.approvalBlock.find((l) => l.kind === 'completion')!;
    // The seed WO-0142 is approved (creation granted) but In_Progress (completion not granted).
    expect(creation.granted).toBe(true);
    expect(completion.granted).toBe(false);
    expect(completion.at).toBeNull();
  });

  it('renders a PDF stub (placeholder) rather than real PDF bytes (REQ-WOD-001; real PDF = TASK-206)', async () => {
    const rendered = await docs.render(woId);
    expect(rendered.kind).toBe('pdf');
    expect(rendered.placeholder).toBe(true);
    expect(rendered.fileName).toBe('WO-0142.pdf');
    expect(rendered.content).toContain('"number": "WO-0142"');
  });
});
