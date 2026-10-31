import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { Role } from '@bmi/shared';
import type { DataGateway } from '@bmi/data-gateway';
import type { AuthenticatedRequest, CurrentUser } from '../../core/auth/current-user.js';
import { RequireCapability } from '../../core/auth/require-capability.decorator.js';
import { Capabilities } from '../../core/auth/permission-matrix.js';
import { enrichAudit } from '../../core/audit/audit-context.js';
import { DATA_GATEWAY } from '../../core/data-gateway/data-gateway.module.js';
import { PartsInventoryService } from './parts-inventory.service.js';
import { TyreRegisterService } from './tyre-register.service.js';
import {
  AddPartDto,
  CorrectGoodsReceiptDto,
  CreateStockOpnameDto,
  CreateTyreCountDto,
  EditPartDto,
  PostGoodsReceiptDto,
  RejectDto,
  RetreadDispatchDto,
  RetreadReturnDto,
  ReceiveTyresDto,
  ScrapTyreDto,
  WornOutDto,
} from './dto/inventory.dto.js';

/**
 * FG-8 — Parts inventory & tyres (REQ-BSL, REQ-INV, REQ-TYR, BR-06, BR-11).
 *
 * The warehouse-side master data + inventory + tyre register. Parts catalog,
 * Goods Receipts & corrections, the stock card and the stock-opname approval
 * flow are parts (`inventory.manage`); the tyre lifecycle (receive / retread /
 * worn-out / scrap / count) is tyres (`tyre.manage`); approvals (stock opname,
 * tyre count) demand `count.approve` (Supervisor / GM / System Admin, §2.2).
 *
 * Every mutating call carries the §2.2 RolesGuard, the global ValidationPipe,
 * the IdempotencyInterceptor and exactly one audit record (AuditInterceptor +
 * audit-context). Tyre status writes run inside the gateway's `unitOfWork`, so
 * the SM-TYRE status write is optimistic-lock-checked and **atomic with** the
 * register write (BR-06).
 */
@Controller('inventory')
export class InventoryController {
  constructor(
    @Inject(DATA_GATEWAY) private readonly gateway: DataGateway,
    private readonly parts: PartsInventoryService,
    private readonly tyres: TyreRegisterService,
  ) {}

  // --- parts catalog (REQ-INV-001/002/003) --------------------------------

  @Get('parts')
  listParts(): { parts: unknown } {
    return { parts: this.parts.listParts() };
  }

  @Get('parts/:sku')
  getPart(@Param('sku') sku: string): { part: unknown } {
    return { part: this.parts.getPart(sku) };
  }

  @Post('parts')
  @RequireCapability(Capabilities.InventoryManage)
  @HttpCode(HttpStatus.CREATED)
  addPart(@Req() req: AuthenticatedRequest, @Body() dto: AddPartDto): { part: unknown } {
    this.principal(req);
    const part = this.parts.addPart({
      sku: dto.sku,
      partName: dto.partName,
      unit: dto.unit,
      ...(dto.category === undefined ? {} : { category: dto.category }),
      ...(dto.brand === undefined ? {} : { brand: dto.brand }),
      ...(dto.reorderPoint === undefined ? {} : { reorderPoint: dto.reorderPoint }),
      ...(dto.rack === undefined ? {} : { rack: dto.rack }),
    });
    this.audit(req, 'parts_catalog', dto.sku, 'add_part');
    return { part };
  }

  @Patch('parts/:sku')
  @RequireCapability(Capabilities.InventoryManage)
  editPart(
    @Req() req: AuthenticatedRequest,
    @Param('sku') sku: string,
    @Body() dto: EditPartDto,
  ): { part: unknown } {
    this.principal(req);
    const part = this.parts.editPart(sku, {
      ...(dto.partName === undefined ? {} : { partName: dto.partName }),
      ...(dto.unit === undefined ? {} : { unit: dto.unit }),
      ...(dto.category === undefined ? {} : { category: dto.category }),
      ...(dto.brand === undefined ? {} : { brand: dto.brand }),
      ...(dto.reorderPoint === undefined ? {} : { reorderPoint: dto.reorderPoint }),
      ...(dto.rack === undefined ? {} : { rack: dto.rack }),
    });
    this.audit(req, 'parts_catalog', sku, `edit_part:${dto.reason}`);
    return { part };
  }

  @Post('parts/:sku/deactivate')
  @RequireCapability(Capabilities.InventoryManage)
  @HttpCode(HttpStatus.OK)
  deactivatePart(@Req() req: AuthenticatedRequest, @Param('sku') sku: string): { part: unknown } {
    this.principal(req);
    const part = this.parts.deactivatePart(sku);
    this.audit(req, 'parts_catalog', sku, 'deactivate_part');
    return { part };
  }

  // --- stock card (REQ-INV-007) -------------------------------------------

  @Get('parts/:sku/stock-card')
  stockCard(@Param('sku') sku: string): { stockCard: unknown } {
    return { stockCard: this.parts.stockCardOf(sku) };
  }

  // --- Goods Receipt & corrections (REQ-INV-004/005) ----------------------

  @Get('goods-receipts')
  listGoodsReceipts(): { goodsReceipts: unknown } {
    return { goodsReceipts: this.parts.listGoodsReceipts() };
  }

  @Post('goods-receipts')
  @RequireCapability(Capabilities.InventoryManage)
  @HttpCode(HttpStatus.CREATED)
  postGoodsReceipt(
    @Req() req: AuthenticatedRequest,
    @Body() dto: PostGoodsReceiptDto,
  ): { goodsReceipt: unknown } {
    const user = this.principal(req);
    const receipt = this.parts.postGoodsReceipt(
      {
        ...(dto.supplier === undefined ? {} : { supplier: dto.supplier }),
        ...(dto.invoiceNumber === undefined ? {} : { invoiceNumber: dto.invoiceNumber }),
        ...(dto.receiptDate === undefined ? {} : { receiptDate: dto.receiptDate }),
        lines: dto.lines,
      },
      user.userId,
    );
    this.audit(req, 'goods_receipts', receipt.grNumber, 'post_goods_receipt');
    return { goodsReceipt: receipt };
  }

  @Post('goods-receipts/:id/correct')
  @RequireCapability(Capabilities.InventoryManage)
  @HttpCode(HttpStatus.CREATED)
  correctGoodsReceipt(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CorrectGoodsReceiptDto,
  ): { correction: unknown } {
    const user = this.principal(req);
    const correction = this.parts.correctGoodsReceipt(
      id,
      {
        sku: dto.sku,
        qtyDelta: dto.qtyDelta,
        ...(dto.unitPrice === undefined ? {} : { unitPrice: dto.unitPrice }),
        reason: dto.reason,
      },
      user.userId,
    );
    this.audit(req, 'gr_corrections', correction.grcNumber, `correct_gr:${dto.reason}`);
    return { correction };
  }

  // --- stock opname (REQ-INV-010/011) -------------------------------------

  @Get('stock-opname')
  listOpnames(): { opnames: unknown } {
    return { opnames: this.parts.listOpnames() };
  }

  @Post('stock-opname')
  @RequireCapability(Capabilities.InventoryManage)
  @HttpCode(HttpStatus.CREATED)
  createOpname(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateStockOpnameDto,
  ): { opname: unknown } {
    const user = this.principal(req);
    const opname = this.parts.createOpname(dto.rows, user.userId);
    this.audit(req, 'stock_adjustments', opname.saNumber, 'create_stock_opname');
    return { opname };
  }

  @Post('stock-opname/:id/submit')
  @RequireCapability(Capabilities.InventoryManage)
  @HttpCode(HttpStatus.OK)
  submitOpname(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
  ): { opname: unknown } {
    const user = this.principal(req);
    const opname = this.parts.submitOpname(id, user.userId);
    this.audit(req, 'stock_adjustments', opname.saNumber, 'submit_stock_opname');
    return { opname };
  }

  @Post('stock-opname/:id/approve')
  @RequireCapability(Capabilities.CountApprove)
  @HttpCode(HttpStatus.OK)
  approveOpname(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
  ): { opname: unknown } {
    const user = this.principal(req);
    const opname = this.parts.approveOpname(id, user.userId, user.role === Role.SystemAdmin);
    this.audit(req, 'stock_adjustments', opname.saNumber, 'approve_stock_opname');
    return { opname };
  }

  @Post('stock-opname/:id/reject')
  @RequireCapability(Capabilities.CountApprove)
  @HttpCode(HttpStatus.OK)
  rejectOpname(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RejectDto,
  ): { opname: unknown } {
    this.principal(req);
    const opname = this.parts.rejectOpname(id, dto.reason);
    this.audit(req, 'stock_adjustments', opname.saNumber, `reject_stock_opname:${dto.reason}`);
    return { opname };
  }

  // --- tyres: receive / worn-out / scrap (REQ-TYR-006/010) ----------------

  @Get('tyres/:id/history')
  async tyreHistory(@Param('id', ParseIntPipe) id: number): Promise<{ history: unknown }> {
    return { history: this.tyres.historyOf(id) };
  }

  @Post('tyres/receive')
  @RequireCapability(Capabilities.TyreManage)
  @HttpCode(HttpStatus.CREATED)
  async receiveTyres(
    @Req() req: AuthenticatedRequest,
    @Body() dto: ReceiveTyresDto,
  ): Promise<{ tyres: unknown }> {
    const user = this.principal(req);
    const received = await this.gateway.unitOfWork((ctx) =>
      this.tyres.receive(ctx.repos, user.userId, {
        source: dto.source as 'Supplier' | 'Existing',
        ...(dto.invoiceNumber === undefined ? {} : { invoiceNumber: dto.invoiceNumber }),
        tyres: dto.tyres,
      }),
    );
    this.audit(req, 'tyres', `${received.length} received`, 'receive_tyres');
    return { tyres: received };
  }

  @Post('tyres/:id/worn-out')
  @RequireCapability(Capabilities.TyreManage)
  @HttpCode(HttpStatus.OK)
  async wornOut(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: WornOutDto,
  ): Promise<{ tyre: unknown }> {
    const user = this.principal(req);
    const tyre = await this.gateway.unitOfWork((ctx) =>
      this.tyres.markWornOut(ctx.repos, id, user.userId, {
        reason: dto.reason,
        ...(dto.note === undefined ? {} : { note: dto.note }),
      }),
    );
    this.audit(req, 'tyres', String(id), `tyre_worn_out:${dto.reason}`, id);
    return { tyre };
  }

  @Post('tyres/:id/scrap')
  @RequireCapability(Capabilities.TyreManage)
  @HttpCode(HttpStatus.OK)
  async scrapTyre(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ScrapTyreDto,
  ): Promise<{ tyre: unknown }> {
    const user = this.principal(req);
    const tyre = await this.gateway.unitOfWork((ctx) =>
      this.tyres.scrap(ctx.repos, id, user.userId, {
        reason: dto.reason,
        ...(dto.note === undefined ? {} : { note: dto.note }),
        ...(dto.disposalReference === undefined ? {} : { disposalReference: dto.disposalReference }),
      }),
    );
    this.audit(req, 'tyres', String(id), `tyre_scrap:${dto.reason}`, id);
    return { tyre };
  }

  // --- retread dispatch & return (REQ-TYR-008/009) ------------------------

  @Get('retread')
  listDispatches(): { dispatches: unknown } {
    return { dispatches: this.tyres.listDispatches() };
  }

  @Post('retread/dispatch')
  @RequireCapability(Capabilities.TyreManage)
  @HttpCode(HttpStatus.CREATED)
  async dispatchRetread(
    @Req() req: AuthenticatedRequest,
    @Body() dto: RetreadDispatchDto,
  ): Promise<{ dispatch: unknown }> {
    const user = this.principal(req);
    const dispatch = await this.gateway.unitOfWork((ctx) =>
      this.tyres.dispatchRetread(ctx.repos, user.userId, {
        vendor: dto.vendor,
        tyreIds: dto.tyreIds,
        ...(dto.deliveryNoteNumber === undefined ? {} : { deliveryNoteNumber: dto.deliveryNoteNumber }),
        ...(dto.expectedReturn === undefined ? {} : { expectedReturn: dto.expectedReturn }),
      }),
    );
    this.audit(req, 'retread_orders', dispatch.rdNumber, 'retread_dispatch');
    return { dispatch };
  }

  @Post('retread/:id/return')
  @RequireCapability(Capabilities.TyreManage)
  @HttpCode(HttpStatus.OK)
  async retreadReturn(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RetreadReturnDto,
  ): Promise<{ dispatch: unknown }> {
    const user = this.principal(req);
    const dispatch = await this.gateway.unitOfWork((ctx) =>
      this.tyres.confirmRetreadReturn(
        ctx.repos,
        id,
        user.userId,
        dto.results.map((r) => ({
          tyreId: r.tyreId,
          result: r.result as 'Accepted' | 'Rejected' | 'NotReturnedYet',
          ...(r.cost === undefined ? {} : { cost: r.cost }),
          ...(r.newTreadMm === undefined ? {} : { newTreadMm: r.newTreadMm }),
          ...(r.invoiceNumber === undefined ? {} : { invoiceNumber: r.invoiceNumber }),
          ...(r.rejectReason === undefined ? {} : { rejectReason: r.rejectReason }),
        })),
      ),
    );
    this.audit(req, 'retread_orders', dispatch.rdNumber, 'retread_return');
    return { dispatch };
  }

  // --- tyre count (REQ-TYR-011/012) ---------------------------------------

  @Post('tyre-count')
  @RequireCapability(Capabilities.TyreManage)
  @HttpCode(HttpStatus.CREATED)
  createTyreCount(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateTyreCountDto,
  ): { count: unknown } {
    const user = this.principal(req);
    const count = this.tyres.createCount(
      dto.rows.map((r) => ({
        tyreId: r.tyreId,
        result: r.result as 'Found' | 'Missing',
        ...(r.reason === undefined ? {} : { reason: r.reason }),
        ...(r.note === undefined ? {} : { note: r.note }),
      })),
      user.userId,
    );
    this.audit(req, 'tyre_counts', count.tcNumber, 'create_tyre_count');
    return { count };
  }

  @Post('tyre-count/:id/submit')
  @RequireCapability(Capabilities.TyreManage)
  @HttpCode(HttpStatus.OK)
  submitTyreCount(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
  ): { count: unknown } {
    const user = this.principal(req);
    const count = this.tyres.submitCount(id, user.userId);
    this.audit(req, 'tyre_counts', count.tcNumber, 'submit_tyre_count');
    return { count };
  }

  @Post('tyre-count/:id/approve')
  @RequireCapability(Capabilities.CountApprove)
  @HttpCode(HttpStatus.OK)
  async approveTyreCount(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<{ count: unknown }> {
    const user = this.principal(req);
    const count = await this.gateway.unitOfWork((ctx) =>
      this.tyres.approveCount(ctx.repos, id, user.userId, user.role === Role.SystemAdmin),
    );
    this.audit(req, 'tyre_counts', count.tcNumber, 'approve_tyre_count');
    return { count };
  }

  @Post('tyre-count/:id/reject')
  @RequireCapability(Capabilities.CountApprove)
  @HttpCode(HttpStatus.OK)
  rejectTyreCount(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RejectDto,
  ): { count: unknown } {
    this.principal(req);
    const count = this.tyres.rejectCount(id, dto.reason);
    this.audit(req, 'tyre_counts', count.tcNumber, `reject_tyre_count:${dto.reason}`);
    return { count };
  }

  // --- helpers -------------------------------------------------------------

  private principal(req: AuthenticatedRequest): CurrentUser {
    if (!req.currentUser) {
      throw new UnauthorizedException('Authentication required.');
    }
    return req.currentUser;
  }

  /**
   * Record exactly one audit record for a mutating call (NFR-02). Inventory
   * documents are identified by their generated running number (a string), so
   * the reference is carried in `after`/`reason`; the numeric `entityId` column
   * is filled only when the entity is a numeric aggregate id (a tyre).
   */
  private audit(
    req: AuthenticatedRequest,
    entity: string,
    entityRef: string,
    reason: string,
    entityId?: number,
  ): void {
    enrichAudit(req, {
      entity,
      ...(entityId === undefined ? {} : { entityId }),
      after: { reference: entityRef },
      reason,
    });
  }
}
