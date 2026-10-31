import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { idValue, type AssignmentDto } from '@bmi/shared';
import type { AuthenticatedRequest, CurrentUser } from '../../core/auth/current-user.js';
import { RequireCapability } from '../../core/auth/require-capability.decorator.js';
import { Capabilities } from '../../core/auth/permission-matrix.js';
import { enrichAudit } from '../../core/audit/audit-context.js';
import { AssignmentsService } from '../assignments/assignments.service.js';
import { StockStepService } from './stock-step.service.js';
import { PartPurchaseStepService } from './part-purchase-step.service.js';
import {
  PurchaseTotalsDto,
  ReverseStockDto,
  StageStockDto,
  SubmitPurchaseDto,
} from './dto/stock.dto.js';

/**
 * FG-4 — Stock step & Part Purchase step (REQ-STK, REQ-PUR, DEC-60).
 *
 * The *lifecycle* transitions (Start/Submit/Verify) run through the generic
 * engine (`/assignments/:id/...`); these endpoints carry the module-specific
 * data the engine's step handlers consume:
 *   - `POST /stock/:id/stage`     — stage the warehouse lines to issue (Stock).
 *   - `POST /stock/:id/reverse`   — request a verified reversal (Stock).
 *   - `POST /stock/purchase/totals` — live line/grand totals, no save (Purchase).
 *   - `POST /stock/purchase/:id/stage` — stage the typed purchase lines.
 * Every mutating call carries the §2.2 RolesGuard (`stock.issue` / `purchase.line`),
 * the global ValidationPipe, the IdempotencyInterceptor and one audit record.
 */
@Controller('stock')
export class StockController {
  constructor(
    private readonly assignments: AssignmentsService,
    private readonly stock: StockStepService,
    private readonly partPurchase: PartPurchaseStepService,
  ) {}

  /** The staged state + required list of a Stock step (for the UI). */
  @Get(':id')
  async view(@Param('id', ParseIntPipe) id: number): Promise<{
    step: AssignmentDto;
    requiredList: unknown;
    staged: unknown;
    postedGoodsIssueId: number | undefined;
  }> {
    const step = await this.assignments.require(id);
    return {
      step,
      requiredList: this.stock.requiredListOf(id),
      staged: this.stock.stagedOf(id) ?? null,
      postedGoodsIssueId: this.stock.postedGoodsIssueIdOf(id),
    };
  }

  /**
   * Stage the warehouse lines to issue on a Stock step (REQ-STK-002/004). A SKU
   * off the WO list or an unconfirmed over-issue is refused (AC-STK-001/003).
   */
  @Post(':id/stage')
  @RequireCapability(Capabilities.StockIssue)
  @HttpCode(HttpStatus.OK)
  async stage(@Req() req: AuthenticatedRequest, @Param('id', ParseIntPipe) id: number, @Body() dto: StageStockDto): Promise<{ staged: unknown }> {
    this.principal(req);
    const step = await this.assignments.require(id);
    this.stock.assertStageable(step);
    this.stock.stageIssue(step, {
      lines: dto.lines,
      ...(dto.confirmShortfall === undefined ? {} : { confirmShortfall: dto.confirmShortfall }),
      ...(dto.hasAttachment === undefined ? {} : { hasAttachment: dto.hasAttachment }),
    });
    const staged = this.stock.stagedOf(id);
    this.audit(req, step, 'stage_stock_issue');
    return { staged: staged ?? null };
  }

  /**
   * Request a reversal of the posted Stock issue with a reason (REQ-STK-008).
   * Stock does not change until the step is verified (AC-STK-005).
   */
  @Post(':id/reverse')
  @RequireCapability(Capabilities.StockIssue)
  @HttpCode(HttpStatus.OK)
  async reverse(@Req() req: AuthenticatedRequest, @Param('id', ParseIntPipe) id: number, @Body() dto: ReverseStockDto): Promise<{ ok: true }> {
    this.principal(req);
    const step = await this.assignments.require(id);
    this.stock.requestReversal(step, dto.reason);
    this.audit(req, step, 'request_stock_reversal');
    return { ok: true };
  }

  // --- Part Purchase -------------------------------------------------------

  /** Live line/grand totals without saving (REQ-PUR-003, AC-PUR-001/002). */
  @Post('purchase/totals')
  @HttpCode(HttpStatus.OK)
  totals(@Body() dto: PurchaseTotalsDto): { lines: unknown; total: number } {
    return this.partPurchase.computeTotals(dto.lines);
  }

  /** The staged/submitted purchase + hints of a Part Purchase step. */
  @Get('purchase/:id')
  async viewPurchase(@Param('id', ParseIntPipe) id: number): Promise<{
    step: AssignmentDto;
    hints: unknown;
    staged: unknown;
    purchase: unknown;
    partsCost: number;
  }> {
    const step = await this.assignments.require(id);
    return {
      step,
      hints: this.partPurchase.hintsOf(id),
      staged: this.partPurchase.stagedOf(id) ?? null,
      purchase: this.partPurchase.purchaseOf(id) ?? null,
      partsCost: this.partPurchase.partsCostOf(idValue(step.workOrderId)),
    };
  }

  /** Stage the typed purchase lines before the engine submit (REQ-PUR-002). */
  @Post('purchase/:id/stage')
  @RequireCapability(Capabilities.PurchaseLine)
  @HttpCode(HttpStatus.OK)
  async stagePurchase(@Req() req: AuthenticatedRequest, @Param('id', ParseIntPipe) id: number, @Body() dto: SubmitPurchaseDto): Promise<{ total: number }> {
    this.principal(req);
    const step = await this.assignments.require(id);
    // Validate the figures now so the buyer gets immediate feedback; the actual
    // record is written by the engine submit (REQ-PUR-006, TX-21).
    const { total } = dto.lines.length > 0 ? this.partPurchase.computeTotals(dto.lines) : { total: 0 };
    this.partPurchase.stage(id, {
      lines: dto.lines,
      ...(dto.vendor === undefined ? {} : { vendor: dto.vendor }),
      ...(dto.receiptNumber === undefined ? {} : { receiptNumber: dto.receiptNumber }),
      ...(dto.receiptDate === undefined ? {} : { receiptDate: dto.receiptDate }),
      ...(dto.receiptPhoto === undefined ? {} : { receiptPhoto: dto.receiptPhoto }),
      ...(dto.nothingBoughtReason === undefined ? {} : { nothingBoughtReason: dto.nothingBoughtReason }),
    });
    this.audit(req, step, 'stage_part_purchase');
    return { total };
  }

  // --- helpers -------------------------------------------------------------

  private principal(req: AuthenticatedRequest): CurrentUser {
    if (!req.currentUser) {
      throw new UnauthorizedException('Authentication required.');
    }
    return req.currentUser;
  }

  private audit(req: AuthenticatedRequest, step: AssignmentDto, reason: string): void {
    enrichAudit(req, {
      entity: 'work_order_assignments',
      entityId: idValue(step.id),
      after: { sequence: step.sequence, module: step.moduleCode, status: step.status },
      reason,
    });
  }
}
