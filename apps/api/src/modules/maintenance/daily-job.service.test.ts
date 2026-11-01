import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ScheduleStatus,
  VehicleStatus,
  WorkOrderStatus,
  idValue,
} from '@bmi/shared';
import { SEED_IDS } from '@bmi/data-gateway';
import { DataGatewayModule, DATA_GATEWAY } from '../../core/data-gateway/data-gateway.module.js';
import { AuditModule } from '../../core/audit/audit.module.js';
import { WorkOrdersModule } from '../work-orders/work-orders.module.js';
import { VehiclesModule } from '../vehicles/vehicles.module.js';
import type { DataGateway } from '@bmi/data-gateway';
import { DailyJobService } from './daily-job.service.js';
import { ScheduleService } from './schedule.service.js';
import { NotificationService } from './notification.service.js';
import { NotificationKind } from './notification.service.js';

/**
 * Unit coverage for the simulated daily job (TASK-114, REQ-SCH-003, SM-SCH,
 * SM-VEH, DEC-92, NFR-14). The seed graph makes an ideal fixture: WO-0142 is an
 * In_Progress Corrective (downtime) WO with a schedule card planned 2026-10-26,
 * so running the job on a later WIB day exercises roll-forward, the
 * `is_rolled_over` flag, the OFF derived status and the once-per-day `off_days`
 * increment.
 */
describe('DailyJobService (TASK-114)', () => {
  let gateway: DataGateway;
  let job: DailyJobService;
  let schedule: ScheduleService;
  let notifications: NotificationService;

  // A WIB instant well after the seed card's planned day 2026-10-26.
  const day1 = new Date('2026-10-28T00:00:00.000Z'); // 07:00 WIB on 2026-10-28
  const cardId = idValue(SEED_IDS.scheduleCard);
  const woId = idValue(SEED_IDS.workOrder);
  const vehicleId = idValue(SEED_IDS.vehicle);

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [DataGatewayModule, AuditModule, WorkOrdersModule, VehiclesModule],
      providers: [DailyJobService, ScheduleService, NotificationService],
    }).compile();
    gateway = moduleRef.get<DataGateway>(DATA_GATEWAY);
    job = moduleRef.get(DailyJobService);
    schedule = moduleRef.get(ScheduleService);
    notifications = moduleRef.get(NotificationService);
    job.resetForTests();
    schedule.resetForTests();
    notifications.resetForTests();
  });

  afterEach(() => {
    job.resetForTests();
    schedule.resetForTests();
    notifications.resetForTests();
  });

  it('rolls a missed card forward one day and flags is_rolled_over (REQ-SCH-003)', async () => {
    const result = await job.run(day1);

    expect(result.rolledForwardCardIds).toContain(cardId);
    const card = await gateway.repos.scheduleCards.requireById(cardId);
    expect(card.isRolledOver).toBe(true);
    // Rolled forward to the job's WIB day (idempotent target).
    expect(card.plannedDate).toBe('2026-10-28');
    expect(card.status).toBe(ScheduleStatus.Planned);
  });

  it('never blocks or cancels the WO when its card is missed (BR-13)', async () => {
    await job.run(day1);
    const wo = await gateway.repos.workOrders.requireById(woId);
    expect(wo.status).toBe(WorkOrderStatus.InProgress);
  });

  it('recalculates the derived vehicle status to OFF (DEC-92)', async () => {
    await job.run(day1);
    const vehicle = await gateway.repos.vehicles.requireById(vehicleId);
    expect(vehicle.status).toBe(VehicleStatus.OFF);
    const result = await job.run(day1);
    expect(result.recalculatedVehicleIds).toContain(vehicleId);
  });

  it('increments off_days exactly once per WIB day (DEC-92)', async () => {
    const before = await gateway.repos.workOrders.requireById(woId);
    expect(before.offDays).toBe(0);

    await job.run(day1);
    const afterOne = await gateway.repos.workOrders.requireById(woId);
    expect(afterOne.offDays).toBe(1);
    expect(job.offLastCountedDateOf(woId)).toBe('2026-10-28');
  });

  it('re-running the same WIB day never double-counts off_days (idempotent)', async () => {
    await job.run(day1);
    const second = await job.run(day1);

    // No card rolls again and off_days is unchanged on the re-run.
    expect(second.rolledForwardCardIds).not.toContain(cardId);
    expect(second.offCountedWorkOrderIds).not.toContain(woId);
    const wo = await gateway.repos.workOrders.requireById(woId);
    expect(wo.offDays).toBe(1);
  });

  it('re-running the same WIB day yields identical schedule state', async () => {
    await job.run(day1);
    const after1 = await gateway.repos.scheduleCards.requireById(cardId);
    await job.run(day1);
    const after2 = await gateway.repos.scheduleCards.requireById(cardId);

    expect(after2.plannedDate).toBe(after1.plannedDate);
    expect(after2.status).toBe(after1.status);
    expect(after2.isRolledOver).toBe(after1.isRolledOver);
  });

  it('counts a second OFF day on the next WIB day (unlimited roll-forward)', async () => {
    await job.run(day1);
    const day2 = new Date('2026-10-29T00:00:00.000Z'); // next WIB day
    const result = await job.run(day2);

    // The card is overdue again (it sits on 2026-10-28, before 2026-10-29).
    expect(result.rolledForwardCardIds).toContain(cardId);
    const wo = await gateway.repos.workOrders.requireById(woId);
    expect(wo.offDays).toBe(2);
    expect(job.offLastCountedDateOf(woId)).toBe('2026-10-29');
  });

  it('sends exactly one late alert per recipient per WIB day (REQ-SCH-004/007)', async () => {
    await job.run(day1);
    const afterFirst = notifications
      .listAll()
      .filter((n) => n.kind === NotificationKind.ScheduleLate && n.workOrderId === woId).length;
    expect(afterFirst).toBeGreaterThan(0);

    // A re-run the same WIB day adds no new late alerts (de-duped per WO/day).
    await job.run(day1);
    const afterSecond = notifications
      .listAll()
      .filter((n) => n.kind === NotificationKind.ScheduleLate && n.workOrderId === woId).length;
    expect(afterSecond).toBe(afterFirst);
  });

  it('stops rolling once the WO is Completed (REQ-SCH-003, BR-13)', async () => {
    // Drive the WO to Completed so the card must stop rolling.
    await gateway.unitOfWork(async (ctx) => {
      const wo = await ctx.repos.workOrders.requireById(woId);
      await ctx.repos.workOrders.update({ ...wo, status: WorkOrderStatus.Completed });
    });
    const result = await job.run(day1);
    expect(result.rolledForwardCardIds).not.toContain(cardId);
    expect(result.offCountedWorkOrderIds).not.toContain(woId);
  });
});
