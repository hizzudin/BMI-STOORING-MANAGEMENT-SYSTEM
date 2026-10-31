import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsPositive,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Role, WorkOrderCategory } from '@bmi/shared';
import { MODULE_COST_KINDS } from '../module-registry.service.js';

/**
 * DTOs for FG-3 module registry, step composer and WO presets (REQ-REG).
 *
 * Server-side validation only (fullstack-guardian: never trust the client).
 * These shape/bound checks run before the services apply the registry's own
 * rules (unique module/preset names, verifier-role restriction, known-module
 * references, versioning, the REQ-REG-004 composer checks).
 */

const ROLE_VALUES = Object.values(Role);
const VERIFIER_VALUES = [Role.Planner, Role.SystemAdmin];
const CATEGORY_VALUES = Object.values(WorkOrderCategory);

// ===========================================================================
// Module registry (REQ-REG-002/006)
// ===========================================================================

/** `POST /registry/modules` — register a new step module as a registry row. */
export class RegisterModuleDto {
  /** Module code, e.g. `Stock`, `Mobilisasi` (unique). */
  @IsString()
  @MinLength(1)
  code!: string;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  /** Front-end component opened in the WO workspace. */
  @IsString()
  @MinLength(1)
  uiComponent!: string;

  @IsOptional()
  @IsObject()
  configSchema?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  creationSchema?: Record<string, unknown>;

  /** Who may run a step of this module (one or more roles). */
  @IsArray()
  @ArrayMinSize(1)
  @IsIn(ROLE_VALUES, { each: true })
  executorRoles!: Role[];

  @IsOptional()
  @IsObject()
  scopeRules?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  completionSection?: Record<string, unknown>;

  /** Cost contribution: Parts, Labor, Document or None. */
  @IsIn(MODULE_COST_KINDS)
  costKind!: (typeof MODULE_COST_KINDS)[number];

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

// ===========================================================================
// WO presets (versioned) (REQ-REG-003/005)
// ===========================================================================

/** One step in a saved preset (module drawn from the registry). */
export class PresetStepDto {
  /** The registry module code this step runs. */
  @IsString()
  @MinLength(1)
  module!: string;

  @IsOptional()
  @IsObject()
  stepConfig?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  isOptional?: boolean;

  /** Who may run this step (one or more roles). */
  @IsArray()
  @ArrayMinSize(1)
  @IsIn(ROLE_VALUES, { each: true })
  executorRoles!: Role[];

  /** Verifier role — only Planner or System Admin (PRD §9.6). */
  @IsIn(VERIFIER_VALUES)
  verifierRole!: typeof Role.Planner | typeof Role.SystemAdmin;
}

/** `POST /registry/presets` — save (or re-version) a WO preset (REQ-REG-003). */
export class SavePresetDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsIn(CATEGORY_VALUES)
  category!: WorkOrderCategory;

  @IsOptional()
  @IsBoolean()
  requiresDowntime?: boolean;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PresetStepDto)
  steps!: PresetStepDto[];
}

// ===========================================================================
// PM packages (REQ-REG-007)
// ===========================================================================

/** `POST /registry/pm-packages` — create a PM package (REQ-REG-007). */
export class CreatePmPackageDto {
  @IsInt()
  @IsPositive()
  vehicleClassId!: number;

  @IsString()
  @MinLength(1)
  packageCode!: string;

  @IsString()
  @MinLength(1)
  packageName!: string;

  /** Interval in km; omit (or null) only for a Towed class (REQ-PLC-018). */
  @IsOptional()
  @IsInt()
  @IsPositive()
  intervalKm?: number;

  @IsInt()
  @IsPositive()
  intervalDays!: number;

  /** The preset version whose steps this package's alerts draft. */
  @IsInt()
  @IsPositive()
  presetId!: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tasks?: string[];
}

// ===========================================================================
// Live composer checks (REQ-REG-004)
// ===========================================================================

/** One step as the designer currently has it (order matters). */
export class ComposedStepDto {
  @IsString()
  @MinLength(1)
  module!: string;
}

/** `POST /registry/composer/check` — run the live composer checks. */
export class ComposerCheckDto {
  /** The current step list; may be empty (which is itself an error finding). */
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ComposedStepDto)
  steps!: ComposedStepDto[];
}
