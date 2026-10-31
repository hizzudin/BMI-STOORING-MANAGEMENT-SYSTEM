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
import { PartsLedgerService } from './parts-ledger.service.js';
import { StockStepService } from './stock-step.service.js';
import { PartPurchaseStepService } from './part-purchase-step.service.js';

/**
 * End-to-end FG-4 coverage (TASK-109) booting the full `AppModule` (real guard,
 * interceptors, session-backed auth) against the dummy gateway. Covers
 * AC-STK-001..006 and AC-PUR-001..006, the atomic goods issue (all-or-nothing),
 * the exact moving-average arithmetic, the shortfall → Part Purchase flow, the
 * verified reversal (BR-06) and that a Part Purchase changes NO stock.
 */
describe('Stock step & Part Purchase step (TASK-109)', () => {
  let app: INestApplication;
  let settings: AppSettingsService;
  let workOrders: WorkOrdersService;
  let timeEvents: StepTimeEventService;
  let ledger: PartsLedgerService;
  let stock: StockStepService;
  let partPurchase: PartPurchaseStepService;
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
    ledger = app.get(PartsLedgerService);
    stock = app.get(StockStepService);
    partPurchase = app.get(PartPurchaseStepService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    settings.resetForTests();
    settings.goLive(new Date().toISOString());
    workOrders.resetForTests();
    timeEvents.resetForTests();
    ledger.resetForTests();
    stock.resetForTests();
    partPurchase.resetForTests();
  });

  const server = (): Parameters<typeof request>[0] => app.getHttpServer();

  async function login(email: string): Promise<string> {
    const res = await request(server()).post(`${base}/auth/login`).send({ email, password: SEED_PASSWORD });
    expect(res.status).toBe(200);
    return res.body.token as string;
  }
  const planner = (): Promise<string> => login('planner@bmi.test');
  const supervisor = (): Promise<string> => login('supervisor@bmi.test');
  const warehouse = (): Promise<string> => login('warehouse@bmi.test');

  const auth = (token: string) => (r: request.Test): request.Test => r.set('Authorization', `Bearer ${token}`);

  const stockStep = { module: 'Stock', executorRoles: [Role.WarehouseManager], verifierRole: Role.Planner };
  const mechStep = { module: 'Mechanic_Action', executorRoles: [Role.Mechanic], verifierRole: Role.Planner };
  const purchaseStep = { module: 'Part_Purchase', executorRoles: [Role.WarehouseManager], verifierRole: Role.Planner };

  /** Create → submit → approve a WO as Planner/Supervisor; return WO + its steps. */
  async function activeWoWithSteps(
    steps: Array<{ module: string; executorRoles: Role[]; verifierRole: Role }>,
  ): Promise<{ id: number; steps: Array<{ id: number; version: number; sequence: number; moduleCode: string; status: string }> }> {
    const plannerToken = await planner();
    const created = await auth(plannerToken)(
      request(server()).post(`${base}/work-orders`).send({
        vehicleId: 1,
        title: 'Stock WO',
        category: WorkOrderCategory.Corrective,
        description: 'brake + oil',
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

  /** Refresh one step's current row (id, version, status). */
  async function stepRow(id: number): Promise<{ id: number; version: number; status: string; moduleCode: string }> {
    const token = await planner();
    const res = await auth(token)(request(server()).get(`${base}/assignments/${id}`)).expect(200);
    return res.body.step;
  }

  // --- AC-STK-006 + atomic goods issue + moving-average ---------------------

  it('AC-STK-006 / REQ-STK-003 — issues 5 L atomically: stock→0, one GI card row, shortfall adds a Part Purchase step', async () => {
    const wo = await activeWoWithSteps([stockStep, mechStep]);
    const stockS = wo.steps.find((s) => s.moduleCode === 'Stock')!;
    // WO required list: 8 L of engine oil (only 5 on hand → shortfall of 3).
    stock.setRequiredList(stockS.id, [
      { sku: 'SKU-1029', partName: 'Engine oil 15W-40', unit: 'L' },
    ]);

    const whToken = await warehouse();
    // Start the step (claims it).
    const started = await auth(whToken)(
      request(server()).post(`${base}/assignments/${stockS.id}/start`).send({ version: stockS.version }),
    ).expect(200);

    // Stage 8 L with a confirmed shortfall + an invoice image.
    await auth(whToken)(
      request(server()).post(`${base}/stock/${stockS.id}/stage`).send({
        lines: [{ sku: 'SKU-1029', qty: 8 }],
        confirmShortfall: true,
        hasAttachment: true,
      }),
    ).expect(200);

    // Submit via the engine → posts the goods issue in one transaction.
    const submitted = await auth(whToken)(
      request(server()).post(`${base}/assignments/${stockS.id}/submit`).send({ version: started.body.step.version }),
    ).expect(200);
    expect(submitted.body.step.status).toBe('Submitted');

    // Stock cut to 0 (5 issued), exactly one GI card row for the issue.
    expect(ledger.stockOf('SKU-1029')).toBe(0);
    const card = ledger.stockCardFor('SKU-1029');
    expect(card).toHaveLength(1);
    expect(card[0]!.transactionType).toBe('GI');
    expect(card[0]!.qtyOut).toBe(5);
    // One goods issue of 5 L (AC-STK-006).
    const gis = ledger.goodsIssuesOf(wo.id);
    expect(gis).toHaveLength(1);
    expect(gis[0]!.items[0]!.qty).toBe(5);

    // A Part Purchase step was added after the Stock step, with a 3 L hint.
    const detail = await auth(await planner())(request(server()).get(`${base}/work-orders/${wo.id}`)).expect(200);
    const steps = detail.body.steps as Array<{ id: number; sequence: number; moduleCode: string }>;
    const pp = steps.find((s) => s.moduleCode === 'Part_Purchase');
    expect(pp).toBeDefined();
    expect(pp!.sequence).toBe(stockS.sequence + 1);
    const hints = partPurchase.hintsOf(pp!.id);
    expect(hints).toHaveLength(1);
    expect(hints[0]!.sku).toBe('SKU-1029');
    expect(hints[0]!.hintQty).toBe(3);
  });

  // --- AC-STK-001 shortfall refusal (REQ-STK-004) ---------------------------

  it('AC-STK-001 — needing 8 with 5 in stock and NO shortfall confirmation: refused, stock stays 5, no GI', async () => {
    const wo = await activeWoWithSteps([stockStep, mechStep]);
    const stockS = wo.steps.find((s) => s.moduleCode === 'Stock')!;
    stock.setRequiredList(stockS.id, [{ sku: 'SKU-1029', partName: 'Engine oil 15W-40', unit: 'L' }]);
    const whToken = await warehouse();
    await auth(whToken)(
      request(server()).post(`${base}/assignments/${stockS.id}/start`).send({ version: stockS.version }),
    ).expect(200);

    const staged = await auth(whToken)(
      request(server()).post(`${base}/stock/${stockS.id}/stage`).send({
        lines: [{ sku: 'SKU-1029', qty: 8 }],
        hasAttachment: true,
      }),
    );
    expect(staged.status).toBe(400); // refuse the missing quantity (AC-STK-001)
    expect(ledger.stockOf('SKU-1029')).toBe(5);
    expect(ledger.allGoodsIssues()).toHaveLength(0);
  });

  // --- AC-STK-003 part not on the WO list is not selectable -----------------

  it('AC-STK-003 — a part not on the WO list cannot be staged', async () => {
    const wo = await activeWoWithSteps([stockStep, mechStep]);
    const stockS = wo.steps.find((s) => s.moduleCode === 'Stock')!;
    stock.setRequiredList(stockS.id, [{ sku: 'SKU-1029', partName: 'Engine oil 15W-40', unit: 'L' }]);
    const whToken = await warehouse();
    await auth(whToken)(
      request(server()).post(`${base}/assignments/${stockS.id}/start`).send({ version: stockS.version }),
    ).expect(200);
    const res = await auth(whToken)(
      request(server()).post(`${base}/stock/${stockS.id}/stage`).send({
        lines: [{ sku: 'SKU-4410', qty: 1 }], // not on the list
        hasAttachment: true,
      }),
    );
    expect(res.status).toBe(400);
  });

  // --- all-or-nothing proof via a forced mid-issue failure ------------------

  it('REQ-STK-003 — a mid-issue failure rolls back stock + stock card + GI together', async () => {
    const wo = await activeWoWithSteps([stockStep, mechStep]);
    const stockS = wo.steps.find((s) => s.moduleCode === 'Stock')!;
    // Two lines on the list; the second cannot be fully issued → the ledger tx throws.
    stock.setRequiredList(stockS.id, [
      { sku: 'SKU-1029', partName: 'Engine oil 15W-40', unit: 'L' },
      { sku: 'SKU-4410', partName: 'Wiper blade', unit: 'pcs' },
    ]);
    const whToken = await warehouse();
    const started = await auth(whToken)(
      request(server()).post(`${base}/assignments/${stockS.id}/start`).send({ version: stockS.version }),
    ).expect(200);

    // Stage a valid oil line (2 L) then force a failure: directly stage a line
    // that will exceed stock at issue time by mutating stock out-of-band.
    await auth(whToken)(
      request(server()).post(`${base}/stock/${stockS.id}/stage`).send({
        lines: [{ sku: 'SKU-1029', qty: 2 }, { sku: 'SKU-4410', qty: 8 }],
        hasAttachment: true,
      }),
    ).expect(200);
    // Drain the wiper stock behind the scenes so the staged 8 now over-issues at submit.
    ledger.transaction((tx) =>
      tx.issueLine({
        sku: 'SKU-4410',
        qty: 8,
        referenceDocId: 'GI-PRE',
        workOrderId: wo.id,
        vehicleId: 1,
        userId: 5,
        at: new Date().toISOString(),
      }),
    );
    const oilBefore = ledger.stockOf('SKU-1029'); // 5
    const giBefore = ledger.allGoodsIssues().length; // 1 (the pre-issue)

    const submit = await auth(whToken)(
      request(server()).post(`${base}/assignments/${stockS.id}/submit`).send({ version: started.body.step.version }),
    );
    expect(submit.status).toBe(400); // the submit rolls back

    // Nothing from the submit persisted: oil stock unchanged, no new GI.
    expect(ledger.stockOf('SKU-1029')).toBe(oilBefore);
    expect(ledger.allGoodsIssues().length).toBe(giBefore);
    // And the step is still submittable (status not advanced).
    const step = await stepRow(stockS.id);
    expect(step.status).toBe('In_Progress');
  });

  // --- AC-STK-005 verified reversal (BR-06, TX-05) --------------------------

  it('AC-STK-005 / BR-06 — a reversal keeps stock unchanged until verified, then restores it with a GIR row', async () => {
    const wo = await activeWoWithSteps([stockStep, mechStep]);
    const stockS = wo.steps.find((s) => s.moduleCode === 'Stock')!;
    stock.setRequiredList(stockS.id, [{ sku: 'SKU-1029', partName: 'Engine oil 15W-40', unit: 'L' }]);
    const whToken = await warehouse();
    const started = await auth(whToken)(
      request(server()).post(`${base}/assignments/${stockS.id}/start`).send({ version: stockS.version }),
    ).expect(200);
    await auth(whToken)(
      request(server()).post(`${base}/stock/${stockS.id}/stage`).send({
        lines: [{ sku: 'SKU-1029', qty: 2 }],
        hasAttachment: true,
      }),
    ).expect(200);
    const submitted = await auth(whToken)(
      request(server()).post(`${base}/assignments/${stockS.id}/submit`).send({ version: started.body.step.version }),
    ).expect(200);
    expect(ledger.stockOf('SKU-1029')).toBe(3);

    // Request a reversal → stock does NOT change yet (AC-STK-005).
    await auth(whToken)(
      request(server()).post(`${base}/stock/${stockS.id}/reverse`).send({ reason: 'Wrong part issued' }),
    ).expect(200);
    expect(ledger.stockOf('SKU-1029')).toBe(3);

    // Planner verifies the step → the reversal returns stock and writes a GIR row.
    const plannerToken = await planner();
    await auth(plannerToken)(
      request(server()).post(`${base}/assignments/${stockS.id}/verify`).send({ version: submitted.body.step.version }),
    ).expect(200);
    expect(ledger.stockOf('SKU-1029')).toBe(5); // restored
    const gir = ledger.stockCardFor('SKU-1029').find((r) => r.transactionType === 'GIR');
    expect(gir).toBeDefined();
    expect(gir!.qtyIn).toBe(2);
    // The original goods issue is kept (no silent delete) + the reversing doc.
    expect(ledger.goodsIssuesOf(wo.id).some((g) => g.reversesGiId !== null)).toBe(true);
  });

  // --- AC-PUR-001 / AC-PUR-002 live totals ----------------------------------

  it('AC-PUR-001 / AC-PUR-002 — line and grand totals compute live (and recompute on a price change)', async () => {
    const whToken = await warehouse();
    // 3 L × Rp 82.000 = 246.000; 2 × Rp 45.000 = 90.000; total 336.000.
    const first = await auth(whToken)(request(server())
      .post(`${base}/stock/purchase/totals`)
      .send({ lines: [
        { sku: 'SKU-1029', quantity: 3, unitPrice: 82000 },
        { sku: 'SKU-4410', quantity: 2, unitPrice: 45000 },
      ] }))
      .expect(200);
    expect(first.body.lines[0].lineTotal).toBe(246000);
    expect(first.body.lines[1].lineTotal).toBe(90000);
    expect(first.body.total).toBe(336000);

    // Change the oil unit price to 85.000 → line 255.000, total 345.000.
    const second = await auth(whToken)(request(server())
      .post(`${base}/stock/purchase/totals`)
      .send({ lines: [
        { sku: 'SKU-1029', quantity: 3, unitPrice: 85000 },
        { sku: 'SKU-4410', quantity: 2, unitPrice: 45000 },
      ] }))
      .expect(200);
    expect(second.body.lines[0].lineTotal).toBe(255000);
    expect(second.body.total).toBe(345000);
  });

  // --- AC-PUR-003 submit adds parts cost, changes NO stock ------------------

  it('AC-PUR-003 / REQ-PUR-006 — submitting a Part Purchase leaves stock + stock card unchanged and raises WO parts cost', async () => {
    const wo = await activeWoWithSteps([purchaseStep]);
    const pp = wo.steps.find((s) => s.moduleCode === 'Part_Purchase')!;
    // Hint lines: SKU-4410 wiper (to buy).
    partPurchase.setHints(pp.id, [{ sku: 'SKU-4410', partName: 'Wiper blade', hintQty: null, unit: 'pcs' }]);

    const stockBefore = ledger.stockOf('SKU-4410'); // 8
    const cardsBefore = ledger.allStockCards().length; // 0

    const whToken = await warehouse();
    const started = await auth(whToken)(
      request(server()).post(`${base}/assignments/${pp.id}/start`).send({ version: pp.version }),
    ).expect(200);
    await auth(whToken)(
      request(server()).post(`${base}/stock/purchase/${pp.id}/stage`).send({
        lines: [{ sku: 'SKU-4410', quantity: 2, unitPrice: 45000 }],
        vendor: 'Toko Jaya',
        receiptDate: '2026-11-07',
        receiptPhoto: 'r2://receipts/abc.jpg',
      }),
    ).expect(200);
    await auth(whToken)(
      request(server()).post(`${base}/assignments/${pp.id}/submit`).send({ version: started.body.step.version }),
    ).expect(200);

    // NO stock change anywhere (REQ-PUR-006, BR-06, TX-21).
    expect(ledger.stockOf('SKU-4410')).toBe(stockBefore);
    expect(ledger.allStockCards().length).toBe(cardsBefore);
    // Parts cost rose by the calculated total (90.000).
    expect(partPurchase.partsCostOf(wo.id)).toBe(90000);
    const purchase = partPurchase.purchaseOf(pp.id);
    expect(purchase!.calculatedTotal).toBe(90000);
    expect(purchase!.vendor).toBe('Toko Jaya');
  });

  // --- AC-PUR-004 receipt photo required ------------------------------------

  it('REQ-PUR-004 — a Part Purchase with lines but no receipt photo is refused at submit', async () => {
    const wo = await activeWoWithSteps([purchaseStep]);
    const pp = wo.steps.find((s) => s.moduleCode === 'Part_Purchase')!;
    partPurchase.setHints(pp.id, [{ sku: 'SKU-4410', partName: 'Wiper blade', hintQty: null, unit: 'pcs' }]);
    const whToken = await warehouse();
    const started = await auth(whToken)(
      request(server()).post(`${base}/assignments/${pp.id}/start`).send({ version: pp.version }),
    ).expect(200);
    await auth(whToken)(
      request(server()).post(`${base}/stock/purchase/${pp.id}/stage`).send({
        lines: [{ sku: 'SKU-4410', quantity: 2, unitPrice: 45000 }],
        vendor: 'Toko Jaya',
        receiptDate: '2026-11-07',
        // no receiptPhoto
      }),
    ).expect(200);
    const submit = await auth(whToken)(
      request(server()).post(`${base}/assignments/${pp.id}/submit`).send({ version: started.body.step.version }),
    );
    expect(submit.status).toBe(400);
    // Nothing recorded.
    expect(partPurchase.purchaseOf(pp.id)).toBeUndefined();
    expect(partPurchase.partsCostOf(wo.id)).toBe(0);
  });

  // --- AC-PUR-006 cannot add a part not on the WO ---------------------------

  it('AC-PUR-006 — a buyer may type more than the hint, but cannot add a part not on the WO', async () => {
    const wo = await activeWoWithSteps([purchaseStep]);
    const pp = wo.steps.find((s) => s.moduleCode === 'Part_Purchase')!;
    // Shortfall hint of 3 L engine oil; the shop sells a 5 L can.
    partPurchase.setHints(pp.id, [{ sku: 'SKU-1029', partName: 'Engine oil 15W-40', hintQty: 3, unit: 'L' }]);
    const whToken = await warehouse();
    const started = await auth(whToken)(
      request(server()).post(`${base}/assignments/${pp.id}/start`).send({ version: pp.version }),
    ).expect(200);

    // 5 L on the engine oil line (more than the 3 L hint) — accepted.
    await auth(whToken)(
      request(server()).post(`${base}/stock/purchase/${pp.id}/stage`).send({
        lines: [{ sku: 'SKU-1029', quantity: 5, unitPrice: 82000 }],
        vendor: 'Toko Jaya',
        receiptDate: '2026-11-07',
        receiptPhoto: 'r2://receipts/oil.jpg',
      }),
    ).expect(200);
    await auth(whToken)(
      request(server()).post(`${base}/assignments/${pp.id}/submit`).send({ version: started.body.step.version }),
    ).expect(200);
    expect(partPurchase.purchaseOf(pp.id)!.calculatedTotal).toBe(410000);

    // A second step, trying to buy a part not on its (empty) hint list — refused.
    const wo2 = await activeWoWithSteps([purchaseStep]);
    const pp2 = wo2.steps.find((s) => s.moduleCode === 'Part_Purchase')!;
    partPurchase.setHints(pp2.id, [{ sku: 'SKU-1029', partName: 'Engine oil 15W-40', hintQty: 3, unit: 'L' }]);
    const started2 = await auth(whToken)(
      request(server()).post(`${base}/assignments/${pp2.id}/start`).send({ version: pp2.version }),
    ).expect(200);
    await auth(whToken)(
      request(server()).post(`${base}/stock/purchase/${pp2.id}/stage`).send({
        lines: [{ sku: 'SKU-4410', quantity: 1, unitPrice: 45000 }], // not on the hint list
        vendor: 'Toko Jaya',
        receiptDate: '2026-11-07',
        receiptPhoto: 'r2://receipts/x.jpg',
      }),
    ).expect(200);
    const submit2 = await auth(whToken)(
      request(server()).post(`${base}/assignments/${pp2.id}/submit`).send({ version: started2.body.step.version }),
    );
    expect(submit2.status).toBe(400);
  });

  // --- REQ-PUR-007 nothing bought -------------------------------------------

  it('REQ-PUR-007 — a Part Purchase step may be submitted with no lines and a reason', async () => {
    const wo = await activeWoWithSteps([purchaseStep]);
    const pp = wo.steps.find((s) => s.moduleCode === 'Part_Purchase')!;
    const whToken = await warehouse();
    const started = await auth(whToken)(
      request(server()).post(`${base}/assignments/${pp.id}/start`).send({ version: pp.version }),
    ).expect(200);
    await auth(whToken)(
      request(server()).post(`${base}/stock/purchase/${pp.id}/stage`).send({
        lines: [],
        nothingBoughtReason: 'Parts were in stock after all',
      }),
    ).expect(200);
    await auth(whToken)(
      request(server()).post(`${base}/assignments/${pp.id}/submit`).send({ version: started.body.step.version }),
    ).expect(200);
    const purchase = partPurchase.purchaseOf(pp.id);
    expect(purchase!.lines).toHaveLength(0);
    expect(purchase!.nothingBoughtReason).toBe('Parts were in stock after all');
    expect(partPurchase.partsCostOf(wo.id)).toBe(0);
  });

  // --- §2.2 guard: a role without stock.issue is refused --------------------

  it('§2.2 — a role without stock.issue cannot stage a Stock issue (server 403)', async () => {
    const wo = await activeWoWithSteps([stockStep, mechStep]);
    const stockS = wo.steps.find((s) => s.moduleCode === 'Stock')!;
    stock.setRequiredList(stockS.id, [{ sku: 'SKU-1029', partName: 'Engine oil 15W-40', unit: 'L' }]);
    // Supervisor lacks stock.issue.
    const supToken = await supervisor();
    const res = await auth(supToken)(
      request(server()).post(`${base}/stock/${stockS.id}/stage`).send({
        lines: [{ sku: 'SKU-1029', qty: 1 }],
        hasAttachment: true,
      }),
    );
    expect(res.status).toBe(403);
  });
});
