import { Module, type OnModuleInit } from '@nestjs/common';
import { AuditModule } from '../../core/audit/audit.module.js';
import { AssignmentsModule } from '../assignments/assignments.module.js';
import { StepHandlerRegistry } from '../assignments/step-handler.registry.js';
import { MobilisasiController } from './mobilisasi.controller.js';
import { MobilisasiStepService } from './mobilisasi-step.service.js';
import { StooringRatesService } from './stooring-rates.service.js';

/**
 * FG-5a — Mobilisasi (mobilisation) module (REQ-MBL, SM-STEP, RSK-09, DEC-90).
 *
 * TASK-110a delivers, against the dummy gateway, the data-driven mobilisation
 * module: a registry row (seeded in TASK-107) plus a step handler — **no engine
 * change** (PR-6, REQ-REG-006). Start opens a route to the driver's captured
 * destination (REQ-MBL-003); the mechanic's location trail is recorded only
 * while the step is In_Progress and stops at Submit (REQ-MBL-005, RSK-09);
 * arrival auto-submits with a manual "Finish stooring" fallback (REQ-MBL-004);
 * and the submit handler charges the stooring fee once per WO / region / WIB-day
 * (REQ-MBL-006, BR-07). The trail is readable only by Planner/System Admin and
 * every read is logged (RSK-09 / UU-PDP). Per DEC-90 the stooring fee + location
 * trail live here, not on Mechanic Action (TASK-110).
 *
 * The module imports {@link AssignmentsModule} for the engine's
 * {@link StepHandlerRegistry}, into which it **registers** its Mobilisasi submit
 * handler at init — the engine invokes it by the step's own module code, never
 * branching on `Mobilisasi` (REQ-REG-006). It imports {@link AuditModule} to
 * append the RSK-09 trail-access record. Dependencies are one-directional
 * (Mobilisasi → Assignments), so there is no import cycle.
 */
@Module({
  imports: [AuditModule, AssignmentsModule],
  controllers: [MobilisasiController],
  providers: [StooringRatesService, MobilisasiStepService],
  exports: [StooringRatesService, MobilisasiStepService],
})
export class MobilisasiModule implements OnModuleInit {
  constructor(
    private readonly stepHandlers: StepHandlerRegistry,
    private readonly mobilisasi: MobilisasiStepService,
  ) {}

  /**
   * Register the Mobilisasi submit handler keyed by its registry code. The
   * engine resolves `step.moduleCode` → handler on submit; it never names
   * `Mobilisasi` itself (PR-6, REQ-REG-006). The handler stops the trail and
   * charges the stooring fee once per WO/region/WIB-day inside the engine's
   * submit transaction (REQ-MBL-005/006).
   */
  onModuleInit(): void {
    this.stepHandlers.register('Mobilisasi', {
      onSubmit: (step) => {
        this.mobilisasi.onSubmit(step);
      },
    });
  }
}
