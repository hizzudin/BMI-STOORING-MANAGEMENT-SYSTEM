import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  AlertStatus,
  ScheduleStatus,
  WorkOrderSource,
  WorkOrderStatus,
  idValue,
} from '@bmi/shared';
import { SEED_IDS } from '@bmi/data-gateway';
import { DataGatewayModule, DATA_GATEWAY } from '../../core/data-gateway/data-gateway.module.js';
import { AuditModule } from '../../core/audit/audit.module.js';
import { WorkOrdersModule } from '../work-orders/work-orders.module.js';
import type { DataGateway } from '@bmi/data-gateway';
import { AlertRuleService, AlertRuleAction, AlertRuleKind } from './alert-rule.service.js';
import { PmAlertService, AlertReason } from './pm-alert.service.js';
import { ScheduleService } from './schedule.service.js';
import { NotificationService, NotificationKind } from './notification.service.js';

const vehicleId = idValue(SEED_IDS.vehicle);
const planner = idValue(SEED_IDS.users.planner);

describe('PM / alert engine + schedule + notifications (TASK-114)', () => {
  let gateway: DataGateway;
  let rules: AlertRuleService;
  let alerts: PmAlertService;
  let schedule: ScheduleService;
  let notifications: NotificationService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [DataGatewayModule, AuditModule, WorkOrdersModule],
      providers: [AlertRuleService, PmAlertService, ScheduleService, NotificationService],
    }).compile();
    gateway = moduleRef.get<DataGateway>(DATA_GATEWAY);
    rules = moduleRef.get(AlertRuleService);
    alerts = moduleRef.get(PmAlertService);
    schedule = moduleRef.get(ScheduleService);
    notifications = moduleRef.get(NotificationService);
    rules.resetForTests();
    alerts.resetForTests();
    schedule.resetForTests();
    notifications.resetForTests();
  });

  afterEach(() => {
    rules.resetForTests();
    alerts.resetForTests();
    schedule.resetForTests();
    notifications.resetForTests();
  });

  // --- PM / alert engine (REQ-PM) -----------------------------------------

  it('raises a PM alert and drafts exactly one Draft WO (AC-PM-001)', async () => {
    const result = await alerts.trigger({
      vehicleId,
      ruleKind: AlertRuleKind.PmDue,
      reason: AlertReason.Mileage,
      sourceRef: 'PM-1',
      title: 'PM-1 service',
      createdBy: planner,
    });

    expect(result.created).toBe(true);
    expect(result.reason).toBe(AlertReason.Mileage);
    expect(result.draftedWorkOrder).not.toBeNull();
    expect(result.draftedWorkOrder?.status).toBe(WorkOrderStatus.Draft);
    expect(result.draftedWorkOrder?.source).toBe(WorkOrderSource.SystemPM);
  });

  it('never drafts a second WO for the same vehicle + source while one is open (REQ-PM-009)', async () => {
    const first = await alerts.trigger({
      vehicleId,
      ruleKind: AlertRuleKind.PmDue,
      reason: AlertReason.Mileage,
      sourceRef: 'PM-1',
      title: 'PM-1 service',
      createdBy: planner,
    });
    const second = await alerts.trigger({
      vehicleId,
      ruleKind: AlertRuleKind.PmDue,
      reason: AlertReason.Mileage,
      sourceRef: 'PM-1',
      title: 'PM-1 service',
      createdBy: planner,
    });

    expect(second.created).toBe(false);
    expect(idValue(second.alert.id)).toBe(idValue(first.alert.id));
    expect(idValue(second.draftedWorkOrder!.id)).toBe(idValue(first.draftedWorkOrder!.id));
  });

  it('a show-only rule raises an alert without drafting a WO (REQ-PM-007)', async () => {
    rules.save({ kind: AlertRuleKind.TyreTread, action: AlertRuleAction.ShowOnly });
    const result = await alerts.trigger({
      vehicleId,
      ruleKind: AlertRuleKind.TyreTread,
      reason: AlertReason.Tread,
      sourceRef: 'TY-0088',
      title: 'Tyre service',
      createdBy: planner,
    });

    expect(result.created).toBe(true);
    expect(result.draftedWorkOrder).toBeNull();
    expect(result.alert.status).toBe(AlertStatus.Pending);
  });

  it('a drafting PM rule with no preset is refused at save (REQ-PM-010)', () => {
    expect(() =>
      rules.save({ kind: AlertRuleKind.PmDue, action: AlertRuleAction.ShowAndDraft, presetId: null }),
    ).toThrow(/preset/i);
  });

  it('lists every pending alert for the alert list (REQ-PM-003)', async () => {
    rules.save({ kind: AlertRuleKind.TyreTread, action: AlertRuleAction.ShowOnly });
    await alerts.trigger({
      vehicleId,
      ruleKind: AlertRuleKind.TyreTread,
      reason: AlertReason.Tread,
      sourceRef: 'TY-0088',
      title: 'Tyre service',
      createdBy: planner,
    });
    const pending = await alerts.pendingAlerts();
    expect(pending.length).toBeGreaterThan(0);
  });

  // --- Schedule (REQ-SCH) --------------------------------------------------

  it('places a card on a day (SM-SCH Place)', async () => {
    // Give WO a fresh card: the seeded WO already has one, so place a new WO.
    const wo = await gateway.unitOfWork((ctx) =>
      ctx.repos.workOrders.insert({
        number: 'WO-TEST',
        vehicleId: SEED_IDS.vehicle,
        status: WorkOrderStatus.Active,
        source: WorkOrderSource.ManualPlanner,
        category: 'Corrective',
        priority: 'Normal',
        requiresDowntime: true,
        description: 'test',
        findingNote: null,
        presetId: null,
        sentForReviewAt: null,
        statusBeforeAmendment: null,
        amendmentNo: 0,
        offDays: 0,
        createdBy: SEED_IDS.users.planner,
        createdAt: new Date().toISOString(),
        approvedBy: null,
        approvedAt: null,
        activatedAt: null,
        startedAt: null,
        completionRequestedAt: null,
        completedAt: null,
        cancelledBy: null,
        cancelReason: null,
      } as never),
    );
    const card = await schedule.place({ workOrderId: idValue(wo.id), plannedDate: '2026-11-10', userId: planner });
    expect(card.status).toBe(ScheduleStatus.Planned);
    expect(card.plannedDate).toBe('2026-11-10');
    expect(schedule.logEntries().some((l) => l.action === 'Placed')).toBe(true);
  });

  it('two WOs are placeable on the same day (AC-SCH-002)', async () => {
    const makeWo = async (num: string): Promise<number> => {
      const wo = await gateway.unitOfWork((ctx) =>
        ctx.repos.workOrders.insert({
          number: num,
          vehicleId: SEED_IDS.vehicle,
          status: WorkOrderStatus.Active,
          source: WorkOrderSource.ManualPlanner,
          category: 'Corrective',
          priority: 'Normal',
          requiresDowntime: true,
          description: 'test',
          findingNote: null,
          presetId: null,
          sentForReviewAt: null,
          statusBeforeAmendment: null,
          amendmentNo: 0,
          offDays: 0,
          createdBy: SEED_IDS.users.planner,
          createdAt: new Date().toISOString(),
          approvedBy: null,
          approvedAt: null,
          activatedAt: null,
          startedAt: null,
          completionRequestedAt: null,
          completedAt: null,
          cancelledBy: null,
          cancelReason: null,
        } as never),
      );
      return idValue(wo.id);
    };
    const a = await makeWo('WO-A');
    const b = await makeWo('WO-B');
    const cardA = await schedule.place({ workOrderId: a, plannedDate: '2026-11-11', userId: planner });
    const cardB = await schedule.place({ workOrderId: b, plannedDate: '2026-11-11', userId: planner });
    expect(cardA.plannedDate).toBe('2026-11-11');
    expect(cardB.plannedDate).toBe('2026-11-11');
  });

  it('moves the seeded card to another day and logs it (REQ-SCH-002/006)', async () => {
    const cardId = idValue(SEED_IDS.scheduleCard);
    const moved = await schedule.move({ scheduleCardId: cardId, newDay: '2026-11-02', userId: planner });
    expect(moved.plannedDate).toBe('2026-11-02');
    expect(schedule.logEntries().some((l) => l.action === 'Moved')).toBe(true);
  });

  // --- Notifications (REQ-NTF) --------------------------------------------

  it('creates an in-app notification and counts it unread (REQ-NTF-001)', () => {
    notifications.create({ kind: NotificationKind.Alert, userId: planner, message: 'hi' });
    expect(notifications.unreadCount(planner)).toBe(1);
    expect(notifications.listForUser(planner)).toHaveLength(1);
  });

  it('de-duplicates by (kind, user, dedupeKey) so a re-event adds nothing', () => {
    notifications.create({ kind: NotificationKind.ScheduleLate, userId: planner, message: 'late', dedupeKey: 'k1' });
    notifications.create({ kind: NotificationKind.ScheduleLate, userId: planner, message: 'late', dedupeKey: 'k1' });
    expect(notifications.listForUser(planner)).toHaveLength(1);
  });

  it('marks a notification read', () => {
    const n = notifications.create({ kind: NotificationKind.Alert, userId: planner, message: 'hi' });
    const updated = notifications.markRead(n.id, planner);
    expect(updated?.isRead).toBe(true);
    expect(notifications.unreadCount(planner)).toBe(0);
  });

  it('createForMany fans out one per distinct recipient', () => {
    notifications.createForMany([planner, 2, 2, planner], {
      kind: NotificationKind.ScheduleLate,
      message: 'late',
      dedupeKey: 'woDay',
    });
    expect(notifications.listForUser(planner)).toHaveLength(1);
    expect(notifications.listForUser(2)).toHaveLength(1);
  });
});
