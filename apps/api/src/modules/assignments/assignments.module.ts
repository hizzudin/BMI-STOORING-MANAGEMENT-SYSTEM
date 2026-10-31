import { Module } from '@nestjs/common';
import { AuditModule } from '../../core/audit/audit.module.js';
import { RegistryModule } from '../registry/registry.module.js';
import { WorkOrdersModule } from '../work-orders/work-orders.module.js';
import { AssignmentsController } from './assignments.controller.js';
import { AssignmentsService } from './assignments.service.js';

/**
 * FG-2 — Assignment engine & step lifecycle (REQ-ENG, SM-STEP, DEC-87).
 *
 * TASK-108 delivers, against the dummy gateway: the step lifecycle
 * (open-on-submit, claim/assign/reassign/release, Start/Pause/Resume time
 * events, verify/return), all module-agnostic — each step's executor/verifier
 * rules are read from its registry row (PR-6, REQ-REG-006), never branched on a
 * module code.
 *
 * The module dependency is one-directional: this module imports
 * {@link WorkOrdersModule} for {@link WorkOrdersService} (the WO-level step
 * callbacks: first-step-started / last-step-submitted / step-returned) and for
 * the shared {@link StepTimeEventService} ledger. The WO service owns step-1
 * opening and the completion gate, so nothing in WorkOrdersModule imports this
 * one — avoiding an ESM import cycle.
 */
@Module({
  imports: [AuditModule, RegistryModule, WorkOrdersModule],
  controllers: [AssignmentsController],
  providers: [AssignmentsService],
  exports: [AssignmentsService],
})
export class AssignmentsModule {}
