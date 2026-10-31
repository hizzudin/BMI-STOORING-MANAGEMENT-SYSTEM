import 'reflect-metadata';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SEED_PASSWORD } from '@bmi/data-gateway';
import { AppModule } from '../../app.module.js';
import { API_PREFIX } from '../../app.constants.js';
import { AuditService } from '../../core/audit/audit.service.js';
import { AppSettingsService } from '../iam/app-settings.service.js';
import { OpeningBalanceService } from './opening-balance.service.js';
import { BulkImportService } from './bulk-import.service.js';

/**
 * End-to-end Setup / Go-live coverage (TASK-105) booting the full `AppModule`
 * (real guard, interceptors, session-backed auth middleware) against the dummy
 * gateway. Verifies through real HTTP:
 *   - AC-IAM-006 — a non-admin (Planner) sign-in is refused while in Setup; once
 *     Live the Planner signs in.
 *   - AC-IAM-007 — vehicles import rejects bad rows (imports nothing), imports a
 *     clean file, and is refused once Live.
 *   - AC-INV-006 — opening balance in Setup; refused once Live.
 *   - REQ-IAM-010 — Go-live is one-way (a second attempt is refused).
 *   - The §2.2 guard refuses a non-System-Admin role the Setup endpoints (403),
 *     and every mutating Setup call writes exactly one audit record.
 */
describe('Setup module (TASK-105) — setup mode, bulk import, opening balance, go-live', () => {
  let app: INestApplication;
  let settings: AppSettingsService;
  let openingBalance: OpeningBalanceService;
  let imports: BulkImportService;
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
    openingBalance = app.get(OpeningBalanceService);
    imports = app.get(BulkImportService);
    audit = app.get(AuditService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    // Each test starts from a clean Setup state (one shared AppModule instance).
    settings.resetForTests();
    openingBalance.resetForTests();
    imports.resetForTests();
  });

  const server = (): Parameters<typeof request>[0] => app.getHttpServer();

  async function login(email: string): Promise<string> {
    const res = await request(server())
      .post(`${base}/auth/login`)
      .send({ email, password: SEED_PASSWORD });
    expect(res.status).toBe(200);
    return res.body.token as string;
  }

  /** Sign in as the System Admin (only SA + AM may sign in during Setup). */
  async function loginSystemAdmin(): Promise<string> {
    return login('sysadmin@bmi.test');
  }

  // --- AC-IAM-006: Setup-mode sign-in gate ---------------------------------

  it('AC-IAM-006 — a Planner sign-in is refused while in Setup mode', async () => {
    const res = await request(server())
      .post(`${base}/auth/login`)
      .send({ email: 'planner@bmi.test', password: SEED_PASSWORD });
    expect(res.status).toBe(403);
    expect(JSON.stringify(res.body)).toContain('being set up');
  });

  it('AC-IAM-006 — the System Admin and Access Manager still sign in during Setup', async () => {
    const sa = await request(server())
      .post(`${base}/auth/login`)
      .send({ email: 'sysadmin@bmi.test', password: SEED_PASSWORD });
    expect(sa.status).toBe(200);
    const am = await request(server())
      .post(`${base}/auth/login`)
      .send({ email: 'access@bmi.test', password: SEED_PASSWORD });
    expect(am.status).toBe(200);
  });

  it('AC-IAM-006 — once the System Admin goes live, the Planner can sign in', async () => {
    const token = await loginSystemAdmin();
    const goLive = await request(server())
      .post(`${base}/setup/go-live`)
      .set('Authorization', `Bearer ${token}`)
      .send({ confirm: true });
    expect(goLive.status).toBe(200);
    expect(goLive.body.isLive).toBe(true);

    const planner = await request(server())
      .post(`${base}/auth/login`)
      .send({ email: 'planner@bmi.test', password: SEED_PASSWORD });
    expect(planner.status).toBe(200);
  });

  // --- §2.2 guard: only the System Admin reaches the Setup endpoints -------

  it('refuses a non-System-Admin role the Setup endpoints (server-side 403)', async () => {
    const amToken = await login('access@bmi.test'); // Access Manager signs in during Setup
    const res = await request(server())
      .get(`${base}/setup/status`)
      .set('Authorization', `Bearer ${amToken}`);
    expect(res.status).toBe(403);
  });

  // --- AC-IAM-007: vehicles bulk import ------------------------------------

  function vehicleRows(count: number, badClassRows: number[] = []): unknown[] {
    const rows = [];
    for (let n = 1; n <= count; n += 1) {
      rows.push({
        plate: `D ${1000 + n} IMP`,
        classId: badClassRows.includes(n) ? 999 : 1,
        chassisLayoutId: 1,
        odometerKm: 0,
      });
    }
    return rows;
  }

  it('AC-IAM-007 — bad rows list their error and import nothing, then a clean file imports all 100', async () => {
    const token = await loginSystemAdmin();

    const bad = await request(server())
      .post(`${base}/setup/import/vehicles`)
      .set('Authorization', `Bearer ${token}`)
      .send({ fileName: 'vehicles.xlsx', rows: vehicleRows(100, [17, 58]) });
    expect(bad.status).toBe(200);
    expect(bad.body.imported).toBe(false);
    expect(bad.body.createdCount).toBe(0);
    expect(bad.body.errors).toHaveLength(2);

    const good = await request(server())
      .post(`${base}/setup/import/vehicles`)
      .set('Authorization', `Bearer ${token}`)
      .send({ fileName: 'vehicles.xlsx', rows: vehicleRows(100) });
    expect(good.status).toBe(200);
    expect(good.body.imported).toBe(true);
    expect(good.body.createdCount).toBe(100);
  });

  it('AC-IAM-007 — once Live, the import is refused with 409', async () => {
    const token = await loginSystemAdmin();
    await request(server())
      .post(`${base}/setup/go-live`)
      .set('Authorization', `Bearer ${token}`)
      .send({ confirm: true })
      .expect(200);

    // Still Live; the SA is signed in. Import must now be refused.
    const res = await request(server())
      .post(`${base}/setup/import/vehicles`)
      .set('Authorization', `Bearer ${token}`)
      .send({ fileName: 'vehicles.xlsx', rows: vehicleRows(1) });
    expect(res.status).toBe(409);
  });

  // --- AC-INV-006: opening balance -----------------------------------------

  it('AC-INV-006 — opening balance of 420 L SKU-1029 at Rp 76.500 saves in Setup with no approval', async () => {
    const token = await loginSystemAdmin();
    const res = await request(server())
      .post(`${base}/setup/opening-balance`)
      .set('Authorization', `Bearer ${token}`)
      .send({ rows: [{ sku: 'SKU-1029', quantity: 420, unitCost: 76500, rack: 'A-01' }] });
    expect(res.status).toBe(200);
    expect(res.body.rows).toBe(1);
    expect(res.body.skus).toEqual(['SKU-1029']);

    const row = openingBalance.getRow('SKU-1029');
    expect(row?.quantity).toBe(420);
    expect(row?.unitCost).toBe(76500);
    expect(row?.movementType).toBe('OB');
  });

  it('AC-INV-006 — once Live, the opening balance is refused with 409', async () => {
    const token = await loginSystemAdmin();
    await request(server())
      .post(`${base}/setup/go-live`)
      .set('Authorization', `Bearer ${token}`)
      .send({ confirm: true })
      .expect(200);

    const res = await request(server())
      .post(`${base}/setup/opening-balance`)
      .set('Authorization', `Bearer ${token}`)
      .send({ rows: [{ sku: 'SKU-1029', quantity: 420, unitCost: 76500, rack: 'A-01' }] });
    expect(res.status).toBe(409);
  });

  // --- REQ-IAM-010: one-way Go-live ----------------------------------------

  it('REQ-IAM-010 — Go-live cannot be reverted: a second go-live attempt is refused with 409', async () => {
    const token = await loginSystemAdmin();
    await request(server())
      .post(`${base}/setup/go-live`)
      .set('Authorization', `Bearer ${token}`)
      .send({ confirm: true })
      .expect(200);

    const second = await request(server())
      .post(`${base}/setup/go-live`)
      .set('Authorization', `Bearer ${token}`)
      .send({ confirm: true });
    expect(second.status).toBe(409);

    // Still Live.
    const status = await request(server())
      .get(`${base}/setup/status`)
      .set('Authorization', `Bearer ${token}`);
    expect(status.body.isLive).toBe(true);
  });

  // --- audit: exactly one record per mutating Setup call -------------------

  it('writes exactly one audit record for a successful opening-balance call', async () => {
    const token = await loginSystemAdmin();
    const obBefore = audit.findByEntity('stock_cards').length;
    await request(server())
      .post(`${base}/setup/opening-balance`)
      .set('Authorization', `Bearer ${token}`)
      .send({ rows: [{ sku: 'SKU-7', quantity: 10, unitCost: 1000, rack: 'B-02' }] })
      .expect(200);
    expect(audit.findByEntity('stock_cards').length - obBefore).toBe(1);
  });
});
