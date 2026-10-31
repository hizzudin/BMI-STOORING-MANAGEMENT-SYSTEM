import { Module, type OnModuleInit } from '@nestjs/common';
import { AuditModule } from '../../core/audit/audit.module.js';
import { AssignmentsModule } from '../assignments/assignments.module.js';
import { StepHandlerRegistry } from '../assignments/step-handler.registry.js';
import { VehiclesModule } from '../vehicles/vehicles.module.js';
import { PlacementController } from './placement.controller.js';
import { PlacementService } from './placement.service.js';

/**
 * FG-6 — Part Replacement & chassis map (REQ-PLC, BR-11, SM-TYRE, DEC-68, DEC-73).
 *
 * TASK-111 delivers, against the dummy gateway, the Part Replacement step: the
 * **data-generated chassis map** (positions generated from the vehicle's stored
 * chassis layout via the TASK-106 generator — 1–6 axle, trailer and spare
 * layouts, never hard-coded, DEC-73/REQ-PLC-008), replace / rotate / demount /
 * scrap **within the WO's locked scope** (BR-02/BR-11), the SM-TYRE status
 * transitions (§3.6, refusing an unlisted move) written **atomically** with the
 * placement, an **append-only placement history** (never a silent overwrite),
 * and a **placement snapshot** captured at submit for the WO document
 * (REQ-PLC-014, rendered by TASK-115).
 *
 * It is a **pure data-driven registry module** (PR-6, REQ-REG-006): one registry
 * row (seeded in TASK-107 as `Part_Replacement`) plus the handler registered
 * into the shared {@link StepHandlerRegistry} — the generic engine never names
 * Part_Replacement. The module imports {@link AssignmentsModule} for the engine
 * registry/service, {@link VehiclesModule} for the data-driven chassis-layout
 * generator ({@link VehicleClassService}, reused not duplicated), and
 * {@link AuditModule}. Dependencies are one-directional (Placement →
 * Assignments / Vehicles), so there is no import cycle.
 */
@Module({
  imports: [AuditModule, AssignmentsModule, VehiclesModule],
  controllers: [PlacementController],
  providers: [PlacementService],
  exports: [PlacementService],
})
export class PlacementModule implements OnModuleInit {
  constructor(
    private readonly stepHandlers: StepHandlerRegistry,
    private readonly placement: PlacementService,
  ) {}

  /**
   * Register the Part Replacement submit handler keyed by its registry code.
   * The engine resolves `step.moduleCode` → handler on submit and runs it inside
   * the engine's `unitOfWork`; it never names `Part_Replacement` itself (PR-6,
   * REQ-REG-006). The handler captures the placement snapshot for the WO
   * document (REQ-PLC-014) transactionally with the submit.
   */
  onModuleInit(): void {
    this.stepHandlers.register('Part_Replacement', {
      onSubmit: async (step, _user, ctx) => {
        await this.placement.onSubmit(step, ctx.repos);
      },
    });
  }
}
