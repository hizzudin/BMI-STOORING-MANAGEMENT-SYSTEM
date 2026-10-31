import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseIntPipe,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import {
  idValue,
  type AssignmentDto,
  type TyreDto,
  type TyreStatus,
} from '@bmi/shared';
import type { DataGateway, TransactionRepositories } from '@bmi/data-gateway';
import type { AuthenticatedRequest, CurrentUser } from '../../core/auth/current-user.js';
import { RequireCapability } from '../../core/auth/require-capability.decorator.js';
import { Capabilities } from '../../core/auth/permission-matrix.js';
import { enrichAudit } from '../../core/audit/audit-context.js';
import { DATA_GATEWAY } from '../../core/data-gateway/data-gateway.module.js';
import { AssignmentsService } from '../assignments/assignments.service.js';
import { PlacementService } from './placement.service.js';
import {
  DemountTyreDto,
  MountTyreDto,
  RotateTyreDto,
  ScrapTyreDto,
} from './dto/placement.dto.js';

/**
 * FG-6 — Part Replacement step & chassis map (REQ-PLC, BR-11, SM-TYRE, DEC-73).
 *
 * The *lifecycle* transitions (Start/Submit/Verify) run through the generic
 * engine (`/assignments/:id/...`); these endpoints carry the module-specific
 * placement changes and read the data-generated map:
 *   - `GET  /placement/:id`              — the step's chassis map + snapshot (for the UI).
 *   - `GET  /placement/:id/history/:pos` — the append-only position history (REQ-PLC-009).
 *   - `POST /placement/:id/mount`        — mount/replace a tyre (REQ-PLC-002/003).
 *   - `POST /placement/:id/rotate`       — rotate / swap-with-spare (REQ-PLC-005/019).
 *   - `POST /placement/:id/demount`      — demount with a condition (REQ-PLC-004).
 *   - `POST /placement/:id/scrap`        — scrap a mounted tyre (REQ-PLC-002).
 *
 * Every mutating call carries the §2.2 RolesGuard (`mechanic.execute`), the
 * global ValidationPipe, the IdempotencyInterceptor and one audit record. Each
 * mutation runs inside the gateway's `unitOfWork`, so the SM-TYRE status write
 * is optimistic-lock-checked and **atomic with** the placement write (all-or-
 * nothing). The read endpoints are open to any role that can see the vehicle
 * (REQ-PLC-012); the edit controls live only on the mutating endpoints, which
 * the guard denies to roles without `mechanic.execute` (AC-PLC-005).
 */
@Controller('placement')
export class PlacementController {
  constructor(
    @Inject(DATA_GATEWAY) private readonly gateway: DataGateway,
    private readonly assignments: AssignmentsService,
    private readonly placement: PlacementService,
  ) {}

  /** The data-generated chassis map for a step's vehicle + any captured snapshot. */
  @Get(':id')
  async view(@Param('id', ParseIntPipe) id: number): Promise<{
    step: AssignmentDto;
    map: unknown;
    snapshot: unknown;
    changedPositions: readonly string[];
  }> {
    const step = await this.assignments.require(id);
    const wo = await this.gateway.repos.workOrders.requireById(idValue(step.workOrderId));
    const vehicle = await this.gateway.repos.vehicles.requireById(idValue(wo.vehicleId));
    const tyresById = await this.tyresById();
    return {
      step,
      map: this.placement.buildMap(vehicle, tyresById, id),
      snapshot: this.placement.snapshotOf(id) ?? null,
      changedPositions: this.placement.changedPositionsOf(id),
    };
  }

  /** The append-only position history (REQ-PLC-009): which tyre sat here, when, which WO. */
  @Get(':id/history/:position')
  async history(
    @Param('id', ParseIntPipe) id: number,
    @Param('position') position: string,
  ): Promise<{ history: unknown }> {
    const step = await this.assignments.require(id);
    const wo = await this.gateway.repos.workOrders.requireById(idValue(step.workOrderId));
    return { history: this.placement.historyOfPosition(idValue(wo.vehicleId), position) };
  }

  /** Mount (or replace) a tyre at a position (REQ-PLC-002/003, BR-11, SM-TYRE). */
  @Post(':id/mount')
  @RequireCapability(Capabilities.MechanicExecute)
  @HttpCode(HttpStatus.OK)
  async mount(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: MountTyreDto,
  ): Promise<{ placement: unknown }> {
    const user = this.principal(req);
    const step = await this.assignments.require(id);
    const placement = await this.gateway.unitOfWork(async (ctx) => {
      const { wo, vehicle } = await this.context(ctx.repos, step);
      return this.placement.mount(step, wo, vehicle, ctx.repos, user, {
        position: dto.position,
        tyreId: dto.tyreId,
        ...(dto.treadMm === undefined ? {} : { treadMm: dto.treadMm }),
        ...(dto.pressurePsi === undefined ? {} : { pressurePsi: dto.pressurePsi }),
      });
    });
    this.audit(req, step, 'placement_mount');
    return { placement };
  }

  /** Rotate a mounted tyre to another position, or swap two (REQ-PLC-005/019). */
  @Post(':id/rotate')
  @RequireCapability(Capabilities.MechanicExecute)
  @HttpCode(HttpStatus.OK)
  async rotate(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RotateTyreDto,
  ): Promise<{ ok: true }> {
    const user = this.principal(req);
    const step = await this.assignments.require(id);
    await this.gateway.unitOfWork(async (ctx) => {
      const { wo, vehicle } = await this.context(ctx.repos, step);
      await this.placement.rotate(step, wo, vehicle, ctx.repos, user, {
        fromPosition: dto.fromPosition,
        toPosition: dto.toPosition,
      });
    });
    this.audit(req, step, 'placement_rotate');
    return { ok: true };
  }

  /** Demount a tyre and set its condition (REQ-PLC-004, SM-TYRE). */
  @Post(':id/demount')
  @RequireCapability(Capabilities.MechanicExecute)
  @HttpCode(HttpStatus.OK)
  async demount(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: DemountTyreDto,
  ): Promise<{ ok: true }> {
    const user = this.principal(req);
    const step = await this.assignments.require(id);
    await this.gateway.unitOfWork(async (ctx) => {
      const { wo, vehicle } = await this.context(ctx.repos, step);
      await this.placement.demount(step, wo, vehicle, ctx.repos, user, {
        position: dto.position,
        condition: dto.condition as TyreStatus,
      });
    });
    this.audit(req, step, 'placement_demount');
    return { ok: true };
  }

  /** Scrap a mounted tyre from a position (REQ-PLC-002, SM-TYRE). */
  @Post(':id/scrap')
  @RequireCapability(Capabilities.MechanicExecute)
  @HttpCode(HttpStatus.OK)
  async scrap(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ScrapTyreDto,
  ): Promise<{ ok: true }> {
    const user = this.principal(req);
    const step = await this.assignments.require(id);
    await this.gateway.unitOfWork(async (ctx) => {
      const { wo, vehicle } = await this.context(ctx.repos, step);
      await this.placement.scrap(step, wo, vehicle, ctx.repos, user, { position: dto.position });
    });
    this.audit(req, step, 'placement_scrap');
    return { ok: true };
  }

  // --- helpers -------------------------------------------------------------

  /** Resolve the step's WO + vehicle inside the transaction. */
  private async context(
    repos: TransactionRepositories,
    step: AssignmentDto,
  ): Promise<{ wo: Awaited<ReturnType<TransactionRepositories['workOrders']['requireById']>>; vehicle: Awaited<ReturnType<TransactionRepositories['vehicles']['requireById']>> }> {
    const wo = await repos.workOrders.requireById(idValue(step.workOrderId));
    const vehicle = await repos.vehicles.requireById(idValue(wo.vehicleId));
    return { wo, vehicle };
  }

  /** Index every tyre by id for the map renderer. */
  private async tyresById(): Promise<ReadonlyMap<number, TyreDto>> {
    const tyres = await this.gateway.repos.tyres.list();
    const map = new Map<number, TyreDto>();
    for (const t of tyres) {
      map.set(idValue(t.id), t);
    }
    return map;
  }

  private principal(req: AuthenticatedRequest): CurrentUser {
    if (!req.currentUser) {
      throw new UnauthorizedException('Authentication required.');
    }
    return req.currentUser;
  }

  private audit(req: AuthenticatedRequest, step: AssignmentDto, reason: string): void {
    enrichAudit(req, {
      entity: 'part_placements',
      entityId: idValue(step.id),
      after: { sequence: step.sequence, module: step.moduleCode, status: step.status },
      reason,
    });
  }
}
