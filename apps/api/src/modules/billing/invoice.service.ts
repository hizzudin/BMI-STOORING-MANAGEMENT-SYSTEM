import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  InvoiceEvent,
  InvoiceLineKind,
  InvoiceStatus,
  idValue,
  smInvoice,
  toId,
  type InvoiceDto,
  type InvoiceLineDto,
  type InvoiceLineKind as InvoiceLineKindT,
  type WorkOrderDto,
} from '@bmi/shared';
import {
  computeInvoiceTotals,
  createDefaultNumberGenerator,
  lineAmountAtCost,
  lineAmountWithMarkup,
  utcToWib,
  wibDayToIso,
  wibDayOf,
} from '@bmi/config';
import { Inject } from '@nestjs/common';
import type { DataGateway } from '@bmi/data-gateway';
import type { VehicleDto } from '@bmi/shared';
import type { CurrentUser } from '../../core/auth/current-user.js';
import { DATA_GATEWAY } from '../../core/data-gateway/data-gateway.module.js';
import { AppSettingsService } from '../iam/app-settings.service.js';
import { WorkOrdersService } from '../work-orders/work-orders.service.js';
import { CustomerService } from './customer.service.js';

/** A billable item a completed WO contributes to its invoice (REQ-BIL-003). */
export interface WorkOrderBillableLine {
  readonly kind: Exclude<InvoiceLineKindT, 'Off_Unit' | 'Adjustment'>;
  readonly description: string;
  readonly sku?: string | null;
  readonly qty: number;
  /** Cost on the WO line (average cost, purchase or workshop price), at cost. */
  readonly unitCost: number;
}

/** The outcome of (re)generating an invoice for a completed WO (REQ-BIL-002). */
export interface GenerateInvoiceResult {
  /** The Draft invoice the WO was billed into, or `null` when Not billable. */
  readonly invoice: InvoiceDto | null;
  /** The lines of that invoice (empty when Not billable). */
  readonly lines: readonly InvoiceLineDto[];
  /** True when the vehicle has no customer, so the WO is listed Not billable (REQ-BIL-009). */
  readonly notBillable: boolean;
}

/** A line amount for the totals helper. */
interface LineTotal {
  readonly amount: number;
}

/**
 * **Invoices** (FG-11, REQ-BIL, SM-INV, BR-15, DEC-92).
 *
 * Builds one Draft invoice per vehicle per day (DEC-43) holding every WO
 * completed for it that day, writes each part / tyre / service / document /
 * stooring / OFF-unit used as its own line (never merged, never one line per WO
 * — REQ-BIL-003), computes subtotal / PPN / grand total with the half-up money
 * helpers (REQ-BIL-004, NFR-16), and walks the state machine
 * Draft → Issued → Paid → Void through the shared `smInvoice` guard (a
 * transition not in PRD §3 SM-INV is refused).
 *
 * **The `Off_Unit` line** (DEC-92): WHERE a billed WO ran past its scheduled day
 * (`work_orders.off_days` > 0, owned and filled by the FG-12 daily job — read
 * here, never recomputed), invoice generation emits one `Off_Unit` line of
 * `off_days` × the global `app_settings.off_unit_daily_rate`, billed to the
 * vehicle's customer **at cost with no markup**, included in both the subtotal
 * and the PPN base.
 *
 * Phase-1 modelling: the dummy gateway models the nine business aggregates only,
 * so invoices, invoice lines and the WO↔invoice links are an API-layer
 * in-memory home (TASK-104..114 precedent); the running invoice number uses the
 * never-reused generator in `@bmi/config` (NFR-15, DEC-46/50). TASK-201/202
 * re-home the state behind PRD §9 `invoices` / `invoice_lines` / `invoice_wos`
 * unchanged.
 */
@Injectable()
export class InvoiceService {
  private readonly invoices = new Map<number, InvoiceDto>();
  private readonly lines = new Map<number, InvoiceLineDto[]>();
  /** invoiceId → the WO ids it bills (BR-15 traceability). */
  private readonly invoiceWos = new Map<number, Set<number>>();
  /**
   * workOrderId → the billable facts captured for it. Phase-1 facts source
   * (the WO parts/tyres/services used); re-homed behind the real WO cost rows
   * (`work_order_parts` / `work_order_services`) by TASK-201/202.
   */
  private readonly billables = new Map<number, WorkOrderBillableLine[]>();
  /**
   * workOrderId → the invoice it is currently billed on (not void). Enforces
   * BR-15 "bill once" and powers Not-billable → Draft re-homing (REQ-BIL-009).
   */
  private readonly billedOn = new Map<number, number>();
  /** WO ids with no customer at completion — listed Not billable (REQ-BIL-009). */
  private readonly notBillableWos = new Set<number>();

  private nextInvoiceId = 1;
  private nextLineId = 1;
  /** The never-reused running-number source — never consumed on cancel/void (DEC-46/50). */
  private numbers = createDefaultNumberGenerator();

  constructor(
    @Inject(DATA_GATEWAY) private readonly gateway: DataGateway,
    private readonly settings: AppSettingsService,
    private readonly workOrders: WorkOrdersService,
    private readonly customers: CustomerService,
  ) {}

  // --- facts (Phase-1 billable source) ------------------------------------

  /**
   * Record the billable lines a WO contributes (REQ-BIL-003). The real cost rows
   * live on the WO in later phases; in Phase 1 the caller supplies them here.
   */
  setWorkOrderBillables(workOrderId: number, lines: readonly WorkOrderBillableLine[]): void {
    this.billables.set(workOrderId, [...lines]);
  }

  // --- generation (REQ-BIL-002/003/009, DEC-43, BR-15) --------------------

  /**
   * Add a completed WO to the Draft invoice of its vehicle for the completion
   * date (local WIB day), creating that draft when none exists (REQ-BIL-002).
   * WHERE the vehicle has no customer, the WO is listed Not billable until a
   * customer is set (REQ-BIL-009). Idempotent per WO (BR-15): re-generating the
   * same WO refreshes its draft rather than billing it twice.
   */
  async generateForWorkOrder(workOrderId: number): Promise<GenerateInvoiceResult> {
    const wo = await this.workOrders.require(workOrderId);
    const vehicle = await this.requireVehicle(idValue(wo.vehicleId));
    const customerId = vehicle.customerId === null ? null : idValue(vehicle.customerId);

    // BR-15: never bill a WO twice. If it is already on a (non-void) invoice,
    // rebuild that invoice's lines so an updated off_days / billables snapshot
    // is reflected, but do not create a second draft.
    const existingInvoiceId = this.billedOn.get(workOrderId);

    if (customerId === null) {
      // Not billable: hold the WO aside; it joins a draft once a customer is set.
      this.notBillableWos.add(workOrderId);
      return { invoice: null, lines: [], notBillable: true };
    }
    this.notBillableWos.delete(workOrderId);

    const serviceDate = this.completionWibDay(wo);
    const invoice =
      existingInvoiceId !== undefined
        ? this.requireInvoice(existingInvoiceId)
        : this.findOrCreateDraft(idValue(vehicle.id), customerId, serviceDate);

    if (invoice.status !== InvoiceStatus.Draft) {
      throw new ConflictException(
        `WO ${wo.number} is already billed on invoice ${invoice.number ?? invoice.id} which is ${invoice.status}.`,
      );
    }

    // Link the WO to this draft (BR-15, bill once).
    this.linkWo(idValue(invoice.id), workOrderId);
    this.billedOn.set(workOrderId, idValue(invoice.id));

    await this.rebuildInvoiceLines(idValue(invoice.id));
    const refreshed = this.requireInvoice(idValue(invoice.id));
    return { invoice: refreshed, lines: this.linesOf(idValue(invoice.id)), notBillable: false };
  }

  /**
   * Rebuild all lines of a Draft invoice from the WOs it bills (REQ-BIL-003).
   * Each part / tyre / service / document / stooring line of each WO becomes its
   * own line (never merged); then, for every WO with `off_days` > 0, one
   * `Off_Unit` line of `off_days` × the OFF-unit daily rate at cost (DEC-92).
   * Totals are recomputed with the half-up money helpers (REQ-BIL-004).
   */
  private async rebuildInvoiceLines(invoiceId: number): Promise<void> {
    const invoice = this.requireInvoice(invoiceId);
    if (invoice.status !== InvoiceStatus.Draft) {
      throw new ConflictException('Only a Draft invoice may have its lines rebuilt (SM-INV).');
    }
    const markupPct = this.settings.getBillingSettings().partMarkupPct;
    const offRate = this.settings.getOffUnitDailyRate();
    const built: InvoiceLineDto[] = [];

    // Keep any manual adjustment lines the user added (REQ-BIL-003).
    const adjustments = this.linesOf(invoiceId).filter(
      (l) => l.kind === InvoiceLineKind.Adjustment,
    );

    for (const woId of this.woIdsOf(invoiceId)) {
      const wo = await this.workOrders.require(woId);
      const woBranded = toId<'WorkOrderId'>(woId);

      // Part / tyre / service / document / stooring lines (REQ-BIL-003).
      for (const item of this.billables.get(woId) ?? []) {
        const usesMarkup =
          item.kind === InvoiceLineKind.Part || item.kind === InvoiceLineKind.Tyre;
        const pct = usesMarkup ? markupPct : 0;
        const { unitPrice, amount } = usesMarkup
          ? lineAmountWithMarkup(item.unitCost, pct, item.qty)
          : lineAmountAtCost(item.unitCost, item.qty);
        built.push({
          id: toId<'InvoiceLineId'>(this.nextLineId++),
          invoiceId: toId<'InvoiceId'>(invoiceId),
          kind: item.kind,
          description: item.description,
          sku: item.sku ?? null,
          qty: item.qty,
          unitCost: item.unitCost,
          markupPct: pct,
          unitPrice,
          amount,
          adjustmentReason: null,
          workOrderId: woBranded,
        });
      }

      // Off_Unit line: off_days × off_unit_daily_rate, at cost, no markup (DEC-92).
      // off_days is produced by the FG-12 daily job — read, never recomputed.
      if (wo.offDays > 0 && offRate > 0) {
        const { unitPrice, amount } = lineAmountAtCost(offRate, wo.offDays);
        built.push({
          id: toId<'InvoiceLineId'>(this.nextLineId++),
          invoiceId: toId<'InvoiceId'>(invoiceId),
          kind: InvoiceLineKind.Off_Unit,
          description: `OFF unit — ${wo.number} (${wo.offDays} day${wo.offDays === 1 ? '' : 's'})`,
          sku: null,
          qty: wo.offDays,
          unitCost: offRate,
          markupPct: 0,
          unitPrice,
          amount,
          adjustmentReason: null,
          workOrderId: woBranded,
        });
      }
    }

    const allLines = [...built, ...adjustments];
    this.lines.set(invoiceId, allLines);
    this.recomputeTotals(invoiceId);
  }

  /** Recompute subtotal / PPN / grand total from the lines (REQ-BIL-004, NFR-16). */
  private recomputeTotals(invoiceId: number): void {
    const invoice = this.requireInvoice(invoiceId);
    const taxPct = invoice.status === InvoiceStatus.Draft ? this.settings.getBillingSettings().taxPct : invoice.taxPct;
    const lineTotals: LineTotal[] = this.linesOf(invoiceId).map((l) => ({ amount: l.amount }));
    const { subtotal, tax, grandTotal } = computeInvoiceTotals(lineTotals, taxPct);
    this.invoices.set(invoiceId, {
      ...invoice,
      taxPct,
      subtotal,
      taxAmount: tax,
      total: grandTotal,
      version: invoice.version + 1,
    });
  }

  // --- adjustment line (REQ-BIL-003) --------------------------------------

  /** Add a manual adjustment line (discount or extra) with a reason. */
  addAdjustment(
    invoiceId: number,
    input: { version: number; description: string; amount: number; reason: string },
  ): { invoice: InvoiceDto; lines: readonly InvoiceLineDto[] } {
    const invoice = this.loadForWrite(invoiceId, input.version);
    if (invoice.status !== InvoiceStatus.Draft) {
      throw new ConflictException('Only a Draft invoice may be adjusted (SM-INV).');
    }
    const line: InvoiceLineDto = {
      id: toId<'InvoiceLineId'>(this.nextLineId++),
      invoiceId: toId<'InvoiceId'>(invoiceId),
      kind: InvoiceLineKind.Adjustment,
      description: input.description,
      sku: null,
      qty: 1,
      unitCost: input.amount,
      markupPct: 0,
      unitPrice: input.amount,
      amount: input.amount,
      adjustmentReason: input.reason,
      workOrderId: null,
    };
    this.linesOf(invoiceId).push(line);
    this.recomputeTotals(invoiceId);
    return { invoice: this.requireInvoice(invoiceId), lines: this.linesOf(invoiceId) };
  }

  // --- state machine (SM-INV) ---------------------------------------------

  /**
   * Issue a Draft invoice (SM-INV Issue): assign the next running number
   * `NNNN/BMI/dd-mm-yy` of the issue date (never reset, never reused), lock the
   * lines and set the due date from the customer's payment terms (REQ-BIL-005).
   */
  issue(invoiceId: number, user: CurrentUser, input: { version: number; issueDate?: string }): InvoiceDto {
    const invoice = this.loadForWrite(invoiceId, input.version);
    // SM-INV guard: Draft → Issued (a non-Draft is refused by the machine).
    const next = this.transition(invoice, InvoiceEvent.Issue);
    if (this.linesOf(invoiceId).length === 0) {
      throw new BadRequestException('Cannot issue an invoice with no lines (REQ-BIL-003).');
    }
    const issuedAt = input.issueDate ? new Date(input.issueDate) : new Date();
    // The number's dd-mm-yy segment is the WIB wall-clock day of issue.
    const number = this.numbers.next('INVOICE', { issueDate: utcToWib(issuedAt) });
    const customer = this.customers.require(invoice.customerId);
    const dueDate = this.addDays(issuedAt, customer.paymentTermsDays);

    const issued: InvoiceDto = {
      ...invoice,
      status: next,
      number,
      issuedBy: toId<'UserId'>(user.userId),
      issuedAt: issuedAt.toISOString(),
      dueDate: wibDayToIso(wibDayOf(dueDate)),
      version: invoice.version + 1,
    };
    this.invoices.set(invoiceId, issued);
    return issued;
  }

  /** Record a payment (SM-INV Pay): sets the invoice Paid (REQ-BIL-006). */
  pay(invoiceId: number, _user: CurrentUser, input: { version: number; amount: number }): InvoiceDto {
    const invoice = this.loadForWrite(invoiceId, input.version);
    const next = this.transition(invoice, InvoiceEvent.Pay);
    if (input.amount !== invoice.total) {
      // No partial payment in R1 (REQ-BIL-006, DEC-50).
      throw new BadRequestException('The payment amount must equal the invoice total (no partial payment in R1).');
    }
    const paid: InvoiceDto = { ...invoice, status: next, version: invoice.version + 1 };
    this.invoices.set(invoiceId, paid);
    return paid;
  }

  /**
   * Void a Draft or Issued invoice with a reason (SM-INV Void): its WOs return to
   * a new Draft of the same vehicle and day, and the voided number is never
   * reused (REQ-BIL-006, AC-BIL-003).
   */
  async void(
    invoiceId: number,
    user: CurrentUser,
    input: { version: number; reason: string },
  ): Promise<{ voided: InvoiceDto; newDraft: InvoiceDto | null }> {
    const invoice = this.loadForWrite(invoiceId, input.version);
    const next = this.transition(invoice, InvoiceEvent.Void);
    const voided: InvoiceDto = {
      ...invoice,
      status: next,
      voidReason: input.reason,
      voidedBy: toId<'UserId'>(user.userId),
      voidedAt: new Date().toISOString(),
      version: invoice.version + 1,
    };
    this.invoices.set(invoiceId, voided);

    // Free its WOs into a new Draft of the same vehicle and day (REQ-BIL-006).
    const woIds = [...this.woIdsOf(invoiceId)];
    this.invoiceWos.set(invoiceId, new Set()); // the void keeps its lines as a snapshot but releases the WO links.
    let newDraft: InvoiceDto | null = null;
    for (const woId of woIds) {
      this.billedOn.delete(woId);
      const result = await this.generateForWorkOrder(woId);
      if (result.invoice) {
        newDraft = result.invoice;
      }
    }
    return { voided, newDraft };
  }

  // --- reads ---------------------------------------------------------------

  /** Every invoice, optionally filtered by status (REQ-BIL-008). */
  list(filter?: { status?: InvoiceStatus }): readonly InvoiceDto[] {
    const all = [...this.invoices.values()];
    return filter?.status ? all.filter((i) => i.status === filter.status) : all;
  }

  /** The WO ids currently listed Not billable (REQ-BIL-009). */
  notBillable(): readonly number[] {
    return [...this.notBillableWos];
  }

  /** Get an invoice with its lines, or throw. */
  detail(invoiceId: number): { invoice: InvoiceDto; lines: readonly InvoiceLineDto[] } {
    return { invoice: this.requireInvoice(invoiceId), lines: this.linesOf(invoiceId) };
  }

  /** The lines of an invoice (copy). */
  linesFor(invoiceId: number): readonly InvoiceLineDto[] {
    return [...this.linesOf(invoiceId)];
  }

  /** The WO ids an invoice bills (BR-15 traceability). */
  workOrderIdsFor(invoiceId: number): readonly number[] {
    return [...this.woIdsOf(invoiceId)];
  }

  // --- internals -----------------------------------------------------------

  /** Walk SM-INV; an unlisted transition is refused (PRD §3.7). */
  private transition(invoice: InvoiceDto, event: InvoiceEvent): InvoiceStatus {
    if (!smInvoice.can(invoice.status, event)) {
      throw new ConflictException(
        `Invoice ${invoice.number ?? invoice.id} cannot ${event} from ${invoice.status} (SM-INV).`,
      );
    }
    return smInvoice.transition(invoice.status, event);
  }

  /** Find the open Draft for a vehicle+day, or create it (one per vehicle/day, DEC-43). */
  private findOrCreateDraft(vehicleId: number, customerId: number, serviceDate: string): InvoiceDto {
    for (const invoice of this.invoices.values()) {
      if (
        invoice.status === InvoiceStatus.Draft &&
        idValue(invoice.vehicleId) === vehicleId &&
        invoice.serviceDate === serviceDate
      ) {
        return invoice;
      }
    }
    const id = this.nextInvoiceId++;
    const taxPct = this.settings.getBillingSettings().taxPct;
    const draft: InvoiceDto = {
      id: toId<'InvoiceId'>(id),
      number: null,
      customerId: toId<'CustomerId'>(customerId),
      vehicleId: toId<'VehicleId'>(vehicleId),
      serviceDate,
      status: InvoiceStatus.Draft,
      subtotal: 0,
      taxPct,
      taxAmount: 0,
      total: 0,
      issuedBy: null,
      issuedAt: null,
      dueDate: null,
      voidReason: null,
      voidedBy: null,
      voidedAt: null,
      version: 1,
    };
    this.invoices.set(id, draft);
    this.lines.set(id, []);
    this.invoiceWos.set(id, new Set());
    return draft;
  }

  private linkWo(invoiceId: number, workOrderId: number): void {
    const set = this.invoiceWos.get(invoiceId) ?? new Set<number>();
    set.add(workOrderId);
    this.invoiceWos.set(invoiceId, set);
  }

  private woIdsOf(invoiceId: number): ReadonlySet<number> {
    return this.invoiceWos.get(invoiceId) ?? new Set<number>();
  }

  private linesOf(invoiceId: number): InvoiceLineDto[] {
    const existing = this.lines.get(invoiceId);
    if (existing) {
      return existing;
    }
    const fresh: InvoiceLineDto[] = [];
    this.lines.set(invoiceId, fresh);
    return fresh;
  }

  private requireInvoice(invoiceId: number): InvoiceDto {
    const invoice = this.invoices.get(invoiceId);
    if (!invoice) {
      throw new NotFoundException(`Invoice ${invoiceId} was not found.`);
    }
    return invoice;
  }

  /** Load for a mutating call with an optimistic-lock (version) check (NFR-03). */
  private loadForWrite(invoiceId: number, version: number): InvoiceDto {
    const invoice = this.requireInvoice(invoiceId);
    if (invoice.version !== version) {
      throw new ConflictException(
        `Invoice ${invoiceId} was modified by someone else (expected version ${version}, found ${invoice.version}).`,
      );
    }
    return invoice;
  }

  private completionWibDay(wo: WorkOrderDto): string {
    const at = wo.completedAt ? new Date(wo.completedAt) : new Date();
    return wibDayToIso(wibDayOf(at));
  }

  private addDays(date: Date, days: number): Date {
    return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
  }

  /** Resolve the vehicle (for its `customer_id`, REQ-BIL-002) or throw. */
  private async requireVehicle(vehicleId: number): Promise<VehicleDto> {
    const vehicle = await this.gateway.repos.vehicles.getById(vehicleId);
    if (!vehicle) {
      throw new NotFoundException(`Vehicle ${vehicleId} was not found.`);
    }
    return vehicle;
  }

  /** Test-only reset of all billing state (including the number sequence). */
  resetForTests(): void {
    this.invoices.clear();
    this.lines.clear();
    this.invoiceWos.clear();
    this.billables.clear();
    this.billedOn.clear();
    this.notBillableWos.clear();
    this.nextInvoiceId = 1;
    this.nextLineId = 1;
    this.numbers = createDefaultNumberGenerator();
  }
}
