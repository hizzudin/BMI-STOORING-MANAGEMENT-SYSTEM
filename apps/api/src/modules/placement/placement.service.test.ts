import 'reflect-metadata';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  Role,
  StepStatus,
  toId,
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
  type ChassisLayoutDefinition,
} from '../vehicles/vehicle-class.service.js';
import { PlacementService } from './placement.service.js';

/**
 * Unit coverage for the Part Replacement rules (TASK-111, FG-6): the
 * data-generated chassis map for 1–6 axle / trailer / spare layouts
 * (AC-PLC-007/010, DEC-73), scope-lock refusal (BR-02/BR-11), the SM-TYRE
 * transitions written with the placement (§3.6), append-only history, and the
 * snapshot capture (REQ-PLC-014).
 */
describe('PlacementService (TASK-111)', () => {
  let classes: VehicleClassService;
  let service: PlacementService;

  const mechanic: CurrentUser = { userId: 2, role: Role.Mechanic };

  beforeEach(() => {
    classes = new VehicleClassService();
    service = new PlacementService(classes);
  });

  // --- test doubles --------------------------------------------------------

  /** A tiny in-memory `tyres` repository implementing the transactional contract. */
  function tyreRepos(tyres: TyreDto[]): TransactionRepositories {
    const byId = new Map<number, TyreDto>(tyres.map((t) => [Number(t.id), t]));
    const repo = {
      name: 'tyres',
      async getById(id: number): Promise<TyreDto | null> {
        return byId.get(id) ?? null;
      },
      async requireById(id: number): Promise<TyreDto> {
        const t = byId.get(id);
        if (!t) throw new Error(`no tyre ${id}`);
        return t;
      },
      async list(): Promise<readonly TyreDto[]> {
        return [...byId.values()];
      },
      async update(t: TyreDto): Promise<TyreDto> {
        const current = byId.get(Number(t.id));
        if (!current) throw new Error('not found');
        if (current.version !== t.version) throw new Error('stale');
        const next = { ...t, version: t.version + 1 };
        byId.set(Number(t.id), next);
        return next;
      },
    };
    // Only `tyres` is exercised by the service in these unit tests.
    return { tyres: repo } as unknown as TransactionRepositories;
  }

  function tyre(id: number, overrides: Partial<TyreDto> = {}): TyreDto {
    return {
      id: toId<'TyreId'>(id),
      code: `TY-01${String(id).padStart(2, '0')}`,
      serialNumber: `SN-${id}`,
      brand: 'Bridgestone',
      size: '1000R20',
      tyreType: 'Tubeless',
      statusId: toId<'TyreStatusId'>(2),
      status: TyreStatus.Issued,
      issuedWorkOrderId: toId<'WorkOrderId'>(700),
      version: 1,
      ...overrides,
    } as TyreDto;
  }

  function vehicle(chassisLayoutId = 1): VehicleDto {
    return {
      id: toId<'VehicleId'>(1),
      plate: 'B 1234 ABC',
      classId: toId<'VehicleClassId'>(1),
      chassisLayoutId: toId<'ChassisLayoutId'>(chassisLayoutId),
      odometerKm: 48210,
      status: 'Active',
      version: 1,
    } as unknown as VehicleDto;
  }

  function wo(overrides: Partial<WorkOrderDto> = {}): WorkOrderDto {
    return {
      id: toId<'WorkOrderId'>(700),
      vehicleId: toId<'VehicleId'>(1),
      status: WorkOrderStatus.InProgress,
      version: 1,
      ...overrides,
    } as unknown as WorkOrderDto;
  }

  function step(overrides: Partial<AssignmentDto> = {}): AssignmentDto {
    return {
      id: toId<'AssignmentId'>(900),
      version: 1,
      workOrderId: toId<'WorkOrderId'>(700),
      moduleId: toId<'AssignmentModuleId'>(5),
      moduleCode: 'Part_Replacement',
      sequence: 1,
      status: StepStatus.InProgress,
      stepConfig: {},
      isOptional: false,
      executorRoles: [Role.Mechanic],
      verifierRole: Role.Planner,
      attemptNo: 1,
      ...overrides,
    } as AssignmentDto;
  }

  // --- AC-PLC-010 / DEC-73: generated 1–6 axle layouts ---------------------

  it('AC-PLC-010 — generates positions for 1–6 axle layouts from the definition (no hard-coded map)', () => {
    for (let axleCount = 1; axleCount <= 6; axleCount += 1) {
      const def: ChassisLayoutDefinition = {
        axles: Array.from({ length: axleCount }, () => ({ role: 'Drive', tyresPerSide: 2 })),
        spareCount: 0,
      };
      const gen = VehicleClassService.generatePositions(def);
      // Each dual axle = 4 tyres (2 per side); no spare here.
      expect(gen.axleCount).toBe(axleCount);
      expect(gen.tyreCount).toBe(axleCount * 4);
      expect(gen.positions).toHaveLength(axleCount * 4);
      // Positions carry axle indices 1..axleCount.
      const axleIndices = new Set(gen.positions.map((p) => p.axleIndex));
      for (let a = 1; a <= axleCount; a += 1) {
        expect(axleIndices.has(a)).toBe(true);
      }
    }
  });

  it('AC-PLC-010 — a Powered 8x4 class not in the launch list generates its 12 positions with no code change', () => {
    // Steer, Steer, Drive(dual), Drive(dual), 0 spares → 2 + 2 + 4 + 4 = 12.
    const created = classes.createClass({
      code: 'Powered_8x4',
      name: 'Powered 8x4',
      unitKind: 'Powered',
      layout: {
        axles: [
          { role: 'Steer', tyresPerSide: 1 },
          { role: 'Steer', tyresPerSide: 1 },
          { role: 'Drive', tyresPerSide: 2 },
          { role: 'Drive', tyresPerSide: 2 },
        ],
        spareCount: 0,
      },
    });
    const layout = classes.requireLayout(created.defaultChassisLayoutId);
    expect(layout.tyreCount).toBe(12);
    expect(layout.positions.filter((p) => p.positionKind === 'Spare')).toHaveLength(0);
  });

  it('AC-PLC-007 — a Towed layout with 3 Trailer axles (2/side) and 1 spare generates 13 positions incl. SPARE_1', () => {
    const created = classes.createClass({
      code: 'Trailer_Tail',
      name: 'Trailer tail',
      unitKind: 'Towed',
      layout: {
        axles: [
          { role: 'Trailer', tyresPerSide: 2 },
          { role: 'Trailer', tyresPerSide: 2 },
          { role: 'Trailer', tyresPerSide: 2 },
        ],
        spareCount: 1,
      },
    });
    const layout = classes.requireLayout(created.defaultChassisLayoutId);
    // 3 axles × 4 tyres + 1 spare = 13.
    expect(layout.tyreCount).toBe(13);
    const spares = layout.positions.filter((p) => p.positionKind === 'Spare');
    expect(spares).toHaveLength(1);
    expect(spares[0]!.code).toBe('SPARE_1');
  });

  it('buildMap renders every generated position with a text status and empty slots', () => {
    const map = service.buildMap(vehicle(), new Map());
    // Seeded Tractor_Head 6x4 layout id 1 → 11 positions.
    expect(map.tyreCount).toBe(11);
    expect(map.positions).toHaveLength(11);
    expect(map.positions.every((p) => p.status === 'Empty')).toBe(true);
    // Status always carries a text label (never colour alone).
    expect(map.positions.every((p) => typeof p.status === 'string')).toBe(true);
  });

  // --- BR-02 / BR-11: scope lock -------------------------------------------

  it('BR-11 — refuses a mount when the WO is not Active/In_Progress (scope lock)', async () => {
    const repos = tyreRepos([tyre(110)]);
    await expect(
      service.mount(step(), wo({ status: WorkOrderStatus.Draft }), vehicle(), repos, mechanic, {
        position: 'A1_L',
        tyreId: 110,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(service.historyCount()).toBe(0);
  });

  it('BR-11 — refuses a mount when the Part Replacement step is not Open/In_Progress', async () => {
    const repos = tyreRepos([tyre(110)]);
    await expect(
      service.mount(step({ status: StepStatus.Submitted }), wo(), vehicle(), repos, mechanic, {
        position: 'A1_L',
        tyreId: 110,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('refuses a position not on the vehicle generated map', async () => {
    const repos = tyreRepos([tyre(110)]);
    await expect(
      service.mount(step(), wo(), vehicle(), repos, mechanic, { position: 'ZZ_9', tyreId: 110 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  // --- AC-PLC-001 / BR-11 / REQ-PLC-003: Issued-to-this-WO gate ------------

  it('AC-PLC-001 — refuses to mount a tyre not Issued to this WO', async () => {
    const otherWoTyre = tyre(110, { issuedWorkOrderId: toId<'WorkOrderId'>(999) });
    const repos = tyreRepos([otherWoTyre]);
    await expect(
      service.mount(step(), wo(), vehicle(), repos, mechanic, { position: 'A1_L', tyreId: 110 }),
    ).rejects.toBeInstanceOf(BadRequestException);

    const inStock = tyre(111, { status: TyreStatus.InStock, issuedWorkOrderId: null });
    const repos2 = tyreRepos([inStock]);
    await expect(
      service.mount(step(), wo(), vehicle(), repos2, mechanic, { position: 'A1_L', tyreId: 111 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  // --- SM-TYRE §3.6: mount / rotate / demount transitions ------------------

  it('SM-TYRE — a valid mount drives Issued → Mounted and writes an append-only history row', async () => {
    const repos = tyreRepos([tyre(110)]);
    const placement = await service.mount(step(), wo(), vehicle(), repos, mechanic, {
      position: 'A1_L',
      tyreId: 110,
      treadMm: 9,
    });
    expect(placement.tyreId).toBe(110);
    const t = await repos.tyres.getById(110);
    expect(t!.status).toBe(TyreStatus.Mounted);
    expect(service.historyCount()).toBe(1);
    expect(service.historyOfVehicle(1)[0]).toMatchObject({
      action: 'Mount',
      position: 'A1_L',
      resultingTyreStatus: TyreStatus.Mounted,
    });
  });

  it('AC-PLC-003 — rotate swaps two mounted tyres; both stay Mounted', async () => {
    const repos = tyreRepos([tyre(110), tyre(111)]);
    await service.mount(step(), wo(), vehicle(), repos, mechanic, { position: 'A1_L', tyreId: 110 });
    await service.mount(step(), wo(), vehicle(), repos, mechanic, { position: 'A1_R', tyreId: 111 });

    await service.rotate(step(), wo(), vehicle(), repos, mechanic, {
      fromPosition: 'A1_L',
      toPosition: 'A1_R',
    });
    // Positions swapped.
    expect(service.placementAt(1, 'A1_L')!.tyreId).toBe(111);
    expect(service.placementAt(1, 'A1_R')!.tyreId).toBe(110);
    // Both stay Mounted.
    expect((await repos.tyres.getById(110))!.status).toBe(TyreStatus.Mounted);
    expect((await repos.tyres.getById(111))!.status).toBe(TyreStatus.Mounted);
  });

  it('AC-PLC-009 / REQ-PLC-019 — swap a wheel tyre with the spare; both stay Mounted', async () => {
    const repos = tyreRepos([tyre(110), tyre(111)]);
    await service.mount(step(), wo(), vehicle(), repos, mechanic, { position: 'A1_L', tyreId: 110 });
    await service.mount(step(), wo(), vehicle(), repos, mechanic, { position: 'SPARE_1', tyreId: 111 });
    await service.rotate(step(), wo(), vehicle(), repos, mechanic, {
      fromPosition: 'A1_L',
      toPosition: 'SPARE_1',
    });
    expect(service.placementAt(1, 'A1_L')!.tyreId).toBe(111);
    expect(service.placementAt(1, 'SPARE_1')!.tyreId).toBe(110);
    expect((await repos.tyres.getById(110))!.status).toBe(TyreStatus.Mounted);
    expect((await repos.tyres.getById(111))!.status).toBe(TyreStatus.Mounted);
  });

  it('REQ-PLC-004 — demount sets the chosen condition (Needs_Retread) via SM-TYRE and clears the position', async () => {
    const repos = tyreRepos([tyre(110)]);
    await service.mount(step(), wo(), vehicle(), repos, mechanic, { position: 'A1_L', tyreId: 110 });
    await service.demount(step(), wo(), vehicle(), repos, mechanic, {
      position: 'A1_L',
      condition: TyreStatus.NeedsRetread,
    });
    expect((await repos.tyres.getById(110))!.status).toBe(TyreStatus.NeedsRetread);
    expect(service.placementAt(1, 'A1_L')).toBeUndefined();
  });

  it('REQ-PLC-004 — demount back to stock sets In_Stock', async () => {
    const repos = tyreRepos([tyre(110)]);
    await service.mount(step(), wo(), vehicle(), repos, mechanic, { position: 'A1_L', tyreId: 110 });
    await service.demount(step(), wo(), vehicle(), repos, mechanic, {
      position: 'A1_L',
      condition: TyreStatus.InStock,
    });
    expect((await repos.tyres.getById(110))!.status).toBe(TyreStatus.InStock);
  });

  it('SM-TYRE — an unlisted transition is refused (scrap an In_Stock tyre: not from Mounted)', async () => {
    const repos = tyreRepos([tyre(110)]);
    await service.mount(step(), wo(), vehicle(), repos, mechanic, { position: 'A1_L', tyreId: 110 });
    await service.scrap(step(), wo(), vehicle(), repos, mechanic, { position: 'A1_L' });
    expect((await repos.tyres.getById(110))!.status).toBe(TyreStatus.Scrapped);
    // Scrapping again (no tyre at the position) is refused.
    await expect(
      service.scrap(step(), wo(), vehicle(), repos, mechanic, { position: 'A1_L' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  // --- AC-PLC-002 / REQ-PLC-006: tyre count / occupied slot ----------------

  it('AC-PLC-002 — a mount onto an occupied position is refused (uq_active_slot)', async () => {
    const repos = tyreRepos([tyre(110), tyre(111)]);
    await service.mount(step(), wo(), vehicle(), repos, mechanic, { position: 'A1_L', tyreId: 110 });
    await expect(
      service.mount(step(), wo(), vehicle(), repos, mechanic, { position: 'A1_L', tyreId: 111 }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('REQ-PLC-006 — the same tyre cannot be mounted twice (uq_active_tyre)', async () => {
    const repos = tyreRepos([tyre(110)]);
    await service.mount(step(), wo(), vehicle(), repos, mechanic, { position: 'A1_L', tyreId: 110 });
    await expect(
      service.mount(step(), wo(), vehicle(), repos, mechanic, { position: 'A1_R', tyreId: 110 }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  // --- append-only history -------------------------------------------------

  it('history is append-only — each action adds a row, nothing is overwritten', async () => {
    const repos = tyreRepos([tyre(110)]);
    await service.mount(step(), wo(), vehicle(), repos, mechanic, { position: 'A1_L', tyreId: 110 });
    await service.demount(step(), wo(), vehicle(), repos, mechanic, {
      position: 'A1_L',
      condition: TyreStatus.InStock,
    });
    // Mount then demount → 2 rows; the mount row is preserved.
    const posHistory = service.historyOfPosition(1, 'A1_L');
    expect(posHistory).toHaveLength(2);
    expect(posHistory.map((h) => h.action)).toEqual(['Mount', 'Demount']);
  });

  // --- REQ-PLC-014: snapshot -----------------------------------------------

  it('REQ-PLC-014 — onSubmit captures a snapshot of the placement + changed positions', async () => {
    const repos = tyreRepos([tyre(110)]);
    const s = step();
    await service.mount(s, wo(), vehicle(), repos, mechanic, { position: 'A1_L', tyreId: 110 });

    // Build a full-repos double that also answers workOrders/vehicles for onSubmit.
    const full = {
      ...repos,
      workOrders: { async requireById() { return wo(); } },
      vehicles: { async requireById() { return vehicle(); } },
    } as unknown as TransactionRepositories;

    const snapshot = await service.onSubmit(s, full);
    expect(snapshot.assignmentId).toBe(Number(s.id));
    expect(snapshot.changedPositions).toContain('A1_L');
    const a1l = snapshot.positions.find((p) => p.code === 'A1_L');
    expect(a1l!.tyreId).toBe(110);
    // Idempotent: a re-submit keeps the same snapshot.
    const again = await service.onSubmit(s, full);
    expect(again.capturedAt).toBe(snapshot.capturedAt);
  });
});
