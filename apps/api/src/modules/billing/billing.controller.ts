import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { InvoiceStatus } from '@bmi/shared';
import type { AuthenticatedRequest, CurrentUser } from '../../core/auth/current-user.js';
import { RequireCapability } from '../../core/auth/require-capability.decorator.js';
import { Capabilities } from '../../core/auth/permission-matrix.js';
import { enrichAudit } from '../../core/audit/audit-context.js';
import { AppSettingsService } from '../iam/app-settings.service.js';
import { CustomerService } from './customer.service.js';
import { InvoiceService } from './invoice.service.js';
import { WoDocumentService } from './wo-document.service.js';
import {
  AddAdjustmentDto,
  CreateCustomerDto,
  GenerateInvoiceDto,
  IssueInvoiceDto,
  PayInvoiceDto,
  SetOffUnitRateDto,
  SetWorkOrderBillablesDto,
  VoidInvoiceDto,
} from './dto/billing.dto.js';

/**
 * FG-11 — WO document & invoices (REQ-WOD, REQ-BIL, REQ-BIL-012, SM-INV, BR-15,
 * DEC-92).
 *
 * Mutating endpoints carry the §2.2 RolesGuard (`invoice.manage` for invoices /
 * customers — Accounting, Supervisor and System Admin; `settings.manage` for the
 * OFF-unit daily rate — System Admin only, REQ-BIL-012), the global
 * ValidationPipe, the IdempotencyInterceptor, an optimistic-lock (`version`)
 * check in the service and exactly one audit record via the AuditInterceptor.
 * The WO-document reads are GETs.
 */
@Controller()
export class BillingController {
  constructor(
    private readonly invoices: InvoiceService,
    private readonly customers: CustomerService,
    private readonly documents: WoDocumentService,
    private readonly settings: AppSettingsService,
  ) {}

  // --- WO document (REQ-WOD) ----------------------------------------------

  /** The renderable WO document model (approval block, exec-time table, B/W snapshot). */
  @Get('work-orders/:id/document')
  async document(@Param('id', ParseIntPipe) id: number): Promise<unknown> {
    return this.documents.buildModel(id);
  }

  /** The WO document rendered to a (stub) PDF artifact (REQ-WOD-001; real PDF = TASK-206). */
  @Get('work-orders/:id/document.pdf')
  async documentPdf(@Param('id', ParseIntPipe) id: number): Promise<unknown> {
    return this.documents.render(id);
  }

  // --- Customers (REQ-BIL-001) --------------------------------------------

  @Get('customers')
  listCustomers(): { customers: unknown } {
    return { customers: this.customers.list() };
  }

  @Post('customers')
  @RequireCapability(Capabilities.InvoiceManage)
  @HttpCode(HttpStatus.CREATED)
  createCustomer(@Req() req: AuthenticatedRequest, @Body() dto: CreateCustomerDto): { customer: unknown } {
    this.principal(req);
    const customer = this.customers.create({
      code: dto.code,
      name: dto.name,
      billingAddress: dto.billingAddress,
      ...(dto.taxNumber === undefined ? {} : { taxNumber: dto.taxNumber }),
      ...(dto.paymentTermsDays === undefined ? {} : { paymentTermsDays: dto.paymentTermsDays }),
    });
    enrichAudit(req, { entity: 'customers', entityId: customer.id as unknown as number, after: { code: customer.code }, reason: 'create_customer' });
    return { customer };
  }

  // --- Invoices (REQ-BIL-002..009, SM-INV) --------------------------------

  /** List invoices, optionally by status (Draft/Issued/Paid/Void), plus Not billable. */
  @Get('invoices')
  listInvoices(@Query('status') status?: string): { invoices: unknown; notBillable: readonly number[] } {
    const filter = this.parseStatus(status);
    return {
      invoices: this.invoices.list(filter ? { status: filter } : undefined),
      notBillable: this.invoices.notBillable(),
    };
  }

  @Get('invoices/:id')
  invoiceDetail(@Param('id', ParseIntPipe) id: number): unknown {
    return this.invoices.detail(id);
  }

  /** Record the billable lines a completed WO contributes (Phase-1 facts, REQ-BIL-003). */
  @Post('invoices/work-order-billables')
  @RequireCapability(Capabilities.InvoiceManage)
  @HttpCode(HttpStatus.OK)
  setBillables(@Req() req: AuthenticatedRequest, @Body() dto: SetWorkOrderBillablesDto): { ok: true } {
    this.principal(req);
    this.invoices.setWorkOrderBillables(dto.workOrderId, dto.lines);
    enrichAudit(req, { entity: 'invoice_lines', entityId: dto.workOrderId, after: { lines: dto.lines.length }, reason: 'set_wo_billables' });
    return { ok: true };
  }

  /** Add a completed WO to its vehicle's Draft invoice for the day (REQ-BIL-002/009). */
  @Post('invoices/generate')
  @RequireCapability(Capabilities.InvoiceManage)
  @HttpCode(HttpStatus.CREATED)
  async generate(@Req() req: AuthenticatedRequest, @Body() dto: GenerateInvoiceDto): Promise<unknown> {
    this.principal(req);
    const result = await this.invoices.generateForWorkOrder(dto.workOrderId);
    enrichAudit(req, {
      entity: 'invoices',
      entityId: result.invoice ? (result.invoice.id as unknown as number) : undefined,
      after: { workOrderId: dto.workOrderId, notBillable: result.notBillable },
      reason: 'generate_invoice',
    });
    return result;
  }

  /** Add a manual adjustment line (discount/extra) to a Draft invoice (REQ-BIL-003). */
  @Post('invoices/:id/adjustments')
  @RequireCapability(Capabilities.InvoiceManage)
  @HttpCode(HttpStatus.OK)
  addAdjustment(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AddAdjustmentDto,
  ): unknown {
    this.principal(req);
    const result = this.invoices.addAdjustment(id, {
      version: dto.version,
      description: dto.description,
      amount: dto.amount,
      reason: dto.reason,
    });
    enrichAudit(req, { entity: 'invoice_lines', entityId: id, after: { amount: dto.amount, reason: dto.reason }, reason: 'add_adjustment' });
    return result;
  }

  @Post('invoices/:id/issue')
  @RequireCapability(Capabilities.InvoiceManage)
  @HttpCode(HttpStatus.OK)
  issue(@Req() req: AuthenticatedRequest, @Param('id', ParseIntPipe) id: number, @Body() dto: IssueInvoiceDto): { invoice: unknown } {
    const user = this.principal(req);
    const invoice = this.invoices.issue(id, user, {
      version: dto.version,
      ...(dto.issueDate === undefined ? {} : { issueDate: dto.issueDate }),
    });
    enrichAudit(req, { entity: 'invoices', entityId: id, after: { status: invoice.status, number: invoice.number }, reason: 'issue_invoice' });
    return { invoice };
  }

  @Post('invoices/:id/pay')
  @RequireCapability(Capabilities.InvoiceManage)
  @HttpCode(HttpStatus.OK)
  pay(@Req() req: AuthenticatedRequest, @Param('id', ParseIntPipe) id: number, @Body() dto: PayInvoiceDto): { invoice: unknown } {
    const user = this.principal(req);
    const invoice = this.invoices.pay(id, user, { version: dto.version, amount: dto.amount });
    enrichAudit(req, { entity: 'invoices', entityId: id, after: { status: invoice.status }, reason: 'pay_invoice' });
    return { invoice };
  }

  @Post('invoices/:id/void')
  @RequireCapability(Capabilities.InvoiceManage)
  @HttpCode(HttpStatus.OK)
  async voidInvoice(@Req() req: AuthenticatedRequest, @Param('id', ParseIntPipe) id: number, @Body() dto: VoidInvoiceDto): Promise<unknown> {
    const user = this.principal(req);
    const result = await this.invoices.void(id, user, { version: dto.version, reason: dto.reason });
    enrichAudit(req, {
      entity: 'invoices',
      entityId: id,
      after: { status: result.voided.status, newDraftId: result.newDraft?.id ?? null },
      reason: 'void_invoice',
    });
    return result;
  }

  // --- OFF-unit daily rate master (REQ-BIL-012, DEC-92) --------------------

  /** Read the billing settings incl. the global OFF-unit daily rate. */
  @Get('settings/off-unit-rate')
  offUnitRate(): { billing: unknown } {
    return { billing: this.settings.getBillingSettings() };
  }

  /** Set the global OFF-unit daily rate (System Admin, Settings — REQ-BIL-012). */
  @Put('settings/off-unit-rate')
  @RequireCapability(Capabilities.SettingsManage)
  @HttpCode(HttpStatus.OK)
  setOffUnitRate(@Req() req: AuthenticatedRequest, @Body() dto: SetOffUnitRateDto): { billing: unknown } {
    this.principal(req);
    const billing = this.settings.setOffUnitDailyRate(dto.rate);
    enrichAudit(req, { entity: 'app_settings', after: { off_unit_daily_rate: dto.rate }, reason: 'set_off_unit_rate' });
    return { billing };
  }

  // --- helpers -------------------------------------------------------------

  private parseStatus(status?: string): InvoiceStatus | null {
    if (!status) {
      return null;
    }
    const match = (Object.values(InvoiceStatus) as string[]).includes(status);
    return match ? (status as InvoiceStatus) : null;
  }

  private principal(req: AuthenticatedRequest): CurrentUser {
    if (!req.currentUser) {
      throw new UnauthorizedException('Authentication required.');
    }
    return req.currentUser;
  }
}
