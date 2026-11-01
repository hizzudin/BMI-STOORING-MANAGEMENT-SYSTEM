import { Inject, Injectable } from '@nestjs/common';
import {
  Role,
  StepStatus,
  VehicleStatus,
  WorkOrderStatus,
  idValue,
  type AssignmentDto,
  type WorkOrderDto,
} from '@bmi/shared';
import type { DataGateway } from '@bmi/data-gateway';
import { DATA_GATEWAY } from '../../core/data-gateway/data-gateway.module.js';
import type { CurrentUser } from '../../core/auth/current-user.js';
import { PmAlertService } from './pm-alert.service.js';
import { ScheduleService } from './schedule.service.js';
import { NotificationService } from './notification.service.js';

/** A labelled count card on a dashboard (REQ-DSH-*). */
export interface DashboardCard {
  readonly key: string;
  readonly label: string;
  readonly count: number;
}

/** A role dashboard's data (cards + the viewer's unread notifications). */
export interface DashboardData {
  readonly role: Role;
  readonly cards: readonly DashboardCard[];
  readonly unreadNotifications: number;
}

/**
 * **Role dashboards (data)** (FG-12, REQ-DSH-001..010).
 *
 * Returns the per-role dashboard **data** (the count cards each role sees) from
 * the live WO graph, the alert list, the schedule and the viewer's
 * notifications. The web/mobile shells (TASK-117/118) render it; this service
 * only computes it. P1-only cards (cost, tyre minimum per size, bottleneck
 * medians) are hidden until Release 2 (REQ-DSH-008) by simply not emitting them.
 */
@Injectable()
export class DashboardService {
  constructor(
    @Inject(DATA_GATEWAY) private readonly gateway: DataGateway,
    private readonly alerts: PmAlertService,
    private readonly schedule: ScheduleService,
    private readonly notifications: NotificationService,
  ) {}

  /** Compute the dashboard for the viewer's role (REQ-DSH-001..006). */
  async forUser(user: CurrentUser): Promise<DashboardData> {
    const cards = await this.cardsForRole(user);
    return {
      role: user.role,
      cards,
      unreadNotifications: this.notifications.unreadCount(user.userId),
    };
  }

  // --- internals -----------------------------------------------------------

  private async cardsForRole(user: CurrentUser): Promise<readonly DashboardCard[]> {
    const wos = await this.gateway.repos.workOrders.list();
    const steps = await this.gateway.repos.assignments.list();

    switch (user.role) {
      case Role.Mechanic:
      case Role.SystemAdmin:
        // REQ-DSH-003 (Mechanic), plus SA sees everything (REQ-DSH-005).
        return this.mechanicCards(user, wos, steps);
      case Role.Planner:
        return this.plannerCards(wos, steps);
      case Role.WarehouseManager:
        return this.warehouseCards(steps);
      case Role.Supervisor:
      case Role.GM:
        return this.supervisorCards(wos);
      case Role.FieldCoordinator:
        return this.fieldCoordinatorCards(wos);
      default:
        return [];
    }
  }

  /** REQ-DSH-003 Mechanic: steps open / returned / coming, submitted this week, vehicles in the workshop. */
  private async mechanicCards(
    user: CurrentUser,
    wos: readonly WorkOrderDto[],
    steps: readonly AssignmentDto[],
  ): Promise<readonly DashboardCard[]> {
    const mine = steps.filter((s) => s.assigneeId !== null && idValue(s.assigneeId) === user.userId);
    const open = mine.filter((s) => s.status === StepStatus.Open || s.status === StepStatus.InProgress);
    const returned = mine.filter((s) => s.returnNote !== null && s.status !== StepStatus.Verified);
    const coming = steps.filter((s) => s.status === StepStatus.Locked);
    const submittedThisWeek = mine.filter((s) => s.status === StepStatus.Submitted);
    const inWorkshopToday = new Set(
      wos
        .filter((w) => w.requiresDowntime && this.isRepair(w.status))
        .map((w) => idValue(w.vehicleId)),
    );
    return [
      { key: 'steps_open', label: 'Steps open', count: open.length },
      { key: 'steps_returned', label: 'Steps returned', count: returned.length },
      { key: 'steps_coming', label: 'Steps coming (locked)', count: coming.length },
      { key: 'submitted_this_week', label: 'Submitted this week', count: submittedThisWeek.length },
      { key: 'vehicles_in_workshop', label: 'Vehicles in the workshop today', count: inWorkshopToday.size },
    ];
  }

  /** REQ-DSH-002 Planner: steps to verify, drafts, own WOs waiting, WOs not scheduled, alerts without a WO. */
  private async plannerCards(
    wos: readonly WorkOrderDto[],
    steps: readonly AssignmentDto[],
  ): Promise<readonly DashboardCard[]> {
    const toVerify = steps.filter((s) => s.status === StepStatus.Submitted);
    const drafts = wos.filter((w) => w.status === WorkOrderStatus.Draft);
    const waitingApproval = wos.filter((w) => w.status === WorkOrderStatus.PendingApproval);
    const notScheduled = await this.unscheduledOpenCount(wos);
    const alertsWithoutWo = (await this.alerts.pendingAlerts()).length;
    return [
      { key: 'steps_to_verify', label: 'Steps to verify', count: toVerify.length },
      { key: 'drafts', label: 'Drafts from alerts', count: drafts.length },
      { key: 'waiting_approval', label: 'Own WOs waiting for approval', count: waitingApproval.length },
      { key: 'not_on_schedule', label: 'WOs not on the schedule', count: notScheduled },
      { key: 'alerts_without_wo', label: 'Alerts without a WO', count: alertsWithoutWo },
    ];
  }

  /** REQ-DSH-004 Warehouse Manager: Stock steps open, open dispatches (placeholders until FG-8 wiring). */
  private warehouseCards(steps: readonly AssignmentDto[]): readonly DashboardCard[] {
    const stockOpen = steps.filter(
      (s) =>
        (s.moduleCode === 'Stock' || s.moduleCode === 'Part_Purchase') &&
        (s.status === StepStatus.Open || s.status === StepStatus.InProgress),
    );
    return [{ key: 'stock_steps_open', label: 'Stock steps open', count: stockOpen.length }];
  }

  /** REQ-DSH-001 Supervisor / GM: approvals waiting, fleet status, invoices (cost cards P1, hidden). */
  private supervisorCards(wos: readonly WorkOrderDto[]): readonly DashboardCard[] {
    const approvalsWaiting = wos.filter(
      (w) =>
        w.status === WorkOrderStatus.PendingApproval ||
        w.status === WorkOrderStatus.PendingVerification,
    );
    return [
      { key: 'approvals_waiting', label: 'Approvals waiting', count: approvalsWaiting.length },
      { key: 'fleet_open_wos', label: 'Open WOs (fleet)', count: wos.filter((w) => this.isOpen(w.status)).length },
    ];
  }

  /** REQ-DSH-006 Field Coordinator: Active/Repair/Blocked counts, maintenance this week, requests. */
  private async fieldCoordinatorCards(wos: readonly WorkOrderDto[]): Promise<readonly DashboardCard[]> {
    const vehicles = await this.gateway.repos.vehicles.list();
    const byStatus = (status: VehicleStatus): number =>
      vehicles.filter((v) => v.status === status).length;
    return [
      { key: 'vehicles_active', label: 'Active vehicles', count: byStatus(VehicleStatus.Active) },
      { key: 'vehicles_repair', label: 'Vehicles in Repair', count: byStatus(VehicleStatus.Repair) + byStatus(VehicleStatus.OFF) },
      { key: 'vehicles_blocked', label: 'Blocked vehicles', count: byStatus(VehicleStatus.Blocked) },
      { key: 'driver_requests', label: 'Driver requests to turn into WOs', count: wos.filter((w) => w.status === WorkOrderStatus.Draft).length },
    ];
  }

  private async unscheduledOpenCount(wos: readonly WorkOrderDto[]): Promise<number> {
    let count = 0;
    for (const wo of wos) {
      if (!this.isOpen(wo.status)) {
        continue;
      }
      const cards = await this.schedule.cardsForWorkOrder(idValue(wo.id));
      if (cards.length === 0) {
        count += 1;
      }
    }
    return count;
  }

  private isOpen(status: WorkOrderStatus): boolean {
    return (
      status === WorkOrderStatus.Draft ||
      status === WorkOrderStatus.PendingApproval ||
      status === WorkOrderStatus.Active ||
      status === WorkOrderStatus.InProgress ||
      status === WorkOrderStatus.PendingVerification ||
      status === WorkOrderStatus.PendingAmendment
    );
  }

  private isRepair(status: WorkOrderStatus): boolean {
    return (
      status === WorkOrderStatus.InProgress ||
      status === WorkOrderStatus.PendingVerification ||
      status === WorkOrderStatus.PendingAmendment
    );
  }
}
