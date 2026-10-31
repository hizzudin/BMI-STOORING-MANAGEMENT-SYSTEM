import { describe, expect, it, beforeEach } from 'vitest';
import {
  VehicleStatus,
  WorkOrderCategory,
  WorkOrderStatus,
  WorkOrderSource,
  WorkOrderPriority,
  deriveVehicleStatus,
  toId,
  idValue,
  type WorkOrderDto,
} from '@bmi/shared';
import { createDummyDataGateway, type DataGateway } from '@bmi/data-gateway';
import { VehicleStatusService } from './vehicle-status.service.js';

/**
 * SM-VEH derived-status coverage (PRD §3.4, DEC-92).
 *
 * Proves the precedence Inactive > OFF > Blocked > Repair > Active and the OFF
 * behaviour: an in-Repair WO that has overrun its scheduled WIB day shows OFF,
 * and OFF holds until that WO is Completed or Cancelled. OFF never blocks WO
 * creation/amendment — that is contrasted in the e2e suite (only Inactive does,
 * REQ-WO-013). The seeded WO-0142 on B 1234 ABC (In_Progress Corrective,
 * schedule card planned 2026-10-26) is the fixture.
 */
describe('VehicleStatusService (TASK-106) — SM-VEH derived status incl. OFF (DEC-92)', () => {
  let gateway: DataGateway;
  let service: VehicleStatusService;
  const vehicleId = 1; // seeded B 1234 ABC
  const workOrderId = 1; // seeded WO-0142
  // A WIB "now" well after the seeded planned day (2026-10-26) so it has overrun.
  const now = new Date('2026-10-28T05:00:00.000Z');

  beforeEach(() => {
    gateway = createDummyDataGateway();
    service = new VehicleStatusService(gateway);
  });

  // --- the pure precedence function (the single source of the ordering) ----

  it('derives by precedence Inactive > OFF > Blocked > Repair > Active', () => {
    // Every higher fact wins over all lower ones held at the same time.
    expect(
      deriveVehicleStatus({
        isDeactivated: true,
        hasOverrunWhileInRepair: true,
        hasBlockingDocument: true,
        hasActiveRepair: true,
      }),
    ).toBe(VehicleStatus.Inactive);
    expect(
      deriveVehicleStatus({
        isDeactivated: false,
        hasOverrunWhileInRepair: true,
        hasBlockingDocument: true,
        hasActiveRepair: true,
      }),
    ).toBe(VehicleStatus.OFF);
    expect(
      deriveVehicleStatus({
        isDeactivated: false,
        hasOverrunWhileInRepair: false,
        hasBlockingDocument: true,
        hasActiveRepair: true,
      }),
    ).toBe(VehicleStatus.Blocked);
    expect(
      deriveVehicleStatus({
        isDeactivated: false,
        hasOverrunWhileInRepair: false,
        hasBlockingDocument: false,
        hasActiveRepair: true,
      }),
    ).toBe(VehicleStatus.Repair);
    expect(
      deriveVehicleStatus({
        isDeactivated: false,
        hasOverrunWhileInRepair: false,
        hasBlockingDocument: false,
        hasActiveRepair: false,
      }),
    ).toBe(VehicleStatus.Active);
  });

  // --- OFF from the live WO graph ------------------------------------------

  it('shows OFF when an in-Repair WO has overrun its scheduled WIB day', async () => {
    const status = await service.computeStatus(
      vehicleId,
      { isDeactivated: false, hasBlockingDocument: false },
      now,
    );
    expect(status).toBe(VehicleStatus.OFF);
  });

  it('shows Repair (not OFF) before the scheduled day has passed', async () => {
    // Evaluate "now" on the planned day itself: in Repair, but not yet overrun.
    const onPlannedDay = new Date('2026-10-26T05:00:00.000Z');
    const status = await service.computeStatus(
      vehicleId,
      { isDeactivated: false, hasBlockingDocument: false },
      onPlannedDay,
    );
    expect(status).toBe(VehicleStatus.Repair);
  });

  it('OFF holds until the overrunning WO is Completed, then clears to Active', async () => {
    // Overrun now → OFF.
    expect(
      await service.computeStatus(
        vehicleId,
        { isDeactivated: false, hasBlockingDocument: false },
        now,
      ),
    ).toBe(VehicleStatus.OFF);

    // Complete the WO; both the OFF overrun and the Repair fact clear.
    await completeWorkOrder(gateway, workOrderId);
    expect(
      await service.computeStatus(
        vehicleId,
        { isDeactivated: false, hasBlockingDocument: false },
        now,
      ),
    ).toBe(VehicleStatus.Active);
  });

  it('OFF also clears when the overrunning WO is Cancelled', async () => {
    await cancelWorkOrder(gateway, workOrderId);
    expect(
      await service.computeStatus(
        vehicleId,
        { isDeactivated: false, hasBlockingDocument: false },
        now,
      ),
    ).toBe(VehicleStatus.Active);
  });

  it('Inactive outranks an overrunning OFF (precedence from the graph)', async () => {
    const status = await service.computeStatus(
      vehicleId,
      { isDeactivated: true, hasBlockingDocument: false },
      now,
    );
    expect(status).toBe(VehicleStatus.Inactive);
  });

  it('a WO with no schedule card does not overrun (Repair, not OFF)', async () => {
    // Add a second vehicle + an unscheduled In_Progress WO on it.
    const vid = await addVehicle(gateway);
    await addWorkOrder(gateway, vid, WorkOrderStatus.InProgress, WorkOrderCategory.Corrective);
    const status = await service.computeStatus(
      vid,
      { isDeactivated: false, hasBlockingDocument: false },
      now,
    );
    expect(status).toBe(VehicleStatus.Repair);
  });
});

// --- helpers ---------------------------------------------------------------

async function completeWorkOrder(gateway: DataGateway, id: number): Promise<void> {
  await gateway.unitOfWork(async (ctx) => {
    const wo = await ctx.repos.workOrders.requireById(id);
    await ctx.repos.workOrders.update({ ...wo, status: WorkOrderStatus.Completed });
  });
}

async function cancelWorkOrder(gateway: DataGateway, id: number): Promise<void> {
  await gateway.unitOfWork(async (ctx) => {
    const wo = await ctx.repos.workOrders.requireById(id);
    await ctx.repos.workOrders.update({ ...wo, status: WorkOrderStatus.Cancelled });
  });
}

async function addVehicle(gateway: DataGateway): Promise<number> {
  const created = await gateway.unitOfWork(async (ctx) =>
    ctx.repos.vehicles.insert({
      plate: 'D 9999 ZZ',
      classId: toId<'VehicleClassId'>(1),
      chassisLayoutId: toId<'ChassisLayoutId'>(1),
      odometerKm: 0,
      status: VehicleStatus.Active,
      customerId: null,
    }),
  );
  return idValue(created.id);
}

async function addWorkOrder(
  gateway: DataGateway,
  vehicleId: number,
  status: WorkOrderStatus,
  category: WorkOrderCategory,
): Promise<WorkOrderDto> {
  return gateway.unitOfWork(async (ctx) =>
    ctx.repos.workOrders.insert({
      number: 'WO-TEST',
      vehicleId: toId<'VehicleId'>(vehicleId),
      status,
      source: WorkOrderSource.ManualPlanner,
      category,
      priority: WorkOrderPriority.Normal,
      description: 'test',
      findingNote: null,
      offDays: 0,
      createdBy: toId<'UserId'>(1),
      createdAt: new Date().toISOString(),
    }),
  );
}
