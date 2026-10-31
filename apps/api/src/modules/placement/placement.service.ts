import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DEMOUNT_TARGETS,
  idValue,
  InvalidTransitionError,
  smTyre,
  StepStatus,
  TyreEvent,
  TyreStatus,
  WorkOrderStatus,
  type AssignmentDto,
  type TyreDto,
  type VehicleDto,
  type WorkOrderDto,
} from '@bmi/shared';
import type { TransactionRepositories } from '@bmi/data-gateway';
import type { CurrentUser } from '../../core/auth/current-user.js';
import {
  VehicleClassService,
  type ChassisLayout,
  type PartPosition,
} from '../vehicles/vehicle-class.service.js';

/** The kinds of change logged against a position (`placement_act_t`, §9.1). */
export type PlacementAction = 'Mount' | 'Rotate' | 'Demount' | 'Scrap';

/**
 * One append-only placement-history row (`part_placement_logs`, §9).
 *
 * Never a silent overwrite (REQ-PLC-001/009): every mount/rotate/demount/scrap
 * adds a row recording which tyre, which position(s), when and by which WO/step.
 */
export interface PlacementLog {
  readonly id: number;
  readonly vehicleId: number;
  readonly workOrderId: number;
  readonly assignmentId: number;
  readonly action: PlacementAction;
  readonly tyreId: number;
  /** The position affected (the destination for a mount/rotate). */
  readonly position: string;
  /** The source position for a rotate (else `null`). */
  readonly fromPosition: string | null;
  /** The resulting tyre status after the action (SM-TYRE §3.6). */
  readonly resultingTyreStatus: TyreStatus;
  readonly treadMm: number | null;
  readonly pressurePsi: number | null;
  readonly at: string;
  readonly byUserId: number;
}

/** The live placement at a position (`part_placements`, §9). */
export interface Placement {
  readonly position: string;
  readonly tyreId: number;
  /** The WO/step that fitted the tyre (REQ-PLC-009). */
  readonly fittedByWorkOrderId: number;
  readonly fittedByAssignmentId: number;
  readonly fittedAt: string;
  readonly treadMm: number | null;
  readonly pressurePsi: number | null;
}

/** One rendered position on the chassis map (REQ-PLC-008/009). */
export interface MapPosition {
  readonly code: string;
  readonly positionKind: 'Wheel' | 'Spare';
  readonly label: string;
  /** The tyre occupying this position, or `null` for an empty slot. */
  readonly tyreId: number | null;
  readonly tyreCode: string | null;
  readonly serialNumber: string | null;
  /** The text status label (never colour alone, PRODUCT accessibility). */
  readonly status: 'Normal' | 'Due soon' | 'Act now' | 'Empty';
  readonly treadMm: number | null;
  /** Highlighted = changed in the currently open step (REQ-PLC-009). */
  readonly changedInStep: boolean;
}

/** The data-generated chassis map for a vehicle (REQ-PLC-008, DEC-73). */
export interface ChassisMap {
  readonly vehicleId: number;
  readonly chassisLayoutId: number;
  readonly axleCount: number;
  readonly tyreCount: number;
  readonly positions: readonly MapPosition[];
}

/** A captured placement snapshot for the WO document (REQ-PLC-014). */
export interface PlacementSnapshot {
  readonly assignmentId: number;
  readonly workOrderId: number;
  readonly vehicleId: number;
  readonly capturedAt: string;
  /** Every position and its occupant at capture time. */
  readonly positions: readonly {
    readonly code: string;
    readonly tyreId: number | null;
    readonly tyreCode: string | null;
  }[];
  /** The positions changed during the step (REQ-PLC-014 "table of changed positions"). */
  readonly changedPositions: readonly string[];
}

/** Default tread threshold (mm) below which a position reads "Act now" (REQ-PLC-007). */
const TREAD_ACT_NOW_MM = 3;
/** Tread band (mm) that reads "Due soon" (approaching the threshold). */
const TREAD_DUE_SOON_MM = 4;

/**
 * **Part Replacement step** business rules (FG-6, REQ-PLC, BR-11, SM-TYRE,
 * DEC-68, DEC-73).
 *
 * The Part Replacement step records where each tyre is mounted on the vehicle's
 * **data-generated chassis map** and shows the condition of every position.
 * It is a **data-driven registry module** (PR-6, REQ-REG-006): one registry row
 * (seeded in TASK-107) plus the handler this service exposes, registered into
 * the engine's `StepHandlerRegistry` — the generic engine never names
 * Part_Replacement.
 *
 * **Data-generated map (DEC-73, REQ-PLC-008):** the positions are GENERATED from
 * the vehicle's stored chassis layout, reusing the TASK-106 generator
 * ({@link VehicleClassService.generatePositions} via the vehicle's
 * `chassisLayoutId`) — never a per-vehicle hard-coded map. 1–6 axle layouts and
 * trailer/spare layouts all come out of the same generator.
 *
 * **Nothing changes outside a WO (BR-01/BR-02/BR-11):** a mount/rotate/demount/
 * scrap is permitted only through the open Part Replacement step of an **Active
 * / In_Progress WO**, for **that WO's vehicle**; a position outside the
 * vehicle's generated map, or a tyre not Issued to the WO, is refused.
 *
 * **SM-TYRE (§3.6):** a tyre's status moves through `@bmi/shared`'s `smTyre`
 * guard — Issued → Mounted (mount), Mounted → Mounted (rotate), Mounted →
 * Needs_Retread/Worn_Out/In_Stock (demount, condition chosen), Mounted →
 * Scrapped (scrap). A transition not in the §3.6 table is refused. The tyre
 * status write goes through the engine's transactional `tyres` repository so it
 * commits (or rolls back) **together with** the placement write.
 *
 * **Append-only history (REQ-PLC-001/009):** every action adds a
 * `part_placement_logs` row — never a silent overwrite.
 *
 * **Snapshot (REQ-PLC-014):** {@link onSubmit} captures the chassis placement
 * for the WO document (TASK-115 renders it black-and-white).
 *
 * Phase-1 modelling: the dummy gateway (TASK-102) carries `tyres` but no
 * `part_placements` / `part_placement_logs` / `placement_map_snapshots` /
 * `part_positions` tables, so — following the TASK-103..110a precedent for
 * cross-cutting Phase-1 state — the live placements, the append-only history,
 * the per-step changed-positions and the snapshots live here as API-layer
 * in-memory state keyed by vehicle / assignment id (the generated positions are
 * read live from the layout, never duplicated). TASK-201/202 re-home them behind
 * the PRD §9 Placement tables unchanged. Tyre status itself is a real gateway
 * aggregate and is always written through the gateway.
 */
@Injectable()
export class PlacementService {
  /** Live placement per vehicle id: `position` → {@link Placement}. */
  private readonly placements = new Map<number, Map<string, Placement>>();
  /** Append-only placement history (newest last). */
  private readonly logs: PlacementLog[] = [];
  /** Positions changed in the currently open step, per assignment id (highlight). */
  private readonly changedByStep = new Map<number, Set<string>>();
  /** Captured snapshots per assignment id (REQ-PLC-014). */
  private readonly snapshots = new Map<number, PlacementSnapshot>();
  private nextLogId = 1;

  constructor(private readonly classes: VehicleClassService) {}

  // --- chassis map (data-generated, DEC-73) --------------------------------

  /**
   * The vehicle's generated chassis layout (REQ-PLC-008). Reuses the TASK-106
   * generator by reading the vehicle's `chassisLayoutId` — the positions are
   * never duplicated or re-derived here.
   */
  layoutOfVehicle(vehicle: VehicleDto): ChassisLayout {
    return this.classes.requireLayout(idValue(vehicle.chassisLayoutId));
  }

  /**
   * Build the chassis map for a vehicle: every generated position, its occupant
   * (if any) and a text status label (REQ-PLC-008). Positions changed in
   * `openStepId` are highlighted (REQ-PLC-009).
   */
  buildMap(
    vehicle: VehicleDto,
    tyresById: ReadonlyMap<number, TyreDto>,
    openStepId?: number,
  ): ChassisMap {
    const layout = this.layoutOfVehicle(vehicle);
    const vehicleId = idValue(vehicle.id);
    const live = this.placements.get(vehicleId) ?? new Map<string, Placement>();
    const changed = openStepId === undefined ? undefined : this.changedByStep.get(openStepId);
    const positions = layout.positions.map((pos): MapPosition => {
      const placed = live.get(pos.code);
      const tyre = placed ? tyresById.get(placed.tyreId) : undefined;
      return {
        code: pos.code,
        positionKind: pos.positionKind,
        label: pos.label,
        tyreId: placed ? placed.tyreId : null,
        tyreCode: tyre ? tyre.code : null,
        serialNumber: tyre ? tyre.serialNumber : null,
        status: this.positionStatus(placed),
        treadMm: placed ? placed.treadMm : null,
        changedInStep: changed?.has(pos.code) ?? false,
      };
    });
    return {
      vehicleId,
      chassisLayoutId: layout.id,
      axleCount: layout.axleCount,
      tyreCount: layout.tyreCount,
      positions,
    };
  }

  // --- scope lock (BR-01/BR-02/BR-11) --------------------------------------

  /**
   * Assert a placement change is permitted on this step (BR-11 scope lock,
   * REQ-PLC-001). The step must be a Part Replacement step whose WO is Active or
   * In_Progress and whose own status is Open or In_Progress. A change on any
   * other step/WO state is refused — nothing changes outside the WO's locked
   * scope.
   */
  assertInScope(step: AssignmentDto, wo: WorkOrderDto): void {
    if (step.moduleCode !== 'Part_Replacement') {
      throw new BadRequestException('Not a Part Replacement step (REQ-PLC-001).');
    }
    const woActive =
      wo.status === WorkOrderStatus.Active || wo.status === WorkOrderStatus.InProgress;
    if (!woActive) {
      throw new ConflictException(
        'Placement changes are allowed only through an active WO (BR-02, REQ-PLC-001).',
      );
    }
    if (step.status !== StepStatus.Open && step.status !== StepStatus.InProgress) {
      throw new ConflictException(
        'Open the Part Replacement step before changing placements (BR-11, REQ-PLC-001).',
      );
    }
  }

  /** Resolve the generated position, throwing if it is not in the vehicle's map. */
  requirePosition(vehicle: VehicleDto, code: string): PartPosition {
    const layout = this.layoutOfVehicle(vehicle);
    const pos = layout.positions.find((p) => p.code === code);
    if (!pos) {
      throw new BadRequestException(
        `Position ${code} is not on this vehicle's chassis map (REQ-PLC-008).`,
      );
    }
    return pos;
  }

  // --- mutations (run inside the engine/controller transaction) ------------

  /**
   * **Mount / replace** a tyre at a position (REQ-PLC-002/003/006, BR-11,
   * SM-TYRE). The tyre must be Issued to this WO (AC-PLC-001) and the position
   * must be empty — a replace demounts the current tyre first (its own call).
   * Mounting a tyre that would exceed the vehicle's tyre count is impossible
   * because every target is a generated position; a position already occupied
   * is refused (REQ-PLC-006 `uq_active_slot`). Drives SM-TYRE Issued → Mounted
   * (or In_Stock → Mounted for the parts baseline), written through the
   * transactional `tyres` repository so it is atomic with the placement.
   */
  async mount(
    step: AssignmentDto,
    wo: WorkOrderDto,
    vehicle: VehicleDto,
    repos: TransactionRepositories,
    user: CurrentUser,
    input: { position: string; tyreId: number; treadMm?: number; pressurePsi?: number },
  ): Promise<Placement> {
    this.assertInScope(step, wo);
    const pos = this.requirePosition(vehicle, input.position);
    const vehicleId = idValue(vehicle.id);
    const workOrderId = idValue(wo.id);
    const stepId = idValue(step.id);

    const live = this.liveOf(vehicleId);
    if (live.has(pos.code)) {
      throw new ConflictException(
        `Position ${pos.code} already holds a tyre; demount it first (REQ-PLC-006).`,
      );
    }

    const tyre = await repos.tyres.getById(input.tyreId);
    if (!tyre) {
      throw new NotFoundException(`Unknown tyre: ${input.tyreId}`);
    }
    // A tyre already mounted elsewhere cannot be mounted again (uq_active_tyre).
    // Checked before the Issued-gate so a double-mount reports the precise
    // reason rather than the (also-true) "not Issued" one (REQ-PLC-006).
    if (this.isTyreMountedAnywhere(input.tyreId)) {
      throw new ConflictException(`Tyre ${tyre.code} is already mounted (REQ-PLC-006).`);
    }
    // BR-11 / REQ-PLC-003: a tyre not Issued to THIS WO may not be mounted.
    // (The parts baseline In_Stock → Mounted path is not reachable from the
    // step UI; the step always mounts a tyre issued to its own WO.)
    if (
      tyre.status !== TyreStatus.Issued ||
      tyre.issuedWorkOrderId === null ||
      idValue(tyre.issuedWorkOrderId) !== workOrderId
    ) {
      throw new BadRequestException(
        `Tyre ${tyre.code} is not Issued to this WO; it cannot be mounted (REQ-PLC-003, BR-11).`,
      );
    }

    // SM-TYRE Issued → Mounted (refused if the table has no such move).
    const nextStatus = this.transitionTyre(tyre, TyreEvent.MountFromIssued);
    await repos.tyres.update({ ...tyre, status: nextStatus });

    const at = new Date().toISOString();
    const placement: Placement = {
      position: pos.code,
      tyreId: input.tyreId,
      fittedByWorkOrderId: workOrderId,
      fittedByAssignmentId: stepId,
      fittedAt: at,
      treadMm: input.treadMm ?? null,
      pressurePsi: input.pressurePsi ?? null,
    };
    live.set(pos.code, placement);
    this.markChanged(stepId, pos.code);
    this.appendLog({
      vehicleId,
      workOrderId,
      assignmentId: stepId,
      action: 'Mount',
      tyreId: input.tyreId,
      position: pos.code,
      fromPosition: null,
      resultingTyreStatus: nextStatus,
      treadMm: placement.treadMm,
      pressurePsi: placement.pressurePsi,
      at,
      byUserId: user.userId,
    });
    return placement;
  }

  /**
   * **Rotate** a mounted tyre to another position, or **swap** two mounted
   * tyres (REQ-PLC-005/019). Only the position(s) change; the tyre(s) stay
   * Mounted (SM-TYRE Mounted → Mounted). An empty target moves the tyre; an
   * occupied target swaps the two. Both tyres keep their tread/pressure.
   */
  async rotate(
    step: AssignmentDto,
    wo: WorkOrderDto,
    vehicle: VehicleDto,
    repos: TransactionRepositories,
    user: CurrentUser,
    input: { fromPosition: string; toPosition: string },
  ): Promise<void> {
    this.assertInScope(step, wo);
    const from = this.requirePosition(vehicle, input.fromPosition);
    const to = this.requirePosition(vehicle, input.toPosition);
    if (from.code === to.code) {
      throw new BadRequestException('Rotate needs two different positions (REQ-PLC-005).');
    }
    const vehicleId = idValue(vehicle.id);
    const workOrderId = idValue(wo.id);
    const stepId = idValue(step.id);
    const live = this.liveOf(vehicleId);

    const movingPlacement = live.get(from.code);
    if (!movingPlacement) {
      throw new BadRequestException(`No tyre at ${from.code} to rotate (REQ-PLC-005).`);
    }
    const swapPlacement = live.get(to.code);
    const at = new Date().toISOString();

    // SM-TYRE Rotate (Mounted → Mounted) for each tyre that moves; both must be
    // a listed transition or the whole rotate is refused.
    const movingTyre = await this.requireTyre(repos, movingPlacement.tyreId);
    const movingNext = this.transitionTyre(movingTyre, TyreEvent.Rotate);
    await repos.tyres.update({ ...movingTyre, status: movingNext });

    if (swapPlacement) {
      const swapTyre = await this.requireTyre(repos, swapPlacement.tyreId);
      const swapNext = this.transitionTyre(swapTyre, TyreEvent.Rotate);
      await repos.tyres.update({ ...swapTyre, status: swapNext });
      // Swap the two placements (keep each tyre's tread/pressure).
      live.set(from.code, { ...swapPlacement, position: from.code });
      live.set(to.code, { ...movingPlacement, position: to.code });
      this.appendLog({
        vehicleId,
        workOrderId,
        assignmentId: stepId,
        action: 'Rotate',
        tyreId: swapPlacement.tyreId,
        position: from.code,
        fromPosition: to.code,
        resultingTyreStatus: swapNext,
        treadMm: swapPlacement.treadMm,
        pressurePsi: swapPlacement.pressurePsi,
        at,
        byUserId: user.userId,
      });
    } else {
      // Move into an empty position.
      live.delete(from.code);
      live.set(to.code, { ...movingPlacement, position: to.code });
    }
    this.markChanged(stepId, from.code);
    this.markChanged(stepId, to.code);
    this.appendLog({
      vehicleId,
      workOrderId,
      assignmentId: stepId,
      action: 'Rotate',
      tyreId: movingPlacement.tyreId,
      position: to.code,
      fromPosition: from.code,
      resultingTyreStatus: movingNext,
      treadMm: movingPlacement.treadMm,
      pressurePsi: movingPlacement.pressurePsi,
      at,
      byUserId: user.userId,
    });
  }

  /**
   * **Demount** a tyre from a position and set its condition (REQ-PLC-004,
   * SM-TYRE Mounted → Needs_Retread / Worn_Out / In_Stock). The chosen
   * condition must be one of the three legal demount targets (DEMOUNT_TARGETS);
   * the tyre leaves the map.
   */
  async demount(
    step: AssignmentDto,
    wo: WorkOrderDto,
    vehicle: VehicleDto,
    repos: TransactionRepositories,
    user: CurrentUser,
    input: { position: string; condition: TyreStatus },
  ): Promise<void> {
    this.assertInScope(step, wo);
    const pos = this.requirePosition(vehicle, input.position);
    if (!DEMOUNT_TARGETS.includes(input.condition)) {
      throw new BadRequestException(
        'Demount condition must be Needs_Retread, Worn_Out or In_Stock (REQ-PLC-004).',
      );
    }
    const vehicleId = idValue(vehicle.id);
    const live = this.liveOf(vehicleId);
    const placement = live.get(pos.code);
    if (!placement) {
      throw new BadRequestException(`No tyre at ${pos.code} to demount (REQ-PLC-004).`);
    }
    const tyre = await this.requireTyre(repos, placement.tyreId);
    // SM-TYRE Demount (Mounted → chosen condition). The §3.6 "Demount, condition
    // chosen" row covers the three legal targets; the guard refuses any other.
    const nextStatus = this.transitionDemount(tyre, input.condition);
    await repos.tyres.update({ ...tyre, status: nextStatus });

    live.delete(pos.code);
    const at = new Date().toISOString();
    this.markChanged(idValue(step.id), pos.code);
    this.appendLog({
      vehicleId,
      workOrderId: idValue(wo.id),
      assignmentId: idValue(step.id),
      action: 'Demount',
      tyreId: placement.tyreId,
      position: pos.code,
      fromPosition: null,
      resultingTyreStatus: nextStatus,
      treadMm: placement.treadMm,
      pressurePsi: placement.pressurePsi,
      at,
      byUserId: user.userId,
    });
  }

  /**
   * **Scrap** a mounted tyre from a position (REQ-PLC-002, SM-TYRE Mounted →
   * Scrapped). Scrapped is final; the tyre leaves the map.
   */
  async scrap(
    step: AssignmentDto,
    wo: WorkOrderDto,
    vehicle: VehicleDto,
    repos: TransactionRepositories,
    user: CurrentUser,
    input: { position: string },
  ): Promise<void> {
    this.assertInScope(step, wo);
    const pos = this.requirePosition(vehicle, input.position);
    const vehicleId = idValue(vehicle.id);
    const live = this.liveOf(vehicleId);
    const placement = live.get(pos.code);
    if (!placement) {
      throw new BadRequestException(`No tyre at ${pos.code} to scrap (REQ-PLC-002).`);
    }
    const tyre = await this.requireTyre(repos, placement.tyreId);
    const nextStatus = this.transitionTyre(tyre, TyreEvent.ScrapFromMounted);
    await repos.tyres.update({ ...tyre, status: nextStatus });

    live.delete(pos.code);
    const at = new Date().toISOString();
    this.markChanged(idValue(step.id), pos.code);
    this.appendLog({
      vehicleId,
      workOrderId: idValue(wo.id),
      assignmentId: idValue(step.id),
      action: 'Scrap',
      tyreId: placement.tyreId,
      position: pos.code,
      fromPosition: null,
      resultingTyreStatus: nextStatus,
      treadMm: placement.treadMm,
      pressurePsi: placement.pressurePsi,
      at,
      byUserId: user.userId,
    });
  }

  // --- snapshot (REQ-PLC-014) ----------------------------------------------

  /**
   * The engine **submit** hook (REQ-PLC-014). Runs inside the engine's
   * `unitOfWork` via the step-handler registry: it captures a placement
   * snapshot for the WO document (TASK-115 renders it black-and-white) from the
   * placement at the moment the step is submitted. It reads the WO → vehicle →
   * tyres through the transactional repositories so the capture is consistent
   * with the same transaction. Idempotent: a re-submit keeps the first snapshot.
   */
  async onSubmit(step: AssignmentDto, repos: TransactionRepositories): Promise<PlacementSnapshot> {
    const wo = await repos.workOrders.requireById(idValue(step.workOrderId));
    const vehicle = await repos.vehicles.requireById(idValue(wo.vehicleId));
    const tyres = await repos.tyres.list();
    const tyresById = new Map<number, TyreDto>();
    for (const t of tyres) {
      tyresById.set(idValue(t.id), t);
    }
    return this.captureSnapshot(step, vehicle, tyresById);
  }

  /**
   * Capture a placement snapshot for the WO document (REQ-PLC-014). Called from
   * {@link onSubmit}, so the snapshot is the placement at the moment the step is
   * submitted. Idempotent: a re-submit keeps the first snapshot.
   */
  captureSnapshot(
    step: AssignmentDto,
    vehicle: VehicleDto,
    tyresById: ReadonlyMap<number, TyreDto>,
  ): PlacementSnapshot {
    const stepId = idValue(step.id);
    const existing = this.snapshots.get(stepId);
    if (existing) {
      return existing;
    }
    const layout = this.layoutOfVehicle(vehicle);
    const vehicleId = idValue(vehicle.id);
    const live = this.placements.get(vehicleId) ?? new Map<string, Placement>();
    const positions = layout.positions.map((pos) => {
      const placed = live.get(pos.code);
      const tyre = placed ? tyresById.get(placed.tyreId) : undefined;
      return {
        code: pos.code,
        tyreId: placed ? placed.tyreId : null,
        tyreCode: tyre ? tyre.code : null,
      };
    });
    const changed = [...(this.changedByStep.get(stepId) ?? new Set<string>())];
    const snapshot: PlacementSnapshot = {
      assignmentId: stepId,
      workOrderId: idValue(step.workOrderId),
      vehicleId,
      capturedAt: new Date().toISOString(),
      positions,
      changedPositions: changed,
    };
    this.snapshots.set(stepId, snapshot);
    return snapshot;
  }

  // --- reads ---------------------------------------------------------------

  /** The captured snapshot of a step, or `undefined`. */
  snapshotOf(stepId: number): PlacementSnapshot | undefined {
    return this.snapshots.get(stepId);
  }

  /** The live placement at a position for a vehicle, or `undefined`. */
  placementAt(vehicleId: number, position: string): Placement | undefined {
    return this.placements.get(vehicleId)?.get(position);
  }

  /** The append-only placement history for a vehicle (newest last). */
  historyOfVehicle(vehicleId: number): readonly PlacementLog[] {
    return this.logs.filter((l) => l.vehicleId === vehicleId);
  }

  /** The append-only placement history for one position (REQ-PLC-009). */
  historyOfPosition(vehicleId: number, position: string): readonly PlacementLog[] {
    return this.logs.filter((l) => l.vehicleId === vehicleId && l.position === position);
  }

  /** Total number of history rows (for append-only assertions in tests). */
  historyCount(): number {
    return this.logs.length;
  }

  /** The positions changed in the open step (highlight set), as an array. */
  changedPositionsOf(stepId: number): readonly string[] {
    return [...(this.changedByStep.get(stepId) ?? new Set<string>())];
  }

  /** Test-only reset of all placement state. */
  resetForTests(): void {
    this.placements.clear();
    this.logs.length = 0;
    this.changedByStep.clear();
    this.snapshots.clear();
    this.nextLogId = 1;
  }

  // --- internals -----------------------------------------------------------

  private liveOf(vehicleId: number): Map<string, Placement> {
    let live = this.placements.get(vehicleId);
    if (!live) {
      live = new Map<string, Placement>();
      this.placements.set(vehicleId, live);
    }
    return live;
  }

  private isTyreMountedAnywhere(tyreId: number): boolean {
    for (const live of this.placements.values()) {
      for (const p of live.values()) {
        if (p.tyreId === tyreId) {
          return true;
        }
      }
    }
    return false;
  }

  private async requireTyre(repos: TransactionRepositories, tyreId: number): Promise<TyreDto> {
    const tyre = await repos.tyres.getById(tyreId);
    if (!tyre) {
      throw new NotFoundException(`Unknown tyre: ${tyreId}`);
    }
    return tyre;
  }

  /**
   * Drive a tyre through SM-TYRE, mapping a refused move to a 400 rather than
   * leaking the raw machine error (REQ-PLC §3.6: an unlisted transition is
   * refused).
   */
  private transitionTyre(
    tyre: TyreDto,
    event:
      | typeof TyreEvent.MountFromIssued
      | typeof TyreEvent.Rotate
      | typeof TyreEvent.ScrapFromMounted,
  ): TyreStatus {
    try {
      return smTyre.transition(tyre.status, event);
    } catch (err) {
      if (err instanceof InvalidTransitionError) {
        throw new ConflictException(
          `Tyre ${tyre.code}: ${event} is not allowed from ${tyre.status} (SM-TYRE §3.6).`,
        );
      }
      throw err;
    }
  }

  /**
   * Demount with a chosen condition. The §3.6 table carries the three legal
   * targets under the single "Demount, condition chosen" row; we verify the
   * tyre can leave Mounted (via the guard) and that the chosen target is one of
   * the three — refusing any other, exactly as "a transition not listed is
   * refused".
   */
  private transitionDemount(tyre: TyreDto, condition: TyreStatus): TyreStatus {
    if (tyre.status !== TyreStatus.Mounted) {
      throw new ConflictException(
        `Tyre ${tyre.code}: Demount is not allowed from ${tyre.status} (SM-TYRE §3.6).`,
      );
    }
    if (!DEMOUNT_TARGETS.includes(condition)) {
      throw new BadRequestException(
        `Tyre ${tyre.code}: ${condition} is not a legal demount condition (SM-TYRE §3.6).`,
      );
    }
    return condition;
  }

  private positionStatus(placed: Placement | undefined): MapPosition['status'] {
    if (!placed) {
      return 'Empty';
    }
    if (placed.treadMm !== null && placed.treadMm < TREAD_ACT_NOW_MM) {
      return 'Act now';
    }
    if (placed.treadMm !== null && placed.treadMm < TREAD_DUE_SOON_MM) {
      return 'Due soon';
    }
    return 'Normal';
  }

  private markChanged(stepId: number, position: string): void {
    const set = this.changedByStep.get(stepId) ?? new Set<string>();
    set.add(position);
    this.changedByStep.set(stepId, set);
  }

  private appendLog(input: Omit<PlacementLog, 'id'>): PlacementLog {
    const log: PlacementLog = { id: this.nextLogId, ...input };
    this.logs.push(log);
    this.nextLogId += 1;
    return log;
  }
}
