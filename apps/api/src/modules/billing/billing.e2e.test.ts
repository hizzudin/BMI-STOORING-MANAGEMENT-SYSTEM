import 'reflect-metadata';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SEED_PASSWORD, SEED_IDS, type DataGateway } from '@bmi/data-gateway';
import { InvoiceStatus, idValue } from '@bmi/shared';
import { AppModule } from '../../app.module.js';
import { API_PREFIX } from '../../app.constants.js';
import { DATA_GATEWAY } from '../../core/data-gateway/data-gateway.module.js';
import { AppSettingsService } from '../iam/app-settings.service.js';
import { InvoiceService } from './invoice.service.js';
import { CustomerService } from './customer.service.js';

/**
 * End-to-end FG-11 coverage (TASK-115) booting the full `AppModule` against the
 * dummy gateway. Covers the §2.2 role guard (`invoice.manage` for invoices,
 * `settings.manage` for the OFF-unit rate), the WO document endpoint
 * (AC-WOD-008 — step times on the document, not the invoice), invoice
 * generation → issue → pay over HTTP, and the Off_Unit line driven by the rate
 * master (DEC-92).
 */
describe('Billing (WO document + invoices) e2e (TASK-115)', () => {
  let app: INestApplication;
  let gateway: DataGateway;
  let settings: AppSettingsService;
  let invoices: InvoiceService;
  let customers: CustomerService;
  const base = `/${API_PREFIX}`;
  const woId = idValue(SEED_IDS.workOrder);
  const vehicleId = idValue(SEED_IDS.vehicle);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix(API_PREFIX);
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    gateway = app.get(DATA_GATEWAY);
    settings = app.get(AppSettingsService);
    invoices = app.get(InvoiceService);
    customers = app.get(CustomerService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    settings.resetForTests();
    settings.goLive(new Date().toISOString());
    invoices.resetForTests();
    customers.resetForTests();
    customers.create({ code: 'CUST-001', name: 'PT Logistik', billingAddress: 'Jakarta' });
    // Put the seed WO into a Completed state with off_days for billing.
    await gateway.unitOfWork(async (ctx) => {
      const wo = await ctx.repos.workOrders.requireById(woId);
      return ctx.repos.workOrders.update({ ...wo, completedAt: '2026-11-03T05:00:00.000Z', offDays: 2 });
    });
    // Ensure the vehicle is billable to customer 1.
    await gateway.unitOfWork(async (ctx) => {
      const v = await ctx.repos.vehicles.requireById(vehicleId);
      return ctx.repos.vehicles.update({ ...v, customerId: SEED_IDS.customer });
    });
  });

  const server = (): Parameters<typeof request>[0] => app.getHttpServer();

  async function login(email: string): Promise<string> {
    const res = await request(server()).post(`${base}/auth/login`).send({ email, password: SEED_PASSWORD });
    expect(res.status).toBe(200);
    return res.body.token as string;
  }
  const auth = (token: string) => (r: request.Test): request.Test => r.set('Authorization', `Bearer ${token}`);

  // --- WO document (REQ-WOD) ----------------------------------------------

  it('serves the WO document model with an approval block and execution-time table', async () => {
    const planner = await login('planner@bmi.test');
    const res = await auth(planner)(request(server()).get(`${base}/work-orders/${woId}/document`)).expect(200);
    expect(res.body.number).toBe('WO-0142');
    expect(Array.isArray(res.body.approvalBlock)).toBe(true);
    expect(Array.isArray(res.body.executionTime)).toBe(true);
  });

  it('renders a PDF stub artifact (REQ-WOD-001; real PDF = TASK-206)', async () => {
    const planner = await login('planner@bmi.test');
    const res = await auth(planner)(request(server()).get(`${base}/work-orders/${woId}/document.pdf`)).expect(200);
    expect(res.body.placeholder).toBe(true);
    expect(res.body.fileName).toBe('WO-0142.pdf');
  });

  // --- role guard (§2.2) ---------------------------------------------------

  it('refuses a Mechanic generating an invoice (§2.2 invoice.manage)', async () => {
    const mechanic = await login('mechanic@bmi.test');
    await auth(mechanic)(request(server()).post(`${base}/invoices/generate`).send({ workOrderId: woId })).expect(403);
  });

  it('refuses a non-System-Admin setting the OFF-unit rate (§2.2 settings.manage, REQ-BIL-012)', async () => {
    const accounting = await login('supervisor@bmi.test');
    await auth(accounting)(request(server()).put(`${base}/settings/off-unit-rate`).send({ rate: 500000 })).expect(403);
    const sysadmin = await login('sysadmin@bmi.test');
    const ok = await auth(sysadmin)(request(server()).put(`${base}/settings/off-unit-rate`).send({ rate: 500000 })).expect(200);
    expect(ok.body.billing.offUnitDailyRate).toBe(500000);
  });

  // --- full invoice flow over HTTP (REQ-BIL, SM-INV, DEC-92) ---------------

  it('generates a Draft with an Off_Unit line, issues it, and pays it (AC-WOD-008: no step time on the invoice)', async () => {
    const sysadmin = await login('sysadmin@bmi.test');
    // Set the OFF-unit rate (System Admin).
    await auth(sysadmin)(request(server()).put(`${base}/settings/off-unit-rate`).send({ rate: 500000 })).expect(200);

    const accounting = await login('supervisor@bmi.test'); // Supervisor owns invoices (invoice.manage)
    // Record the WO's billable lines then generate its invoice.
    await auth(accounting)(
      request(server()).post(`${base}/invoices/work-order-billables`).send({
        workOrderId: woId,
        lines: [
          { kind: 'Part', description: 'Oil filter', sku: 'OF-1', qty: 1, unitCost: 64000 },
          { kind: 'Service', description: 'Engine oil change', qty: 1, unitCost: 150000 },
        ],
      }),
    ).expect(200);

    const gen = await auth(accounting)(request(server()).post(`${base}/invoices/generate`).send({ workOrderId: woId })).expect(201);
    expect(gen.body.notBillable).toBe(false);
    const invoiceId = gen.body.invoice.id as number;

    // Lines: Part 96.000 + Service 150.000 + Off_Unit 2 × 500.000 = 1.000.000.
    const lines = gen.body.lines as Array<{ kind: string; amount: number; unitPrice: number }>;
    const off = lines.find((l) => l.kind === 'Off_Unit')!;
    expect(off.amount).toBe(1000000);
    // Subtotal 1.246.000; PPN 11% = 137.060; total 1.383.060.
    expect(gen.body.invoice.subtotal).toBe(1246000);
    expect(gen.body.invoice.taxAmount).toBe(137060);
    expect(gen.body.invoice.total).toBe(1383060);

    // The invoice detail carries no step-time fields (DEC-87, AC-WOD-008).
    const detail = await auth(accounting)(request(server()).get(`${base}/invoices/${invoiceId}`)).expect(200);
    const serialized = JSON.stringify(detail.body);
    expect(serialized).not.toContain('workedSeconds');
    expect(serialized).not.toContain('waited_for_verification');

    // Issue → running number, then pay the exact total.
    const fresh = detail.body.invoice;
    const issued = await auth(accounting)(
      request(server()).post(`${base}/invoices/${invoiceId}/issue`).send({ version: fresh.version, issueDate: '2026-11-03T05:00:00.000Z' }),
    ).expect(200);
    expect(issued.body.invoice.status).toBe(InvoiceStatus.Issued);
    expect(issued.body.invoice.number).toBe('0001/BMI/03-11-26');

    const paid = await auth(accounting)(
      request(server()).post(`${base}/invoices/${invoiceId}/pay`).send({ version: issued.body.invoice.version, method: 'Transfer', amount: issued.body.invoice.total }),
    ).expect(200);
    expect(paid.body.invoice.status).toBe(InvoiceStatus.Paid);
  });
});
