import 'reflect-metadata';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SEED_PASSWORD } from '@bmi/data-gateway';
import { AppModule } from '../../app.module.js';
import { API_PREFIX } from '../../app.constants.js';
import { AppSettingsService } from '../iam/app-settings.service.js';
import { AuditService } from '../../core/audit/audit.service.js';
import { PartsInventoryService } from './parts-inventory.service.js';
import { TyreRegisterService } from './tyre-register.service.js';

/**
 * End-to-end FG-8 coverage (TASK-112) booting the full `AppModule` (real guard,
 * interceptors, session auth) against the dummy gateway. Proves, over HTTP:
 *   - AC-INV-001 — Goods Receipt recomputes the moving-average (exact Rp).
 *   - AC-INV-002/REQ-INV-005 — a posted GR is corrected by a GRC, never edited.
 *   - REQ-INV-007/BR-06 — the stock card is append-only with a running balance.
 *   - REQ-INV-011 — a stock opname does not post until approved.
 *   - REQ-TYR-006 — receive generates a TY code; AC-TYR-006 — a Missing count
 *     approved sets the tyre Lost (SM-TYRE transactional).
 *   - AC-TYR-007 — a Goods Receipt offers no tyre (a tyre SKU is not a part).
 *   - §2.2 guard — a non-authorised role is refused (403); approvals demand
 *     count.approve; every mutating call writes exactly one audit record.
 */
describe('Inventory & tyres (TASK-112)', () => {
  let app: INestApplication;
  let settings: AppSettingsService;
  let parts: PartsInventoryService;
  let tyres: TyreRegisterService;
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
    parts = app.get(PartsInventoryService);
    tyres = app.get(TyreRegisterService);
    audit = app.get(AuditService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    settings.resetForTests();
    settings.goLive(new Date().toISOString());
    parts.resetForTests();
    tyres.resetForTests();
  });

  const server = (): Parameters<typeof request>[0] => app.getHttpServer();

  async function login(email: string): Promise<string> {
    const res = await request(server()).post(`${base}/auth/login`).send({ email, password: SEED_PASSWORD });
    expect(res.status).toBe(200);
    return res.body.token as string;
  }
  const warehouse = (): Promise<string> => login('warehouse@bmi.test');
  const supervisor = (): Promise<string> => login('supervisor@bmi.test');
  const sysadmin = (): Promise<string> => login('sysadmin@bmi.test');
  const mechanic = (): Promise<string> => login('mechanic@bmi.test');

  const auth = (token: string) => (r: request.Test): request.Test =>
    r.set('Authorization', `Bearer ${token}`);

  // --- parts: Goods Receipt + moving average + stock card ------------------

  it('AC-INV-001 — a receipt of 10 @ Rp 100.000 onto 10 @ Rp 80.000 → avg Rp 90.000, stock 20', async () => {
    const whm = await warehouse();
    await auth(whm)(request(server()).post(`${base}/inventory/parts`).send({ sku: 'SKU-OIL', partName: 'Oil', unit: 'L' })).expect(201);
    await auth(whm)(request(server()).post(`${base}/inventory/goods-receipts`).send({ lines: [{ sku: 'SKU-OIL', qty: 10, unitPrice: 80000 }] })).expect(201);
    await auth(whm)(request(server()).post(`${base}/inventory/goods-receipts`).send({ lines: [{ sku: 'SKU-OIL', qty: 10, unitPrice: 100000 }] })).expect(201);

    const part = await auth(whm)(request(server()).get(`${base}/inventory/parts/SKU-OIL`)).expect(200);
    expect(part.body.part.averageCost).toBe(90000);
    expect(part.body.part.stockQty).toBe(20);
  });

  it('REQ-INV-007/BR-06 — the stock card is append-only, newest first, with a running balance and a doc number', async () => {
    const whm = await warehouse();
    await auth(whm)(request(server()).post(`${base}/inventory/parts`).send({ sku: 'SKU-OIL', partName: 'Oil', unit: 'L' })).expect(201);
    const gr = await auth(whm)(request(server()).post(`${base}/inventory/goods-receipts`).send({ lines: [{ sku: 'SKU-OIL', qty: 10, unitPrice: 80000 }] })).expect(201);

    const card = await auth(whm)(request(server()).get(`${base}/inventory/parts/SKU-OIL/stock-card`)).expect(200);
    expect(card.body.stockCard).toHaveLength(1);
    expect(card.body.stockCard[0].transactionType).toBe('GR');
    expect(card.body.stockCard[0].balanceAfter).toBe(10);
    expect(card.body.stockCard[0].referenceDocId).toBe(gr.body.goodsReceipt.grNumber);
  });

  it('AC-INV-002/REQ-INV-005 — a posted GR is corrected by a GRC (correcting movement), not edited', async () => {
    const whm = await warehouse();
    await auth(whm)(request(server()).post(`${base}/inventory/parts`).send({ sku: 'SKU-OIL', partName: 'Oil', unit: 'L' })).expect(201);
    const gr = await auth(whm)(request(server()).post(`${base}/inventory/goods-receipts`).send({ lines: [{ sku: 'SKU-OIL', qty: 10, unitPrice: 80000 }] })).expect(201);
    const grId = gr.body.goodsReceipt.id;

    await auth(whm)(request(server()).post(`${base}/inventory/goods-receipts/${grId}/correct`).send({ sku: 'SKU-OIL', qtyDelta: -3, reason: 'over-received' })).expect(201);

    const card = await auth(whm)(request(server()).get(`${base}/inventory/parts/SKU-OIL/stock-card`)).expect(200);
    expect(card.body.stockCard).toHaveLength(2); // GR kept + a GRC row
    expect(card.body.stockCard[0].transactionType).toBe('GRC');
    expect(card.body.stockCard[0].balanceAfter).toBe(7);
    const part = await auth(whm)(request(server()).get(`${base}/inventory/parts/SKU-OIL`)).expect(200);
    expect(part.body.part.stockQty).toBe(7);
  });

  // --- stock opname approval gate ------------------------------------------

  it('REQ-INV-011 — a stock opname does not change stock until it is approved', async () => {
    const whm = await warehouse();
    await auth(whm)(request(server()).post(`${base}/inventory/parts`).send({ sku: 'SKU-OIL', partName: 'Oil', unit: 'L' })).expect(201);
    await auth(whm)(request(server()).post(`${base}/inventory/goods-receipts`).send({ lines: [{ sku: 'SKU-OIL', qty: 10, unitPrice: 80000 }] })).expect(201);

    const opname = await auth(whm)(request(server()).post(`${base}/inventory/stock-opname`).send({ rows: [{ sku: 'SKU-OIL', physicalQty: 8, reasonCode: 'Damaged', note: 'leaked' }] })).expect(201);
    const id = opname.body.opname.id;
    await auth(whm)(request(server()).post(`${base}/inventory/stock-opname/${id}/submit`).send({})).expect(200);

    // Submitted — stock unchanged, no SA row yet.
    let part = await auth(whm)(request(server()).get(`${base}/inventory/parts/SKU-OIL`)).expect(200);
    expect(part.body.part.stockQty).toBe(10);

    // A Warehouse Manager cannot approve (lacks count.approve) → 403.
    await auth(whm)(request(server()).post(`${base}/inventory/stock-opname/${id}/approve`).send({})).expect(403);

    // The Supervisor approves → now stock posts to the physical quantity.
    const sup = await supervisor();
    await auth(sup)(request(server()).post(`${base}/inventory/stock-opname/${id}/approve`).send({})).expect(200);
    part = await auth(whm)(request(server()).get(`${base}/inventory/parts/SKU-OIL`)).expect(200);
    expect(part.body.part.stockQty).toBe(8);
    const card = await auth(whm)(request(server()).get(`${base}/inventory/parts/SKU-OIL/stock-card`)).expect(200);
    expect(card.body.stockCard.some((r: { transactionType: string }) => r.transactionType === 'SA')).toBe(true);
  });

  it('AC-INV-003 — Submit is refused when a variance row has no reason code', async () => {
    const whm = await warehouse();
    await auth(whm)(request(server()).post(`${base}/inventory/parts`).send({ sku: 'SKU-OIL', partName: 'Oil', unit: 'L' })).expect(201);
    await auth(whm)(request(server()).post(`${base}/inventory/goods-receipts`).send({ lines: [{ sku: 'SKU-OIL', qty: 10, unitPrice: 80000 }] })).expect(201);
    const opname = await auth(whm)(request(server()).post(`${base}/inventory/stock-opname`).send({ rows: [{ sku: 'SKU-OIL', physicalQty: 8 }] })).expect(201);
    await auth(whm)(request(server()).post(`${base}/inventory/stock-opname/${opname.body.opname.id}/submit`).send({})).expect(400);
  });

  // --- tyres end-to-end ----------------------------------------------------

  it('REQ-TYR-006 — receive generates a TY code, In_Stock, with a ReceiveNew event', async () => {
    const whm = await warehouse();
    const res = await auth(whm)(
      request(server()).post(`${base}/inventory/tyres/receive`).send({
        source: 'Supplier',
        invoiceNumber: 'INV-99',
        tyres: [{ serialNumber: 'SER-NEW', brand: 'Bridgestone', size: '11R22.5', tyreType: 'Tubeless', treadMm: 14 }],
      }),
    ).expect(201);
    const tyre = res.body.tyres[0];
    expect(tyre.code).toMatch(/^TY-\d{4,}$/);
    expect(tyre.status).toBe('In_Stock');

    const history = await auth(whm)(request(server()).get(`${base}/inventory/tyres/${tyre.id}/history`)).expect(200);
    expect(history.body.history[0].event).toBe('ReceiveNew');
  });

  /** Receive one fresh In_Stock tyre and return its gateway id (order-independent). */
  async function receiveOne(whm: string): Promise<number> {
    const res = await auth(whm)(
      request(server()).post(`${base}/inventory/tyres/receive`).send({
        source: 'Existing',
        tyres: [{ serialNumber: `SER-${Date.now()}-${Math.random()}`, brand: 'B', size: '1', tyreType: 'Tube' }],
      }),
    ).expect(201);
    return res.body.tyres[0].id as number;
  }

  it('refuses an unlisted SM-TYRE transition over HTTP (scrap of an In_Stock tyre → 409)', async () => {
    const whm = await warehouse();
    const id = await receiveOne(whm); // fresh, In_Stock
    // Scrap is not listed from In_Stock in §3.6 → refused, status unchanged.
    await auth(whm)(request(server()).post(`${base}/inventory/tyres/${id}/scrap`).send({ reason: 'bad' })).expect(409);
  });

  it('AC-TYR-006 — a tyre count with one Missing tyre, once approved, sets it Lost', async () => {
    const whm = await warehouse();
    const id = await receiveOne(whm); // fresh In_Stock tyre
    const count = await auth(whm)(request(server()).post(`${base}/inventory/tyre-count`).send({ rows: [{ tyreId: id, result: 'Missing', reason: 'not found' }] })).expect(201);
    const countId = count.body.count.id;
    await auth(whm)(request(server()).post(`${base}/inventory/tyre-count/${countId}/submit`).send({})).expect(200);

    // Warehouse Manager cannot approve a count (needs count.approve) → 403.
    await auth(whm)(request(server()).post(`${base}/inventory/tyre-count/${countId}/approve`).send({})).expect(403);

    const sup = await supervisor();
    const approved = await auth(sup)(request(server()).post(`${base}/inventory/tyre-count/${countId}/approve`).send({})).expect(200);
    expect(approved.body.count.status).toBe('Approved');

    const history = await auth(whm)(request(server()).get(`${base}/inventory/tyres/${id}/history`)).expect(200);
    const last = history.body.history[history.body.history.length - 1];
    expect(last.toStatus).toBe('Lost');
  });

  it('AC-TYR-007 — a Goods Receipt offers no tyre (a tyre code is not a catalog SKU)', async () => {
    const whm = await warehouse();
    await auth(whm)(request(server()).post(`${base}/inventory/parts`).send({ sku: 'SKU-OIL', partName: 'Oil', unit: 'L' })).expect(201);
    const parts = await auth(whm)(request(server()).get(`${base}/inventory/parts`)).expect(200);
    // No part SKU is a tyre code — tyres are never in the catalog (REQ-TYR-001).
    expect(parts.body.parts.every((p: { sku: string }) => !p.sku.startsWith('TY-'))).toBe(true);
    // A GR cannot receive a tyre code (it is not a known part) → refused.
    await auth(whm)(request(server()).post(`${base}/inventory/goods-receipts`).send({ lines: [{ sku: 'TY-0101', qty: 1, unitPrice: 1 }] })).expect(400);
  });

  // --- §2.2 guard + audit --------------------------------------------------

  it('§2.2 — a Mechanic cannot add a part or receive tyres (403)', async () => {
    const mech = await mechanic();
    await auth(mech)(request(server()).post(`${base}/inventory/parts`).send({ sku: 'SKU-X', partName: 'X', unit: 'pcs' })).expect(403);
    await auth(mech)(request(server()).post(`${base}/inventory/tyres/receive`).send({ source: 'Existing', tyres: [{ serialNumber: 'S', brand: 'B', size: '1', tyreType: 'Tube' }] })).expect(403);
  });

  it('writes exactly one audit record per mutating call', async () => {
    const whm = await warehouse();
    const before = audit.count();
    await auth(whm)(request(server()).post(`${base}/inventory/parts`).send({ sku: 'SKU-AUD', partName: 'Audit', unit: 'pcs' })).expect(201);
    const after = audit.count();
    expect(after).toBe(before + 1);
  });

  it('a System Admin who counted may self-approve a stock opname (AC-INV-004)', async () => {
    const sa = await sysadmin();
    await auth(sa)(request(server()).post(`${base}/inventory/parts`).send({ sku: 'SKU-OIL', partName: 'Oil', unit: 'L' })).expect(201);
    await auth(sa)(request(server()).post(`${base}/inventory/goods-receipts`).send({ lines: [{ sku: 'SKU-OIL', qty: 10, unitPrice: 80000 }] })).expect(201);
    const opname = await auth(sa)(request(server()).post(`${base}/inventory/stock-opname`).send({ rows: [{ sku: 'SKU-OIL', physicalQty: 9, reasonCode: 'Found' }] })).expect(201);
    const id = opname.body.opname.id;
    await auth(sa)(request(server()).post(`${base}/inventory/stock-opname/${id}/submit`).send({})).expect(200);
    const approved = await auth(sa)(request(server()).post(`${base}/inventory/stock-opname/${id}/approve`).send({})).expect(200);
    expect(approved.body.opname.selfApproved).toBe(true);
  });
});
