import { describe, expect, it } from 'vitest';
import {
  ScheduleStatus,
  WorkOrderCategory,
  WorkOrderPriority,
  WorkOrderSource,
  WorkOrderStatus,
  toId,
  type ScheduleCardDto,
  type WorkOrderDto,
} from '@bmi/shared';
import { buildMechanicTodayList, wibDayIso } from './mechanic-today.js';

const TODAY = '2026-11-11';

function wo(id: number, number: string, priority: WorkOrderPriority): WorkOrderDto {
  return {
    id: toId<'WorkOrderId'>(id),
    number,
    vehicleId: toId<'VehicleId'>(1),
    status: WorkOrderStatus.InProgress,
    source: WorkOrderSource.SystemPM,
    category: WorkOrderCategory.PM,
    priority,
    requiresDowntime: true,
    description: 'x',
    findingNote: null,
    presetId: null,
    sentForReviewAt: null,
    statusBeforeAmendment: null,
    amendmentNo: 0,
    offDays: 0,
    createdBy: toId<'UserId'>(1),
    createdAt: '2026-11-01T00:00:00.000Z',
    approvedBy: null,
    approvedAt: null,
    activatedAt: null,
    startedAt: null,
    completionRequestedAt: null,
    completedAt: null,
    cancelledBy: null,
    cancelReason: null,
    version: 1,
  };
}

function card(id: number, workOrderId: number, plannedDate: string, isRolledOver: boolean): ScheduleCardDto {
  return {
    id: toId<'ScheduleCardId'>(id),
    workOrderId: toId<'WorkOrderId'>(workOrderId),
    plannedDate,
    status: ScheduleStatus.Planned,
    isRolledOver,
    version: 1,
  };
}

const MECH = 3;

describe('buildMechanicTodayList (REQ-MOB-010)', () => {
  it('shows only WOs scheduled today AND assigned to this mechanic', () => {
    const wos = [
      wo(1, 'WO-0001', WorkOrderPriority.Normal), // today + mine
      wo(2, 'WO-0002', WorkOrderPriority.High), // today + someone else
      wo(3, 'WO-0003', WorkOrderPriority.Urgent), // another day + mine
    ];
    const cards = [
      card(10, 1, TODAY, false),
      card(11, 2, TODAY, false),
      card(12, 3, '2026-11-12', false),
    ];
    const assignee = new Map<number, number | null>([
      [1, MECH],
      [2, 99],
      [3, MECH],
    ]);

    const list = buildMechanicTodayList(wos, cards, assignee, { mechanicUserId: MECH, wibDayIso: TODAY });
    expect(list.map((i) => i.number)).toEqual(['WO-0001']);
  });

  it('orders rolled-over/late first, then by urgency descending, then by number', () => {
    const wos = [
      wo(1, 'WO-0001', WorkOrderPriority.Low),
      wo(2, 'WO-0002', WorkOrderPriority.Urgent),
      wo(3, 'WO-0003', WorkOrderPriority.High),
      wo(4, 'WO-0004', WorkOrderPriority.Urgent), // rolled over → first overall
      wo(5, 'WO-0005', WorkOrderPriority.Normal),
    ];
    const cards = [
      card(10, 1, TODAY, false),
      card(11, 2, TODAY, false),
      card(12, 3, TODAY, false),
      card(13, 4, TODAY, true), // rolled over
      card(14, 5, TODAY, false),
    ];
    const assignee = new Map<number, number | null>([
      [1, MECH],
      [2, MECH],
      [3, MECH],
      [4, MECH],
      [5, MECH],
    ]);

    const list = buildMechanicTodayList(wos, cards, assignee, { mechanicUserId: MECH, wibDayIso: TODAY });
    expect(list.map((i) => i.number)).toEqual([
      'WO-0004', // rolled over (Urgent) → first
      'WO-0002', // Urgent
      'WO-0003', // High
      'WO-0005', // Normal
      'WO-0001', // Low
    ]);
    // The first item carries the rolled-over flag the pill renders.
    expect(list[0]?.isRolledOver).toBe(true);
  });

  it('excludes a WO with no assignee', () => {
    const wos = [wo(1, 'WO-0001', WorkOrderPriority.Urgent)];
    const cards = [card(10, 1, TODAY, false)];
    const assignee = new Map<number, number | null>([[1, null]]);
    const list = buildMechanicTodayList(wos, cards, assignee, { mechanicUserId: MECH, wibDayIso: TODAY });
    expect(list).toHaveLength(0);
  });

  it('defaults the WIB day from now when none is given', () => {
    // 2026-11-10T20:00:00Z == 2026-11-11T03:00 WIB (UTC+7).
    expect(wibDayIso(new Date('2026-11-10T20:00:00.000Z'))).toBe('2026-11-11');
    // 16:59:59Z is still the previous WIB day boundary region.
    expect(wibDayIso(new Date('2026-11-10T16:00:00.000Z'))).toBe('2026-11-10');
  });
});
