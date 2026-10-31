import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  VehicleStatus,
  WorkOrderStatus,
  TyreStatus,
  toId,
  idValue,
  type VehicleDto,
} from '@bmi/shared';
import type { DataGateway } from '@bmi/data-gateway';
import { DATA_GATEWAY } from '../../core/data-gateway/data-gateway.module.js';
import { VehicleClassService } from './vehicle-class.service.js';
import { DocumentService } from './document.service.js';
import { OdometerService } from './odometer.service.js';
import { VehicleStatusService } from './vehicle-status.service.js';

/** WO statuses that count as "open" for the class-change / deactivate guards. */
const OPEN_WO_STATUSES: ReadonlySet<WorkOrderStatus> = new Set([
  WorkOrderStatus.Draft,
  WorkOrderStatus.PendingApproval,
  WorkOrderStatus.Active,
  WorkOrderStatus.InProgress,
  WorkOrderStatus.PendingVerification,
  WorkOrderStatus.PendingAmendment,
]);

/** A vehicle projected with its current driver + fresh derived status. */
export interface VehicleView {
  readonly vehicle: VehicleDto;
  readonly driverId: number | null;
}

/**
 * Vehicles — registration, edit, deactivation, driver assignment and the
 * derived status (REQ-VEH-002..004, REQ-VEH-010; SM-VEH).
 *
 * Vehicles themselves live in the dummy gateway's `vehicles` repository (one of
 * its nine aggregates), so all vehicle writes go through the gateway's
 * version-checked `unitOfWork`. The derived status is recomputed from the
 * governing facts via {@link VehicleStatusService} and written back into
 * `vehicles.status` — it is never set directly by a caller.
 *
 * Deactivation (`deactivated_at`) and driver assignment (`drivers.assigned_vehicle_id`)
 * are not modelled on the gateway's `VehicleDto` in Phase 1, so — following the
 * TASK-103/104/105 precedent — they are tracked in API-layer in-memory maps;
 * TASK-201 re-homes them behind PRD §9.3 (`vehicles.deactivated_at`, `drivers`)
 * unchanged.
 */
@Injectable()
export class VehiclesService {
  /** vehicleId → deactivation reason (presence = deactivated). */
  private readonly deactivated = new Map<number, string>();
  /** vehicleId → driverId (one driver per vehicle). */
  private readonly driverOf = new Map<number, number>();

  constructor(
    @Inject(DATA_GATEWAY) private readonly gateway: DataGateway,
    private readonly classes: VehicleClassService,
    private readonly documents: DocumentService,
    private readonly odometer: OdometerService,
    private readonly statuses: VehicleStatusService,
  ) {}

  /** Register a vehicle (REQ-VEH-002). Unique plate; class/layout must be known. */
  async create(input: {
    plate: string;
    classId: number;
    chassisLayoutId?: number;
    odometerKm?: number;
    customerId?: number;
  }): Promise<VehicleDto> {
    const plate = input.plate.trim();
    if (plate.length === 0) {
      throw new BadRequestException('Plate is required.');
    }
    const vehicleClass = this.classes.requireClass(input.classId);
    const layoutId = input.chassisLayoutId ?? vehicleClass.defaultChassisLayoutId;
    this.classes.requireLayout(layoutId);

    const existing = await this.gateway.repos.vehicles.list();
    if (existing.some((v) => v.plate.trim().toUpperCase() === plate.toUpperCase())) {
      throw new ConflictException(`A vehicle with plate ${plate} already exists.`);
    }

    // A Towed unit has no odometer (REQ-PLC-018): force 0.
    const odometerKm = vehicleClass.unitKind === 'Towed' ? 0 : (input.odometerKm ?? 0);

    const created = await this.gateway.unitOfWork(async (ctx) =>
      ctx.repos.vehicles.insert({
        plate,
        classId: toId<'VehicleClassId'>(input.classId),
        chassisLayoutId: toId<'ChassisLayoutId'>(layoutId),
        odometerKm,
        // Status is derived; a fresh vehicle with no WO/document opens Active.
        status: VehicleStatus.Active,
        customerId:
          input.customerId === undefined ? null : toId<'CustomerId'>(input.customerId),
      }),
    );
    // Recompute and persist the derived status from its facts (blocking docs
    // appear once first-entry documents are added).
    return this.recomputeStatus(idValue(created.id));
  }

  /** Edit a vehicle (REQ-VEH-003). Class/layout change refused if a tyre is mounted or a WO is open. */
  async edit(
    id: number,
    input: {
      version: number;
      classId?: number;
      chassisLayoutId?: number;
      customerId?: number;
    },
  ): Promise<VehicleDto> {
    const changesClassOrLayout =
      input.classId !== undefined || input.chassisLayoutId !== undefined;
    if (changesClassOrLayout) {
      if (await this.hasMountedTyre(id)) {
        throw new ConflictException(
          'Cannot change class or layout while a tyre is mounted (REQ-VEH-003).',
        );
      }
      if (await this.hasOpenWorkOrder(id)) {
        throw new ConflictException(
          'Cannot change class or layout while a WO is open (REQ-VEH-003).',
        );
      }
      if (input.classId !== undefined) {
        this.classes.requireClass(input.classId);
      }
      if (input.chassisLayoutId !== undefined) {
        this.classes.requireLayout(input.chassisLayoutId);
      }
    }

    const updated = await this.gateway.unitOfWork(async (ctx) => {
      const current = await ctx.repos.vehicles.requireById(id);
      if (current.version !== input.version) {
        throw new ConflictException('Vehicle was modified concurrently; reload and retry.');
      }
      return ctx.repos.vehicles.update({
        ...current,
        ...(input.classId !== undefined
          ? { classId: toId<'VehicleClassId'>(input.classId) }
          : {}),
        ...(input.chassisLayoutId !== undefined
          ? { chassisLayoutId: toId<'ChassisLayoutId'>(input.chassisLayoutId) }
          : {}),
        ...(input.customerId !== undefined
          ? { customerId: toId<'CustomerId'>(input.customerId) }
          : {}),
      });
    });
    return this.recomputeStatus(idValue(updated.id));
  }

  /** Deactivate a vehicle (REQ-VEH-004). Refused while a WO is open. */
  async deactivate(id: number, input: { version: number; reason: string }): Promise<VehicleDto> {
    await this.requireVehicle(id);
    if (await this.hasOpenWorkOrder(id)) {
      throw new ConflictException('Cannot deactivate a vehicle while a WO is open (REQ-VEH-004).');
    }
    this.deactivated.set(id, input.reason);
    // Optimistic-lock the write that flips the derived status to Inactive.
    await this.gateway.unitOfWork(async (ctx) => {
      const current = await ctx.repos.vehicles.requireById(id);
      if (current.version !== input.version) {
        throw new ConflictException('Vehicle was modified concurrently; reload and retry.');
      }
      return ctx.repos.vehicles.update({ ...current, status: VehicleStatus.Inactive });
    });
    return this.recomputeStatus(id);
  }

  /**
   * Set the current driver of a vehicle (REQ-VEH-010): one driver per vehicle,
   * one vehicle per driver. Assigning a driver to a new vehicle releases the
   * driver's old vehicle (AC-VEH-004).
   */
  async setDriver(id: number, driverId: number): Promise<{ vehicleId: number; driverId: number }> {
    await this.requireVehicle(id);
    // Enforce one-vehicle-per-driver: drop the driver from any other vehicle.
    for (const [vehicleId, existingDriver] of [...this.driverOf.entries()]) {
      if (existingDriver === driverId && vehicleId !== id) {
        this.driverOf.delete(vehicleId);
      }
    }
    this.driverOf.set(id, driverId);
    return { vehicleId: id, driverId };
  }

  /** The vehicle currently assigned to a driver, or `null` (REQ-VEH-010 driver app). */
  vehicleForDriver(driverId: number): number | null {
    for (const [vehicleId, assigned] of this.driverOf.entries()) {
      if (assigned === driverId) {
        return vehicleId;
      }
    }
    return null;
  }

  /** Record a manual odometer reading and persist the recomputed odometer (REQ-VEH-006). */
  async recordOdometer(
    id: number,
    input: {
      reading: number;
      readingAt: string;
      source?: 'Admin' | 'Driver' | 'GPS';
      note?: string | null;
      recordedBy?: number | null;
    },
  ): Promise<{ vehicle: VehicleDto; warning: string | null; jumpWarning: boolean }> {
    await this.requireVehicle(id);
    const result = this.odometer.record({ vehicleId: id, ...input });
    const vehicle = await this.persistOdometer(id, result.currentOdometer);
    return { vehicle, warning: result.warning, jumpWarning: result.log.jumpWarning };
  }

  /** Void an odometer reading and recompute the vehicle odometer (REQ-VEH-007). */
  async voidOdometer(
    vehicleId: number,
    logId: number,
    input: { reason: string; voidedBy: number | null },
  ): Promise<VehicleDto> {
    await this.requireVehicle(vehicleId);
    const log = this.odometer.getLog(logId);
    if (!log || log.vehicleId !== vehicleId) {
      throw new NotFoundException(`Unknown odometer reading ${logId} for vehicle ${vehicleId}.`);
    }
    const result = this.odometer.void({ logId, reason: input.reason, voidedBy: input.voidedBy });
    return this.persistOdometer(vehicleId, result.currentOdometer);
  }

  /** Read a vehicle with its driver and a freshly recomputed status. */
  async view(id: number): Promise<VehicleView> {
    const vehicle = await this.recomputeStatus(id);
    return { vehicle, driverId: this.driverOf.get(id) ?? null };
  }

  /** Every vehicle (read). Status is each row's stored derived value. */
  async list(): Promise<readonly VehicleDto[]> {
    return this.gateway.repos.vehicles.list();
  }

  /**
   * Whether the vehicle may be assigned to trips. Blocked by a Missing/Expired
   * document (REQ-DOC-005) or by deactivation (REQ-VEH-004). OFF and Repair do
   * NOT block trips (DEC-92: OFF does not even block WO creation/amendment).
   */
  async canAssignToTrips(id: number): Promise<boolean> {
    const vehicle = await this.recomputeStatus(id);
    return (
      vehicle.status !== VehicleStatus.Blocked && vehicle.status !== VehicleStatus.Inactive
    );
  }

  /** Recompute the derived status from its facts and persist it (SM-VEH). */
  async recomputeStatus(id: number, now: Date = new Date()): Promise<VehicleDto> {
    const vehicle = await this.requireVehicle(id);
    const isDeactivated = this.deactivated.has(id);
    const hasBlockingDocument = await this.documents.hasBlockingDocument(
      id,
      idValue(vehicle.classId),
    );
    const status = await this.statuses.computeStatus(
      id,
      { isDeactivated, hasBlockingDocument },
      now,
    );
    if (status === vehicle.status) {
      return vehicle;
    }
    return this.gateway.unitOfWork(async (ctx) => {
      const current = await ctx.repos.vehicles.requireById(id);
      return ctx.repos.vehicles.update({ ...current, status });
    });
  }

  /** Test-only reset of the in-memory deactivation/driver maps. */
  resetForTests(): void {
    this.deactivated.clear();
    this.driverOf.clear();
  }

  private async requireVehicle(id: number): Promise<VehicleDto> {
    const vehicle = await this.gateway.repos.vehicles.getById(id);
    if (!vehicle) {
      throw new NotFoundException(`Unknown vehicle: ${id}`);
    }
    return vehicle;
  }

  /** Persist a recomputed current odometer through the gateway (version-checked). */
  private async persistOdometer(id: number, odometerKm: number): Promise<VehicleDto> {
    await this.gateway.unitOfWork(async (ctx) => {
      const current = await ctx.repos.vehicles.requireById(id);
      if (current.odometerKm === odometerKm) {
        return current;
      }
      return ctx.repos.vehicles.update({ ...current, odometerKm });
    });
    // PM due dates would recalc here (REQ-VEH-006) — owned by TASK-114's job.
    return this.recomputeStatus(id);
  }

  private async hasOpenWorkOrder(vehicleId: number): Promise<boolean> {
    const wos = await this.gateway.repos.workOrders.findBy(
      'vehicleId',
      toId<'VehicleId'>(vehicleId),
    );
    return wos.some((wo) => OPEN_WO_STATUSES.has(wo.status));
  }

  private async hasMountedTyre(vehicleId: number): Promise<boolean> {
    // A tyre is mounted to a vehicle via its WOs in Phase 1; a mounted tyre has
    // status Mounted and an issuing WO belonging to this vehicle.
    const wos = await this.gateway.repos.workOrders.findBy(
      'vehicleId',
      toId<'VehicleId'>(vehicleId),
    );
    const woIds = new Set(wos.map((wo) => idValue(wo.id)));
    const tyres = await this.gateway.repos.tyres.list();
    return tyres.some(
      (t) =>
        t.status === TyreStatus.Mounted &&
        t.issuedWorkOrderId !== null &&
        woIds.has(idValue(t.issuedWorkOrderId)),
    );
  }
}
