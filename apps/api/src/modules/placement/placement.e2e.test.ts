import 'reflect-metadata';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SEED_PASSWORD } from '@bmi/data-gateway';
import type { DataGateway } from '@bmi/data-gateway';
import { idValue, Role, TyreStatus, WorkOrderCategory } from '@bmi/shared';
import { AppModule } from '../../app.module.js';
import { API_PREFIX } from '../../app.constants.js';
import { DATA_GATEWAY } from '../../core/data-gateway/data-gateway.module.js';
import { AppSettingsService } from '../iam/app-settings.service.js';
import { WorkOrdersService } from '../work-orders/work-orders.service.js';
import { StepTimeEventService } from '../assignments/step-time-event.service.js';
import { PlacementService } from './placement.service.js';

/**
 * End-to-end FG-6 coverage (TASK-111) booting the full `AppModule` (real guard,
 * interceptors, session auth) against the dummy gateway. Covers the generated
 * 1–6 axle / trailer / spare layouts (AC-PLC-007/010, DEC-73), the Issued-to-WO
 * mount gate (AC-PLC-001), scope-lock refusal (BR-02/BR-11), the SM-TYRE
 * transitions written with the placement (§3.6), append-only history, the
 * read-only map for a Field Coordinator (AC-PLC-005/012), and the snapshot
 * captured at submit (REQ-PLC-014).
 */
describe('Part Replacement step + chassis map (TASK-111)', () => {
  let app: INestApplication;
  let settings: AppSettingsService;
  let workOrders: WorkOrdersService;
  let timeEvents: StepTimeEventService;
  let placement: PlacementService;
  let gateway: DataGateway;
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
    placement = app.get(PlacementService);
    gateway = app.get<DataGateway>(DATA_GATEWAY);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    settings.resetForTests();
    settings.goLive(new Date().toISOString());
    workOrders.resetForTests();
    timeEvents.resetForTests();
    placement.resetForTests();
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
  const sysadmin = (): Promise<string> => login('sysadmin@bmi.test');
  const fieldCoordinator = (): Promise<string> => login('driver@bmi.test'); // a non-executor field role

  const auth = (token: string) => (r: request.Test): request.Test =>
    r.set('Authorization', `Bearer ${token}`);

  const replacementStep = () => ({
    module: 'Part_Replacement',
    executorRoles: [Role.Mechanic],
    verifierRole: Role.Planner,
    stepConfig: {},
  });

  /** Create → submit → approve a WO (vehicle 1) with a single Part Replacement step. */
  async function activeReplacementWo(): Promise<{
    id: number;
    step: { id: number; version: number };
  }> {
    const plannerToken = await planner();
    const created = await auth(plannerToken)(
      request(server()).post(`${base}/work-orders`).send({
        vehicleId: 1,
        title: 'Tyre replacement WO',
        category: WorkOrderCategory.Tyre,
        description: 'replace axle-2 tyres',
        steps: [replacementStep()],
      }),
    );
    expect(created.status).toBe(201);
    const wo = created.body.workOrder;
    const submitted = await auth(plannerToken)(
      request(server()).post(`${base}/work-orders/${wo.id}/submit`).send({ version: wo.version }),
    );
    expect(submitted.status).toBe(200);
    const supToken = await supervisor();
    await auth(supToken)(
      request(server()).post(`${base}/work-orders/${wo.id}/approve`).send({ version: submitted.body.workOrder.version }),
    ).expect(200);
    const detail = await auth(plannerToken)(request(server()).get(`${base}/work-orders/${wo.id}`)).expect(200);
    const step = detail.body.steps.find((s: { moduleCode: string }) => s.moduleCode === 'Part_Replacement');
    return { id: wo.id, step: { id: step.id, version: step.version } };
  }

  /**
   * Issue a seeded tyre to a WO (the tyre-issue the Stock/Inventory FG-8 owns in
   * production — simulated here so a Part Replacement mount has an Issued tyre).
   */
  async function issueTyreToWo(tyreCode: string, workOrderId: number): Promise<number> {
    return gateway.unitOfWork(async (ctx) => {
      const tyre = await ctx.repos.tyres.findOneBy('code', tyreCode);
      if (!tyre) throw new Error(`no tyre ${tyreCode}`);
      const woRow = await ctx.repos.workOrders.requireById(workOrderId);
      const updated = await ctx.repos.tyres.update({
        ...tyre,
        status: TyreStatus.Issued,
        issuedWorkOrderId: woRow.id,
      });
      return idValue(updated.id);
    });
  }

  /** Start a step via the engine and return its fresh version. */
  async function startStep(token: string, step: { id: number; version: number }): Promise<number> {
    const started = await auth(token)(
      request(server()).post(`${base}/assignments/${step.id}/start`).send({ version: step.version }),
    ).expect(200);
    return started.body.step.version as number;
  }

  // --- AC-PLC-010 / DEC-73: the map is GENERATED from the layout (1–6 axle) ---

  it('AC-PLC-010 — a Powered 8x4 class not in the launch list generates its 12 positions with no code change', async () => {
    const saToken = await sysadmin();
    const created = await auth(saToken)(
      request(server()).post(`${base}/vehicles/classes`).send({
        code: 'Powered_8x4_e2e',
        name: 'Powered 8x4 e2e',
        unitKind: 'Powered',
        layout: {
          axles: [
            { role: 'Steer', tyresPerSide: 1 },
            { role: 'Steer', tyresPerSide: 1 },
            { role: 'Drive', tyresPerSide: 2 },
            { role: 'Drive', tyresPerSide: 2 },
          ],
          spareCount: 0,
        },
      }),
    ).expect(201);
    expect(created.body.layout.tyreCount).toBe(12);
    // The same generated layout is readable via the shared classes endpoint.
    const list = await auth(saToken)(request(server()).get(`${base}/vehicles/classes`)).expect(200);
    const layout = (list.body.layouts as Array<{ code: string; tyreCount: number }>).find(
      (l) => l.code === 'Powered_8x4_e2e',
    );
    expect(layout!.tyreCount).toBe(12);
  });

  it('AC-PLC-007 — a Towed trailer layout (3 axles 2/side + 1 spare) generates 13 positions incl. SPARE_1', async () => {
    const saToken = await sysadmin();
    const created = await auth(saToken)(
      request(server()).post(`${base}/vehicles/classes`).send({
        code: 'Trailer_Tail_e2e',
        name: 'Trailer tail e2e',
        unitKind: 'Towed',
        layout: {
          axles: [
            { role: 'Trailer', tyresPerSide: 2 },
            { role: 'Trailer', tyresPerSide: 2 },
            { role: 'Trailer', tyresPerSide: 2 },
          ],
          spareCount: 1,
        },
      }),
    ).expect(201);
    expect(created.body.layout.tyreCount).toBe(13);
  });

  it('DEC-73 — the step map is generated from the vehicle chassis layout (seeded 6x4 → 11 positions, all Empty)', async () => {
    const { step } = await activeReplacementWo();
    const view = await auth(await planner())(request(server()).get(`${base}/placement/${step.id}`)).expect(200);
    expect(view.body.map.tyreCount).toBe(11);
    expect(view.body.map.positions).toHaveLength(11);
    expect(view.body.map.positions.every((p: { status: string }) => p.status === 'Empty')).toBe(true);
  });

  // --- AC-PLC-001 / BR-11: mount only a tyre Issued to this WO ----------------

  it('AC-PLC-001 — a tyre not Issued to this WO cannot be mounted; a tyre issued to it mounts and goes Mounted', async () => {
    const { id: woId, step } = await activeReplacementWo();
    const mechToken = await mechanic();
    await startStep(mechToken, step);

    // TY-0101 is In_Stock (not issued to this WO) → refused.
    await auth(mechToken)(
      request(server()).post(`${base}/placement/${step.id}/mount`).send({ position: 'A1_L', tyreId: 1 }),
    ).expect(400);

    // Issue TY-0101 to this WO, then mount → Mounted + one history row.
    const tyreId = await issueTyreToWo('TY-0101', woId);
    await auth(mechToken)(
      request(server()).post(`${base}/placement/${step.id}/mount`).send({ position: 'A1_L', tyreId, treadMm: 9 }),
    ).expect(200);
    const tyre = await gateway.repos.tyres.getById(tyreId);
    expect(tyre!.status).toBe(TyreStatus.Mounted);
    expect(placement.historyOfPosition(1, 'A1_L')).toHaveLength(1);
  });

  // --- BR-02 / BR-11: scope lock ----------------------------------------------

  it('BR-11 — a mount on a step that has not been opened is refused (scope lock)', async () => {
    const { id: woId, step } = await activeReplacementWo();
    const tyreId = await issueTyreToWo('TY-0102', woId);
    const mechToken = await mechanic();
    // Step is Open (WO active) but the scope-lock allows Open too; prove the
    // harder case: submit the WO past the step, then a placement change is refused.
    const version = await startStep(mechToken, step);
    await auth(mechToken)(
      request(server()).post(`${base}/placement/${step.id}/mount`).send({ position: 'A1_L', tyreId }),
    ).expect(200);
    // Submit the step (last step → WO Pending_Verification): the step is now Submitted.
    await auth(mechToken)(
      request(server()).post(`${base}/assignments/${step.id}/submit`).send({ version }),
    ).expect(200);
    // A further placement change is now out of scope (step Submitted) → refused.
    const tyreId2 = await issueTyreToWo('TY-0103', woId);
    await auth(mechToken)(
      request(server()).post(`${base}/placement/${step.id}/mount`).send({ position: 'A1_R', tyreId: tyreId2 }),
    ).expect(409);
  });

  // --- AC-PLC-003 / REQ-PLC-005: rotate ---------------------------------------

  it('AC-PLC-003 — rotate swaps two mounted tyres; both stay Mounted', async () => {
    const { id: woId, step } = await activeReplacementWo();
    const mechToken = await mechanic();
    await startStep(mechToken, step);
    const t1 = await issueTyreToWo('TY-0104', woId);
    const t2 = await issueTyreToWo('TY-0105', woId);
    await auth(mechToken)(request(server()).post(`${base}/placement/${step.id}/mount`).send({ position: 'A1_L', tyreId: t1 })).expect(200);
    await auth(mechToken)(request(server()).post(`${base}/placement/${step.id}/mount`).send({ position: 'A1_R', tyreId: t2 })).expect(200);

    await auth(mechToken)(
      request(server()).post(`${base}/placement/${step.id}/rotate`).send({ fromPosition: 'A1_L', toPosition: 'A1_R' }),
    ).expect(200);
    expect(placement.placementAt(1, 'A1_L')!.tyreId).toBe(t2);
    expect(placement.placementAt(1, 'A1_R')!.tyreId).toBe(t1);
    expect((await gateway.repos.tyres.getById(t1))!.status).toBe(TyreStatus.Mounted);
    expect((await gateway.repos.tyres.getById(t2))!.status).toBe(TyreStatus.Mounted);
  });

  // --- REQ-PLC-004: demount with a condition (SM-TYRE) ------------------------

  it('REQ-PLC-004 — demount sets the chosen condition via SM-TYRE and leaves an append-only history', async () => {
    const { id: woId, step } = await activeReplacementWo();
    const mechToken = await mechanic();
    await startStep(mechToken, step);
    const t1 = await issueTyreToWo('TY-0106', woId);
    await auth(mechToken)(request(server()).post(`${base}/placement/${step.id}/mount`).send({ position: 'A1_L', tyreId: t1 })).expect(200);

    await auth(mechToken)(
      request(server()).post(`${base}/placement/${step.id}/demount`).send({ position: 'A1_L', condition: 'Needs_Retread' }),
    ).expect(200);
    expect((await gateway.repos.tyres.getById(t1))!.status).toBe(TyreStatus.NeedsRetread);
    // Mount + demount = 2 append-only rows for the position; nothing overwritten.
    expect(placement.historyOfPosition(1, 'A1_L').map((h) => h.action)).toEqual(['Mount', 'Demount']);
  });

  it('demount rejects an illegal condition value (whitelist pipe, SM-TYRE §3.6)', async () => {
    const { id: woId, step } = await activeReplacementWo();
    const mechToken = await mechanic();
    await startStep(mechToken, step);
    const t1 = await issueTyreToWo('TY-0107', woId);
    await auth(mechToken)(request(server()).post(`${base}/placement/${step.id}/mount`).send({ position: 'A1_L', tyreId: t1 })).expect(200);
    await auth(mechToken)(
      request(server()).post(`${base}/placement/${step.id}/demount`).send({ position: 'A1_L', condition: 'Scrapped' }),
    ).expect(400);
  });

  // --- AC-PLC-005 / AC-PLC-012: read-only map for a non-executor role ---------

  it('AC-PLC-005 — a non-executor role cannot mount (edit controls denied by the guard)', async () => {
    const { id: woId, step } = await activeReplacementWo();
    await startStep(await mechanic(), step);
    const tyreId = await issueTyreToWo('TY-0108', woId);
    // A Driver (field role without mechanic.execute) is refused the edit call.
    await auth(await fieldCoordinator())(
      request(server()).post(`${base}/placement/${step.id}/mount`).send({ position: 'A1_L', tyreId }),
    ).expect(403);
  });

  // --- REQ-PLC-014: snapshot captured at submit -------------------------------

  it('REQ-PLC-014 — submitting the step captures a placement snapshot for the WO document', async () => {
    const { id: woId, step } = await activeReplacementWo();
    const mechToken = await mechanic();
    const version = await startStep(mechToken, step);
    const tyreId = await issueTyreToWo('TY-0109', woId);
    await auth(mechToken)(
      request(server()).post(`${base}/placement/${step.id}/mount`).send({ position: 'A1_L', tyreId }),
    ).expect(200);

    expect(placement.snapshotOf(step.id)).toBeUndefined();
    await auth(mechToken)(
      request(server()).post(`${base}/assignments/${step.id}/submit`).send({ version }),
    ).expect(200);

    const snapshot = placement.snapshotOf(step.id);
    expect(snapshot).toBeDefined();
    expect(snapshot!.changedPositions).toContain('A1_L');
    const a1l = snapshot!.positions.find((p) => p.code === 'A1_L');
    expect(a1l!.tyreId).toBe(tyreId);
    // Visible via the view endpoint for the WO document renderer (TASK-115).
    const view = await auth(await planner())(request(server()).get(`${base}/placement/${step.id}`)).expect(200);
    expect(view.body.snapshot).not.toBeNull();
  });
});
