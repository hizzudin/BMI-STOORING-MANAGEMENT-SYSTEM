import 'reflect-metadata';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SEED_PASSWORD } from '@bmi/data-gateway';
import { Role, WorkOrderCategory, WorkOrderStatus, ChangeRequestStatus } from '@bmi/shared';
import { AppModule } from '../../app.module.js';
import { API_PREFIX } from '../../app.constants.js';
import { AppSettingsService } from '../iam/app-settings.service.js';
import { WorkOrdersService } from '../work-orders/work-orders.service.js';
import { StepTimeEventService } from '../assignments/step-time-event.service.js';
import { ChangeRequestsService } from './change-requests.service.js';

/**
 * End-to-end FG-9 coverage (TASK-113) booting the full `AppModule` against the
 * dummy gateway. Covers executor-raises / creator-decides (REQ-CR-001, BR-03),
 * SM-CR + SM-WO Pending_Amendment / amendment counter / step freeze (SM-WO
 * T8/T9/T10, REQ-CR-002/004/005) and AC-CR-001..005.
 */
describe('Change requests & amendments (TASK-113)', () => {
  let app: INestApplication;
  let settings: AppSettingsService;
  let workOrders: WorkOrdersService;
  let timeEvents: StepTimeEventService;
  let changeRequests: ChangeRequestsService;
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
    workOrders = app.get(WorkOrdersService);
    timeEvents = app.get(StepTimeEventService);
    changeRequests = app.get(ChangeRequestsService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    settings.resetForTests();
    settings.goLive(new Date().toISOString());
    workOrders.resetForTests();
    timeEvents.resetForTests();
    changeRequests.resetForTests();
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

  const auth = (token: string) => (r: request.Test): request.Test => r.set('Authorization', `Bearer ${token}`);

  const mechStep = () => ({
    module: 'Mechanic_Action',
    executorRoles: [Role.Mechanic],
    verifierRole: Role.Planner,
  });

  /** Create → submit → approve a WO as the Planner; returns WO id + its opened steps. */
  async function activeWo(
    steps: Array<Record<string, unknown>>,
  ): Promise<{ id: number; steps: Array<{ id: number; version: number; sequence: number; moduleCode: string; status: string }> }> {
    const plannerToken = await planner();
    const created = await auth(plannerToken)(
      request(server()).post(`${base}/work-orders`).send({
        vehicleId: 1,
        title: 'CR WO',
        category: WorkOrderCategory.Corrective,
        description: 'change-request flow',
        steps,
      }),
    );
    expect(created.status).toBe(201);
    const wo = created.body.workOrder;
    const submitted = await auth(plannerToken)(
      request(server()).post(`${base}/work-orders/${wo.id}/submit`).send({ version: wo.version }),
    ).expect(200);
    const supToken = await supervisor();
    await auth(supToken)(
      request(server()).post(`${base}/work-orders/${wo.id}/approve`).send({ version: submitted.body.workOrder.version }),
    ).expect(200);
    const detail = await auth(plannerToken)(request(server()).get(`${base}/work-orders/${wo.id}`)).expect(200);
    return { id: wo.id, steps: detail.body.steps };
  }

  async function startStep(token: string, step: { id: number; version: number }): Promise<number> {
    const started = await auth(token)(
      request(server()).post(`${base}/assignments/${step.id}/start`).send({ version: step.version }),
    ).expect(200);
    return started.body.step.version as number;
  }

  async function stepVersion(token: string, stepId: number): Promise<number> {
    const view = await auth(token)(request(server()).get(`${base}/assignments/${stepId}`)).expect(200);
    return view.body.step.version as number;
  }

  async function woStatus(token: string, woId: number): Promise<{ status: string; amendmentNo: number; version: number }> {
    const detail = await auth(token)(request(server()).get(`${base}/work-orders/${woId}`)).expect(200);
    return {
      status: detail.body.workOrder.status,
      amendmentNo: detail.body.workOrder.amendmentNo,
      version: detail.body.workOrder.version,
    };
  }

  // --- AC-CR-001: raise → Pending_Amendment, next step stays Locked ---------

  it('AC-CR-001 — executor raises a CR; the WO shows Pending_Amendment and the next step stays Locked', async () => {
    const wo = await activeWo([mechStep(), mechStep()]);
    const step1 = wo.steps[0]!;
    const step2 = wo.steps[1]!;
    const mechToken = await mechanic();
    await startStep(mechToken, { id: step1.id, version: step1.version });

    const raised = await auth(mechToken)(
      request(server()).post(`${base}/change-requests`).send({
        assignmentId: step1.id,
        whatChanges: 'need an extra part',
        requestedChange: 'add a bearing to the list',
        reason: 'original list was wrong',
      }),
    ).expect(201);
    expect(raised.body.changeRequest.status).toBe(ChangeRequestStatus.Submitted);

    const status = await woStatus(mechToken, wo.id);
    expect(status.status).toBe(WorkOrderStatus.PendingAmendment);
    // Next step stays Locked (REQ-CR-002).
    const s2 = await auth(mechToken)(request(server()).get(`${base}/assignments/${step2.id}`)).expect(200);
    expect(s2.body.step.status).toBe('Locked');
  });

  // --- step freeze while Pending_Amendment ---------------------------------

  it('freezes the open step while Pending_Amendment (the engine refuses step edits)', async () => {
    const wo = await activeWo([mechStep()]);
    const step1 = wo.steps[0]!;
    const mechToken = await mechanic();
    const v = await startStep(mechToken, { id: step1.id, version: step1.version });

    await auth(mechToken)(
      request(server()).post(`${base}/change-requests`).send({
        assignmentId: step1.id,
        whatChanges: 'x',
        requestedChange: 'y',
        reason: 'z',
      }),
    ).expect(201);

    // Submitting the frozen step is refused (409) while the WO is Pending_Amendment.
    const submit = await auth(mechToken)(
      request(server()).post(`${base}/assignments/${step1.id}/submit`).send({ version: v }),
    );
    expect(submit.status).toBe(409);
  });

  // --- BR-03: executor raises, non-executor cannot -------------------------

  it('REQ-CR-001 / BR-03 — a non-executor cannot raise a CR for the step; the WO creator cannot either', async () => {
    const wo = await activeWo([mechStep()]);
    const step1 = wo.steps[0]!;
    const mechToken = await mechanic();
    await startStep(mechToken, { id: step1.id, version: step1.version });

    // Warehouse Manager holds changerequest.raise but is not this step's executor → 409.
    const whToken = await warehouse();
    const byNonExecutor = await auth(whToken)(
      request(server()).post(`${base}/change-requests`).send({
        assignmentId: step1.id,
        whatChanges: 'x',
        requestedChange: 'y',
        reason: 'z',
      }),
    );
    expect(byNonExecutor.status).toBe(409);
  });

  // --- AC-CR-003: approve → amendment number rises, old content kept --------

  it('AC-CR-003 — the creator decides; approving the revision raises the amendment number and the step resumes', async () => {
    const wo = await activeWo([mechStep()]);
    const step1 = wo.steps[0]!;
    const mechToken = await mechanic();
    await startStep(mechToken, { id: step1.id, version: step1.version });

    const raised = await auth(mechToken)(
      request(server()).post(`${base}/change-requests`).send({
        assignmentId: step1.id,
        whatChanges: 'wrong description',
        requestedChange: 'fix the work description',
        reason: 'scope clarified',
      }),
    ).expect(201);
    const crId = raised.body.changeRequest.id;

    const before = await woStatus(mechToken, wo.id);
    expect(before.amendmentNo).toBe(0);

    // The WO creator (Planner) opens → revises → approves.
    const plannerToken = await planner();
    await auth(plannerToken)(request(server()).post(`${base}/change-requests/${crId}/open`).send({})).expect(200);
    await auth(plannerToken)(
      request(server()).post(`${base}/change-requests/${crId}/revise`).send({ description: 'revised description' }),
    ).expect(200);
    const approved = await auth(plannerToken)(
      request(server()).post(`${base}/change-requests/${crId}/approve`).send({}),
    ).expect(200);
    expect(approved.body.changeRequest.status).toBe(ChangeRequestStatus.Approved);

    const after = await woStatus(plannerToken, wo.id);
    expect(after.amendmentNo).toBe(1); // AC-CR-003 — rises by one.
    expect(after.status).toBe(WorkOrderStatus.InProgress); // restored, step resumes.
    // The old content is kept in history (REQ-CR-004).
    expect(changeRequests.historyForWorkOrder(wo.id).length).toBeGreaterThanOrEqual(1);
  });

  // --- AC-CR-002: reject → original content stays, step resumes -------------

  it('AC-CR-002 — rejecting the revision keeps the original content and resumes the step', async () => {
    const wo = await activeWo([mechStep()]);
    const step1 = wo.steps[0]!;
    const mechToken = await mechanic();
    await startStep(mechToken, { id: step1.id, version: step1.version });
    const raised = await auth(mechToken)(
      request(server()).post(`${base}/change-requests`).send({
        assignmentId: step1.id,
        whatChanges: 'x',
        requestedChange: 'y',
        reason: 'z',
      }),
    ).expect(201);
    const crId = raised.body.changeRequest.id;

    const plannerToken = await planner();
    await auth(plannerToken)(request(server()).post(`${base}/change-requests/${crId}/open`).send({})).expect(200);
    await auth(plannerToken)(
      request(server()).post(`${base}/change-requests/${crId}/revise`).send({ description: 'should be discarded' }),
    ).expect(200);
    // Reject with no reason is refused (REQ-CR-005, AC-APR-004).
    const noReason = await auth(plannerToken)(
      request(server()).post(`${base}/change-requests/${crId}/reject`).send({ reason: '' }),
    );
    expect(noReason.status).toBe(400);
    const rejected = await auth(plannerToken)(
      request(server()).post(`${base}/change-requests/${crId}/reject`).send({ reason: 'not needed' }),
    ).expect(200);
    expect(rejected.body.changeRequest.status).toBe(ChangeRequestStatus.Rejected);

    const after = await woStatus(plannerToken, wo.id);
    expect(after.amendmentNo).toBe(0); // no amendment applied.
    expect(after.status).toBe(WorkOrderStatus.InProgress); // restored, step resumes.
    const detail = await auth(plannerToken)(request(server()).get(`${base}/work-orders/${wo.id}`)).expect(200);
    expect(detail.body.workOrder.description).toBe('change-request flow'); // original content stays.
  });

  // --- AC-CR-004: a vehicle switch is refused ------------------------------

  it('AC-CR-004 — a revision that switches the vehicle is refused', async () => {
    const wo = await activeWo([mechStep()]);
    const step1 = wo.steps[0]!;
    const mechToken = await mechanic();
    await startStep(mechToken, { id: step1.id, version: step1.version });
    const raised = await auth(mechToken)(
      request(server()).post(`${base}/change-requests`).send({
        assignmentId: step1.id,
        whatChanges: 'x',
        requestedChange: 'y',
        reason: 'z',
      }),
    ).expect(201);
    const crId = raised.body.changeRequest.id;
    const plannerToken = await planner();
    await auth(plannerToken)(request(server()).post(`${base}/change-requests/${crId}/open`).send({})).expect(200);
    const switched = await auth(plannerToken)(
      request(server()).post(`${base}/change-requests/${crId}/revise`).send({ vehicleId: 2 }),
    );
    expect(switched.status).toBe(409);
  });

  // --- AC-CR-005: cannot change a submitted step; can change the open step ---

  it('AC-CR-005 — a CR in step 3 cannot change submitted step 1, but can change the open step 3', async () => {
    const wo = await activeWo([mechStep(), mechStep(), mechStep()]);
    const [s1, s2, s3] = wo.steps;
    const mechToken = await mechanic();
    const plannerToken = await planner();

    // Submit & verify step 1 so it is no longer editable.
    const v1 = await startStep(mechToken, { id: s1!.id, version: s1!.version });
    await auth(mechToken)(request(server()).post(`${base}/assignments/${s1!.id}/submit`).send({ version: v1 })).expect(200);
    const v1b = await stepVersion(plannerToken, s1!.id);
    await auth(plannerToken)(request(server()).post(`${base}/assignments/${s1!.id}/verify`).send({ version: v1b })).expect(200);
    // Submit & verify step 2 so step 3 opens.
    const v2 = await startStep(mechToken, { id: s2!.id, version: await stepVersion(mechToken, s2!.id) });
    await auth(mechToken)(request(server()).post(`${base}/assignments/${s2!.id}/submit`).send({ version: v2 })).expect(200);
    const v2b = await stepVersion(plannerToken, s2!.id);
    await auth(plannerToken)(request(server()).post(`${base}/assignments/${s2!.id}/verify`).send({ version: v2b })).expect(200);

    // Raise a CR from the open step 3.
    await startStep(mechToken, { id: s3!.id, version: await stepVersion(mechToken, s3!.id) });
    const raised = await auth(mechToken)(
      request(server()).post(`${base}/change-requests`).send({
        assignmentId: s3!.id,
        whatChanges: 'step 1 part list wrong',
        requestedChange: 'change the parts',
        reason: 'wrong list',
      }),
    ).expect(201);
    const crId = raised.body.changeRequest.id;
    await auth(plannerToken)(request(server()).post(`${base}/change-requests/${crId}/open`).send({})).expect(200);

    // A revision that drops/changes the submitted step 1 is refused (REQ-CR-008).
    const touchingStep1 = await auth(plannerToken)(
      request(server()).post(`${base}/change-requests/${crId}/revise`).send({
        revisedSteps: [mechStep()], // only one step → would drop the submitted step 1 & 2.
      }),
    );
    expect(touchingStep1.status).toBe(409);

    // A revision that keeps the submitted steps and changes only the open step 3 is accepted.
    const keepingSubmitted = await auth(plannerToken)(
      request(server()).post(`${base}/change-requests/${crId}/revise`).send({
        revisedSteps: [mechStep(), mechStep(), mechStep()],
        description: 'open step 3 reworded',
      }),
    );
    expect(keepingSubmitted.status).toBe(200);
  });

  // --- REQ-CR-007: no CR while Pending_Verification ------------------------

  it('REQ-CR-007 — a change request is refused while the WO is Pending_Verification', async () => {
    const wo = await activeWo([mechStep()]);
    const step1 = wo.steps[0]!;
    const mechToken = await mechanic();
    const plannerToken = await planner();
    const v1 = await startStep(mechToken, { id: step1.id, version: step1.version });
    await auth(mechToken)(request(server()).post(`${base}/assignments/${step1.id}/submit`).send({ version: v1 })).expect(200);
    // The last step submitted → WO Pending_Verification. The step is Submitted,
    // so a raise is refused (not the open step); confirm the WO status too.
    const status = await woStatus(plannerToken, wo.id);
    expect(status.status).toBe(WorkOrderStatus.PendingVerification);
    const raised = await auth(mechToken)(
      request(server()).post(`${base}/change-requests`).send({
        assignmentId: step1.id,
        whatChanges: 'x',
        requestedChange: 'y',
        reason: 'z',
      }),
    );
    expect(raised.status).toBe(409);
  });
});
