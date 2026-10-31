import { Module } from '@nestjs/common';
import { AuditModule } from '../../core/audit/audit.module.js';
import { WorkOrdersModule } from '../work-orders/work-orders.module.js';
import { AssignmentsModule } from '../assignments/assignments.module.js';
import { ChangeRequestsController } from './change-requests.controller.js';
import { ChangeRequestsService } from './change-requests.service.js';

/**
 * FG-9 — Change requests & amendments (REQ-CR, SM-CR §3.7, BR-02, BR-03).
 *
 * TASK-113 delivers, against the dummy gateway, the executor-raised change
 * request and the WO-creator amendment decision: the open step's executor
 * raises a CR (REQ-CR-001) which moves the WO to Pending_Amendment (SM-WO T8,
 * freezing the open step via the engine); the WO creator opens it, revises the
 * not-yet-submitted steps and sends it for approval (REQ-CR-003); an Approver
 * approves (applies the revision, raises the amendment number, restores the
 * status — SM-WO T9, REQ-CR-004) or rejects it with a reason (SM-WO T10,
 * REQ-CR-005). SM-CR is driven through the shared `smChangeRequest` guard; an
 * unlisted transition is refused.
 *
 * **Reuse, not reimplement:** the WO lifecycle (Pending_Amendment / amendment
 * counter / revision apply) stays owned by {@link WorkOrdersService} (imported
 * from {@link WorkOrdersModule}); this module drives SM-CR and calls into the WO
 * service's amendment path. It imports {@link AssignmentsModule} to read the
 * open step and validate the raiser is its executor, and {@link AuditModule}
 * for the single audit record. Dependencies are one-directional, so there is no
 * import cycle.
 */
@Module({
  imports: [AuditModule, WorkOrdersModule, AssignmentsModule],
  controllers: [ChangeRequestsController],
  providers: [ChangeRequestsService],
  exports: [ChangeRequestsService],
})
export class ChangeRequestsModule {}
