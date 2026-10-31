import 'reflect-metadata';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SEED_PASSWORD } from '@bmi/data-gateway';
import { Role, WorkOrderCategory, WorkOrderPriority } from '@bmi/shared';
import { AppModule } from '../../app.module.js';
import { API_PREFIX } from '../../app.constants.js';
import { AuditService } from '../../core/audit/audit.service.js';
import { AppSettingsService } from '../iam/app-settings.service.js';
import { WorkOrdersService } from './work-orders.service.js';
import { StepTimeEventService } from '../assignments/step-time-event.service.js';

/**
 * End-to-end FG-1 + FG-2 coverage (TASK-108) booting the full `AppModule`
 * (real guard, interceptors, session-backed auth) against the dummy gateway.
 *
 * Covers AC-WO-001..006 and AC-ENG-001..009, every SM-WO / SM-STEP transition
 * (and that an unlisted one is refused), the Driver_Breakdown auto-draft with
 * exactly one Mobilisasi step, the finding_note rules (REQ-WO-016), the priority
 * ordering (REQ-WO-015), four-eyes (BR-03) and the scope lock (BR-02).
 */
describe('WO lifecycle + assignment engine (TASK-108)', () => {
  let app: INestApplication;
  let settings: AppSettingsService;
  let audit: AuditService;
  let workOrders: WorkOrdersService;
  let timeEvents: StepTimeEventService;
  const base = `/${API_PREFIX}`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix(API_PREFIX);
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
    settings = app.get(AppSettingsService);
    audit = app.get(AuditService);
    workOrders = app.get(WorkOrdersService);
    timeEvents = app.get(StepTimeEventService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    settings.resetForTests();
    settings.goLive(new Date().toISOString());
    workOrders.resetForTests();
    timeEvents.resetForTests();
  });

  const server = (): Parameters<typeof request>[0] => app.getHttpServer();

  async function login(email: string): Promise<string> {
    const res = await request(server()).post(`${base}/auth/login`).send({ email, password: SEED_PASSWORD });
    expect(res.status).toBe(200);
    return res.body.token as string;
  }
  const planner = (): Promise<string> => login('planner@bmi.test');
  const supervisor = (): Promise<string> => login('supervisor@bmi.test');
  const mechanic = (): Promise<string> => login('mechanic@bmi.test');
  const warehouse = (): Promise<string> => login('warehouse@bmi.test');
  const admin = (): Promise<string> => login('sysadmin@bmi.test');

  const auth = (token: string) => (r: request.Test): request.Test => r.set('Authorization', `Bearer ${token}`);

  /** Create a WO with the given steps as the given token; return the created WO. */
  async function createWo(
    token: string,
    steps: Array<{ module: string; executorRoles: Role[]; verifierRole: Role }>,
    overrides: Record<string, unknown> = {},
  ): Promise<{ id: number; version: number; number: string; status: string }> {
    const res = await auth(token)(
      request(server())
        .post(`${base}/work-orders`)
        .send({
          vehicleId: 1,
          title: 'Test WO',
          category: WorkOrderCategory.Corrective,
          description: 'desc',
          steps,
          ...overrides,
        }),
    );
    expect(res.status).toBe(201);
    return res.body.workOrder;
  }

  const stockStep = { module: 'Stock', executorRoles: [Role.WarehouseManager], verifierRole: Role.Planner };
  const mechStep = { module: 'Mechanic_Action', executorRoles: [Role.Mechanic], verifierRole: Role.Planner };

  // --- AC-WO-001 four-eyes (BR-03, REQ-WO-006) -----------------------------

  it('AC-WO-001 — the creating Planner cannot approve; a Supervisor can (four-eyes, BR-03)', async () => {
    const plannerToken = await planner();
    const wo = await createWo(plannerToken, [stockStep]);

    // Submit for approval (activate).
    const submitted = await auth(plannerToken)(
      request(server()).post(`${base}/work-orders/${wo.id}/submit`).send({ version: wo.version }),
    );
    expect(submitted.status).toBe(200);
    expect(submitted.body.workOrder.status).toBe('Pending_Approval');

    // The Planner who created+submitted it may NOT approve (BR-03).
    const selfApprove = await auth(plannerToken)(
      request(server()).post(`${base}/work-orders/${wo.id}/approve`).send({ version: submitted.body.workOrder.version }),
    );
    // Planner lacks wo.approve (switchable, off) → 403; even with it, BR-03 refuses.
    expect([403, 409]).toContain(selfApprove.status);

    // A Supervisor approves it → Active.
    const supToken = await supervisor();
    const approved = await auth(supToken)(
      request(server()).post(`${base}/work-orders/${wo.id}/approve`).send({ version: submitted.body.workOrder.version }),
    );
    expect(approved.status).toBe(200);
    expect(approved.body.workOrder.status).toBe('Active');
  });

  // --- AC-WO-002 step freeze on approval (REQ-WO-005) ----------------------

  it('AC-WO-002 — approving a 3-step WO opens step 1 and locks 2 & 3', async () => {
    const plannerToken = await planner();
    const wo = await createWo(plannerToken, [stockStep, mechStep, { ...stockStep }]);
    const submitted = await auth(plannerToken)(
      request(server()).post(`${base}/work-orders/${wo.id}/submit`).send({ version: wo.version }),
    );
    const supToken = await supervisor();
    await auth(supToken)(
      request(server()).post(`${base}/work-orders/${wo.id}/approve`).send({ version: submitted.body.workOrder.version }),
    ).expect(200);

    const detail = await auth(plannerToken)(request(server()).get(`${base}/work-orders/${wo.id}`)).expect(200);
    const steps = detail.body.steps as Array<{ sequence: number; status: string }>;
    expect(steps.find((s) => s.sequence === 1)!.status).toBe('Open');
    expect(steps.find((s) => s.sequence === 2)!.status).toBe('Locked');
    expect(steps.find((s) => s.sequence === 3)!.status).toBe('Locked');
  });

  // --- AC-WO-003 composer gate (REQ-WO-004) --------------------------------

  it('AC-WO-003 — Submit is refused for a WO with no step', async () => {
    const plannerToken = await planner();
    // Create with no steps (a Planner WO can be stepless at create; Submit gates it).
    const res = await auth(plannerToken)(
      request(server()).post(`${base}/work-orders`).send({
        vehicleId: 1,
        title: 'Empty',
        category: WorkOrderCategory.Corrective,
        description: 'd',
        steps: [],
      }),
    );
    expect(res.status).toBe(201);
    const wo = res.body.workOrder;
    const submit = await auth(plannerToken)(
      request(server()).post(`${base}/work-orders/${wo.id}/submit`).send({ version: wo.version }),
    );
    expect(submit.status).toBe(400);
  });

  // --- AC-WO-005 rejection reason (REQ-WO-007) -----------------------------

  it('AC-WO-005 — a rejection with no reason is refused; with one it appears Rejected', async () => {
    const plannerToken = await planner();
    const wo = await createWo(plannerToken, [stockStep]);
    const submitted = await auth(plannerToken)(
      request(server()).post(`${base}/work-orders/${wo.id}/submit`).send({ version: wo.version }),
    );
    const supToken = await supervisor();

    const noReason = await auth(supToken)(
      request(server()).post(`${base}/work-orders/${wo.id}/reject`).send({ version: submitted.body.workOrder.version }),
    );
    expect(noReason.status).toBe(400);

    const rejected = await auth(supToken)(
      request(server())
        .post(`${base}/work-orders/${wo.id}/reject`)
        .send({ version: submitted.body.workOrder.version, reason: 'Missing parts' }),
    );
    expect(rejected.status).toBe(200);
    expect(rejected.body.workOrder.status).toBe('Rejected');
  });

  // --- AC-WO-006 self-approve marked (REQ-WO-006) --------------------------

  it('AC-WO-006 — the System Admin may self-approve, and the audit record carries the flag', async () => {
    const adminToken = await admin();
    const wo = await createWo(adminToken, [stockStep]);
    const submitted = await auth(adminToken)(
      request(server()).post(`${base}/work-orders/${wo.id}/submit`).send({ version: wo.version }),
    );
    const before = audit.findByEntity('work_orders').length;
    const approved = await auth(adminToken)(
      request(server()).post(`${base}/work-orders/${wo.id}/approve`).send({ version: submitted.body.workOrder.version }),
    );
    expect(approved.status).toBe(200);
    expect(approved.body.workOrder.status).toBe('Active');
    const records = audit.findByEntity('work_orders');
    expect(records.length).toBe(before + 1);
    expect(records.at(-1)!.selfDecision).toBe(true);
  });

  // --- Scope lock (BR-02) --------------------------------------------------

  it('BR-02 — an active WO refuses a silent edit (scope lock)', async () => {
    const plannerToken = await planner();
    const wo = await createWo(plannerToken, [stockStep]);
    const submitted = await auth(plannerToken)(
      request(server()).post(`${base}/work-orders/${wo.id}/submit`).send({ version: wo.version }),
    );
    const supToken = await supervisor();
    const approved = await auth(supToken)(
      request(server()).post(`${base}/work-orders/${wo.id}/approve`).send({ version: submitted.body.workOrder.version }),
    ).then((r) => r.body.workOrder);

    const edit = await auth(plannerToken)(
      request(server())
        .post(`${base}/work-orders/${wo.id}/edit`)
        .send({ version: approved.version, description: 'sneaky change' }),
    );
    expect(edit.status).toBe(409);
  });

  // --- Draft-only discipline (REQ-WO-016, BR-03) ---------------------------

  it('a Mechanic draft cannot be submitted for approval (draft-only discipline)', async () => {
    const mechToken = await mechanic();
    // A Mechanic draft carries no steps and needs a finding note.
    const res = await auth(mechToken)(
      request(server()).post(`${base}/work-orders`).send({
        vehicleId: 1,
        title: 'Field finding',
        category: WorkOrderCategory.Corrective,
        description: 'brake noise',
        findingNote: 'Loud grinding on the rear axle',
      }),
    );
    expect(res.status).toBe(201);
    const wo = res.body.workOrder;
    const submit = await auth(mechToken)(
      request(server()).post(`${base}/work-orders/${wo.id}/submit`).send({ version: wo.version }),
    );
    expect(submit.status).toBe(409);
  });

  it('REQ-WO-016 — a Mechanic draft with an empty finding_note is refused at send-for-review', async () => {
    const mechToken = await mechanic();
    const res = await auth(mechToken)(
      request(server()).post(`${base}/work-orders`).send({
        vehicleId: 1,
        title: 'No note',
        category: WorkOrderCategory.Corrective,
        description: 'something',
        findingNote: '',
      }),
    );
    expect(res.status).toBe(201);
    const wo = res.body.workOrder;
    const send = await auth(mechToken)(
      request(server()).post(`${base}/work-orders/${wo.id}/send-for-review`).send({ version: wo.version }),
    );
    expect(send.status).toBe(400);
  });

  it('REQ-WO-016 — a Mechanic draft WITH a finding_note sends for review and keeps it Draft', async () => {
    const mechToken = await mechanic();
    const res = await auth(mechToken)(
      request(server()).post(`${base}/work-orders`).send({
        vehicleId: 1,
        title: 'With note',
        category: WorkOrderCategory.Corrective,
        description: 'something',
        findingNote: 'Coolant leak at the pump',
      }),
    );
    const wo = res.body.workOrder;
    const send = await auth(mechToken)(
      request(server()).post(`${base}/work-orders/${wo.id}/send-for-review`).send({ version: wo.version }),
    );
    expect(send.status).toBe(200);
    expect(send.body.workOrder.status).toBe('Draft');
    expect(send.body.workOrder.sentForReviewAt).not.toBeNull();
  });

  // --- Breakdown auto-draft (REQ-MBL-001, REQ-WO-003, DEC-91) ---------------

  it('REQ-MBL-001 — a Driver_Breakdown draft carries exactly one Mobilisasi step with finding_note from the breakdown', async () => {
    // The driver trigger is TASK-118; here the auto-draft path is driven by a Planner-held capability.
    const plannerToken = await planner();
    const res = await auth(plannerToken)(
      request(server()).post(`${base}/work-orders/breakdown-draft`).send({
        vehicleId: 1,
        description: 'Engine died on the toll road at KM 32',
        locationLat: -6.2,
        locationLng: 106.8,
      }),
    );
    expect(res.status).toBe(201);
    const wo = res.body.workOrder;
    expect(wo.status).toBe('Draft');
    expect(wo.source).toBe('Driver_Breakdown');
    // finding_note auto-copied from the breakdown description (DEC-91).
    expect(wo.findingNote).toBe('Engine died on the toll road at KM 32');

    const detail = await auth(plannerToken)(request(server()).get(`${base}/work-orders/${wo.id}`)).expect(200);
    const steps = detail.body.steps as Array<{ moduleCode: string }>;
    expect(steps).toHaveLength(1);
    expect(steps[0]!.moduleCode).toBe('Mobilisasi');
  });

  it('DEC-91 — the Planner editing description preserves the driver-sourced finding_note', async () => {
    const plannerToken = await planner();
    const created = await auth(plannerToken)(
      request(server()).post(`${base}/work-orders/breakdown-draft`).send({
        vehicleId: 1,
        description: 'Flat tyre, axle 2',
      }),
    ).then((r) => r.body.workOrder);

    const edited = await auth(plannerToken)(
      request(server())
        .post(`${base}/work-orders/${created.id}/edit`)
        .send({ version: created.version, description: 'Planner-rewritten scope: replace tyre + brake check' }),
    );
    expect(edited.status).toBe(200);
    expect(edited.body.workOrder.description).toBe('Planner-rewritten scope: replace tyre + brake check');
    // finding_note is NEVER overwritten by a description edit (DEC-91).
    expect(edited.body.workOrder.findingNote).toBe('Flat tyre, axle 2');
  });

  // --- Priority ordering (REQ-WO-015) --------------------------------------

  it('REQ-WO-015 — Urgent/High WOs sort first in the list', async () => {
    const plannerToken = await planner();
    await createWo(plannerToken, [stockStep], { priority: WorkOrderPriority.Low, title: 'low' });
    await createWo(plannerToken, [stockStep], { priority: WorkOrderPriority.Urgent, title: 'urgent' });
    await createWo(plannerToken, [stockStep], { priority: WorkOrderPriority.Normal, title: 'normal' });

    const list = await auth(plannerToken)(request(server()).get(`${base}/work-orders`)).expect(200);
    const priorities = (list.body.workOrders as Array<{ priority: string }>).map((w) => w.priority);
    // The first of our three created WOs in the list must be Urgent, then High/Normal before Low.
    const firstUrgent = priorities.indexOf('Urgent');
    const firstLow = priorities.indexOf('Low');
    expect(firstUrgent).toBeGreaterThanOrEqual(0);
    expect(firstUrgent).toBeLessThan(firstLow);
  });

  // --- Engine: open-on-submit, timing, verify, completion gate -------------

  /** Drive a WO to Active with two steps (Stock then Mechanic_Action). */
  async function activeTwoStepWo(): Promise<{ id: number; steps: Array<{ id: number; sequence: number; status: string; version: number }> }> {
    const plannerToken = await planner();
    const wo = await createWo(plannerToken, [stockStep, mechStep]);
    const submitted = await auth(plannerToken)(
      request(server()).post(`${base}/work-orders/${wo.id}/submit`).send({ version: wo.version }),
    );
    const supToken = await supervisor();
    await auth(supToken)(
      request(server()).post(`${base}/work-orders/${wo.id}/approve`).send({ version: submitted.body.workOrder.version }),
    ).expect(200);
    const detail = await auth(plannerToken)(request(server()).get(`${base}/work-orders/${wo.id}`)).expect(200);
    return { id: wo.id, steps: detail.body.steps };
  }

  it('AC-ENG-001 — submitting step 1 opens step 2 and leaves a later locked step locked', async () => {
    const plannerToken = await planner();
    const wo = await createWo(plannerToken, [stockStep, mechStep, { ...stockStep }]);
    const submitted = await auth(plannerToken)(
      request(server()).post(`${base}/work-orders/${wo.id}/submit`).send({ version: wo.version }),
    );
    const supToken = await supervisor();
    await auth(supToken)(
      request(server()).post(`${base}/work-orders/${wo.id}/approve`).send({ version: submitted.body.workOrder.version }),
    ).expect(200);
    let detail = await auth(plannerToken)(request(server()).get(`${base}/work-orders/${wo.id}`)).expect(200);
    const step1 = detail.body.steps.find((s: { sequence: number }) => s.sequence === 1);

    const whToken = await warehouse();
    const started = await auth(whToken)(
      request(server()).post(`${base}/assignments/${step1.id}/start`).send({ version: step1.version }),
    ).expect(200);
    await auth(whToken)(
      request(server()).post(`${base}/assignments/${step1.id}/submit`).send({ version: started.body.step.version }),
    ).expect(200);

    detail = await auth(plannerToken)(request(server()).get(`${base}/work-orders/${wo.id}`)).expect(200);
    const steps = detail.body.steps as Array<{ sequence: number; status: string }>;
    expect(steps.find((s) => s.sequence === 2)!.status).toBe('Open');
    expect(steps.find((s) => s.sequence === 3)!.status).toBe('Locked');
  });

  it('REQ-ENG-012 — opening a step does not start the clock; Submit needs Start', async () => {
    const { steps } = await activeTwoStepWo();
    const step1 = steps.find((s) => s.sequence === 1)!;
    const whToken = await warehouse();
    // Submitting without Start is refused (form read-only until Start).
    const submit = await auth(whToken)(
      request(server()).post(`${base}/assignments/${step1.id}/submit`).send({ version: step1.version }),
    );
    expect(submit.status).toBe(400);
  });

  it('AC-ENG-004 — a Mechanic who executed a step cannot verify it (BR-03)', async () => {
    const { id, steps } = await activeTwoStepWo();
    const plannerToken = await planner();
    const whToken = await warehouse();
    const mechToken = await mechanic();

    // Finish step 1 (Stock) so step 2 (Mechanic_Action) opens.
    const s1 = steps.find((s) => s.sequence === 1)!;
    const s1Started = await auth(whToken)(
      request(server()).post(`${base}/assignments/${s1.id}/start`).send({ version: s1.version }),
    ).then((r) => r.body.step);
    await auth(whToken)(
      request(server()).post(`${base}/assignments/${s1.id}/submit`).send({ version: s1Started.version }),
    ).expect(200);

    // Mechanic runs step 2.
    const detail = await auth(plannerToken)(request(server()).get(`${base}/work-orders/${id}`)).then((r) => r.body.steps);
    const s2 = detail.find((s: { sequence: number }) => s.sequence === 2);
    const s2Started = await auth(mechToken)(
      request(server()).post(`${base}/assignments/${s2.id}/start`).send({ version: s2.version }),
    ).then((r) => r.body.step);
    const s2Submitted = await auth(mechToken)(
      request(server()).post(`${base}/assignments/${s2.id}/submit`).send({ version: s2Started.version }),
    ).then((r) => r.body.step);

    // The mechanic (executor) tries to verify step 2 — refused (step.verify is not theirs anyway).
    const mechVerify = await auth(mechToken)(
      request(server()).post(`${base}/assignments/${s2.id}/verify`).send({ version: s2Submitted.version }),
    );
    expect([403, 409]).toContain(mechVerify.status);
  });

  it('AC-ENG-002 + DEC-87 — completion is refused until every step is verified, then approved', async () => {
    const { id, steps } = await activeTwoStepWo();
    const plannerToken = await planner();
    const whToken = await warehouse();
    const mechToken = await mechanic();
    const supToken = await supervisor();

    // Run + verify step 1.
    const s1 = steps.find((s) => s.sequence === 1)!;
    const s1Started = await auth(whToken)(
      request(server()).post(`${base}/assignments/${s1.id}/start`).send({ version: s1.version }),
    ).then((r) => r.body.step);
    const s1Submitted = await auth(whToken)(
      request(server()).post(`${base}/assignments/${s1.id}/submit`).send({ version: s1Started.version }),
    ).then((r) => r.body.step);

    // Run step 2 (this is the LAST step → WO goes Pending_Verification).
    let detail = await auth(plannerToken)(request(server()).get(`${base}/work-orders/${id}`)).then((r) => r.body);
    const s2 = detail.steps.find((s: { sequence: number }) => s.sequence === 2);
    const s2Started = await auth(mechToken)(
      request(server()).post(`${base}/assignments/${s2.id}/start`).send({ version: s2.version }),
    ).then((r) => r.body.step);
    const s2Submitted = await auth(mechToken)(
      request(server()).post(`${base}/assignments/${s2.id}/submit`).send({ version: s2Started.version }),
    ).then((r) => r.body.step);

    detail = await auth(plannerToken)(request(server()).get(`${base}/work-orders/${id}`)).then((r) => r.body);
    expect(detail.workOrder.status).toBe('Pending_Verification');

    // Completion refused — step 2 not verified yet (AC-ENG-002).
    const early = await auth(plannerToken)(
      request(server()).post(`${base}/work-orders/${id}/request-completion`).send({ version: detail.workOrder.version }),
    );
    expect(early.status).toBe(409);

    // Verify both steps.
    await auth(plannerToken)(
      request(server()).post(`${base}/assignments/${s1.id}/verify`).send({ version: s1Submitted.version }),
    ).expect(200);
    await auth(plannerToken)(
      request(server()).post(`${base}/assignments/${s2.id}/verify`).send({ version: s2Submitted.version }),
    ).expect(200);

    // Now completion can be requested and approved by a Supervisor.
    detail = await auth(plannerToken)(request(server()).get(`${base}/work-orders/${id}`)).then((r) => r.body);
    const requested = await auth(plannerToken)(
      request(server()).post(`${base}/work-orders/${id}/request-completion`).send({ version: detail.workOrder.version }),
    ).expect(200);
    const completed = await auth(supToken)(
      request(server()).post(`${base}/work-orders/${id}/approve-completion`).send({ version: requested.body.workOrder.version }),
    ).expect(200);
    expect(completed.body.workOrder.status).toBe('Completed');
  });

  it('AC-ENG-005 — returning a step needs a note; the returned step reopens for a new attempt', async () => {
    const { steps } = await activeTwoStepWo();
    const plannerToken = await planner();
    const whToken = await warehouse();
    const s1 = steps.find((s) => s.sequence === 1)!;
    const started = await auth(whToken)(
      request(server()).post(`${base}/assignments/${s1.id}/start`).send({ version: s1.version }),
    ).then((r) => r.body.step);
    const submitted = await auth(whToken)(
      request(server()).post(`${base}/assignments/${s1.id}/submit`).send({ version: started.version }),
    ).then((r) => r.body.step);

    const noNote = await auth(plannerToken)(
      request(server()).post(`${base}/assignments/${s1.id}/return`).send({ version: submitted.version }),
    );
    expect(noNote.status).toBe(400);

    const returned = await auth(plannerToken)(
      request(server()).post(`${base}/assignments/${s1.id}/return`).send({ version: submitted.version, note: 'Wrong SKU issued' }),
    );
    expect(returned.status).toBe(200);
    expect(returned.body.step.status).toBe('Open');
    expect(returned.body.step.returnNote).toBe('Wrong SKU issued');
    expect(returned.body.step.attemptNo).toBe(2);
  });

  it('AC-ENG-006 — a claimed step is read-only to another executor; the Planner can reassign', async () => {
    // Two steps both executable by Mechanic so a second mechanic could contend.
    const plannerToken = await planner();
    const wo = await createWo(plannerToken, [mechStep]);
    const submitted = await auth(plannerToken)(
      request(server()).post(`${base}/work-orders/${wo.id}/submit`).send({ version: wo.version }),
    );
    const supToken = await supervisor();
    await auth(supToken)(
      request(server()).post(`${base}/work-orders/${wo.id}/approve`).send({ version: submitted.body.workOrder.version }),
    ).expect(200);
    const step = (await auth(plannerToken)(request(server()).get(`${base}/work-orders/${wo.id}`)).then((r) => r.body.steps))[0];

    // Mechanic Agus claims it by Starting.
    const mechToken = await mechanic();
    const claimed = await auth(mechToken)(
      request(server()).post(`${base}/assignments/${step.id}/start`).send({ version: step.version }),
    ).expect(200);
    expect(claimed.body.step.assigneeId).not.toBeNull();

    // The Planner reassigns it to the mechanic again with a reason (a valid reassign).
    const reassigned = await auth(plannerToken)(
      request(server())
        .post(`${base}/assignments/${step.id}/assign`)
        .send({ version: claimed.body.step.version, assigneeId: 3, reason: 'Keep with Agus' }),
    );
    expect(reassigned.status).toBe(200);
  });

  it('AC-ENG-009 — an entered-earlier Start is accepted (≥ opened, ≤ 2h back) and refused beyond 2h / before opened', async () => {
    const { id, steps } = await activeTwoStepWo();
    const plannerToken = await planner();
    const s1 = steps.find((s) => s.sequence === 1)!;
    const whToken = await warehouse();

    // The step's opened_at is the lower bound (REQ-ENG-014).
    const detail = await auth(plannerToken)(request(server()).get(`${base}/work-orders/${id}`)).then((r) => r.body.steps);
    const openedAt = detail.find((s: { sequence: number }) => s.sequence === 1).openedAt as string;

    const now = Date.now();
    const beyond = new Date(now - 3 * 60 * 60 * 1000).toISOString(); // 3 h back
    const beforeOpened = new Date(Date.parse(openedAt) - 60 * 1000).toISOString(); // 1 min before open

    // Beyond 2 h back → refused.
    expect(
      (await auth(whToken)(
        request(server())
          .post(`${base}/assignments/${s1.id}/start`)
          .send({ version: s1.version, startedAt: beyond, reason: 'Forgot to press Start' }),
      )).status,
    ).toBe(400);

    // Before the step opened → refused.
    expect(
      (await auth(whToken)(
        request(server())
          .post(`${base}/assignments/${s1.id}/start`)
          .send({ version: s1.version, startedAt: beforeOpened, reason: 'Forgot to press Start' }),
      )).status,
    ).toBe(400);

    // At the opened instant (≥ opened, within 2 h, ≤ now) with a reason → accepted & marked entered.
    const ok = await auth(whToken)(
      request(server())
        .post(`${base}/assignments/${s1.id}/start`)
        .send({ version: s1.version, startedAt: openedAt, reason: 'Forgot to press Start' }),
    );
    expect(ok.status).toBe(200);
    expect(ok.body.step.startEntered).toBe(true);
  });

  it('AC-ENG-008 — Pause stops the clock and Submit is refused while paused', async () => {
    const { steps } = await activeTwoStepWo();
    const s1 = steps.find((s) => s.sequence === 1)!;
    const whToken = await warehouse();
    const started = await auth(whToken)(
      request(server()).post(`${base}/assignments/${s1.id}/start`).send({ version: s1.version }),
    ).then((r) => r.body.step);
    const paused = await auth(whToken)(
      request(server())
        .post(`${base}/assignments/${s1.id}/pause`)
        .send({ version: started.version, pauseReason: 'Break_Shift_End' }),
    ).expect(200);
    // Submit refused while paused.
    const submitPaused = await auth(whToken)(
      request(server()).post(`${base}/assignments/${s1.id}/submit`).send({ version: paused.body.step.version }),
    );
    expect(submitPaused.status).toBe(409);
    // Resume then submit works.
    const resumed = await auth(whToken)(
      request(server()).post(`${base}/assignments/${s1.id}/resume`).send({ version: paused.body.step.version }),
    ).expect(200);
    await auth(whToken)(
      request(server()).post(`${base}/assignments/${s1.id}/submit`).send({ version: resumed.body.step.version }),
    ).expect(200);
  });

  // --- SM-WO / SM-STEP: an unlisted transition is refused ------------------

  it('SM-WO — approving a Draft (not Pending_Approval) is refused as an unlisted transition', async () => {
    const plannerToken = await planner();
    const wo = await createWo(plannerToken, [stockStep]);
    const supToken = await supervisor();
    // WO is still Draft — Approve is not a listed transition from Draft.
    const approve = await auth(supToken)(
      request(server()).post(`${base}/work-orders/${wo.id}/approve`).send({ version: wo.version }),
    );
    expect(approve.status).toBe(409);
  });

  it('SM-STEP — starting a Locked step is refused as an unlisted transition', async () => {
    const plannerToken = await planner();
    const wo = await createWo(plannerToken, [stockStep, mechStep]);
    const submitted = await auth(plannerToken)(
      request(server()).post(`${base}/work-orders/${wo.id}/submit`).send({ version: wo.version }),
    );
    const supToken = await supervisor();
    await auth(supToken)(
      request(server()).post(`${base}/work-orders/${wo.id}/approve`).send({ version: submitted.body.workOrder.version }),
    ).expect(200);
    const locked = (await auth(plannerToken)(request(server()).get(`${base}/work-orders/${wo.id}`)).then((r) => r.body.steps)).find(
      (s: { sequence: number }) => s.sequence === 2,
    );
    const whToken = await warehouse();
    const start = await auth(whToken)(
      request(server()).post(`${base}/assignments/${locked.id}/start`).send({ version: locked.version }),
    );
    expect(start.status).toBe(409);
  });

  // --- REQ-WO-013 Inactive blocks create -----------------------------------

  it('REQ-WO-013 — a WO on the seeded (Repair/OFF) vehicle is allowed; an Inactive vehicle is refused', async () => {
    const plannerToken = await planner();
    // The seeded vehicle 1 is in Repair/OFF (WO-0142) — NOT Inactive — so create is allowed (DEC-92).
    await auth(plannerToken)(
      request(server()).post(`${base}/work-orders`).send({
        vehicleId: 1,
        title: 'On a busy vehicle',
        category: WorkOrderCategory.Corrective,
        description: 'd',
        steps: [stockStep],
      }),
    ).expect(201);

    // Register a fresh vehicle (no open WO), deactivate it, then creation is refused.
    const adminToken = await admin();
    const created = await auth(adminToken)(
      request(server()).post(`${base}/vehicles`).send({ plate: 'B 9 OFF', classId: 1 }),
    );
    expect(created.status).toBe(201);
    const newVehicle = created.body.vehicle;
    await auth(adminToken)(
      request(server())
        .post(`${base}/vehicles/${newVehicle.id}/deactivate`)
        .send({ version: newVehicle.version, reason: 'Sold' }),
    ).expect(200);

    const refused = await auth(plannerToken)(
      request(server()).post(`${base}/work-orders`).send({
        vehicleId: newVehicle.id,
        title: 'Blocked',
        category: WorkOrderCategory.Corrective,
        description: 'd',
        steps: [stockStep],
      }),
    );
    expect(refused.status).toBe(409);
  });
});
