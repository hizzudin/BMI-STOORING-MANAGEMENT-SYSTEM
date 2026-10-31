import 'reflect-metadata';
import { BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it } from 'vitest';
import { Role, WorkOrderCategory } from '@bmi/shared';
import { ModuleRegistryService } from './module-registry.service.js';
import { PresetService } from './preset.service.js';
import { ComposerCheckService } from './composer-check.service.js';

/**
 * Unit coverage for FG-3 (TASK-107): the module registry, versioned WO presets,
 * PM packages and the live composer checks — against the in-memory stores.
 *
 * Headline proofs:
 *   - **Configuration over code (PR-6, AC-REG-003):** a 7th dummy module appears
 *     in the composer's module list and is accepted in a preset / composition
 *     with no engine edit — only a new registry row.
 *   - **Preset versioning (REQ-REG-003, AC-REG-005):** re-saving a preset adds a
 *     new version while a WO created from the earlier version keeps its steps.
 *   - **Live composer checks (REQ-REG-004, AC-REG-001):** an invalid composition
 *     is rejected (no step; two Document steps) and a Part_Replacement-before-
 *     Stock ordering warns but never blocks.
 */
describe('Registry — module registry, presets, composer checks (TASK-107)', () => {
  let registry: ModuleRegistryService;
  let presets: PresetService;
  let composer: ComposerCheckService;

  beforeEach(() => {
    registry = new ModuleRegistryService();
    presets = new PresetService(registry);
    composer = new ComposerCheckService(registry);
  });

  // --- Module registry: the six modules are rows, not hard-coded -----------

  it('seeds the six step modules (plus Part_Check) as active registry rows', () => {
    const codes = registry.listActive().map((m) => m.code);
    expect(codes).toEqual(
      expect.arrayContaining([
        'Stock',
        'Part_Purchase',
        'Mechanic_Action',
        'Mobilisasi',
        'Part_Replacement',
        'Document',
      ]),
    );
    // Part_Check (DEC-88) is a seventh seeded row of the same shape.
    expect(codes).toContain('Part_Check');
    // The designer offers only active rows, in sort order.
    const sorted = [...registry.listActive()];
    expect(sorted).toEqual([...sorted].sort((a, b) => a.sortOrder - b.sortOrder));
  });

  it('refuses a duplicate module code', () => {
    expect(() =>
      registry.register({
        code: 'Stock',
        name: 'Dup',
        uiComponent: 'X',
        executorRoles: [Role.Mechanic],
        costKind: 'None',
      }),
    ).toThrow(BadRequestException);
  });

  it('a deactivated module stops new use but stays readable (REQ-REG-005)', () => {
    registry.deactivate('Document');
    expect(registry.isActive('Document')).toBe(false);
    expect(registry.listActive().map((m) => m.code)).not.toContain('Document');
    // Still known/readable for old WOs.
    expect(registry.isKnown('Document')).toBe(true);
    expect(registry.require('Document').name).toBe('Document');
  });

  it('mayExecute honours executor roles; the System Admin always may (PRD §9.6)', () => {
    expect(registry.mayExecute('Stock', Role.WarehouseManager)).toBe(true);
    expect(registry.mayExecute('Stock', Role.Mechanic)).toBe(false);
    expect(registry.mayExecute('Stock', Role.SystemAdmin)).toBe(true);
  });

  // --- HEADLINE: a 7th module with NO engine edit (PR-6, AC-REG-003) -------

  it('AC-REG-003 — a newly registered 7th module appears in the composer with no engine edit', () => {
    const before = registry.listActive().length;
    const created = registry.register({
      code: 'Tyre_Scan',
      name: 'Tyre Scan',
      description: 'A future module registered as data, not code.',
      uiComponent: 'StepTyreScan',
      executorRoles: [Role.Mechanic],
      costKind: 'None',
    });
    expect(created.isActive).toBe(true);

    // 1) It appears in the module list the designer offers — no code branch.
    const active = registry.listActive().map((m) => m.code);
    expect(active).toContain('Tyre_Scan');
    expect(registry.listActive().length).toBe(before + 1);

    // 2) The composer accepts a composition that uses it — same contract.
    const result = composer.check([{ module: 'Tyre_Scan' }]);
    expect(result.canSubmit).toBe(true);
    expect(result.findings).toHaveLength(0);

    // 3) A preset can be built from it — the preset engine never names a module.
    const preset = presets.savePreset({
      name: 'Scan only',
      category: WorkOrderCategory.Corrective,
      createdBy: 1,
      steps: [{ module: 'Tyre_Scan', executorRoles: [Role.Mechanic], verifierRole: Role.Planner }],
    });
    expect(preset.steps[0]?.module).toBe('Tyre_Scan');
  });

  // --- WO presets (versioned) ----------------------------------------------

  it('AC-REG-002 — a preset may hold the Stock module in two steps', () => {
    const preset = presets.savePreset({
      name: 'Double stock',
      category: WorkOrderCategory.Corrective,
      createdBy: 1,
      steps: [
        { module: 'Stock', executorRoles: [Role.WarehouseManager], verifierRole: Role.Planner },
        { module: 'Stock', executorRoles: [Role.WarehouseManager], verifierRole: Role.Planner },
      ],
    });
    expect(preset.steps).toHaveLength(2);
    expect(preset.steps.map((s) => s.sequenceNo)).toEqual([1, 2]);
    expect(preset.steps.every((s) => s.module === 'Stock')).toBe(true);
  });

  it('refuses a preset step whose module is unknown or inactive', () => {
    expect(() =>
      presets.savePreset({
        name: 'Bad',
        category: WorkOrderCategory.Other,
        createdBy: 1,
        steps: [{ module: 'Nope', executorRoles: [Role.Mechanic], verifierRole: Role.Planner }],
      }),
    ).toThrow(BadRequestException);

    registry.deactivate('Document');
    expect(() =>
      presets.savePreset({
        name: 'Bad2',
        category: WorkOrderCategory.Document,
        createdBy: 1,
        steps: [{ module: 'Document', executorRoles: [Role.Planner], verifierRole: Role.Planner }],
      }),
    ).toThrow(BadRequestException);
  });

  it('refuses a verifier role that is not Planner or System Admin (PRD §9.6)', () => {
    expect(() =>
      presets.savePreset({
        name: 'Bad verifier',
        category: WorkOrderCategory.Corrective,
        createdBy: 1,
        steps: [
          {
            module: 'Stock',
            executorRoles: [Role.WarehouseManager],
            verifierRole: Role.Mechanic as never,
          },
        ],
      }),
    ).toThrow(BadRequestException);
  });

  it('AC-REG-005 — re-saving a preset adds a new version; a WO keeps its own version', () => {
    const v1 = presets.savePreset({
      name: 'PM minor',
      category: WorkOrderCategory.PM,
      createdBy: 1,
      steps: [{ module: 'Stock', executorRoles: [Role.WarehouseManager], verifierRole: Role.Planner }],
    });
    expect(v1.version).toBe(1);

    // A WO was created from v1: it references the v1 id and copies v1's steps.
    const woStepsSnapshot = v1.steps.map((s) => s.module);
    const woPresetId = v1.id;

    // The preset is re-saved as a new version with different steps.
    const v2 = presets.savePreset({
      name: 'PM minor',
      category: WorkOrderCategory.PM,
      createdBy: 1,
      steps: [
        { module: 'Stock', executorRoles: [Role.WarehouseManager], verifierRole: Role.Planner },
        { module: 'Mechanic_Action', executorRoles: [Role.Mechanic], verifierRole: Role.Planner },
      ],
    });
    expect(v2.version).toBe(2);
    expect(presets.versionsOf('PM minor').map((p) => p.version)).toEqual([1, 2]);
    expect(presets.latestActive('PM minor')?.version).toBe(2);

    // The WO created from v1 is unchanged: v1 still has its single step, and the
    // WO's own id/steps still point at v1 — it never followed v2 (AC-REG-005).
    const stillV1 = presets.require(woPresetId);
    expect(stillV1.version).toBe(1);
    expect(stillV1.steps).toHaveLength(1);
    expect(stillV1.steps.map((s) => s.module)).toEqual(woStepsSnapshot);
  });

  it('latestActive skips a deactivated newest version (REQ-REG-005)', () => {
    presets.savePreset({
      name: 'Seasonal',
      category: WorkOrderCategory.Corrective,
      createdBy: 1,
      steps: [{ module: 'Stock', executorRoles: [Role.WarehouseManager], verifierRole: Role.Planner }],
    });
    const v2 = presets.savePreset({
      name: 'Seasonal',
      category: WorkOrderCategory.Corrective,
      createdBy: 1,
      steps: [{ module: 'Mechanic_Action', executorRoles: [Role.Mechanic], verifierRole: Role.Planner }],
    });
    presets.deactivate(v2.id);
    expect(presets.latestActive('Seasonal')?.version).toBe(1);
  });

  // --- PM packages (REQ-REG-007) -------------------------------------------

  it('creates a PM package drafting its steps through a preset version', () => {
    const preset = presets.savePreset({
      name: 'PM-1 steps',
      category: WorkOrderCategory.PM,
      createdBy: 1,
      steps: [{ module: 'Stock', executorRoles: [Role.WarehouseManager], verifierRole: Role.Planner }],
    });
    const pkg = presets.createPmPackage({
      vehicleClassId: 1,
      packageCode: 'PM-1',
      packageName: 'Minor service',
      intervalKm: 10000,
      intervalDays: 90,
      presetId: preset.id,
      tasks: ['Change engine oil', 'Replace oil filter'],
    });
    expect(pkg.presetId).toBe(preset.id);
    expect(pkg.tasks).toHaveLength(2);
    expect(presets.listPmPackages(1).map((p) => p.packageCode)).toContain('PM-1');
  });

  it('refuses a PM package referencing an unknown preset or a duplicate code', () => {
    expect(() =>
      presets.createPmPackage({
        vehicleClassId: 1,
        packageCode: 'PM-X',
        packageName: 'X',
        intervalDays: 30,
        presetId: 999,
      }),
    ).toThrow(BadRequestException);

    const preset = presets.savePreset({
      name: 'PM steps',
      category: WorkOrderCategory.PM,
      createdBy: 1,
      steps: [{ module: 'Stock', executorRoles: [Role.WarehouseManager], verifierRole: Role.Planner }],
    });
    presets.createPmPackage({
      vehicleClassId: 1,
      packageCode: 'PM-2',
      packageName: 'Major',
      intervalDays: 180,
      presetId: preset.id,
    });
    expect(() =>
      presets.createPmPackage({
        vehicleClassId: 1,
        packageCode: 'PM-2',
        packageName: 'Dup',
        intervalDays: 180,
        presetId: preset.id,
      }),
    ).toThrow(BadRequestException);
  });

  // --- Live composer checks (REQ-REG-004) ----------------------------------

  it('AC-REG-001 — a composition with no step cannot be submitted', () => {
    const result = composer.check([]);
    expect(result.canSubmit).toBe(false);
    expect(result.findings.map((f) => f.code)).toContain('NO_STEP');
  });

  it('refuses a composition with two Document steps (REQ-REG-004)', () => {
    const result = composer.check([
      { module: 'Document' },
      { module: 'Document' },
    ]);
    expect(result.canSubmit).toBe(false);
    expect(result.findings.map((f) => f.code)).toContain('MULTIPLE_DOCUMENT_STEPS');
  });

  it('warns (never blocks) when Part_Replacement comes before any Stock step (REQ-REG-004)', () => {
    const result = composer.check([
      { module: 'Part_Replacement' },
      { module: 'Stock' },
    ]);
    const replacementFinding = result.findings.find(
      (f) => f.code === 'REPLACEMENT_BEFORE_STOCK',
    );
    expect(replacementFinding?.severity).toBe('warning');
    // A warning never blocks submit.
    expect(result.canSubmit).toBe(true);
  });

  it('accepts a valid composition (Stock then Part_Replacement, one Document)', () => {
    const result = composer.check([
      { module: 'Stock' },
      { module: 'Part_Replacement' },
      { module: 'Document' },
    ]);
    expect(result.canSubmit).toBe(true);
    expect(result.findings).toHaveLength(0);
  });

  it('refuses a composition that names a deactivated or unknown module', () => {
    const unknown = composer.check([{ module: 'Ghost' }]);
    expect(unknown.canSubmit).toBe(false);
    expect(unknown.findings.map((f) => f.code)).toContain('UNKNOWN_MODULE');

    registry.deactivate('Document');
    const inactive = composer.check([{ module: 'Document' }]);
    expect(inactive.canSubmit).toBe(false);
    expect(inactive.findings.map((f) => f.code)).toContain('UNKNOWN_MODULE');
  });
});
