import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { AuthenticatedRequest, CurrentUser } from '../../core/auth/current-user.js';
import { RequireCapability } from '../../core/auth/require-capability.decorator.js';
import { Capabilities } from '../../core/auth/permission-matrix.js';
import { enrichAudit } from '../../core/audit/audit-context.js';
import {
  ApprovalsService,
  type ApprovalInboxItem,
  type ApprovalTab,
} from './approvals.service.js';
import { DecideApprovalDto } from './dto/approvals.dto.js';

/**
 * FG-10 — Approvals inbox (REQ-APR, BR-03, BR-04, DQ-07).
 *
 * The endpoints design.md names: `GET /approvals` (the unified inbox + count)
 * and `POST /approvals/:ref/decide` (route a decision to the owning service).
 * The inbox aggregates WO creation / amendment / completion / warehouse-count
 * items, ordered Urgent/High first (REQ-WO-015), hiding a viewer's own items
 * unless they are a System Admin (REQ-APR-006). A reviewed part-replacing item
 * carries the part-age / early-failure signal (DQ-07, REQ-APR-011).
 *
 * A decision is routed to the owning service (WorkOrders / ChangeRequests /
 * PartsInventory / TyreRegister) — the inbox never duplicates approve/reject
 * logic — so four-eyes (BR-03) and SM-WO/SM-CR/SM-TYRE stay enforced there.
 * Every mutating call carries the §2.2 RolesGuard (WO/amendment decisions
 * `wo.approve`; warehouse counts `count.approve`), the global ValidationPipe,
 * the IdempotencyInterceptor and exactly one audit record.
 */
@Controller('approvals')
export class ApprovalsController {
  constructor(private readonly approvals: ApprovalsService) {}

  /** The unified approvals inbox for the viewer, with the badge count (REQ-APR-001). */
  @Get()
  async inbox(
    @Req() req: AuthenticatedRequest,
    @Query('tab') tab?: string,
  ): Promise<{ items: readonly ApprovalInboxItem[]; count: number }> {
    const user = this.principal(req);
    const items = await this.approvals.inbox(
      user,
      tab === 'WorkOrders' || tab === 'Warehouse' ? (tab as ApprovalTab) : undefined,
    );
    return { items, count: items.length };
  }

  /**
   * Route a decision (`approve`/`reject`) to the owning service for the inbox
   * `ref` (`kind:id`). A WO/amendment decision needs `wo.approve`; the guard
   * refuses other roles a 403. Four-eyes and the state machines are enforced by
   * the owning service.
   */
  @Post(':ref/decide')
  @RequireCapability(Capabilities.WoApprove)
  @HttpCode(HttpStatus.OK)
  async decide(
    @Req() req: AuthenticatedRequest,
    @Param('ref') ref: string,
    @Body() dto: DecideApprovalDto,
  ): Promise<{ result: unknown }> {
    const user = this.principal(req);
    const result = await this.approvals.decide(user, ref, {
      action: dto.action,
      ...(dto.reason === undefined ? {} : { reason: dto.reason }),
      ...(dto.version === undefined ? {} : { version: dto.version }),
    });
    this.audit(req, ref, dto.action, dto.reason);
    return { result };
  }

  /**
   * Route a **warehouse count** decision (stock opname / tyre count) — needs
   * `count.approve` (§2.2: Warehouse Manager counts; Supervisor/GM/System Admin
   * approve). Kept separate from the WO decide route so each carries the right
   * capability (a WO approver is not automatically a count approver).
   */
  @Post('warehouse/:ref/decide')
  @RequireCapability(Capabilities.CountApprove)
  @HttpCode(HttpStatus.OK)
  async decideWarehouse(
    @Req() req: AuthenticatedRequest,
    @Param('ref') ref: string,
    @Body() dto: DecideApprovalDto,
  ): Promise<{ result: unknown }> {
    const user = this.principal(req);
    const result = await this.approvals.decide(user, ref, {
      action: dto.action,
      ...(dto.reason === undefined ? {} : { reason: dto.reason }),
    });
    this.audit(req, ref, dto.action, dto.reason);
    return { result };
  }

  // --- helpers -------------------------------------------------------------

  private principal(req: AuthenticatedRequest): CurrentUser {
    if (!req.currentUser) {
      throw new UnauthorizedException('Authentication required.');
    }
    return req.currentUser;
  }

  private audit(req: AuthenticatedRequest, ref: string, action: string, reason?: string): void {
    enrichAudit(req, {
      entity: 'work_order_approvals',
      after: { ref, action },
      reason: reason ? `${action}:${reason}` : action,
    });
  }
}
