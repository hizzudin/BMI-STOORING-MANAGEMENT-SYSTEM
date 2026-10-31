import { Module, type OnModuleInit } from '@nestjs/common';
import { AuditModule } from '../../core/audit/audit.module.js';
import { AssignmentsModule } from '../assignments/assignments.module.js';
import { WorkOrdersModule } from '../work-orders/work-orders.module.js';
import { StockModule } from '../stock/stock.module.js';
import { StepHandlerRegistry } from '../assignments/step-handler.registry.js';
import { MechanicController } from './mechanic.controller.js';
import { MechanicActionStepService } from './mechanic-action-step.service.js';
import { PartCheckStepService } from './part-check-step.service.js';
import { ServiceCatalogService } from './service-catalog.service.js';

/**
 * FG-5 — Mechanic Action & Part Check (REQ-MEC, REQ-CHK, DEC-88/89/90).
 *
 * TASK-110 delivers, against the dummy gateway: the Mechanic Action step
 * (Internal catalog services at a read-only snapshotted price, or External
 * vendor/free-price work, with labour cost and repair/invoice photos — and
 * **no location, Rp 0 stooring** per DEC-90, REQ-MEC-007..009 retired), and the
 * Part Check step (per-part Good/Repair/Replace with photos, which on **verify**
 * creates one follow-up **Draft** WO from the not-good findings, atomically in
 * the engine's verify transaction, through the WorkOrders service).
 *
 * The module imports {@link AssignmentsModule} for the engine's
 * {@link StepHandlerRegistry}, into which it **registers** its Mechanic Action
 * and Part Check step handlers at init — the engine invokes them by the step's
 * own module code, never branching on a code (PR-6, REQ-REG-006). It imports
 * WorkOrdersModule to build the follow-up Draft WO (REQ-CHK-003) and StockModule
 * to read on-hand stock when deciding Stock-vs-Part-Purchase for a Replace
 * finding. All dependencies are one-directional (Mechanic → Assignments /
 * WorkOrders / Stock), so there is no import cycle.
 */
@Module({
  imports: [AuditModule, AssignmentsModule, WorkOrdersModule, StockModule],
  controllers: [MechanicController],
  providers: [ServiceCatalogService, MechanicActionStepService, PartCheckStepService],
  exports: [ServiceCatalogService, MechanicActionStepService, PartCheckStepService],
})
export class MechanicModule implements OnModuleInit {
  constructor(
    private readonly stepHandlers: StepHandlerRegistry,
    private readonly mechanicAction: MechanicActionStepService,
    private readonly partCheck: PartCheckStepService,
  ) {}

  /**
   * Register the step handlers keyed by their registry codes. The engine resolves
   * `step.moduleCode` → handler on submit/verify; it never names `Mechanic_Action`
   * or `Part_Check` itself (REQ-REG-006).
   */
  onModuleInit(): void {
    this.stepHandlers.register('Mechanic_Action', {
      onSubmit: (step) => this.mechanicAction.onSubmit(step),
    });
    this.stepHandlers.register('Part_Check', {
      onSubmit: (step) => this.partCheck.onSubmit(step),
      onVerify: (step, user, ctx) => this.partCheck.onVerify(step, user, ctx),
    });
  }
}
