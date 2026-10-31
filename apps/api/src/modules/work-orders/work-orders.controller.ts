import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { idValue, type WorkOrderDto, type WorkOrderStatus } from '@bmi/shared';
import type { AuthenticatedRequest, CurrentUser } from '../../core/auth/current-user.js';
import { RequireCapability } from '../../core/auth/require-capability.decorator.js';
import { Capabilities } from '../../core/auth/permission-matrix.js';
import { enrichAudit } from '../../core/audit/audit-context.js';
import { WorkOrdersService } from './work-orders.service.js';
import {
  BreakdownDraftDto,
  CancelWorkOrderDto,
  CreateWorkOrderDto,
  EditWorkOrderDto,
  RejectWorkOrderDto,
  WorkOrderVersionDto,
} from './dto/work-orders.dto.js';

/**
 * FG-1 — Work Order lifecycle (REQ-WO, SM-WO, BR-02, BR-03, DEC-87).
 *
 * The endpoints design.md names: `POST /work-orders`, and
 * `POST /work-orders/{id}/submit|approve|reject|cancel` (plus send-for-review,
 * edit, completion and the breakdown auto-draft). Writes carry a §2.2 capability
 * so the global RolesGuard refuses an unauthorized role a server-side 403; the
 * draft-only discipline and four-eyes are additionally enforced in the service
 * (BR-03). Every mutating call leaves exactly one audit record via the
 * AuditInterceptor enriched through the per-request audit-context.
 */
@Controller('work-orders')
export class WorkOrdersController {
  constructor(private readonly workOrders: WorkOrdersService) {}

  // --- reads ---------------------------------------------------------------

  /** List WOs, urgency-ordered (REQ-WO-015). Optional `?status=`. */
  @Get()
  async list(@Query('status') status?: string): Promise<{ workOrders: readonly WorkOrderDto[] }> {
    const workOrders = await this.workOrders.list(
      status === undefined ? undefined : { status: status as WorkOrderStatus },
    );
    return { workOrders };
  }

  /** A WO with its steps (REQ-WO-011). */
  @Get(':id')
  async view(@Param('id', ParseIntPipe) id: number): Promise<unknown> {
    const workOrder = await this.workOrders.require(id);
    const steps = await this.workOrders.stepsOf(id);
    return { workOrder, steps };
  }

  // --- create (SM-WO T1) ---------------------------------------------------

  /** Create a WO or a review draft (REQ-WO-001/014/016). */
  @Post()
  @RequireCapability(Capabilities.WoCreate)
  @HttpCode(HttpStatus.CREATED)
  async create(@Req() req: AuthenticatedRequest, @Body() dto: CreateWorkOrderDto): Promise<{ workOrder: WorkOrderDto }> {
    const user = this.principal(req);
    const workOrder = await this.workOrders.create(user, {
      vehicleId: dto.vehicleId,
      title: dto.title,
      category: dto.category,
      ...(dto.priority === undefined ? {} : { priority: dto.priority }),
      ...(dto.requiresDowntime === undefined ? {} : { requiresDowntime: dto.requiresDowntime }),
      description: dto.description,
      ...(dto.findingNote === undefined ? {} : { findingNote: dto.findingNote }),
      ...(dto.source === undefined ? {} : { source: dto.source }),
      ...(dto.steps === undefined ? {} : { steps: dto.steps }),
      ...(dto.presetId === undefined ? {} : { presetId: dto.presetId }),
    });
    this.audit(req, workOrder, 'create_wo');
    return { workOrder };
  }

  /**
   * Create a Driver_Breakdown auto-draft with exactly one Mobilisasi step
   * (REQ-WO-003, REQ-MBL-001). Driver-sourced; here we build the auto-draft and
   * its single step (the mobile trigger is TASK-118).
   */
  @Post('breakdown-draft')
  @RequireCapability(Capabilities.WoCreate)
  @HttpCode(HttpStatus.CREATED)
  async breakdownDraft(@Req() req: AuthenticatedRequest, @Body() dto: BreakdownDraftDto): Promise<{ workOrder: WorkOrderDto }> {
    const user = this.principal(req);
    const workOrder = await this.workOrders.createBreakdownDraft({
      vehicleId: dto.vehicleId,
      description: dto.description,
      createdBy: user.userId,
      ...(dto.locationLat === undefined ? {} : { locationLat: dto.locationLat }),
      ...(dto.locationLng === undefined ? {} : { locationLng: dto.locationLng }),
      ...(dto.breakdownReportId === undefined ? {} : { breakdownReportId: dto.breakdownReportId }),
    });
    this.audit(req, workOrder, 'breakdown_auto_draft');
    return { workOrder };
  }

  // --- edit / submit / send-for-review ------------------------------------

  /** Edit a draft/rejected WO's common fields and steps (REQ-WO-017). */
  @Post(':id/edit')
  @RequireCapability(Capabilities.WoCreate)
  @HttpCode(HttpStatus.OK)
  async edit(@Req() req: AuthenticatedRequest, @Param('id', ParseIntPipe) id: number, @Body() dto: EditWorkOrderDto): Promise<{ workOrder: WorkOrderDto }> {
    const user = this.principal(req);
    const workOrder = await this.workOrders.edit(id, user, {
      version: dto.version,
      ...(dto.title === undefined ? {} : { title: dto.title }),
      ...(dto.category === undefined ? {} : { category: dto.category }),
      ...(dto.priority === undefined ? {} : { priority: dto.priority }),
      ...(dto.requiresDowntime === undefined ? {} : { requiresDowntime: dto.requiresDowntime }),
      ...(dto.description === undefined ? {} : { description: dto.description }),
      ...(dto.steps === undefined ? {} : { steps: dto.steps }),
    });
    this.audit(req, workOrder, 'edit_wo');
    return { workOrder };
  }

  /** Submit a draft for approval — Planner/System Admin "activate" (SM-WO T2/T5). */
  @Post(':id/submit')
  @RequireCapability(Capabilities.WoCreate)
  @HttpCode(HttpStatus.OK)
  async submit(@Req() req: AuthenticatedRequest, @Param('id', ParseIntPipe) id: number, @Body() dto: WorkOrderVersionDto): Promise<{ workOrder: WorkOrderDto }> {
    const user = this.principal(req);
    const workOrder = await this.workOrders.submitForApproval(id, user, dto.version);
    this.audit(req, workOrder, 'submit_for_approval');
    return { workOrder };
  }

  /** Send a draft for review — Field Coordinator / Mechanic (REQ-WO-016). */
  @Post(':id/send-for-review')
  @RequireCapability(Capabilities.WoCreate)
  @HttpCode(HttpStatus.OK)
  async sendForReview(@Req() req: AuthenticatedRequest, @Param('id', ParseIntPipe) id: number, @Body() dto: WorkOrderVersionDto): Promise<{ workOrder: WorkOrderDto }> {
    const user = this.principal(req);
    const workOrder = await this.workOrders.sendForReview(id, user, dto.version);
    this.audit(req, workOrder, 'send_for_review');
    return { workOrder };
  }

  // --- approve / reject / cancel ------------------------------------------

  /** Approve creation (Approver, SM-WO T3). Four-eyes enforced in the service. */
  @Post(':id/approve')
  @RequireCapability(Capabilities.WoApprove)
  @HttpCode(HttpStatus.OK)
  async approve(@Req() req: AuthenticatedRequest, @Param('id', ParseIntPipe) id: number, @Body() dto: WorkOrderVersionDto): Promise<{ workOrder: WorkOrderDto }> {
    const user = this.principal(req);
    const workOrder = await this.workOrders.approve(id, user, dto.version);
    this.audit(req, workOrder, 'approve_wo', idValue(workOrder.createdBy) === user.userId);
    return { workOrder };
  }

  /** Reject creation with a reason (Approver, SM-WO T4). */
  @Post(':id/reject')
  @RequireCapability(Capabilities.WoApprove)
  @HttpCode(HttpStatus.OK)
  async reject(@Req() req: AuthenticatedRequest, @Param('id', ParseIntPipe) id: number, @Body() dto: RejectWorkOrderDto): Promise<{ workOrder: WorkOrderDto }> {
    const user = this.principal(req);
    const workOrder = await this.workOrders.reject(id, user, { version: dto.version, reason: dto.reason });
    this.audit(req, workOrder, 'reject_wo');
    return { workOrder };
  }

  /** Cancel a WO with a reason (Approver, SM-WO T6/T15). */
  @Post(':id/cancel')
  @RequireCapability(Capabilities.WoCancel)
  @HttpCode(HttpStatus.OK)
  async cancel(@Req() req: AuthenticatedRequest, @Param('id', ParseIntPipe) id: number, @Body() dto: CancelWorkOrderDto): Promise<{ workOrder: WorkOrderDto }> {
    const user = this.principal(req);
    const workOrder = await this.workOrders.cancel(id, user, { version: dto.version, reason: dto.reason });
    this.audit(req, workOrder, 'cancel_wo');
    return { workOrder };
  }

  // --- completion (SM-WO T13) ---------------------------------------------

  /** Request completion approval — every step Verified/Skipped (REQ-ENG-006). */
  @Post(':id/request-completion')
  @RequireCapability(Capabilities.StepRequestCompletion)
  @HttpCode(HttpStatus.OK)
  async requestCompletion(@Req() req: AuthenticatedRequest, @Param('id', ParseIntPipe) id: number, @Body() dto: WorkOrderVersionDto): Promise<{ workOrder: WorkOrderDto }> {
    const user = this.principal(req);
    const workOrder = await this.workOrders.requestCompletion(id, user, dto.version);
    this.audit(req, workOrder, 'request_completion');
    return { workOrder };
  }

  /** Approve completion → Completed (Approver, SM-WO T13, DEC-87 gate). */
  @Post(':id/approve-completion')
  @RequireCapability(Capabilities.WoApprove)
  @HttpCode(HttpStatus.OK)
  async approveCompletion(@Req() req: AuthenticatedRequest, @Param('id', ParseIntPipe) id: number, @Body() dto: WorkOrderVersionDto): Promise<{ workOrder: WorkOrderDto }> {
    const user = this.principal(req);
    const workOrder = await this.workOrders.approveCompletion(id, user, dto.version);
    this.audit(req, workOrder, 'approve_completion', idValue(workOrder.createdBy) === user.userId);
    return { workOrder };
  }

  // --- helpers -------------------------------------------------------------

  private principal(req: AuthenticatedRequest): CurrentUser {
    if (!req.currentUser) {
      throw new UnauthorizedException('Authentication required.');
    }
    return req.currentUser;
  }

  private audit(req: AuthenticatedRequest, wo: WorkOrderDto, reason: string, selfDecision = false): void {
    enrichAudit(req, {
      entity: 'work_orders',
      entityId: idValue(wo.id),
      after: { number: wo.number, status: wo.status, priority: wo.priority },
      reason,
      selfDecision,
    });
  }
}
