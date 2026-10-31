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
import { MobilisasiStepService } from './mobilisasi-step.service.js';
import { StooringRatesService } from './stooring-rates.service.js';
import { ArrivalCheckDto, TrailPointDto } from './dto/mobilisasi.dto.js';

/**
 * FG-5a — Mobilisasi (mobilisation) step (REQ-MBL, SM-STEP, RSK-09, DEC-90).
 *
 * The *lifecycle* transitions (Start/Submit/Verify) run through the generic
 * engine (`/assignments/:id/...`); these endpoints carry the module-specific
 * data the step handler consumes and the privacy-scoped trail:
 *   - `GET  /mobilisasi/rates`          — the active stooring-rate regions (REQ-MEC-010).
 *   - `POST /mobilisasi/:id/route`      — open the route to the driver's destination (REQ-MBL-003).
 *   - `POST /mobilisasi/:id/trail`      — record one In_Progress trail point (REQ-MBL-005).
 *   - `POST /mobilisasi/:id/arrival`    — test arrival / whether to auto-submit (REQ-MBL-004).
 *   - `GET  /mobilisasi/:id/trail`      — read the trail (Planner/SA only, every read logged, RSK-09).
 *   - `GET  /mobilisasi/:id`            — the step's destination, region, charge + cost (for the UI).
 *
 * Every mutating call carries the §2.2 RolesGuard (`mobilisasi.execute`), the
 * global ValidationPipe, the IdempotencyInterceptor and one audit record. The
 * stooring fee (REQ-MBL-006) is charged by the submit handler inside the
 * engine's submit transaction — there is no endpoint for it; both the
 * auto-submit on arrival and the manual "Finish stooring" submit go through
 * `/assignments/:id/submit`.
 */
@Controller('mobilisasi')
export class MobilisasiController {
  constructor(
    private readonly assignments: AssignmentsService,
    private readonly mobilisasi: MobilisasiStepService,
    private readonly rates: StooringRatesService,
  ) {}

  /** The active stooring-rate regions a Mobilisasi destination may map to (REQ-MEC-010). */
  @Get('rates')
  ratesList(): { rates: unknown } {
    return { rates: this.rates.listActive() };
  }

  /**
   * Open the route to the driver's captured destination and begin the trail
   * window (REQ-MBL-003). "Opening a route" returns the destination + region
   * payload the client renders; there is no third-party map integration in
   * Phase 1. The engine Start (`/assignments/:id/start`) must have moved the
   * step to In_Progress first.
   */
  @Post(':id/route')
  @RequireCapability(Capabilities.MobilisasiExecute)
  @HttpCode(HttpStatus.OK)
  async openRoute(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<{ route: unknown }> {
    this.principal(req);
    const step = await this.assignments.require(id);
    const route = this.mobilisasi.start(step);
    this.audit(req, step, 'mobilisasi_open_route');
    return { route };
  }

  /**
   * Record one point of the mechanic's location trail (REQ-MBL-005). Accepted
   * **only while the step is In_Progress** — a point before Start or after
   * Submit is refused (the RSK-09 / UU-PDP privacy boundary).
   */
  @Post(':id/trail')
  @RequireCapability(Capabilities.MobilisasiExecute)
  @HttpCode(HttpStatus.OK)
  async recordTrail(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: TrailPointDto,
  ): Promise<{ ok: true }> {
    this.principal(req);
    const step = await this.assignments.require(id);
    this.mobilisasi.recordPoint(step, {
      lat: dto.lat,
      lng: dto.lng,
      ...(dto.accuracyM === undefined ? {} : { accuracyM: dto.accuracyM }),
    });
    this.audit(req, step, 'mobilisasi_trail_point');
    return { ok: true };
  }

  /**
   * Test whether the mechanic has reached the destination (REQ-MBL-004). The
   * client auto-submits the step (`/assignments/:id/submit`) when this returns
   * `arrived: true`; a manual "Finish stooring" submits regardless.
   */
  @Post(':id/arrival')
  @RequireCapability(Capabilities.MobilisasiExecute)
  @HttpCode(HttpStatus.OK)
  async checkArrival(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ArrivalCheckDto,
  ): Promise<{ arrived: boolean }> {
    this.principal(req);
    const step = await this.assignments.require(id);
    return { arrived: this.mobilisasi.hasArrived(step, { lat: dto.lat, lng: dto.lng }) };
  }

  /**
   * Read the step's location trail (REQ-MBL-005, RSK-09 / UU-PDP). Visible to a
   * **Planner or the System Admin only** (any other role is refused 403 by the
   * service), and **every read writes an access-log record** — this GET is not
   * covered by the mutating-only AuditInterceptor, so the service appends the
   * record explicitly.
   */
  @Get(':id/trail')
  @RequireCapability(Capabilities.StepVerify)
  async viewTrail(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<{ step: AssignmentDto; trail: unknown }> {
    const user = this.principal(req);
    const step = await this.assignments.require(id);
    const trail = this.mobilisasi.readTrail(step, user);
    return { step, trail };
  }

  /** The step's destination, region, charge and WO stooring cost (for the UI). */
  @Get(':id')
  async view(@Param('id', ParseIntPipe) id: number): Promise<{
    step: AssignmentDto;
    destination: unknown;
    charge: unknown;
    stooringCost: number;
  }> {
    const step = await this.assignments.require(id);
    return {
      step,
      destination: this.mobilisasi.destinationOf(step),
      charge: this.mobilisasi.chargeOf(id) ?? null,
      stooringCost: this.mobilisasi.stooringCostOf(idValue(step.workOrderId)),
    };
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
