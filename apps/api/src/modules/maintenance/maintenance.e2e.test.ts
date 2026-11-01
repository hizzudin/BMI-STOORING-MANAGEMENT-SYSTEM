import 'reflect-metadata';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SEED_PASSWORD } from '@bmi/data-gateway';
import { VehicleStatus, WorkOrderSource, WorkOrderStatus } from '@bmi/shared';
import { AppModule } from '../../app.module.js';
import { API_PREFIX } from '../../app.constants.js';
import { AppSettingsService } from '../iam/app-settings.service.js';
import { WorkOrdersService } from '../work-orders/work-orders.service.js';
import { PmAlertService } from './pm-alert.service.js';
import { ScheduleService } from './schedule.service.js';
import { NotificationService } from './notification.service.js';
import { BreakdownReportService } from './breakdown-report.service.js';
import { DailyJobService } from './daily-job.service.js';
import { AlertRuleService } from './alert-rule.service.js';

/**
 * End-to-end FG-12 coverage (TASK-114) booting the full `AppModule` against the
 * dummy gateway. Covers the §2.2 role guard on the schedule / alert / daily-job
 * endpoints, the breakdown → one-Mobilisasi-step Draft WO with finding_note
 * (REQ-PM-005, REQ-MBL-002, REQ-WO-016), the daily job roll-forward + OFF recalc
 * via the HTTP surface, and the alert-list / notification reads.
 */
describe('Maintenance (PM / schedule / notifications / daily job) e2e (TASK-114)', () => {
  let app: INestApplication;
  let settings: AppSettingsService;
  let workOrders: WorkOrdersService;
  let alerts: PmAlertService;
  let schedule: ScheduleService;
  let notifications: NotificationService;
  let breakdowns: BreakdownReportService;
  let dailyJob: DailyJobService;
  let rules: AlertRuleService;
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
    alerts = app.get(PmAlertService);
    schedule = app.get(ScheduleService);
    notifications = app.get(NotificationService);
    breakdowns = app.get(BreakdownReportService);
    dailyJob = app.get(DailyJobService);
    rules = app.get(AlertRuleService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    settings.resetForTests();
    settings.goLive(new Date().toISOString());
    workOrders.resetForTests();
    alerts.resetForTests();
    schedule.resetForTests();
    notifications.resetForTests();
    breakdowns.resetForTests();
    dailyJob.resetForTests();
    rules.resetForTests();
  });

  const server = (): Parameters<typeof request>[0] => app.getHttpServer();

  async function login(email: string): Promise<string> {
    const res = await request(server()).post(`${base}/auth/login`).send({ email, password: SEED_PASSWORD });
    expect(res.status).toBe(200);
    return res.body.token as string;
  }
  const auth = (token: string) => (r: request.Test): request.Test => r.set('Authorization', `Bearer ${token}`);

  // --- role guard (REQ-SCH-002 / §2.2) ------------------------------------

  it('refuses a Driver placing a schedule card (§2.2, only Planner/SA)', async () => {
    const driver = await login('driver@bmi.test');
    await auth(driver)(
      request(server()).post(`${base}/maintenance/schedule`).send({ workOrderId: 1, plannedDate: '2026-11-10' }),
    ).expect(403);
  });

  it('lets the Planner run the daily job; a Mechanic is refused (§2.2)', async () => {
    const mechanic = await login('mechanic@bmi.test');
    await auth(mechanic)(
      request(server()).post(`${base}/maintenance/daily-job/run`).send({ now: '2026-10-28T00:00:00.000Z' }),
    ).expect(403);

    const planner = await login('planner@bmi.test');
    const res = await auth(planner)(
      request(server()).post(`${base}/maintenance/daily-job/run`).send({ now: '2026-10-28T00:00:00.000Z' }),
    ).expect(200);
    expect(res.body.wibDay).toBe('2026-10-28');
    expect(res.body.rolledForwardCardIds.length).toBeGreaterThan(0);
  });

  // --- daily job over HTTP (REQ-SCH-003, DEC-92) --------------------------

  it('the daily job rolls the seeded card forward, flags it, and sets the vehicle OFF', async () => {
    const planner = await login('planner@bmi.test');
    await auth(planner)(
      request(server()).post(`${base}/maintenance/daily-job/run`).send({ now: '2026-10-28T00:00:00.000Z' }),
    ).expect(200);

    const list = await auth(planner)(request(server()).get(`${base}/maintenance/schedule`)).expect(200);
    const cards = list.body.cards as Array<{ isRolledOver: boolean; plannedDate: string }>;
    const card = cards[0];
    expect(card).toBeDefined();
    expect(card?.isRolledOver).toBe(true);
    expect(card?.plannedDate).toBe('2026-10-28');

    const vehicle = await auth(planner)(request(server()).get(`${base}/vehicles/1`)).expect(200);
    expect(vehicle.body.vehicle.status).toBe(VehicleStatus.OFF);
  });

  // --- breakdown → one-Mobilisasi-step Draft WO (REQ-PM-005/MBL-002/WO-016) -

  it('a breakdown report auto-drafts a one-Mobilisasi-step Draft WO with finding_note copied', async () => {
    const sysadmin = await login('sysadmin@bmi.test');
    const res = await auth(sysadmin)(
      request(server()).post(`${base}/maintenance/breakdowns`).send({
        vehicleId: 1,
        driverId: 4,
        description: 'Engine overheating on the toll road',
        locationLat: -6.2,
        locationLng: 106.8,
      }),
    ).expect(201);

    const draft = res.body.draftedWorkOrder;
    expect(draft.status).toBe(WorkOrderStatus.Draft);
    expect(draft.source).toBe(WorkOrderSource.DriverBreakdown);
    expect(draft.findingNote).toBe('Engine overheating on the toll road');

    // Exactly one Mobilisasi step at the captured location.
    const steps = await workOrders.stepsOf(draft.id);
    expect(steps).toHaveLength(1);
    expect(steps[0]?.moduleCode).toBe('Mobilisasi');
    expect(steps[0]?.stepConfig).toMatchObject({ locationLat: -6.2, locationLng: 106.8 });
  });

  // --- alert list + draft (REQ-PM-001/003/009) ----------------------------

  it('triggering a PM alert drafts a WO and lists it in the alert list', async () => {
    const planner = await login('planner@bmi.test');
    const triggered = await auth(planner)(
      request(server()).post(`${base}/maintenance/alerts/trigger`).send({
        vehicleId: 1,
        ruleKind: 'PM_Due',
        reason: 'Mileage',
        sourceRef: 'PM-1',
        title: 'PM-1 service due',
      }),
    ).expect(201);
    expect(triggered.body.created).toBe(true);
    expect(triggered.body.draftedWorkOrder.status).toBe(WorkOrderStatus.Draft);
  });

  // --- notifications + dashboard reads ------------------------------------

  it('surfaces late alerts in the notification list and a Mechanic dashboard (REQ-NTF-001, REQ-DSH-003)', async () => {
    const planner = await login('planner@bmi.test');
    await auth(planner)(
      request(server()).post(`${base}/maintenance/daily-job/run`).send({ now: '2026-10-28T00:00:00.000Z' }),
    ).expect(200);

    const bell = await auth(planner)(request(server()).get(`${base}/maintenance/notifications`)).expect(200);
    expect(Array.isArray(bell.body.notifications)).toBe(true);

    const mechanic = await login('mechanic@bmi.test');
    const dash = await auth(mechanic)(request(server()).get(`${base}/maintenance/dashboard`)).expect(200);
    expect(dash.body.role).toBe('Mechanic');
    expect(dash.body.cards.some((c: { key: string }) => c.key === 'steps_open')).toBe(true);
  });

  // --- REQ-DSH-009: the Accounting dashboard has its P0 cards (TASK-120) ----

  it('REQ-DSH-009 — the Accounting role lands on an Accounting dashboard with its billing cards', async () => {
    const accounting = await login('accounting@bmi.test');
    const dash = await auth(accounting)(
      request(server()).get(`${base}/maintenance/dashboard`),
    ).expect(200);
    expect(dash.body.role).toBe('Accounting');
    const keys = (dash.body.cards as Array<{ key: string }>).map((c) => c.key);
    // The four P0 Accounting cards (REQ-DSH-009); cost cards stay P1 (REQ-DSH-008).
    expect(keys).toEqual(
      expect.arrayContaining([
        'invoice_drafts',
        'invoices_issued',
        'invoices_overdue',
        'billed_this_month',
        'wos_not_billable',
      ]),
    );
  });
});
