import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { AuthenticatedRequest, CurrentUser } from '../../core/auth/current-user.js';
import { RequireCapability } from '../../core/auth/require-capability.decorator.js';
import { Capabilities } from '../../core/auth/permission-matrix.js';
import { enrichAudit } from '../../core/audit/audit-context.js';
import { AlertRuleService } from './alert-rule.service.js';
import { PmAlertService } from './pm-alert.service.js';
import { ScheduleService } from './schedule.service.js';
import { NotificationService } from './notification.service.js';
import { DashboardService } from './dashboard.service.js';
import { BreakdownReportService } from './breakdown-report.service.js';
import { DailyJobService } from './daily-job.service.js';
import {
  MoveScheduleDto,
  PlaceScheduleDto,
  ReportBreakdownDto,
  RunDailyJobDto,
  SaveAlertRuleDto,
  TriggerAlertDto,
} from './dto/maintenance.dto.js';

/**
 * FG-12 — PM / alert engine, maintenance schedule, in-app notifications, role
 * dashboards and the simulated daily job (REQ-PM, REQ-SCH, REQ-NTF, REQ-DSH,
 * REQ-MBL-002, SM-SCH, DEC-86, DEC-92).
 *
 * Mutating endpoints carry the §2.2 RolesGuard (`schedule.manage` for schedule
 * and alert-rule config / daily-job run; `vehicle.manage` for the System-Admin
 * breakdown report), the global ValidationPipe, the IdempotencyInterceptor, an
 * optimistic-lock (`version`) check on gateway writes and exactly one audit
 * record via the AuditInterceptor. Dashboards and notification reads are GETs.
 */
@Controller('maintenance')
export class MaintenanceController {
  constructor(
    private readonly alertRules: AlertRuleService,
    private readonly alerts: PmAlertService,
    private readonly schedule: ScheduleService,
    private readonly notifications: NotificationService,
    private readonly dashboards: DashboardService,
    private readonly breakdowns: BreakdownReportService,
    private readonly dailyJob: DailyJobService,
  ) {}

  // --- Alert rules + PM / alert engine (REQ-PM) ----------------------------

  @Get('alert-rules')
  listAlertRules(): { rules: unknown } {
    return { rules: this.alertRules.list() };
  }

  @Post('alert-rules')
  @RequireCapability(Capabilities.ScheduleManage)
  @HttpCode(HttpStatus.OK)
  saveAlertRule(@Req() req: AuthenticatedRequest, @Body() dto: SaveAlertRuleDto): { rule: unknown } {
    this.principal(req);
    const rule = this.alertRules.save({
      kind: dto.kind,
      action: dto.action,
      ...(dto.presetId === undefined ? {} : { presetId: dto.presetId }),
      ...(dto.priority === undefined ? {} : { priority: dto.priority }),
      ...(dto.notifyRoles === undefined ? {} : { notifyRoles: dto.notifyRoles }),
    });
    enrichAudit(req, { entity: 'alert_rules', entityId: rule.id, after: { kind: rule.kind, action: rule.action }, reason: 'save_alert_rule' });
    return { rule };
  }

  /** The alert list (every alert without a WO), with its reason (REQ-PM-003). */
  @Get('alerts')
  async listAlerts(): Promise<{ alerts: unknown[] }> {
    const pending = await this.alerts.pendingAlerts();
    return {
      alerts: pending.map((a) => ({
        alert: a,
        reason: this.alerts.reasonOf(a.id as unknown as number),
      })),
    };
  }

  /** Trigger an alert evaluation (REQ-PM-001/009). Drafts one WO per its rule. */
  @Post('alerts/trigger')
  @RequireCapability(Capabilities.ScheduleManage)
  @HttpCode(HttpStatus.CREATED)
  async triggerAlert(@Req() req: AuthenticatedRequest, @Body() dto: TriggerAlertDto): Promise<unknown> {
    const user = this.principal(req);
    const result = await this.alerts.trigger({
      vehicleId: dto.vehicleId,
      ruleKind: dto.ruleKind,
      reason: dto.reason,
      sourceRef: dto.sourceRef,
      title: dto.title,
      ...(dto.category === undefined ? {} : { category: dto.category }),
      ...(dto.presetId === undefined ? {} : { presetId: dto.presetId }),
      createdBy: user.userId,
    });
    enrichAudit(req, {
      entity: 'maintenance_alerts',
      entityId: result.alert.id as unknown as number,
      after: { type: result.alert.alertType, created: result.created, draftedWorkOrderId: result.draftedWorkOrder?.id ?? null },
      reason: 'trigger_alert',
    });
    return result;
  }

  // --- Maintenance schedule (REQ-SCH) --------------------------------------

  @Get('schedule')
  async listSchedule(): Promise<{ cards: unknown; log: unknown }> {
    return { cards: await this.schedule.list(), log: this.schedule.logEntries() };
  }

  @Post('schedule')
  @RequireCapability(Capabilities.ScheduleManage)
  @HttpCode(HttpStatus.CREATED)
  async placeSchedule(@Req() req: AuthenticatedRequest, @Body() dto: PlaceScheduleDto): Promise<{ card: unknown }> {
    const user = this.principal(req);
    const card = await this.schedule.place({ workOrderId: dto.workOrderId, plannedDate: dto.plannedDate, userId: user.userId });
    enrichAudit(req, { entity: 'wo_schedule', entityId: card.id as unknown as number, after: { workOrderId: dto.workOrderId, plannedDate: dto.plannedDate }, reason: 'place_schedule' });
    return { card };
  }

  @Post('schedule/:id/move')
  @RequireCapability(Capabilities.ScheduleManage)
  @HttpCode(HttpStatus.OK)
  async moveSchedule(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: MoveScheduleDto,
  ): Promise<{ card: unknown }> {
    const user = this.principal(req);
    const card = await this.schedule.move({ scheduleCardId: id, newDay: dto.newDay, userId: user.userId });
    enrichAudit(req, { entity: 'wo_schedule', entityId: id, after: { newDay: dto.newDay }, reason: 'move_schedule' });
    return { card };
  }

  // --- Breakdown drafting (REQ-PM-005, REQ-MBL-002, REQ-WO-016) ------------

  @Post('breakdowns')
  @RequireCapability(Capabilities.VehicleManage)
  @HttpCode(HttpStatus.CREATED)
  async reportBreakdown(@Req() req: AuthenticatedRequest, @Body() dto: ReportBreakdownDto): Promise<unknown> {
    const user = this.principal(req);
    const result = await this.breakdowns.report({
      vehicleId: dto.vehicleId,
      driverId: dto.driverId,
      description: dto.description,
      reportedBy: user.userId,
      ...(dto.locationLat === undefined ? {} : { locationLat: dto.locationLat }),
      ...(dto.locationLng === undefined ? {} : { locationLng: dto.locationLng }),
      ...(dto.photoRef === undefined ? {} : { photoRef: dto.photoRef }),
    });
    enrichAudit(req, {
      entity: 'breakdown_reports',
      entityId: result.report.id,
      after: { vehicleId: dto.vehicleId, draftedWorkOrderId: result.draftedWorkOrder.id },
      reason: 'report_breakdown',
    });
    return result;
  }

  // --- Notifications (REQ-NTF) ---------------------------------------------

  @Get('notifications')
  listNotifications(@Req() req: AuthenticatedRequest): { notifications: unknown; unread: number } {
    const user = this.principal(req);
    return {
      notifications: this.notifications.listForUser(user.userId),
      unread: this.notifications.unreadCount(user.userId),
    };
  }

  @Post('notifications/:id/read')
  @HttpCode(HttpStatus.OK)
  markRead(@Req() req: AuthenticatedRequest, @Param('id', ParseIntPipe) id: number): { notification: unknown } {
    const user = this.principal(req);
    const notification = this.notifications.markRead(id, user.userId);
    enrichAudit(req, { entity: 'notifications', entityId: id, after: { isRead: true }, reason: 'mark_notification_read' });
    return { notification };
  }

  // --- Role dashboards (REQ-DSH) -------------------------------------------

  @Get('dashboard')
  async dashboard(@Req() req: AuthenticatedRequest): Promise<unknown> {
    const user = this.principal(req);
    return this.dashboards.forUser(user);
  }

  // --- Simulated daily job (REQ-SCH-003, SM-SCH, DEC-92, NFR-14) -----------

  @Post('daily-job/run')
  @RequireCapability(Capabilities.ScheduleManage)
  @HttpCode(HttpStatus.OK)
  async runDailyJob(@Req() req: AuthenticatedRequest, @Body() dto: RunDailyJobDto, @Query('now') nowQuery?: string): Promise<unknown> {
    this.principal(req);
    const nowValue = dto.now ?? nowQuery;
    const now = nowValue ? new Date(nowValue) : new Date();
    const result = await this.dailyJob.run(now);
    enrichAudit(req, {
      entity: 'wo_schedule',
      after: { wibDay: result.wibDay, rolledForward: result.rolledForwardCardIds.length, offCounted: result.offCountedWorkOrderIds.length },
      reason: 'run_daily_job',
    });
    return result;
  }

  // --- helpers -------------------------------------------------------------

  private principal(req: AuthenticatedRequest): CurrentUser {
    if (!req.currentUser) {
      throw new UnauthorizedException('Authentication required.');
    }
    return req.currentUser;
  }
}
