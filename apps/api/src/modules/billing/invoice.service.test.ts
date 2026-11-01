import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ConflictException } from '@nestjs/common';
import { InvoiceLineKind, InvoiceStatus, idValue } from '@bmi/shared';
import { SEED_IDS, type DataGateway } from '@bmi/data-gateway';
import { Role } from '@bmi/shared';
import { DataGatewayModule, DATA_GATEWAY } from '../../core/data-gateway/data-gateway.module.js';
import { AuditModule } from '../../core/audit/audit.module.js';
import { WorkOrdersModule } from '../work-orders/work-orders.module.js';
import { IamModule } from '../iam/iam.module.js';
import type { CurrentUser } from '../../core/auth/current-user.js';
import { AppSettingsService } from '../iam/app-settings.service.js';
import { InvoiceService } from './invoice.service.js';
import { CustomerService } from './customer.service.js';

/**
 * Unit coverage for the invoice engine (TASK-115, REQ-BIL, SM-INV, BR-15,
 * DEC-92). Fixtures build on the seed graph: vehicle 1 (B 1234 ABC) is billable
 * to customer 1, and WO-0142 is its WO. The tests craft the WO's completion /
 * off_days state directly through the gateway so each case exercises exact
 * money arithmetic (NFR-16), the Off_Unit line, the state machine and the
 * never-reused running number.
 */
describe('InvoiceService (TASK-115)', () => {
  let gateway: DataGateway;
  let invoices: InvoiceService;
  let customers: CustomerService;
  let settings: AppSettingsService;

  const woId = idValue(SEED_IDS.workOrder);
  const vehicleId = idValue(SEED_IDS.vehicle);
  const accounting: CurrentUser = { userId: 10, role: Role.Accounting };

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [DataGatewayModule, AuditModule, IamModule, WorkOrdersModule],
      providers: [InvoiceService, CustomerService],
    }).compile();
    gateway = moduleRef.get<DataGateway>(DATA_GATEWAY);
    invoices = moduleRef.get(InvoiceService);
    customers = moduleRef.get(CustomerService);
    settings = moduleRef.get(AppSettingsService);
    invoices.resetForTests();
    customers.resetForTests();
    settings.resetForTests();
    // The first customer gets id 1 — matching the seed vehicle's customer_id.
    customers.create({ code: 'CUST-001', name: 'PT Logistik', billingAddress: 'Jakarta' });
  });

  afterEach(() => {
    invoices.resetForTests();
    customers.resetForTests();
    settings.resetForTests();
  });

  /** Mark the seed WO Completed on a given WIB day with a given off_days. */
  async function completeSeedWo(completedAt: string, offDays = 0): Promise<void> {
    await gateway.unitOfWork(async (ctx) => {
      const wo = await ctx.repos.workOrders.requireById(woId);
      return ctx.repos.workOrders.update({ ...wo, offDays, completedAt });
    });
  }

  // --- AC-BIL-005: exact part markup + no-markup service (REQ-BIL-003) -----

  it('AC-BIL-005 — a part at +50% markup and a service at cost, exact arithmetic', async () => {
    await completeSeedWo('2026-11-03T05:00:00.000Z');
    invoices.setWorkOrderBillables(woId, [
      { kind: InvoiceLineKind.Part, description: 'Oil filter', sku: 'OF-1', qty: 1, unitCost: 64000 },
      { kind: InvoiceLineKind.Service, description: 'Engine oil change', qty: 1, unitCost: 150000 },
    ]);

    const result = await invoices.generateForWorkOrder(woId);
    expect(result.notBillable).toBe(false);
    const lines = result.lines;

    const part = lines.find((l) => l.kind === InvoiceLineKind.Part)!;
    expect(part.unitPrice).toBe(96000); // 64.000 × 1.5 (AC-BIL-005)
    expect(part.amount).toBe(96000);
    expect(part.markupPct).toBe(50);

    const service = lines.find((l) => l.kind === InvoiceLineKind.Service)!;
    expect(service.unitPrice).toBe(150000); // no markup
    expect(service.markupPct).toBe(0);

    // Subtotal 246.000; PPN 11% = 27.060; total 273.060 (half-up, NFR-16).
    expect(result.invoice!.subtotal).toBe(246000);
    expect(result.invoice!.taxAmount).toBe(27060);
    expect(result.invoice!.total).toBe(273060);
  });

  // --- DEC-92: the Off_Unit line = off_days × rate, at cost, in subtotal + PPN

  it('Off_Unit line = off_days × off_unit_daily_rate at cost, included in subtotal and PPN (DEC-92)', async () => {
    settings.setOffUnitDailyRate(500000);
    await completeSeedWo('2026-11-03T05:00:00.000Z', 3); // off_days = 3
    invoices.setWorkOrderBillables(woId, [
      { kind: InvoiceLineKind.Service, description: 'Diagnosis', qty: 1, unitCost: 100000 },
    ]);

    const result = await invoices.generateForWorkOrder(woId);
    const off = result.lines.find((l) => l.kind === InvoiceLineKind.Off_Unit)!;
    expect(off).toBeDefined();
    expect(off.qty).toBe(3);
    expect(off.unitCost).toBe(500000);
    expect(off.markupPct).toBe(0); // at cost, no markup
    expect(off.unitPrice).toBe(500000);
    expect(off.amount).toBe(1500000); // 3 × 500.000

    // Subtotal = service 100.000 + Off_Unit 1.500.000 = 1.600.000; PPN 11% = 176.000.
    expect(result.invoice!.subtotal).toBe(1600000);
    expect(result.invoice!.taxAmount).toBe(176000);
    expect(result.invoice!.total).toBe(1776000);
  });

  it('no Off_Unit line when off_days is 0 or the rate is 0', async () => {
    // off_days 0 → no line even with a rate set.
    settings.setOffUnitDailyRate(500000);
    await completeSeedWo('2026-11-03T05:00:00.000Z', 0);
    invoices.setWorkOrderBillables(woId, [
      { kind: InvoiceLineKind.Service, description: 'Diagnosis', qty: 1, unitCost: 100000 },
    ]);
    const r1 = await invoices.generateForWorkOrder(woId);
    expect(r1.lines.some((l) => l.kind === InvoiceLineKind.Off_Unit)).toBe(false);
  });

  // --- AC-BIL-001: one draft per vehicle per day (DEC-43) ------------------

  it('AC-BIL-001 — two WOs completed the same day share one Draft; a later day is a new draft', async () => {
    // First WO (the seed) completes 3 November.
    await completeSeedWo('2026-11-03T05:00:00.000Z');
    invoices.setWorkOrderBillables(woId, [
      { kind: InvoiceLineKind.Service, description: 'Service A', qty: 1, unitCost: 100000 },
    ]);
    const first = await invoices.generateForWorkOrder(woId);

    // A second WO on the same vehicle, completed the same day.
    const secondWoId = await createCompletedWo('2026-11-03T08:00:00.000Z');
    invoices.setWorkOrderBillables(secondWoId, [
      { kind: InvoiceLineKind.Service, description: 'Service B', qty: 1, unitCost: 50000 },
    ]);
    const second = await invoices.generateForWorkOrder(secondWoId);

    expect(second.invoice!.id).toBe(first.invoice!.id); // same draft (DEC-43)
    const lines = invoices.linesFor(idValue(first.invoice!.id));
    expect(lines).toHaveLength(2);
    expect(invoices.workOrderIdsFor(idValue(first.invoice!.id))).toEqual(
      expect.arrayContaining([woId, secondWoId]),
    );

    // A third WO on a later day → a new draft.
    const thirdWoId = await createCompletedWo('2026-11-04T05:00:00.000Z');
    invoices.setWorkOrderBillables(thirdWoId, [
      { kind: InvoiceLineKind.Service, description: 'Service C', qty: 1, unitCost: 10000 },
    ]);
    const third = await invoices.generateForWorkOrder(thirdWoId);
    expect(third.invoice!.id).not.toBe(first.invoice!.id);
    expect(third.invoice!.serviceDate).toBe('2026-11-04');
  });

  // --- AC-BIL-004: Not billable → Draft once a customer is set (REQ-BIL-009)

  it('AC-BIL-004 — a WO on a vehicle with no customer is Not billable, then joins a Draft', async () => {
    // Clear the vehicle's customer.
    await gateway.unitOfWork(async (ctx) => {
      const v = await ctx.repos.vehicles.requireById(vehicleId);
      return ctx.repos.vehicles.update({ ...v, customerId: null });
    });
    await completeSeedWo('2026-11-05T05:00:00.000Z');
    invoices.setWorkOrderBillables(woId, [
      { kind: InvoiceLineKind.Service, description: 'Service', qty: 1, unitCost: 100000 },
    ]);

    const notBillable = await invoices.generateForWorkOrder(woId);
    expect(notBillable.notBillable).toBe(true);
    expect(notBillable.invoice).toBeNull();
    expect(invoices.notBillable()).toContain(woId);

    // Set the customer back → the WO joins a Draft.
    await gateway.unitOfWork(async (ctx) => {
      const v = await ctx.repos.vehicles.requireById(vehicleId);
      return ctx.repos.vehicles.update({ ...v, customerId: SEED_IDS.customer });
    });
    const billed = await invoices.generateForWorkOrder(woId);
    expect(billed.notBillable).toBe(false);
    expect(billed.invoice).not.toBeNull();
    expect(invoices.notBillable()).not.toContain(woId);
  });

  // --- SM-INV: Draft → Issued → Paid; illegal transitions refused ----------

  it('issues a Draft (running number, due date, lines locked), pays it; refuses illegal transitions (SM-INV, AC-BIL-002)', async () => {
    await completeSeedWo('2026-10-26T05:00:00.000Z');
    invoices.setWorkOrderBillables(woId, [
      { kind: InvoiceLineKind.Service, description: 'Service', qty: 1, unitCost: 100000 },
    ]);
    const draft = (await invoices.generateForWorkOrder(woId)).invoice!;

    // Paying a Draft is refused (must Issue first) — SM-INV.
    expect(() => invoices.pay(idValue(draft.id), accounting, { version: draft.version, amount: draft.total })).toThrow(
      ConflictException,
    );

    const issued = invoices.issue(idValue(draft.id), accounting, {
      version: draft.version,
      issueDate: '2026-10-26T05:00:00.000Z',
    });
    expect(issued.status).toBe(InvoiceStatus.Issued);
    expect(issued.number).toBe('0001/BMI/26-10-26'); // NNNN/BMI/dd-mm-yy
    expect(issued.dueDate).toBe('2026-11-25'); // issue + 30-day terms

    // Issuing again is refused (Issued cannot Issue) — SM-INV / AC-BIL-002 lines locked.
    expect(() => invoices.issue(idValue(issued.id), accounting, { version: issued.version })).toThrow(ConflictException);
    // Adjusting an Issued invoice is refused (lines locked).
    expect(() =>
      invoices.addAdjustment(idValue(issued.id), { version: issued.version, description: 'x', amount: -1, reason: 'r' }),
    ).toThrow(ConflictException);

    const paid = invoices.pay(idValue(issued.id), accounting, { version: issued.version, amount: issued.total });
    expect(paid.status).toBe(InvoiceStatus.Paid);
    // Paid is final — a further transition is refused.
    expect(() => invoices.pay(idValue(paid.id), accounting, { version: paid.version, amount: paid.total })).toThrow(
      ConflictException,
    );
  });

  // --- AC-BIL-003: void frees WOs to a new Draft; number never reused ------

  it('AC-BIL-003 — voiding an Issued invoice frees its WOs to a new Draft; the number is never reused', async () => {
    await completeSeedWo('2026-10-26T05:00:00.000Z');
    invoices.setWorkOrderBillables(woId, [
      { kind: InvoiceLineKind.Service, description: 'Service', qty: 1, unitCost: 100000 },
    ]);
    const draft = (await invoices.generateForWorkOrder(woId)).invoice!;
    const issued = invoices.issue(idValue(draft.id), accounting, { version: draft.version, issueDate: '2026-10-26T05:00:00.000Z' });
    expect(issued.number).toBe('0001/BMI/26-10-26');

    const { voided, newDraft } = await invoices.void(idValue(issued.id), accounting, {
      version: issued.version,
      reason: 'Wrong customer',
    });
    expect(voided.status).toBe(InvoiceStatus.Void);
    expect(voided.voidReason).toBe('Wrong customer');
    expect(newDraft).not.toBeNull();
    expect(newDraft!.id).not.toBe(issued.id);
    expect(newDraft!.status).toBe(InvoiceStatus.Draft);

    // The next issued number is 0002 — the voided 0001 is never reused (DEC-50).
    const reissued = invoices.issue(idValue(newDraft!.id), accounting, { version: newDraft!.version, issueDate: '2026-10-26T05:00:00.000Z' });
    expect(reissued.number).toBe('0002/BMI/26-10-26');
  });

  it('refuses issuing an invoice with no lines (REQ-BIL-003)', async () => {
    await completeSeedWo('2026-10-26T05:00:00.000Z');
    const draft = (await invoices.generateForWorkOrder(woId)).invoice!;
    expect(() => invoices.issue(idValue(draft.id), accounting, { version: draft.version })).toThrow();
  });

  it('enforces the optimistic-lock version on a mutating call (NFR-03)', async () => {
    await completeSeedWo('2026-10-26T05:00:00.000Z');
    invoices.setWorkOrderBillables(woId, [
      { kind: InvoiceLineKind.Service, description: 'Service', qty: 1, unitCost: 100000 },
    ]);
    const draft = (await invoices.generateForWorkOrder(woId)).invoice!;
    expect(() => invoices.issue(idValue(draft.id), accounting, { version: draft.version + 5 })).toThrow(ConflictException);
  });

  /**
   * Create a second completed WO on the seed vehicle via the WO service is heavy;
   * instead clone the seed WO into a new gateway row with a fresh id/number.
   */
  async function createCompletedWo(completedAt: string): Promise<number> {
    return gateway.unitOfWork(async (ctx) => {
      const seed = await ctx.repos.workOrders.requireById(woId);
      const n = await ctx.repos.workOrders.count();
      const { id: _id, version: _version, ...rest } = seed;
      void _id;
      void _version;
      const created = await ctx.repos.workOrders.insert({
        ...rest,
        number: `WO-9${n + 1}`,
        completedAt,
        offDays: 0,
      });
      return idValue(created.id);
    });
  }
});
