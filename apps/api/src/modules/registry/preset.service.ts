import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role, WorkOrderCategory } from '@bmi/shared';
import { ModuleRegistryService } from './module-registry.service.js';

/**
 * One step of a preset version (`wo_preset_steps`, PRD §9.6). A step is a module
 * drawn from the registry, placed at a 1-based sequence, with its executor
 * roles, verifier role, optional flag and saved step details (`step_config`).
 */
export interface PresetStep {
  readonly sequenceNo: number;
  readonly module: string;
  readonly stepConfig: Readonly<Record<string, unknown>>;
  readonly isOptional: boolean;
  readonly executorRoles: readonly Role[];
  /** Verifier role — only Planner or System Admin (PRD §9.6 CHECK). */
  readonly verifierRole: typeof Role.Planner | typeof Role.SystemAdmin;
}

/**
 * A WO preset **version** (`wo_presets`, PRD §9.6). Presets are versioned:
 * saving under an existing name adds a new version (REQ-REG-003) and the old
 * version stays readable. A WO records the `presetId` (version) it started
 * from; it never follows the preset afterwards (AC-REG-005).
 */
export interface WoPreset {
  readonly id: number;
  readonly name: string;
  readonly category: WorkOrderCategory;
  readonly requiresDowntime: boolean;
  readonly version: number;
  readonly createdBy: number;
  readonly isActive: boolean;
  readonly steps: readonly PresetStep[];
}

/** A PM package (`pm_packages`, PRD §9.5, REQ-REG-007) — steps via a preset. */
export interface PmPackage {
  readonly id: number;
  readonly vehicleClassId: number;
  readonly packageCode: string;
  readonly packageName: string;
  /** Interval in km — `null` only for a Towed class (REQ-PLC-018). */
  readonly intervalKm: number | null;
  readonly intervalDays: number;
  /** The preset version whose steps this package's alerts draft. */
  readonly presetId: number;
  readonly tasks: readonly string[];
  readonly isActive: boolean;
}

/** Input for a preset step (before sequence numbering). */
export interface PresetStepInput {
  module: string;
  stepConfig?: Record<string, unknown>;
  isOptional?: boolean;
  executorRoles: Role[];
  verifierRole: typeof Role.Planner | typeof Role.SystemAdmin;
}

/** Input to save (or re-version) a preset. */
export interface SavePresetInput {
  name: string;
  category: WorkOrderCategory;
  requiresDowntime?: boolean;
  createdBy: number;
  steps: PresetStepInput[];
}

/** Input to create a PM package. */
export interface CreatePmPackageInput {
  vehicleClassId: number;
  packageCode: string;
  packageName: string;
  intervalKm?: number | null;
  intervalDays: number;
  presetId: number;
  tasks?: string[];
}

const VERIFIER_ROLES: readonly Role[] = [Role.Planner, Role.SystemAdmin];

/**
 * **WO presets (versioned) and PM packages** (FG-3, REQ-REG-003/005/007,
 * DEC-85/DEC-88).
 *
 * - A preset is a saved step sequence that is an optional *starting point* for
 *   a WO (DEC-85), never followed afterwards. Saving under an existing name
 *   adds a new **version** (REQ-REG-003); a WO created from version N keeps
 *   version N's steps even after the preset is re-saved as N+1 (AC-REG-005).
 * - Deactivating a preset stops new use but keeps old WOs readable (REQ-REG-005).
 * - A PM package (per vehicle class) drafts its steps through a preset version
 *   (REQ-REG-007, DEC-70).
 *
 * Phase 1: an API-layer in-memory store (TASK-103..106 precedent); TASK-201/202
 * re-home it behind the PRD §9.5/§9.6 `wo_presets` / `wo_preset_steps` /
 * `pm_packages` / `pm_tasks` tables unchanged.
 */
@Injectable()
export class PresetService {
  private readonly presets = new Map<number, WoPreset>();
  private readonly pmPackages = new Map<number, PmPackage>();
  private nextPresetId = 1;
  private nextPmId = 1;

  constructor(private readonly registry: ModuleRegistryService) {}

  /**
   * Save the current steps as a preset (REQ-REG-003). If a preset with that
   * name already exists, store a **new version**; otherwise version 1. Returns
   * the stored version. Validates that every step's module is a known, active
   * registry module and that the verifier role is Planner or System Admin.
   */
  savePreset(input: SavePresetInput): WoPreset {
    const name = input.name.trim();
    if (name.length === 0) {
      throw new BadRequestException('Preset name is required.');
    }
    if (input.steps.length === 0) {
      throw new BadRequestException('A preset needs at least one step.');
    }
    const steps = this.buildSteps(input.steps);
    const priorVersions = this.versionsOf(name);
    const version =
      priorVersions.length === 0
        ? 1
        : Math.max(...priorVersions.map((p) => p.version)) + 1;
    const preset: WoPreset = {
      id: this.nextPresetId,
      name,
      category: input.category,
      requiresDowntime: input.requiresDowntime ?? true,
      version,
      createdBy: input.createdBy,
      isActive: true,
      steps,
    };
    this.presets.set(preset.id, preset);
    this.nextPresetId += 1;
    return preset;
  }

  /** A preset version by id, throwing if absent. */
  require(id: number): WoPreset {
    const found = this.presets.get(id);
    if (!found) {
      throw new NotFoundException(`Unknown WO preset: ${id}`);
    }
    return found;
  }

  /** Whether `id` is a known preset version. */
  isKnown(id: number): boolean {
    return this.presets.has(id);
  }

  /** Deactivate a preset version: stop new use, keep it readable (REQ-REG-005). */
  deactivate(id: number): WoPreset {
    const preset = this.require(id);
    const next: WoPreset = { ...preset, isActive: false };
    this.presets.set(id, next);
    return next;
  }

  /** Every version saved under `name`, oldest first. */
  versionsOf(name: string): readonly WoPreset[] {
    const key = name.trim().toLowerCase();
    return [...this.presets.values()]
      .filter((p) => p.name.toLowerCase() === key)
      .sort((a, b) => a.version - b.version);
  }

  /** The latest **active** version for `name`, or `undefined`. */
  latestActive(name: string): WoPreset | undefined {
    const active = this.versionsOf(name).filter((p) => p.isActive);
    return active.length === 0 ? undefined : active[active.length - 1];
  }

  /** Every preset version (newest first), for admin screens. */
  listAll(): readonly WoPreset[] {
    return [...this.presets.values()].sort((a, b) => b.id - a.id);
  }

  // --- PM packages (REQ-REG-007) -------------------------------------------

  /** Create a PM package drafting its steps through a preset version. */
  createPmPackage(input: CreatePmPackageInput): PmPackage {
    const code = input.packageCode.trim();
    if (code.length === 0) {
      throw new BadRequestException('Package code is required.');
    }
    if (!this.isKnown(input.presetId)) {
      throw new BadRequestException(`Unknown preset for PM package: ${input.presetId}`);
    }
    if (input.intervalDays <= 0) {
      throw new BadRequestException('interval_days must be positive.');
    }
    if (input.intervalKm !== null && input.intervalKm !== undefined && input.intervalKm <= 0) {
      throw new BadRequestException('interval_km must be positive when set.');
    }
    const duplicate = [...this.pmPackages.values()].some(
      (p) =>
        p.vehicleClassId === input.vehicleClassId &&
        p.packageCode.toUpperCase() === code.toUpperCase(),
    );
    if (duplicate) {
      throw new BadRequestException(
        `Package code already exists for this class: ${code}`,
      );
    }
    const pkg: PmPackage = {
      id: this.nextPmId,
      vehicleClassId: input.vehicleClassId,
      packageCode: code,
      packageName: input.packageName.trim(),
      intervalKm: input.intervalKm ?? null,
      intervalDays: input.intervalDays,
      presetId: input.presetId,
      tasks: input.tasks?.map((t) => t.trim()).filter((t) => t.length > 0) ?? [],
      isActive: true,
    };
    this.pmPackages.set(pkg.id, pkg);
    this.nextPmId += 1;
    return pkg;
  }

  /** A PM package by id, throwing if absent. */
  requirePmPackage(id: number): PmPackage {
    const found = this.pmPackages.get(id);
    if (!found) {
      throw new NotFoundException(`Unknown PM package: ${id}`);
    }
    return found;
  }

  /** PM packages for a vehicle class (REQ-REG-007). */
  listPmPackages(vehicleClassId?: number): readonly PmPackage[] {
    const all = [...this.pmPackages.values()];
    return vehicleClassId === undefined
      ? all
      : all.filter((p) => p.vehicleClassId === vehicleClassId);
  }

  /** Test-only reset to empty. */
  resetForTests(): void {
    this.presets.clear();
    this.pmPackages.clear();
    this.nextPresetId = 1;
    this.nextPmId = 1;
  }

  /**
   * Validate and number the steps: every module must be a known active registry
   * module, with at least one executor role allowed by that module, and a
   * verifier role of Planner or System Admin. Sequence numbers are assigned
   * 1..n in the given order (AC-REG-004 renumbering is the caller's reorder).
   */
  private buildSteps(inputs: PresetStepInput[]): PresetStep[] {
    return inputs.map((step, i) => {
      if (!this.registry.isKnown(step.module)) {
        throw new BadRequestException(`Unknown module in preset: ${step.module}`);
      }
      if (!this.registry.isActive(step.module)) {
        throw new BadRequestException(`Inactive module in preset: ${step.module}`);
      }
      if (step.executorRoles.length === 0) {
        throw new BadRequestException(
          `Step ${i + 1} (${step.module}) needs an executor role.`,
        );
      }
      if (!VERIFIER_ROLES.includes(step.verifierRole)) {
        throw new BadRequestException(
          `Step ${i + 1} verifier must be Planner or System Admin.`,
        );
      }
      return {
        sequenceNo: i + 1,
        module: this.registry.require(step.module).code,
        stepConfig: step.stepConfig ?? {},
        isOptional: step.isOptional ?? false,
        executorRoles: [...step.executorRoles],
        verifierRole: step.verifierRole,
      };
    });
  }
}
