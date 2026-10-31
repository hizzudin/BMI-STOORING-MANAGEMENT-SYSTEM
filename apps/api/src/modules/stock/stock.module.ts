import { Module, type OnModuleInit } from '@nestjs/common';
import { AuditModule } from '../../core/audit/audit.module.js';
import { AssignmentsModule } from '../assignments/assignments.module.js';
import { WorkOrdersModule } from '../work-orders/work-orders.module.js';
import { StepHandlerRegistry } from '../assignments/step-handler.registry.js';
import { StockController } from './stock.controller.js';
import { StockStepService } from './stock-step.service.js';
import { PartPurchaseStepService } from './part-purchase-step.service.js';
import { PartsLedgerService } from './parts-ledger.service.js';

/**
 * FG-4 — Stock step & Part Purchase step (REQ-STK, REQ-PUR, BR-01, BR-06, DEC-60).
 *
 * TASK-109 delivers, against the dummy gateway: the atomic goods issue (stock +
 * stock card + moving-average cost in one transaction), shortfall handling (adds
 * a Part Purchase step), the verified reversal (BR-06), and the Part Purchase
 * step that records typed lines/totals + a receipt and never changes warehouse
 * stock.
 *
 * The module imports {@link AssignmentsModule} for the engine's
 * {@link StepHandlerRegistry}, into which it **registers** its Stock and Part
 * Purchase step handlers at init — the engine invokes them by the step's own
 * module code, never branching on a code (PR-6, REQ-REG-006). It also imports
 * WorkOrdersModule for the shortfall → Part Purchase step insertion
 * (REQ-PUR-008). Both dependencies are one-directional (Stock → Assignments /
 * WorkOrders), so there is no import cycle.
 */
@Module({
  imports: [AuditModule, AssignmentsModule, WorkOrdersModule],
  controllers: [StockController],
  providers: [PartsLedgerService, StockStepService, PartPurchaseStepService],
  exports: [PartsLedgerService, StockStepService, PartPurchaseStepService],
})
export class StockModule implements OnModuleInit {
  constructor(
    private readonly stepHandlers: StepHandlerRegistry,
    private readonly stock: StockStepService,
    private readonly partPurchase: PartPurchaseStepService,
  ) {}

  /**
   * Register the step handlers keyed by their registry codes. The engine resolves
   * `step.moduleCode` → handler on submit/verify; it never names `Stock` or
   * `Part_Purchase` itself (REQ-REG-006).
   */
  onModuleInit(): void {
    this.stepHandlers.register('Stock', {
      onSubmit: (step, user, ctx) => this.stock.onSubmit(step, user, ctx),
      onVerify: (step, user) => this.stock.onVerify(step, user),
    });
    this.stepHandlers.register('Part_Purchase', {
      onSubmit: (step) => this.partPurchase.onSubmit(step),
    });
  }
}
