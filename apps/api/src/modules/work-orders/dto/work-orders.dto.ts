import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  Role,
  WorkOrderCategory,
  WorkOrderPriority,
  WorkOrderSource,
} from '@bmi/shared';

/**
 * DTOs for the WO lifecycle endpoints (FG-1, REQ-WO). Every field is validated
 * server-side by the global ValidationPipe (NFR-04); unknown fields are
 * rejected (`forbidNonWhitelisted`).
 */

/** One composed step in Create WO (REQ-WO-017). Module named by registry code. */
export class CreateStepDto {
  /** `assignment_modules.code` — resolved against the registry (REQ-REG-006). */
  @IsString()
  @IsNotEmpty()
  module!: string;

  /** Roles allowed to execute this step (REQ-ENG-003). */
  @IsArray()
  @ArrayMinSize(1)
  @IsEnum(Role, { each: true })
  executorRoles!: Role[];

  /** Verifier — Planner or System Admin (REQ-ENG-005); validated in the service. */
  @IsEnum(Role)
  verifierRole!: Role;

  @IsOptional()
  @IsBoolean()
  isOptional?: boolean;

  @IsOptional()
  stepConfig?: Record<string, unknown>;
}

/** Create a WO (REQ-WO-001). A FC/Mechanic draft carries no steps (REQ-WO-016). */
export class CreateWorkOrderDto {
  @IsInt()
  @Min(1)
  vehicleId!: number;

  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsEnum(WorkOrderCategory)
  category!: WorkOrderCategory;

  @IsEnum(WorkOrderPriority)
  @IsOptional()
  priority?: WorkOrderPriority;

  @IsOptional()
  @IsBoolean()
  requiresDowntime?: boolean;

  @IsString()
  description!: string;

  /** Field-finding note (REQ-WO-016); required for FC/Mechanic drafts at send. */
  @IsOptional()
  @IsString()
  findingNote?: string;

  /** The WO source (REQ-WO-002). Defaults to the creator's role when omitted. */
  @IsOptional()
  @IsEnum(WorkOrderSource)
  source?: WorkOrderSource;

  /** Steps composed in Create WO (REQ-WO-017). Omitted/empty for a FC/Mechanic draft. */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateStepDto)
  steps?: CreateStepDto[];

  /** Optional preset version to copy steps from (REQ-ENG-004). */
  @IsOptional()
  @IsInt()
  @Min(1)
  presetId?: number;
}

/** Edit a WO's common fields while Draft/Rejected (REQ-WO-016 preserves findingNote). */
export class EditWorkOrderDto {
  @IsInt()
  @Min(1)
  version!: number;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  title?: string;

  @IsOptional()
  @IsEnum(WorkOrderCategory)
  category?: WorkOrderCategory;

  @IsOptional()
  @IsEnum(WorkOrderPriority)
  priority?: WorkOrderPriority;

  @IsOptional()
  @IsBoolean()
  requiresDowntime?: boolean;

  @IsOptional()
  @IsString()
  description?: string;

  /** Replace the composed steps (REQ-WO-017). */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateStepDto)
  steps?: CreateStepDto[];
}

/** Optimistic-lock envelope for a plain lifecycle transition. */
export class WorkOrderVersionDto {
  @IsInt()
  @Min(1)
  version!: number;
}

/** Reject creation (REQ-WO-007). Reason required (AC-WO-005). */
export class RejectWorkOrderDto {
  @IsInt()
  @Min(1)
  version!: number;

  @IsString()
  @IsNotEmpty()
  reason!: string;
}

/** Cancel a WO (REQ-WO-008). Reason required. */
export class CancelWorkOrderDto {
  @IsInt()
  @Min(1)
  version!: number;

  @IsString()
  @IsNotEmpty()
  reason!: string;
}

/** Create a breakdown auto-draft (REQ-MBL-001). Driver-sourced; one Mobilisasi step. */
export class BreakdownDraftDto {
  @IsInt()
  @Min(1)
  vehicleId!: number;

  /** The breakdown narrative — copied into finding_note (REQ-WO-003, DEC-91). */
  @IsString()
  @IsNotEmpty()
  description!: string;

  /** The driver's captured destination (REQ-MOB-003). */
  @IsOptional()
  locationLat?: number;

  @IsOptional()
  locationLng?: number;

  /** A reference to the originating breakdown report, when known. */
  @IsOptional()
  @IsInt()
  @Min(1)
  breakdownReportId?: number;
}
