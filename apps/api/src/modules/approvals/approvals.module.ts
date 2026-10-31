import { Module } from '@nestjs/common';
import { AuditModule } from '../../core/audit/audit.module.js';
import { WorkOrdersModule } from '../work-orders/work-orders.module.js';
import { ChangeRequestsModule } from '../change-requests/change-requests.module.js';
import { InventoryModule } from '../inventory/inventory.module.js';
import { ApprovalsController } from './approvals.controller.js';
import { ApprovalsService } from './approvals.service.js';

/**
 * FG-10 — Approvals inbox (REQ-APR, BR-03, BR-04, DQ-07).
 *
 * TASK-113 delivers, against the dummy gateway, the unified approvals inbox for
 * the decider roles: WO **creation** approvals, **amendment** approvals (FG-9
 * change requests), **completion** approvals and **warehouse count** approvals
 * (stock opname + tyre count, FG-8), ordered Urgent/High first (REQ-WO-015),
 * hiding a viewer's own items unless System Admin (REQ-APR-006, BR-03), with the
 * part-age / early-failure signal on a reviewed part-replacing item (DQ-07,
 * REQ-APR-011).
 *
 * **Reuse, not reimplement:** the inbox is a read/aggregation + routing surface.
 * It aggregates from the owning services and routes every approve/reject back to
 * them — {@link WorkOrdersService} (creation/completion), the
 * {@link ChangeRequestsService} (amendment), the {@link PartsInventoryService}
 * (stock opname) and the {@link TyreRegisterService} (tyre count) — so four-eyes
 * (BR-03) and SM-WO / SM-CR / SM-TYRE stay enforced in one place. It imports the
 * owning modules for their exported services and {@link AuditModule} for the
 * single audit record. Dependencies are one-directional (Approvals → WorkOrders
 * / ChangeRequests / Inventory), so there is no import cycle.
 */
@Module({
  imports: [AuditModule, WorkOrdersModule, ChangeRequestsModule, InventoryModule],
  controllers: [ApprovalsController],
  providers: [ApprovalsService],
  exports: [ApprovalsService],
})
export class ApprovalsModule {}
