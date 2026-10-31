import { Body, Controller, Get, HttpCode, HttpStatus, Put, Req } from '@nestjs/common';
import type { AuthenticatedRequest } from '../../core/auth/current-user.js';
import { RequireCapability } from '../../core/auth/require-capability.decorator.js';
import { Capabilities } from '../../core/auth/permission-matrix.js';
import { enrichAudit } from '../../core/audit/audit-context.js';
import { PermissionsService } from './permissions.service.js';
import { PlannerApprovalSwitchDto } from './dto/permissions.dto.js';

/**
 * FG-13 roles & permissions (REQ-IAM-005/008).
 *
 * The matrix read and the Planner-approval switch both sit behind the §2.2
 * `accounts.manage` capability (Access Manager only, RL-5) — the same locked
 * cell that refuses the System Admin, consistent with the accounts routes. The
 * matrix is served read-only with each cell's locked flag; the switch write is
 * audited by the global interceptor and enriched with its reason.
 */
@Controller('roles')
@RequireCapability(Capabilities.AccountsManage)
export class PermissionsController {
  constructor(private readonly permissions: PermissionsService) {}

  /** The full §2.2 matrix, role by role, with locked flags (REQ-IAM-005). */
  @Get('permissions')
  readMatrix(): { roles: ReturnType<PermissionsService['readMatrix']> } {
    return { roles: this.permissions.readMatrix() };
  }

  /** Current Planner-approval switch state (REQ-IAM-008). */
  @Get('planner-approval')
  readPlannerApproval(): ReturnType<PermissionsService['getPlannerApproval']> {
    return this.permissions.getPlannerApproval();
  }

  /** Switch Planner approval on/off with a reason (REQ-IAM-008). */
  @Put('planner-approval')
  @HttpCode(HttpStatus.OK)
  setPlannerApproval(
    @Req() req: AuthenticatedRequest,
    @Body() dto: PlannerApprovalSwitchDto,
  ): ReturnType<PermissionsService['setPlannerApproval']> {
    const state = this.permissions.setPlannerApproval({
      on: dto.on,
      until: dto.until ?? null,
      kinds: dto.kinds ?? [],
    });
    enrichAudit(req, {
      entity: 'app_settings',
      reason: dto.reason,
      after: { plannerApproval: state },
    });
    return state;
  }
}
