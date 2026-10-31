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
import { MechanicActionStepService } from './mechanic-action-step.service.js';
import { PartCheckStepService } from './part-check-step.service.js';
import { ServiceCatalogService } from './service-catalog.service.js';
import { StageMechanicActionDto, StagePartCheckDto } from './dto/mechanic.dto.js';

/**
 * FG-5 — Mechanic Action & Part Check (REQ-MEC, REQ-CHK, DEC-88/89/90).
 *
 * The *lifecycle* transitions (Start/Submit/Verify) run through the generic
 * engine (`/assignments/:id/...`); these endpoints carry the module-specific
 * data the engine's step handlers consume:
 *   - `GET  /mechanic/catalog`              — the active service catalog (REQ-MEC-002).
 *   - `POST /mechanic/action/:id/stage`     — stage a Mechanic Action (team, services, photos).
 *   - `POST /mechanic/check/:id/stage`      — stage a Part Check (results + check service).
 *
 * Every mutating call carries the §2.2 RolesGuard (`mechanic.execute`), the
 * global ValidationPipe, the IdempotencyInterceptor and one audit record. The
 * follow-up Draft WO (REQ-CHK-003) is created by the Part Check *verify* handler
 * inside the engine's verify transaction — there is no endpoint for it.
 */
@Controller('mechanic')
export class MechanicController {
  constructor(
    private readonly assignments: AssignmentsService,
    private readonly mechanicAction: MechanicActionStepService,
    private readonly partCheck: PartCheckStepService,
    private readonly catalog: ServiceCatalogService,
  ) {}

  /** The active service catalog the Internal team may pick (REQ-MEC-002/005). */
  @Get('catalog')
  catalogList(): { services: unknown } {
    return { services: this.catalog.listActive() };
  }

  // --- Mechanic Action -----------------------------------------------------

  /** The staged/submitted Mechanic Action of a step (for the UI). */
  @Get('action/:id')
  async viewAction(@Param('id', ParseIntPipe) id: number): Promise<{
    step: AssignmentDto;
    staged: unknown;
    action: unknown;
    laborCost: number;
  }> {
    const step = await this.assignments.require(id);
    return {
      step,
      staged: this.mechanicAction.stagedOf(id) ?? null,
      action: this.mechanicAction.actionOf(id) ?? null,
      laborCost: this.mechanicAction.laborCostOf(idValue(step.workOrderId)),
    };
  }

  /**
   * Stage a Mechanic Action step before the engine submit (REQ-MEC-001..003).
   * DEC-90: no location or stooring is ever accepted here — the DTO carries none.
   */
  @Post('action/:id/stage')
  @RequireCapability(Capabilities.MechanicExecute)
  @HttpCode(HttpStatus.OK)
  async stageAction(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: StageMechanicActionDto,
  ): Promise<{ ok: true }> {
    this.principal(req);
    const step = await this.assignments.require(id);
    this.mechanicAction.stage(id, {
      team: dto.team,
      ...(dto.internalServices === undefined ? {} : { internalServices: dto.internalServices }),
      ...(dto.vendor === undefined ? {} : { vendor: dto.vendor }),
      ...(dto.externalServices === undefined ? {} : { externalServices: dto.externalServices }),
      ...(dto.photos === undefined ? {} : { photos: dto.photos }),
    });
    this.audit(req, step, 'stage_mechanic_action');
    return { ok: true };
  }

  // --- Part Check ----------------------------------------------------------

  /** The listed items + submitted check of a step (for the UI). */
  @Get('check/:id')
  async viewCheck(@Param('id', ParseIntPipe) id: number): Promise<{
    step: AssignmentDto;
    items: unknown;
    staged: unknown;
    submission: unknown;
    followUpWorkOrderId: number | undefined;
    serviceCost: number;
  }> {
    const step = await this.assignments.require(id);
    return {
      step,
      items: this.partCheck.itemsOf(id),
      staged: this.partCheck.stagedOf(id) ?? null,
      submission: this.partCheck.submissionOf(id) ?? null,
      followUpWorkOrderId: this.partCheck.followUpWorkOrderIdOf(id),
      serviceCost: this.partCheck.serviceCostOf(idValue(step.workOrderId)),
    };
  }

  /**
   * Stage a Part Check step before the engine submit (REQ-CHK-002/007). The
   * follow-up Draft WO (if any) is created when a Planner/SA later verifies the
   * step (REQ-CHK-003), not here.
   */
  @Post('check/:id/stage')
  @RequireCapability(Capabilities.MechanicExecute)
  @HttpCode(HttpStatus.OK)
  async stageCheck(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: StagePartCheckDto,
  ): Promise<{ ok: true }> {
    this.principal(req);
    const step = await this.assignments.require(id);
    this.partCheck.stage(id, {
      team: dto.team,
      results: dto.results.map((r) => ({
        lineNo: r.lineNo,
        conditionNote: r.conditionNote,
        decision: r.decision,
        ...(r.unsafeToDrive === undefined ? {} : { unsafeToDrive: r.unsafeToDrive }),
        ...(r.photos === undefined ? {} : { photos: r.photos }),
      })),
      ...(dto.addedParts === undefined ? {} : { addedParts: dto.addedParts }),
      ...(dto.internalServices === undefined ? {} : { internalServices: dto.internalServices }),
      ...(dto.vendor === undefined ? {} : { vendor: dto.vendor }),
      ...(dto.externalServices === undefined ? {} : { externalServices: dto.externalServices }),
      ...(dto.invoiceImages === undefined ? {} : { invoiceImages: dto.invoiceImages }),
    });
    this.audit(req, step, 'stage_part_check');
    return { ok: true };
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
