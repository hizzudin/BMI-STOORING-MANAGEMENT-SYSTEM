import { Module } from '@nestjs/common';
import { AuditModule } from '../../core/audit/audit.module.js';
import { WorkOrdersModule } from '../work-orders/work-orders.module.js';
import { VehiclesModule } from '../vehicles/vehicles.module.js';
import { BillingModule } from '../billing/billing.module.js';
import { MaintenanceController } from './maintenance.controller.js';
import { AlertRuleService } from './alert-rule.service.js';
import { PmAlertService } from './pm-alert.service.js';
import { ScheduleService } from './schedule.service.js';
import { NotificationService } from './notification.service.js';
import { DashboardService } from './dashboard.service.js';
import { BreakdownReportService } from './breakdown-report.service.js';
import { DailyJobService } from './daily-job.service.js';

/**
 * FG-12 — PM engine, schedule, dashboards, notifications & the daily job
 * (REQ-PM, REQ-SCH, REQ-SCH-003, REQ-NTF, REQ-DSH, REQ-MBL-002, SM-SCH, DEC-86,
 * DEC-92).
 *
 * TASK-114 delivers, against the dummy gateway:
 *   - **PM / alert engine** ({@link AlertRuleService} + {@link PmAlertService}) —
 *     alert rules → one Draft WO per alert, de-duplicated per vehicle + source,
 *     **reusing** {@link WorkOrdersService} (the WO-lifecycle owner) and never
 *     re-implementing WO creation (REQ-PM-001..010).
 *   - **Maintenance schedule** ({@link ScheduleService}) — plan-only place/move,
 *     SM-SCH, the move log (REQ-SCH-001..006, BR-13).
 *   - **In-app notifications** ({@link NotificationService}) — REQ-NTF-001..005.
 *   - **Role dashboards (data)** ({@link DashboardService}) — REQ-DSH-001..010.
 *   - **Breakdown drafting** ({@link BreakdownReportService}) — a Driver_Breakdown
 *     report auto-drafts a one-Mobilisasi-step Draft WO at the captured location,
 *     **reusing** `WorkOrdersService.createBreakdownDraft` (REQ-PM-005,
 *     REQ-MBL-002, REQ-WO-016).
 *   - **Simulated daily job** ({@link DailyJobService}) — idempotent 00:30 WIB
 *     roll-forward (`is_rolled_over`), OFF recalculation via the TASK-106
 *     derivation seam {@link VehiclesService.recomputeStatus}, and `off_days` /
 *     `off_last_counted_date` (counted once per WIB day, DEC-92, NFR-14).
 *
 * It imports {@link WorkOrdersModule} (WO draft / breakdown reuse — one
 * directional, no cycle), {@link VehiclesModule} (the derived-status seam) and
 * {@link AuditModule} (cross-cutting audit); the role guard, validation pipe and
 * idempotency interceptor are global.
 */
@Module({
  imports: [AuditModule, WorkOrdersModule, VehiclesModule, BillingModule],
  controllers: [MaintenanceController],
  providers: [
    AlertRuleService,
    PmAlertService,
    ScheduleService,
    NotificationService,
    DashboardService,
    BreakdownReportService,
    DailyJobService,
  ],
  exports: [
    AlertRuleService,
    PmAlertService,
    ScheduleService,
    NotificationService,
    DashboardService,
    BreakdownReportService,
    DailyJobService,
  ],
})
export class MaintenanceModule {}
