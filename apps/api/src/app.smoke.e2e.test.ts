import 'reflect-metadata';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  SEED_PASSWORD,
  SEED_IDS,
  type DataGateway,
} from '@bmi/data-gateway';
import {
  idValue,
  InvoiceStatus,
  Role,
  Team,
  toId,
  TyreStatus,
  WorkOrderCategory,
  WorkOrderStatus,
  type TyreId,
  type VehicleId,
  type WorkOrderId,
} from '@bmi/shared';
import { AppModule } from './app.module.js';
import { API_PREFIX } from './app.constants.js';
import { DATA_GATEWAY } from './core/data-gateway/data-gateway.module.js';
import { AuditService } from './core/audit/audit.service.js';
import { AppSettingsService } from './modules/iam/app-settings.service.js';
import { WorkOrdersService } from './modules/work-orders/work-orders.service.js';
import { StepTimeEventService } from './modules/assignments/step-time-event.service.js';
import { ModuleRegistryService } from './modules/registry/module-registry.service.js';
import { PresetService } from './modules/registry/preset.service.js';
import { VehiclesService } from './modules/vehicles/vehicles.service.js';
import { VehicleClassService } from './modules/vehicles/vehicle-class.service.js';
import { DocumentTypeService } from './modules/vehicles/document-type.service.js';
import { DocumentService } from './modules/vehicles/document.service.js';
import { OdometerService } from './modules/vehicles/odometer.service.js';
import { PartsLedgerService } from './modules/stock/parts-ledger.service.js';
import { StockStepService } from './modules/stock/stock-step.service.js';
import { PartPurchaseStepService } from './modules/stock/part-purchase-step.service.js';
import { MechanicActionStepService } from './modules/mechanic/mechanic-action-step.service.js';
import { PartCheckStepService } from './modules/mechanic/part-check-step.service.js';
import { ServiceCatalogService } from './modules/mechanic/service-catalog.service.js';
import { MobilisasiStepService } from './modules/mobilisasi/mobilisasi-step.service.js';
import { StooringRatesService } from './modules/mobilisasi/stooring-rates.service.js';
import { PlacementService } from './modules/placement/placement.service.js';
import { PartsInventoryService } from './modules/inventory/parts-inventory.service.js';
import { TyreRegisterService } from './modules/inventory/tyre-register.service.js';
import { ChangeRequestsService } from './modules/change-requests/change-requests.service.js';
import { ApprovalsService } from './modules/approvals/approvals.service.js';
import { PmAlertService } from './modules/maintenance/pm-alert.service.js';
import { ScheduleService } from './modules/maintenance/schedule.service.js';
import { NotificationService } from './modules/maintenance/notification.service.js';
import { BreakdownReportService } from './modules/maintenance/breakdown-report.service.js';
import { DailyJobService } from './modules/maintenance/daily-job.service.js';
import { AlertRuleService } from './modules/maintenance/alert-rule.service.js';
import { InvoiceService } from './modules/billing/invoice.service.js';
import { CustomerService } from './modules/billing/customer.service.js';
import { OpeningBalanceService } from './modules/setup/opening-balance.service.js';
import { BulkImportService } from './modules/setup/bulk-import.service.js';
import { buildFileBuffer, type FileEnvelope } from './modules/files/content.js';

/**
 * Every module's state-holding service that exposes a `resetForTests()` seam.
 * The smoke suite resets each before an FG script so the shared `AppModule`
 * instance never leaks state across functional groups.
 */
const RESETTABLE_SERVICES = [
  WorkOrdersService,
  StepTimeEventService,
  ModuleRegistryService,
  PresetService,
  VehiclesService,
  VehicleClassService,
  DocumentTypeService,
  DocumentService,
  OdometerService,
  PartsLedgerService,
  StockStepService,
  PartPurchaseStepService,
  MechanicActionStepService,
  PartCheckStepService,
  ServiceCatalogService,
  MobilisasiStepService,
  StooringRatesService,
  PlacementService,
  PartsInventoryService,
  TyreRegisterService,
  ChangeRequestsService,
  ApprovalsService,
  PmAlertService,
  ScheduleService,
  NotificationService,
  BreakdownReportService,
  DailyJobService,
  AlertRuleService,
  InvoiceService,
  CustomerService,
  OpeningBalanceService,
  BulkImportService,
] as const;

/** Brand a raw numeric id back to its typed surrogate for gateway reads. */
function toTyreId(id: number): TyreId {
  return toId<'TyreId'>(id);
}
function toVehicleId(id: number): VehicleId {
  return toId<'VehicleId'>(id);
}
function toWoId(id: number): WorkOrderId {
  return toId<'WorkOrderId'>(id);
}

/** Build the deterministic Phase-1 JPEG envelope the Files worker consumes. */
function buildPhotoBytes(env: FileEnvelope): string {
  return buildFileBuffer('image/jpeg', env).toString('base64');
}

/**
 * TASK-119 — Dev-phase E2E smoke suite (all P0 functional groups).
 *
 * One scripted happy-path end-to-end per functional group (FG-1 … FG-16),
 * exercised over real HTTP against the booted `AppModule` on the Phase-1
 * in-memory **dummy** `DataGateway` (never a concrete DB driver — the steering
 * hard rule). The per-module e2e suites prove each acceptance criterion in
 * depth; this suite is the thin, fast "does the whole arc still work" gate the
 * `develop` CI job runs, following the PRD §6 happy-path arc
 * create → approve → execute → verify → complete → invoice where the FG has one.
 *
 * It reuses the exact conventions the sibling e2e suites established:
 *   - boot `AppModule` once (`beforeAll`), reset the shared in-memory state
 *     before each FG via the modules' `resetForTests()` seams,
 *   - sign in through `POST /auth/login` with the seeded `SEED_PASSWORD`,
 *   - send the opaque session token as `Authorization: Bearer`.
 *
 * No new endpoint, service, DTO, data-model (§9) or state machine (§3) is
 * introduced — the suite is pure black-box verification of shipped behaviour.
 */
describe('Dev-phase E2E smoke suite (TASK-119) — all P0 functional groups', () => {
  let app: INestApplication;
  let gateway: DataGateway;
  let settings: AppSettingsService;
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
    gateway = app.get<DataGateway>(DATA_GATEWAY);
    settings = app.get(AppSettingsService);
    audit = app.get(AuditService);
  });

  afterAll(async () => {
    await app.close();
  });

  /**
   * Reset every module's Phase-1 in-memory state to the seeded baseline, then
   * flip the system Live so office + field roles can sign in. FG-14 drives the
   * Setup → Go-live flow itself, so it manages its own mode after this reset.
   */
  beforeEach(() => {
    resetAll();
    settings.goLive(new Date().toISOString());
  });

  /**
   * Reset every module's in-memory state so each FG script starts from the
   * seeded baseline (no cross-FG leakage on the shared `AppModule` instance).
   * `AppSettings` resets first because go-live is one-way — a reset returns the
   * system to Setup, which the `beforeEach` then flips back Live.
   */
  function resetAll(): void {
    settings.resetForTests();
    for (const ServiceClass of RESETTABLE_SERVICES) {
      const provider = app.get<{ resetForTests?: () => void }>(ServiceClass);
      provider.resetForTests?.();
    }
  }

  const server = (): Parameters<typeof request>[0] => app.getHttpServer();

  async function login(email: string): Promise<string> {
    const res = await request(server())
      .post(`${base}/auth/login`)
      .send({ email, password: SEED_PASSWORD });
    expect(res.status).toBe(200);
    return res.body.token as string;
  }
  const auth = (token: string) => (r: request.Test): request.Test =>
    r.set('Authorization', `Bearer ${token}`);

  const stockStep = {
    module: 'Stock',
    executorRoles: [Role.WarehouseManager],
    verifierRole: Role.Planner,
  };
  const mechStep = {
    module: 'Mechanic_Action',
    executorRoles: [Role.Mechanic],
    verifierRole: Role.Planner,
  };

  // --- shared helpers reused across FG scripts -----------------------------

  /** Create → submit → approve a WO as Planner/Supervisor; return WO + steps. */
  async function activeWo(
    steps: Array<Record<string, unknown>>,
    overrides: Record<string, unknown> = {},
  ): Promise<{
    id: number;
    steps: Array<{ id: number; version: number; sequence: number; moduleCode: string; status: string }>;
  }> {
    const plannerToken = await login('planner@bmi.test');
    const created = await auth(plannerToken)(
      request(server()).post(`${base}/work-orders`).send({
        vehicleId: 1,
        title: 'Smoke WO',
        category: WorkOrderCategory.Corrective,
        description: 'smoke happy path',
        steps,
        ...overrides,
      }),
    ).expect(201);
    const wo = created.body.workOrder;
    const submitted = await auth(plannerToken)(
      request(server()).post(`${base}/work-orders/${wo.id}/submit`).send({ version: wo.version }),
    ).expect(200);
    const supToken = await login('supervisor@bmi.test');
    await auth(supToken)(
      request(server())
        .post(`${base}/work-orders/${wo.id}/approve`)
        .send({ version: submitted.body.workOrder.version }),
    ).expect(200);
    const detail = await auth(plannerToken)(
      request(server()).get(`${base}/work-orders/${wo.id}`),
    ).expect(200);
    return { id: wo.id, steps: detail.body.steps };
  }

  // =========================================================================
  // FG-1 — Work Order lifecycle (create → approve → execute → verify →
  // complete), the central product rule "nothing happens outside a WO".
  // =========================================================================

  it('FG-1 WO lifecycle — create → approve → run steps → verify → request/approve completion', async () => {
    const { id, steps } = await activeWo([stockStep, mechStep]);
    const plannerToken = await login('planner@bmi.test');
    const whToken = await login('warehouse@bmi.test');
    const mechToken = await login('mechanic@bmi.test');
    const supToken = await login('supervisor@bmi.test');

    // Step 1 (Stock): start → submit (opens step 2).
    const s1 = steps.find((s) => s.sequence === 1)!;
    const s1Started = await auth(whToken)(
      request(server()).post(`${base}/assignments/${s1.id}/start`).send({ version: s1.version }),
    ).expect(200);
    const s1Submitted = await auth(whToken)(
      request(server()).post(`${base}/assignments/${s1.id}/submit`).send({ version: s1Started.body.step.version }),
    ).expect(200);

    // Step 2 (Mechanic_Action, last): start → submit (→ WO Pending_Verification).
    const s2 = (await auth(plannerToken)(request(server()).get(`${base}/work-orders/${id}`)).expect(200)).body.steps.find(
      (s: { sequence: number }) => s.sequence === 2,
    );
    const s2Started = await auth(mechToken)(
      request(server()).post(`${base}/assignments/${s2.id}/start`).send({ version: s2.version }),
    ).expect(200);
    const s2Submitted = await auth(mechToken)(
      request(server()).post(`${base}/assignments/${s2.id}/submit`).send({ version: s2Started.body.step.version }),
    ).expect(200);

    // Verify both steps, then request + approve completion (four-eyes, BR-03).
    await auth(plannerToken)(
      request(server()).post(`${base}/assignments/${s1.id}/verify`).send({ version: s1Submitted.body.step.version }),
    ).expect(200);
    await auth(plannerToken)(
      request(server()).post(`${base}/assignments/${s2.id}/verify`).send({ version: s2Submitted.body.step.version }),
    ).expect(200);

    const woNow = (await auth(plannerToken)(request(server()).get(`${base}/work-orders/${id}`)).expect(200)).body.workOrder;
    const requested = await auth(plannerToken)(
      request(server()).post(`${base}/work-orders/${id}/request-completion`).send({ version: woNow.version }),
    ).expect(200);
    const completed = await auth(supToken)(
      request(server())
        .post(`${base}/work-orders/${id}/approve-completion`)
        .send({ version: requested.body.workOrder.version }),
    ).expect(200);
    expect(completed.body.workOrder.status).toBe(WorkOrderStatus.Completed);
  });

  // =========================================================================
  // FG-2 — Assignment engine: approving a multi-step WO opens step 1 and
  // keeps later steps Locked; submitting step 1 opens step 2 (sequencing).
  // =========================================================================

  it('FG-2 assignment engine — approval opens step 1, submit cascades to step 2', async () => {
    const { id, steps } = await activeWo([stockStep, mechStep, { ...stockStep }]);
    const plannerToken = await login('planner@bmi.test');
    const whToken = await login('warehouse@bmi.test');

    // After approval: step 1 Open, 2 & 3 Locked.
    expect(steps.find((s) => s.sequence === 1)!.status).toBe('Open');
    expect(steps.find((s) => s.sequence === 2)!.status).toBe('Locked');
    expect(steps.find((s) => s.sequence === 3)!.status).toBe('Locked');

    // Submit step 1 → step 2 opens, step 3 still Locked.
    const s1 = steps.find((s) => s.sequence === 1)!;
    const started = await auth(whToken)(
      request(server()).post(`${base}/assignments/${s1.id}/start`).send({ version: s1.version }),
    ).expect(200);
    await auth(whToken)(
      request(server()).post(`${base}/assignments/${s1.id}/submit`).send({ version: started.body.step.version }),
    ).expect(200);

    const after = (await auth(plannerToken)(request(server()).get(`${base}/work-orders/${id}`)).expect(200)).body
      .steps as Array<{ sequence: number; status: string }>;
    expect(after.find((s) => s.sequence === 2)!.status).toBe('Open');
    expect(after.find((s) => s.sequence === 3)!.status).toBe('Locked');
  });

  // =========================================================================
  // FG-3 — Registry / composer: register a new module, then the live composer
  // check accepts a composition that uses it (configuration over code).
  // =========================================================================

  it('FG-3 registry/composer — register a module then compose with it', async () => {
    const admin = await login('sysadmin@bmi.test');
    await auth(admin)(
      request(server()).post(`${base}/registry/modules`).send({
        code: 'Smoke_Scan',
        name: 'Smoke Scan',
        uiComponent: 'StepSmokeScan',
        executorRoles: [Role.Mechanic],
        costKind: 'None',
      }),
    ).expect(201);

    const modules = await auth(admin)(request(server()).get(`${base}/registry/modules`)).expect(200);
    expect((modules.body.modules as Array<{ code: string }>).map((m) => m.code)).toContain('Smoke_Scan');

    const check = await auth(admin)(
      request(server()).post(`${base}/registry/composer/check`).send({ steps: [{ module: 'Smoke_Scan' }] }),
    ).expect(200);
    expect(check.body.canSubmit).toBe(true);
  });

  // =========================================================================
  // FG-4 — Stock + Part Purchase: a Part Purchase step records a vendor cost
  // and changes NO stock (REQ-PUR-006), proving the purchase-vs-issue split.
  // =========================================================================

  it('FG-4 stock + purchase — a Part Purchase records cost and leaves stock untouched', async () => {
    const partPurchase = app.get(PartPurchaseStepService);
    const ledger = app.get(PartsLedgerService);

    const { steps } = await activeWo([
      { module: 'Part_Purchase', executorRoles: [Role.WarehouseManager], verifierRole: Role.Planner },
    ]);
    const pp = steps.find((s) => s.moduleCode === 'Part_Purchase')!;
    partPurchase.setHints(pp.id, [{ sku: 'SKU-4410', partName: 'Wiper blade', hintQty: null, unit: 'pcs' }]);

    const stockBefore = ledger.stockOf('SKU-4410');
    const whToken = await login('warehouse@bmi.test');
    const started = await auth(whToken)(
      request(server()).post(`${base}/assignments/${pp.id}/start`).send({ version: pp.version }),
    ).expect(200);
    await auth(whToken)(
      request(server()).post(`${base}/stock/purchase/${pp.id}/stage`).send({
        lines: [{ sku: 'SKU-4410', quantity: 2, unitPrice: 45000 }],
        vendor: 'Toko Smoke',
        receiptDate: '2026-11-11',
        receiptPhoto: 'r2://receipts/smoke.jpg',
      }),
    ).expect(200);
    await auth(whToken)(
      request(server()).post(`${base}/assignments/${pp.id}/submit`).send({ version: started.body.step.version }),
    ).expect(200);

    expect(partPurchase.purchaseOf(pp.id)!.calculatedTotal).toBe(90000);
    expect(ledger.stockOf('SKU-4410')).toBe(stockBefore); // purchase never cuts stock
  });

  // =========================================================================
  // FG-5 — Mechanic + Part Check: an Internal Mechanic Action bills the
  // read-only catalog price, end-to-end (start → stage → submit).
  // =========================================================================

  it('FG-5 mechanic action — stage an internal service and submit at catalog price', async () => {
    const mechanicAction = app.get(MechanicActionStepService);
    const { steps } = await activeWo([mechStep]);
    const ma = steps.find((s) => s.moduleCode === 'Mechanic_Action')!;
    const mechToken = await login('mechanic@bmi.test');
    const started = await auth(mechToken)(
      request(server()).post(`${base}/assignments/${ma.id}/start`).send({ version: ma.version }),
    ).expect(200);
    await auth(mechToken)(
      request(server()).post(`${base}/mechanic/action/${ma.id}/stage`).send({
        team: Team.Internal,
        internalServices: [{ serviceCode: 'SVC-010' }],
        photos: ['r2://repair/smoke.jpg'],
      }),
    ).expect(200);
    await auth(mechToken)(
      request(server()).post(`${base}/assignments/${ma.id}/submit`).send({ version: started.body.step.version }),
    ).expect(200);
    expect(mechanicAction.actionOf(ma.id)!.laborCost).toBe(250000);
  });

  // =========================================================================
  // FG-5a — Mobilisasi: start opens a route; reaching the destination reports
  // arrival; the engine submit charges the region's stooring fee.
  // =========================================================================

  it('FG-5a mobilisasi — route, arrival and stooring charge on submit', async () => {
    const mobilisasi = app.get(MobilisasiStepService);
    const { steps } = await activeWo([
      {
        module: 'Mobilisasi',
        executorRoles: [Role.Mechanic],
        verifierRole: Role.Planner,
        stepConfig: { stooringRegion: 'BEKASI', locationLat: -6.3, locationLng: 107.1 },
      },
    ]);
    const mbl = steps.find((s) => s.moduleCode === 'Mobilisasi')!;
    const mechToken = await login('mechanic@bmi.test');
    const started = await auth(mechToken)(
      request(server()).post(`${base}/assignments/${mbl.id}/start`).send({ version: mbl.version }),
    ).expect(200);
    const route = await auth(mechToken)(request(server()).post(`${base}/mobilisasi/${mbl.id}/route`).send({})).expect(200);
    expect(route.body.route.region).toMatchObject({ code: 'BEKASI' });
    const arrival = await auth(mechToken)(
      request(server()).post(`${base}/mobilisasi/${mbl.id}/arrival`).send({ lat: -6.3, lng: 107.1 }),
    ).expect(200);
    expect(arrival.body.arrived).toBe(true);
    await auth(mechToken)(
      request(server()).post(`${base}/assignments/${mbl.id}/submit`).send({ version: started.body.step.version }),
    ).expect(200);
    expect(mobilisasi.chargeOf(mbl.id)!.fee).toBe(250000);
  });

  // =========================================================================
  // FG-6 — Placement: a Part Replacement step mounts a tyre issued to its WO
  // onto a generated chassis position (the tyre goes Mounted).
  // =========================================================================

  it('FG-6 placement — mount a tyre issued to the WO onto a chassis position', async () => {
    const { id: woId, steps } = await activeWo([
      { module: 'Part_Replacement', executorRoles: [Role.Mechanic], verifierRole: Role.Planner, stepConfig: {} },
    ]);
    const step = steps.find((s) => s.moduleCode === 'Part_Replacement')!;
    const mechToken = await login('mechanic@bmi.test');
    const started = await auth(mechToken)(
      request(server()).post(`${base}/assignments/${step.id}/start`).send({ version: step.version }),
    ).expect(200);

    // Issue a seeded In_Stock tyre to this WO (the FG-8 tyre-issue seam).
    const tyreId = await gateway.unitOfWork(async (ctx) => {
      const tyre = await ctx.repos.tyres.findOneBy('code', 'TY-0101');
      if (!tyre) throw new Error('seed tyre TY-0101 missing');
      const wo = await ctx.repos.workOrders.requireById(woId);
      const updated = await ctx.repos.tyres.update({
        ...tyre,
        status: TyreStatus.Issued,
        issuedWorkOrderId: wo.id,
      });
      return idValue(updated.id);
    });

    await auth(mechToken)(
      request(server()).post(`${base}/placement/${step.id}/mount`).send({ position: 'A1_L', tyreId, treadMm: 9 }),
    ).expect(200);
    const tyre = await gateway.repos.tyres.getById(toTyreId(tyreId));
    expect(tyre!.status).toBe(TyreStatus.Mounted);
    void started;
  });

  // =========================================================================
  // FG-7 — Vehicles / documents / odometer: register a vehicle, add its
  // required documents, record an odometer reading.
  // =========================================================================

  it('FG-7 vehicles/documents/odometer — register, document and read a vehicle', async () => {
    const admin = await login('sysadmin@bmi.test');
    const created = await auth(admin)(
      request(server()).post(`${base}/vehicles`).send({ plate: 'D 119 SMK', classId: 1, odometerKm: 1000 }),
    ).expect(201);
    const vid = created.body.vehicle.id;

    for (const typeId of [1, 2, 3]) {
      await auth(admin)(
        request(server()).post(`${base}/vehicles/${vid}/documents`).send({
          documentTypeId: typeId,
          documentNumber: `DOC-${typeId}`,
          expiryDate: '2030-01-01',
          fileUrl: 'key/doc.jpg',
        }),
      ).expect(201);
    }
    const odo = await auth(admin)(
      request(server()).post(`${base}/vehicles/${vid}/odometer`).send({ reading: 1500, readingAt: '2026-11-11T00:00:00.000Z' }),
    ).expect(201);
    expect(odo.body.vehicle.odometerKm).toBe(1500);
  });

  // =========================================================================
  // FG-8 — Inventory / tyres: a Goods Receipt raises stock and recomputes the
  // moving average; a tyre receive issues a never-reused TY code.
  // =========================================================================

  it('FG-8 inventory/tyres — goods receipt moving-average + tyre receive', async () => {
    const whm = await login('warehouse@bmi.test');
    await auth(whm)(
      request(server()).post(`${base}/inventory/parts`).send({ sku: 'SKU-SMK', partName: 'Smoke oil', unit: 'L' }),
    ).expect(201);
    await auth(whm)(
      request(server()).post(`${base}/inventory/goods-receipts`).send({ lines: [{ sku: 'SKU-SMK', qty: 10, unitPrice: 80000 }] }),
    ).expect(201);
    await auth(whm)(
      request(server()).post(`${base}/inventory/goods-receipts`).send({ lines: [{ sku: 'SKU-SMK', qty: 10, unitPrice: 100000 }] }),
    ).expect(201);
    const part = await auth(whm)(request(server()).get(`${base}/inventory/parts/SKU-SMK`)).expect(200);
    expect(part.body.part.stockQty).toBe(20);
    expect(part.body.part.averageCost).toBe(90000);

    const received = await auth(whm)(
      request(server()).post(`${base}/inventory/tyres/receive`).send({
        source: 'Supplier',
        invoiceNumber: 'INV-SMK',
        tyres: [{ serialNumber: 'SN-SMK', brand: 'Bridgestone', size: '11R22.5', tyreType: 'Tubeless', treadMm: 14 }],
      }),
    ).expect(201);
    expect(received.body.tyres[0].code).toMatch(/^TY-\d{4,}$/);
    expect(received.body.tyres[0].status).toBe('In_Stock');
  });

  // =========================================================================
  // FG-9 — Change requests: the open step's executor raises a CR (→ WO
  // Pending_Amendment); the creator opens → revises → approves (amendment++).
  // =========================================================================

  it('FG-9 change requests — raise, revise and approve an amendment', async () => {
    const { steps } = await activeWo([mechStep]);
    const step1 = steps[0]!;
    const mechToken = await login('mechanic@bmi.test');
    await auth(mechToken)(
      request(server()).post(`${base}/assignments/${step1.id}/start`).send({ version: step1.version }),
    ).expect(200);
    const raised = await auth(mechToken)(
      request(server()).post(`${base}/change-requests`).send({
        assignmentId: step1.id,
        whatChanges: 'need an extra part',
        requestedChange: 'add a bearing',
        reason: 'original list was wrong',
      }),
    ).expect(201);
    const crId = raised.body.changeRequest.id;

    const plannerToken = await login('planner@bmi.test');
    await auth(plannerToken)(request(server()).post(`${base}/change-requests/${crId}/open`).send({})).expect(200);
    await auth(plannerToken)(
      request(server()).post(`${base}/change-requests/${crId}/revise`).send({ description: 'revised scope' }),
    ).expect(200);
    const approved = await auth(plannerToken)(
      request(server()).post(`${base}/change-requests/${crId}/approve`).send({}),
    ).expect(200);
    expect(approved.body.changeRequest.status).toBe('Approved');
  });

  // =========================================================================
  // FG-10 — Approvals inbox: a pending-creation WO appears in the inbox and a
  // Supervisor approves it through the decide route (→ WO Active).
  // =========================================================================

  it('FG-10 approvals — a creation item is approved through the inbox', async () => {
    const plannerToken = await login('planner@bmi.test');
    const created = await auth(plannerToken)(
      request(server()).post(`${base}/work-orders`).send({
        vehicleId: 1,
        title: 'Approval WO',
        category: WorkOrderCategory.Corrective,
        description: 'awaiting approval',
        steps: [mechStep],
      }),
    ).expect(201);
    const wo = created.body.workOrder;
    await auth(plannerToken)(
      request(server()).post(`${base}/work-orders/${wo.id}/submit`).send({ version: wo.version }),
    ).expect(200);

    const sup = await login('supervisor@bmi.test');
    const inbox = await auth(sup)(request(server()).get(`${base}/approvals`)).expect(200);
    expect((inbox.body.items as Array<{ ref: string }>).some((i) => i.ref === `Creation:${wo.id}`)).toBe(true);

    const woView = await auth(sup)(request(server()).get(`${base}/work-orders/${wo.id}`)).expect(200);
    await auth(sup)(
      request(server())
        .post(`${base}/approvals/Creation:${wo.id}/decide`)
        .send({ action: 'approve', version: woView.body.workOrder.version }),
    ).expect(200);
    const after = await auth(sup)(request(server()).get(`${base}/work-orders/${wo.id}`)).expect(200);
    expect(after.body.workOrder.status).toBe(WorkOrderStatus.Active);
  });

  // =========================================================================
  // FG-11 — WO document + invoices: serve the WO document, then generate →
  // issue → pay a customer invoice for a completed WO (with the Off_Unit line).
  // =========================================================================

  it('FG-11 WO document + invoices — generate, issue and pay an invoice', async () => {
    const customers = app.get(CustomerService);
    const woId = idValue(SEED_IDS.workOrder);
    const vehicleId = idValue(SEED_IDS.vehicle);

    customers.create({ code: 'CUST-SMK', name: 'PT Smoke', billingAddress: 'Jakarta' });
    // Put the seed WO into a Completed state with off_days, billable to customer 1.
    await gateway.unitOfWork(async (ctx) => {
      const wo = await ctx.repos.workOrders.requireById(toWoId(woId));
      return ctx.repos.workOrders.update({ ...wo, completedAt: '2026-11-03T05:00:00.000Z', offDays: 2 });
    });
    await gateway.unitOfWork(async (ctx) => {
      const v = await ctx.repos.vehicles.requireById(toVehicleId(vehicleId));
      return ctx.repos.vehicles.update({ ...v, customerId: SEED_IDS.customer });
    });

    const sysadmin = await login('sysadmin@bmi.test');
    await auth(sysadmin)(request(server()).put(`${base}/settings/off-unit-rate`).send({ rate: 500000 })).expect(200);

    const planner = await login('planner@bmi.test');
    const doc = await auth(planner)(request(server()).get(`${base}/work-orders/${woId}/document`)).expect(200);
    expect(doc.body.number).toBe('WO-0142');

    const accounting = await login('supervisor@bmi.test'); // holds invoice.manage
    await auth(accounting)(
      request(server()).post(`${base}/invoices/work-order-billables`).send({
        workOrderId: woId,
        lines: [
          { kind: 'Part', description: 'Oil filter', sku: 'OF-1', qty: 1, unitCost: 64000 },
          { kind: 'Service', description: 'Oil change', qty: 1, unitCost: 150000 },
        ],
      }),
    ).expect(200);
    const gen = await auth(accounting)(
      request(server()).post(`${base}/invoices/generate`).send({ workOrderId: woId }),
    ).expect(201);
    const invoiceId = gen.body.invoice.id as number;
    expect(gen.body.invoice.total).toBe(1383060);

    const issued = await auth(accounting)(
      request(server())
        .post(`${base}/invoices/${invoiceId}/issue`)
        .send({ version: gen.body.invoice.version, issueDate: '2026-11-03T05:00:00.000Z' }),
    ).expect(200);
    expect(issued.body.invoice.status).toBe(InvoiceStatus.Issued);
    const paid = await auth(accounting)(
      request(server())
        .post(`${base}/invoices/${invoiceId}/pay`)
        .send({ version: issued.body.invoice.version, method: 'Transfer', amount: issued.body.invoice.total }),
    ).expect(200);
    expect(paid.body.invoice.status).toBe(InvoiceStatus.Paid);
  });

  // =========================================================================
  // FG-12 — PM / schedule / dashboards / notifications: the daily job rolls
  // the seeded overdue card forward and surfaces a role dashboard.
  // =========================================================================

  it('FG-12 PM/schedule/dashboards/notifications — daily job + dashboard read', async () => {
    const planner = await login('planner@bmi.test');
    const job = await auth(planner)(
      request(server()).post(`${base}/maintenance/daily-job/run`).send({ now: '2026-10-28T00:00:00.000Z' }),
    ).expect(200);
    expect(job.body.wibDay).toBe('2026-10-28');
    expect(job.body.rolledForwardCardIds.length).toBeGreaterThan(0);

    const schedule = await auth(planner)(request(server()).get(`${base}/maintenance/schedule`)).expect(200);
    expect((schedule.body.cards as Array<{ isRolledOver: boolean }>)[0]!.isRolledOver).toBe(true);

    const mechanic = await login('mechanic@bmi.test');
    const dash = await auth(mechanic)(request(server()).get(`${base}/maintenance/dashboard`)).expect(200);
    expect(dash.body.role).toBe('Mechanic');
  });

  // =========================================================================
  // FG-13 — IAM / audit: the Access Manager moves the single System Admin
  // role, and exactly one audit record is written for the move (NFR-02).
  // =========================================================================

  it('FG-13 IAM/audit — move the System Admin role, exactly one audit record', async () => {
    const am = await login('access@bmi.test');
    const before = audit.count();
    const moved = await auth(am)(
      request(server()).post(`${base}/users/move-system-admin`).send({ toUserId: 3, reason: 'Smoke handover' }),
    ).expect(200);
    expect(moved.body.to.role).toBe(Role.SystemAdmin);
    expect(audit.count()).toBe(before + 1);
    expect(audit.all().at(-1)!.reason).toBe('Smoke handover');

    // The gateway `users` table is NOT covered by the module `resetForTests()`
    // seams (those reset only API-layer stores), and this one boot shares a
    // single seeded gateway across every FG. Move the System Admin role back to
    // the seeded holder (user 6) so later FGs (14/15) see the pristine seed.
    await auth(am)(
      request(server()).post(`${base}/users/move-system-admin`).send({ toUserId: 6, reason: 'Smoke handover revert' }),
    ).expect(200);
  });

  // =========================================================================
  // FG-14 — Setup / go-live: in Setup mode only SA/AM sign in; a vehicles
  // import succeeds, then the one-way Go-live switch flips the system Live.
  // =========================================================================

  it('FG-14 setup/go-live — Setup-only sign-in, bulk import, then one-way go-live', async () => {
    // Return to Setup mode for this FG (the suite's beforeEach went Live).
    settings.resetForTests();

    // In Setup, a Planner cannot sign in; the System Admin can (AC-IAM-006).
    await request(server())
      .post(`${base}/auth/login`)
      .send({ email: 'planner@bmi.test', password: SEED_PASSWORD })
      .expect(403);
    const sa = await login('sysadmin@bmi.test');

    // Bulk import a clean vehicles file (Setup-mode only).
    const rows = Array.from({ length: 5 }, (_unused, n) => ({
      plate: `D ${2000 + n} SMK`,
      classId: 1,
      chassisLayoutId: 1,
      odometerKm: 0,
    }));
    const imported = await auth(sa)(
      request(server()).post(`${base}/setup/import/vehicles`).send({ fileName: 'smoke.xlsx', rows }),
    ).expect(200);
    expect(imported.body.imported).toBe(true);
    expect(imported.body.createdCount).toBe(5);

    // Go live (one-way), then the Planner can sign in.
    const goLive = await auth(sa)(request(server()).post(`${base}/setup/go-live`).send({ confirm: true })).expect(200);
    expect(goLive.body.isLive).toBe(true);
    await request(server())
      .post(`${base}/auth/login`)
      .send({ email: 'planner@bmi.test', password: SEED_PASSWORD })
      .expect(200);
  });

  // =========================================================================
  // FG-15 — Mobile flows: the field-role (mobile) breakdown report auto-drafts
  // a one-Mobilisasi-step Draft WO carrying the finding note (REQ-MBL-002).
  // =========================================================================

  it('FG-15 mobile flows — a breakdown report auto-drafts a Mobilisasi WO', async () => {
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
    expect(draft.findingNote).toBe('Engine overheating on the toll road');

    const detail = await auth(sysadmin)(request(server()).get(`${base}/work-orders/${draft.id}`)).expect(200);
    const mblSteps = (detail.body.steps as Array<{ moduleCode: string }>).filter((s) => s.moduleCode === 'Mobilisasi');
    expect(mblSteps).toHaveLength(1);
  });

  // =========================================================================
  // FG-16 — Files: the signed-link sign → upload flow compresses a photo to a
  // Ready file under the profile limit (the direct-to-bucket Phase-1 arc).
  // =========================================================================

  it('FG-16 files — sign and upload a photo to a Ready, compressed file', async () => {
    const mechanic = await login('mechanic@bmi.test');
    const signed = await auth(mechanic)(
      request(server()).post(`${base}/uploads/sign`).send({ profile: 'Photo', entity: 'wo', captureSource: 'Camera' }),
    ).expect(201);
    const uploadToken = signed.body.uploadToken as string;
    const fileId = signed.body.file.id as number;

    // A 4 MB camera photo envelope (deterministic Phase-1 content model).
    const envelope = {
      width: 4032,
      height: 3024,
      logicalBytes: 4_200_000,
      hasExifGps: true,
      capturedAt: '2026-11-11T02:00:00.000Z',
      pageCount: 0,
    };
    const bytes = buildPhotoBytes(envelope);
    const uploaded = await auth(mechanic)(
      request(server()).post(`${base}/uploads`).send({ uploadToken, bytes }),
    ).expect(200);
    expect(uploaded.body.file.status).toBe('Ready');
    expect(uploaded.body.file.storedBytes).toBeLessThan(1_000_000);

    const link = await auth(mechanic)(request(server()).get(`${base}/files/${fileId}/link`)).expect(200);
    expect(link.body.token.length).toBeGreaterThan(20);
  });
});
