import 'reflect-metadata';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SEED_PASSWORD } from '@bmi/data-gateway';
import { Role, WorkOrderCategory } from '@bmi/shared';
import { AppModule } from '../../app.module.js';
import { API_PREFIX } from '../../app.constants.js';
import { AppSettingsService } from '../iam/app-settings.service.js';
import { WorkOrdersService } from '../work-orders/work-orders.service.js';
import { StepTimeEventService } from '../assignments/step-time-event.service.js';
import { AuditService } from '../../core/audit/audit.service.js';
import { MobilisasiStepService } from './mobilisasi-step.service.js';
import { StooringRatesService } from './stooring-rates.service.js';

/**
 * End-to-end FG-5a coverage (TASK-110a) booting the full `AppModule` (real
 * guard, interceptors, session-backed auth) against the dummy gateway. Covers
 * AC-MBL-001 (Mobilisasi in the palette, Mechanic executor, no engine change),
 * AC-MBL-002 (auto-submit on arrival + manual Finish), AC-MBL-003 (In_Progress
 * only trail that stops at submit + Planner/SA-only reads each logged) and
 * AC-MBL-004 (stooring once per WO/region/WIB-day with the exact Rp amount).
 */
describe('Mobilisasi step (TASK-110a)', () => {
  let app: INestApplication;
  let settings: AppSettingsService;
  let workOrders: WorkOrdersService;
  let timeEvents: StepTimeEventService;
  let mobilisasi: MobilisasiStepService;
  let rates: StooringRatesService;
  let audit: AuditService;
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
    mobilisasi = app.get(MobilisasiStepService);
    rates = app.get(StooringRatesService);
    audit = app.get(AuditService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    settings.resetForTests();
    settings.goLive(new Date().toISOString());
    workOrders.resetForTests();
    timeEvents.resetForTests();
    mobilisasi.resetForTests();
    rates.resetForTests();
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

  /** A Mobilisasi step with a given stooring region + destination. */
  const mblStep = (region: string, lat = -6.3, lng = 107.1) => ({
    module: 'Mobilisasi',
    executorRoles: [Role.Mechanic],
    verifierRole: Role.Planner,
    stepConfig: { stooringRegion: region, locationLat: lat, locationLng: lng },
  });

  /** Create → submit → approve a WO with the given steps; return WO id + its steps. */
  async function activeWoWithSteps(
    steps: Array<Record<string, unknown>>,
  ): Promise<{ id: number; steps: Array<{ id: number; version: number; sequence: number; moduleCode: string; status: string }> }> {
    const plannerToken = await planner();
    const created = await auth(plannerToken)(
      request(server()).post(`${base}/work-orders`).send({
        vehicleId: 1,
        title: 'Mobilisasi WO',
        category: WorkOrderCategory.Corrective,
        description: 'mobilisation + stooring',
        steps,
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
    return { id: wo.id, steps: detail.body.steps };
  }

  /** Read a step's current id + version via the mobilisasi view endpoint. */
  async function currentStep(token: string, stepId: number): Promise<{ id: number; version: number }> {
    const view = await auth(token)(request(server()).get(`${base}/mobilisasi/${stepId}`)).expect(200);
    return { id: stepId, version: view.body.step.version };
  }

  /** Start a Mobilisasi step via the engine, returning the started step. */
  async function startStep(token: string, step: { id: number; version: number }): Promise<{ id: number; version: number }> {
    const started = await auth(token)(
      request(server()).post(`${base}/assignments/${step.id}/start`).send({ version: step.version }),
    ).expect(200);
    return { id: step.id, version: started.body.step.version };
  }

  // --- AC-MBL-001: Mobilisasi in the palette, Mechanic executor, no engine edit

  it('AC-MBL-001 — Mobilisasi is an active registry module and composes a step with executor Mechanic', async () => {
    const plannerToken = await planner();
    const modules = await auth(plannerToken)(request(server()).get(`${base}/registry/modules`)).expect(200);
    const codes = (modules.body.modules as Array<{ code: string }>).map((m) => m.code);
    expect(codes).toContain('Mobilisasi');

    const wo = await activeWoWithSteps([mblStep('BEKASI')]);
    const mbl = wo.steps.find((s) => s.moduleCode === 'Mobilisasi')!;
    expect(mbl).toBeDefined();
    const view = await auth(plannerToken)(request(server()).get(`${base}/mobilisasi/${mbl.id}`)).expect(200);
    expect(view.body.step.executorRoles).toContain(Role.Mechanic);
  });

  // --- AC-MBL-002: route at Start + auto-submit on arrival + manual Finish -----

  it('AC-MBL-002 — Start opens a route; reaching the destination auto-submits, a manual Finish submits too', async () => {
    const wo = await activeWoWithSteps([mblStep('BEKASI', -6.3, 107.1)]);
    const mbl = wo.steps.find((s) => s.moduleCode === 'Mobilisasi')!;
    const mechToken = await mechanic();
    const started = await startStep(mechToken, mbl);

    // Start opens a route to the driver's captured destination (REQ-MBL-003).
    const route = await auth(mechToken)(request(server()).post(`${base}/mobilisasi/${mbl.id}/route`).send({})).expect(200);
    expect(route.body.route.destination).toEqual({ lat: -6.3, lng: 107.1 });
    expect(route.body.route.region).toMatchObject({ code: 'BEKASI', price: 250000 });

    // At the destination → arrival true → the client auto-submits via the engine.
    const arrival = await auth(mechToken)(
      request(server()).post(`${base}/mobilisasi/${mbl.id}/arrival`).send({ lat: -6.3, lng: 107.1 }),
    ).expect(200);
    expect(arrival.body.arrived).toBe(true);
    await auth(mechToken)(
      request(server()).post(`${base}/assignments/${mbl.id}/submit`).send({ version: started.version }),
    ).expect(200);
    expect(mobilisasi.chargeOf(mbl.id)).toBeDefined();

    // A second WO: a manual "Finish stooring" (engine submit) before arrival also submits.
    const wo2 = await activeWoWithSteps([mblStep('BEKASI', -6.3, 107.1)]);
    const mbl2 = wo2.steps.find((s) => s.moduleCode === 'Mobilisasi')!;
    const started2 = await startStep(mechToken, mbl2);
    const farAway = await auth(mechToken)(
      request(server()).post(`${base}/mobilisasi/${mbl2.id}/arrival`).send({ lat: -6.9, lng: 107.9 }),
    ).expect(200);
    expect(farAway.body.arrived).toBe(false);
    // Manual Finish → engine submit succeeds regardless of arrival.
    await auth(mechToken)(
      request(server()).post(`${base}/assignments/${mbl2.id}/submit`).send({ version: started2.version }),
    ).expect(200);
    expect(mobilisasi.chargeOf(mbl2.id)).toBeDefined();
  });

  // --- AC-MBL-003: In_Progress-only trail, stops at submit, private + logged ---

  it('AC-MBL-003 — trail records only In_Progress and stops at submit; a point before Start or after Submit is refused', async () => {
    const wo = await activeWoWithSteps([mblStep('BEKASI')]);
    const mbl = wo.steps.find((s) => s.moduleCode === 'Mobilisasi')!;
    const mechToken = await mechanic();

    // Before Start (step still Open) → a trail point is refused.
    const before = await auth(mechToken)(
      request(server()).post(`${base}/mobilisasi/${mbl.id}/trail`).send({ lat: -6.21, lng: 107.01 }),
    );
    expect(before.status).toBe(400);
    expect(mobilisasi.trailLengthOf(mbl.id)).toBe(0);

    // Start → record two points while In_Progress.
    const started = await startStep(mechToken, mbl);
    await auth(mechToken)(request(server()).post(`${base}/mobilisasi/${mbl.id}/route`).send({})).expect(200);
    await auth(mechToken)(request(server()).post(`${base}/mobilisasi/${mbl.id}/trail`).send({ lat: -6.21, lng: 107.01 })).expect(200);
    await auth(mechToken)(request(server()).post(`${base}/mobilisasi/${mbl.id}/trail`).send({ lat: -6.22, lng: 107.02 })).expect(200);
    expect(mobilisasi.trailLengthOf(mbl.id)).toBe(2);

    // Submit → recording stops; a point after Submit is refused.
    await auth(mechToken)(
      request(server()).post(`${base}/assignments/${mbl.id}/submit`).send({ version: started.version }),
    ).expect(200);
    const after = await auth(mechToken)(
      request(server()).post(`${base}/mobilisasi/${mbl.id}/trail`).send({ lat: -6.23, lng: 107.03 }),
    );
    expect(after.status).toBe(400);
    expect(mobilisasi.trailLengthOf(mbl.id)).toBe(2); // unchanged
  });

  it('AC-MBL-003 / RSK-09 — the trail is readable only by Planner/SA (others 403); every read writes one access-log record', async () => {
    const wo = await activeWoWithSteps([mblStep('BEKASI')]);
    const mbl = wo.steps.find((s) => s.moduleCode === 'Mobilisasi')!;
    const mechToken = await mechanic();
    const started = await startStep(mechToken, mbl);
    await auth(mechToken)(request(server()).post(`${base}/mobilisasi/${mbl.id}/route`).send({})).expect(200);
    await auth(mechToken)(request(server()).post(`${base}/mobilisasi/${mbl.id}/trail`).send({ lat: -6.21, lng: 107.01 })).expect(200);
    await auth(mechToken)(
      request(server()).post(`${base}/assignments/${mbl.id}/submit`).send({ version: started.version }),
    ).expect(200);

    // A non-Planner/SA read is refused 403 (guard: lacks step.verify).
    await auth(mechToken)(request(server()).get(`${base}/mobilisasi/${mbl.id}/trail`)).expect(403);
    await auth(await warehouse())(request(server()).get(`${base}/mobilisasi/${mbl.id}/trail`)).expect(403);

    // A Planner read succeeds AND writes exactly one access-log record.
    const before = audit.findByEntity('mobilisation_location_trail', mbl.id).length;
    const read = await auth(await planner())(request(server()).get(`${base}/mobilisasi/${mbl.id}/trail`)).expect(200);
    expect(read.body.trail).toHaveLength(1);
    const afterOne = audit.findByEntity('mobilisation_location_trail', mbl.id).length;
    expect(afterOne).toBe(before + 1);

    // A second read logs a second record (one per read).
    await auth(await planner())(request(server()).get(`${base}/mobilisasi/${mbl.id}/trail`)).expect(200);
    expect(audit.findByEntity('mobilisation_location_trail', mbl.id).length).toBe(before + 2);
  });

  // --- AC-MBL-004: stooring once per WO/region/WIB-day with the exact amount ---

  it('AC-MBL-004 / REQ-MBL-006 — Bekasi adds Rp 250.000; workshop adds Rp 0; a second Bekasi step of the same WO on the same day adds Rp 0', async () => {
    // One WO with two Bekasi steps + one workshop step.
    const wo = await activeWoWithSteps([mblStep('BEKASI'), mblStep('BEKASI'), mblStep('WORKSHOP')]);
    const mechToken = await mechanic();
    const ordered = wo.steps.sort((a, b) => a.sequence - b.sequence);

    // Submitting a step opens the next one (REQ-ENG-002), which bumps its
    // version — so each step's current version is re-read before Start.
    const runStep = async (stepId: number): Promise<void> => {
      const fresh = await currentStep(mechToken, stepId);
      const started = await startStep(mechToken, fresh);
      await auth(mechToken)(
        request(server()).post(`${base}/assignments/${stepId}/submit`).send({ version: started.version }),
      ).expect(200);
    };

    // Submit step 1 (Bekasi) → +250.000.
    await runStep(ordered[0]!.id);
    expect(mobilisasi.chargeOf(ordered[0]!.id)!.fee).toBe(250000);
    expect(mobilisasi.stooringCostOf(wo.id)).toBe(250000);

    // Submit step 2 (Bekasi, same WO + region + day) → +0 (not doubled).
    await runStep(ordered[1]!.id);
    expect(mobilisasi.chargeOf(ordered[1]!.id)!.fee).toBe(0);
    expect(mobilisasi.stooringCostOf(wo.id)).toBe(250000); // unchanged

    // Submit step 3 (workshop) → +0.
    await runStep(ordered[2]!.id);
    expect(mobilisasi.chargeOf(ordered[2]!.id)!.fee).toBe(0);
    expect(mobilisasi.stooringCostOf(wo.id)).toBe(250000); // still only the one Bekasi charge
  });

  // --- §2.2 guard: a role without mobilisasi.execute cannot record a trail -----

  it('§2.2 — a role without mobilisasi.execute cannot record a trail point (server 403)', async () => {
    const wo = await activeWoWithSteps([mblStep('BEKASI')]);
    const mbl = wo.steps.find((s) => s.moduleCode === 'Mobilisasi')!;
    const whToken = await warehouse(); // lacks mobilisasi.execute
    await auth(whToken)(
      request(server()).post(`${base}/mobilisasi/${mbl.id}/trail`).send({ lat: -6.2, lng: 107.0 }),
    ).expect(403);
  });
});
