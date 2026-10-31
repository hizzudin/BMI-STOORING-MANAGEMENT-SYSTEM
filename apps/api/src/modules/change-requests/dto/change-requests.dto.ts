import {
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
import { WorkOrderCategory, WorkOrderPriority } from '@bmi/shared';
import { CreateStepDto } from '../../work-orders/dto/work-orders.dto.js';

/**
 * DTOs for the change-request & amendment endpoints (FG-9, REQ-CR). Validated
 * server-side by the global ValidationPipe (NFR-04); unknown fields are
 * rejected (`forbidNonWhitelisted`), so a revision cannot sneak in a vehicle
 * switch through an undeclared field — the service refuses an explicit one too
 * (AC-CR-004).
 */

/** The open step's executor raises a change request (REQ-CR-001). */
export class RaiseChangeRequestDto {
  /** The open step the CR is raised from (REQ-CR-001). */
  @IsInt()
  @Min(1)
  assignmentId!: number;

  /** What is wrong / what should change (REQ-CR-001). */
  @IsString()
  @IsNotEmpty()
  whatChanges!: string;

  /** The requested change (REQ-CR-001). */
  @IsString()
  @IsNotEmpty()
  requestedChange!: string;

  /** The executor's reason (REQ-CR-001). */
  @IsString()
  @IsNotEmpty()
  reason!: string;
}

/**
 * The WO creator's revision sent for approval (REQ-CR-003). A revision may
 * change the open step and the not-started steps after it; it may NOT switch
 * the vehicle (AC-CR-004) and may not touch an already-submitted step
 * (AC-CR-005) — both refused server-side.
 */
export class ReviseChangeRequestDto {
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

  /** The not-yet-submitted steps the revision replaces (REQ-CR-003/008). */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateStepDto)
  revisedSteps?: CreateStepDto[];

  /**
   * Present only when a client (wrongly) tries to switch the vehicle; the
   * service refuses it (AC-CR-004). Declared so the whitelist pipe surfaces it
   * to the service rather than silently stripping it.
   */
  @IsOptional()
  @IsInt()
  @Min(1)
  vehicleId?: number;
}

/** Reject a revision with a reason (REQ-CR-005, AC-APR-004). */
export class RejectRevisionDto {
  @IsString()
  @IsNotEmpty()
  reason!: string;
}
