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
import { idValue, type ChangeRequestDto } from '@bmi/shared';
import type { AuthenticatedRequest, CurrentUser } from '../../core/auth/current-user.js';
import { RequireCapability } from '../../core/auth/require-capability.decorator.js';
import { Capabilities } from '../../core/auth/permission-matrix.js';
import { enrichAudit } from '../../core/audit/audit-context.js';
import { ChangeRequestsService } from './change-requests.service.js';
import {
  RaiseChangeRequestDto,
  RejectRevisionDto,
  ReviseChangeRequestDto,
} from './dto/change-requests.dto.js';

/**
 * FG-9 — Change requests & amendments (REQ-CR, SM-CR §3.7, BR-02, BR-03).
 *
 * The open step's **executor raises** a change request (`changerequest.raise`,
 * §2.2 — Mechanic / Warehouse Manager / Field Coordinator / System Admin); the
 * WO **creator decides** it — the decide routes carry `wo.create` (held by the
 * WO-creating roles, Planner / System Admin) and the service additionally
 * enforces that the caller is the actual WO creator or a System Admin, so a
 * non-creator decision is refused (REQ-CR-001, BR-03). Raising moves the WO to Pending_Amendment
 * (SM-WO T8) and the engine freezes the open step; approving applies the
 * revision, raises the amendment number and restores the WO status (SM-WO T9);
 * rejecting discards it and restores the status (SM-WO T10).
 *
 * Endpoints:
 *   - `GET  /change-requests?workOrderId=` — list CRs for a WO (newest first).
 *   - `GET  /change-requests/:id`          — one CR.
 *   - `POST /change-requests`              — raise (executor, REQ-CR-001).
 *   - `POST /change-requests/:id/open`     — creator opens for revision (SM-CR Open).
 *   - `POST /change-requests/:id/revise`   — creator sends the revision (SM-CR SendRevision).
 *   - `POST /change-requests/:id/approve`  — Approver approves (SM-CR Approve, SM-WO T9).
 *   - `POST /change-requests/:id/reject`   — Approver rejects with a reason (SM-CR Reject, SM-WO T10).
 *
 * Every mutating call runs through the global ValidationPipe +
 * IdempotencyInterceptor and leaves exactly one audit record via the
 * AuditInterceptor enriched through the per-request audit-context.
 */
@Controller('change-requests')
export class ChangeRequestsController {
  constructor(private readonly changeRequests: ChangeRequestsService) {}

  // --- reads ---------------------------------------------------------------

  @Get()
  list(@Query('workOrderId', ParseIntPipe) workOrderId: number): { changeRequests: readonly ChangeRequestDto[] } {
    return { changeRequests: this.changeRequests.listForWorkOrder(workOrderId) };
  }

  @Get(':id')
  view(@Param('id', ParseIntPipe) id: number): { changeRequest: ChangeRequestDto } {
    return { changeRequest: this.changeRequests.require(id) };
  }

  // --- raise (executor) ----------------------------------------------------

  /** The open step's executor raises a change request (REQ-CR-001, BR-03). */
  @Post()
  @RequireCapability(Capabilities.ChangeRequestRaise)
  @HttpCode(HttpStatus.CREATED)
  async raise(
    @Req() req: AuthenticatedRequest,
    @Body() dto: RaiseChangeRequestDto,
  ): Promise<{ changeRequest: ChangeRequestDto }> {
    const user = this.principal(req);
    const changeRequest = await this.changeRequests.raise(user, {
      assignmentId: dto.assignmentId,
      whatChanges: dto.whatChanges,
      requestedChange: dto.requestedChange,
      reason: dto.reason,
    });
    this.audit(req, changeRequest, 'raise_change_request');
    return { changeRequest };
  }

  // --- creator opens & sends the revision ----------------------------------

  /** The WO creator opens the CR for revision (SM-CR Open). */
  @Post(':id/open')
  @RequireCapability(Capabilities.WoCreate)
  @HttpCode(HttpStatus.OK)
  async open(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<{ changeRequest: ChangeRequestDto }> {
    const user = this.principal(req);
    const changeRequest = await this.changeRequests.open(id, user);
    this.audit(req, changeRequest, 'open_change_request');
    return { changeRequest };
  }

  /** The WO creator revises the content and sends it for approval (REQ-CR-003). */
  @Post(':id/revise')
  @RequireCapability(Capabilities.WoCreate)
  @HttpCode(HttpStatus.OK)
  async revise(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReviseChangeRequestDto,
  ): Promise<{ changeRequest: ChangeRequestDto }> {
    const user = this.principal(req);
    const changeRequest = await this.changeRequests.sendRevision(id, user, {
      ...(dto.category === undefined ? {} : { category: dto.category }),
      ...(dto.priority === undefined ? {} : { priority: dto.priority }),
      ...(dto.requiresDowntime === undefined ? {} : { requiresDowntime: dto.requiresDowntime }),
      ...(dto.description === undefined ? {} : { description: dto.description }),
      ...(dto.revisedSteps === undefined ? {} : { revisedSteps: dto.revisedSteps }),
      ...(dto.vehicleId === undefined ? {} : { vehicleId: dto.vehicleId }),
    });
    this.audit(req, changeRequest, 'revise_change_request');
    return { changeRequest };
  }

  // --- decide --------------------------------------------------------------

  /** An Approver approves the revision (REQ-CR-004, SM-WO T9). */
  @Post(':id/approve')
  @RequireCapability(Capabilities.WoCreate)
  @HttpCode(HttpStatus.OK)
  async approve(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<{ changeRequest: ChangeRequestDto }> {
    const user = this.principal(req);
    const changeRequest = await this.changeRequests.approveRevision(id, user);
    this.audit(req, changeRequest, 'approve_change_request');
    return { changeRequest };
  }

  /** An Approver rejects the revision with a reason (REQ-CR-005, SM-WO T10). */
  @Post(':id/reject')
  @RequireCapability(Capabilities.WoCreate)
  @HttpCode(HttpStatus.OK)
  async reject(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RejectRevisionDto,
  ): Promise<{ changeRequest: ChangeRequestDto }> {
    const user = this.principal(req);
    const changeRequest = await this.changeRequests.rejectRevision(id, user, dto.reason);
    this.audit(req, changeRequest, `reject_change_request:${dto.reason}`);
    return { changeRequest };
  }

  // --- helpers -------------------------------------------------------------

  private principal(req: AuthenticatedRequest): CurrentUser {
    if (!req.currentUser) {
      throw new UnauthorizedException('Authentication required.');
    }
    return req.currentUser;
  }

  private audit(req: AuthenticatedRequest, cr: ChangeRequestDto, reason: string): void {
    enrichAudit(req, {
      entity: 'wo_change_requests',
      entityId: idValue(cr.id),
      after: { workOrderId: idValue(cr.workOrderId), status: cr.status },
      reason,
    });
  }
}
