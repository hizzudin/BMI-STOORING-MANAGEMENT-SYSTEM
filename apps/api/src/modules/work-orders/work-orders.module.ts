import { Module } from '@nestjs/common';
import { AuditModule } from '../../core/audit/audit.module.js';
import { RegistryModule } from '../registry/registry.module.js';
import { WorkOrdersController } from './work-orders.controller.js';
import { WorkOrdersService } from './work-orders.service.js';
import { StepTimeEventService } from '../assignments/step-time-event.service.js';

/**
 * FG-1 — Work Order lifecycle (REQ-WO, SM-WO, BR-02, BR-03, DEC-87).
 *
 * TASK-108 delivers, against the dummy gateway: create / submit
 * (send-for-review / activate) / approve / reject / cancel / amend with the
 * draft-only discipline (FC / Mechanic / Driver draft only; Planner activates,
 * Supervisor approves), four-eyes (BR-03), the scope lock (BR-02), the
 * field-finding note rules (REQ-WO-016), the priority urgency label / ordering
 * (REQ-WO-015), and the Driver_Breakdown auto-draft pre-seeded with one
 * Mobilisasi step (REQ-MBL-001).
 *
 * The WO service owns step-1 opening on approval and the completion gate (it
 * reads/writes the assignments repository through the gateway), so the module
 * dependency is **one-directional** — {@link AssignmentsModule} imports this one
 * for the WO-level step callbacks, never the reverse (avoiding an ESM import
 * cycle). The {@link StepTimeEventService} step-time ledger (Phase-1 in-memory;
 * PRD §9.6 later) is provided here and shared with the assignment engine. Steps
 * are composed from the {@link RegistryModule} registry (module-agnostic,
 * REQ-REG-006) and Submit is gated by the composer check (REQ-REG-004).
 */
@Module({
  imports: [AuditModule, RegistryModule],
  controllers: [WorkOrdersController],
  providers: [WorkOrdersService, StepTimeEventService],
  exports: [WorkOrdersService, StepTimeEventService],
})
export class WorkOrdersModule {}
