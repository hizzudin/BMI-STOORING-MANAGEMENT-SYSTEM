import { Module } from '@nestjs/common';
import { AuditModule } from '../../core/audit/audit.module.js';
import { RegistryController } from './registry.controller.js';
import { ModuleRegistryService } from './module-registry.service.js';
import { PresetService } from './preset.service.js';
import { ComposerCheckService } from './composer-check.service.js';

/**
 * FG-3 — Module registry, step composer & WO presets (REQ-REG, PR-6, DEC-85/88).
 *
 * TASK-107 delivers, against the dummy gateway:
 *   - **Module registry** ({@link ModuleRegistryService}) — the six step modules
 *     (Stock, Part_Purchase, Mechanic_Action, Mobilisasi, Part_Replacement,
 *     Document) plus Part_Check (DEC-88) as **editable master-data rows**, never
 *     hard-coded in the engine. Registering a 7th module is a new row, pickable
 *     in the composer with no engine edit (PR-6, REQ-REG-006, AC-REG-003).
 *   - **WO presets (versioned)** + **PM packages** ({@link PresetService}) —
 *     saving under an existing name adds a new version (REQ-REG-003); existing
 *     WOs keep their own steps (AC-REG-005); PM packages draft steps via a
 *     preset version (REQ-REG-007).
 *   - **Live composer checks** ({@link ComposerCheckService}) — the three named
 *     REQ-REG-004 checks (no step → refuse; at most one Document step; a warning
 *     when Part_Replacement precedes any Stock step), surfaced live and gating
 *     Submit server-side.
 *
 * Phase 1: the registry, presets and PM packages are API-layer in-memory stores
 * (TASK-103..106 precedent). TASK-201/202 re-home them behind the PRD §9.5/§9.6
 * `assignment_modules` / `wo_presets` / `wo_preset_steps` / `pm_packages` /
 * `pm_tasks` tables unchanged. {@link AuditModule} supplies the cross-cutting
 * audit of every mutating call.
 */
@Module({
  imports: [AuditModule],
  controllers: [RegistryController],
  providers: [ModuleRegistryService, PresetService, ComposerCheckService],
  exports: [ModuleRegistryService, PresetService, ComposerCheckService],
})
export class RegistryModule {}
