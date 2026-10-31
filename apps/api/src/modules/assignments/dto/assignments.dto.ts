import {
  IsEnum,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { PAUSE_REASONS, type PauseReason } from '../step-time-event.service.js';

/**
 * DTOs for the step / assignment engine endpoints (FG-2, REQ-ENG). Validated
 * server-side by the global ValidationPipe (NFR-04).
 */

/** Optimistic-lock envelope for a plain step transition. */
export class StepVersionDto {
  @IsInt()
  @Min(1)
  version!: number;
}

/** Start a step (REQ-ENG-012). Optional entered-earlier time (REQ-ENG-014). */
export class StartStepDto {
  @IsInt()
  @Min(1)
  version!: number;

  /** Start from an earlier time, ≤ 2 h back and never before Open (REQ-ENG-014). */
  @IsOptional()
  @IsISO8601()
  startedAt?: string;

  /** Required when `startedAt` is an entered earlier time (REQ-ENG-014). */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  reason?: string;
}

/** Pause a started step with a reason (REQ-ENG-013). */
export class PauseStepDto {
  @IsInt()
  @Min(1)
  version!: number;

  @IsEnum(PAUSE_REASONS)
  pauseReason!: PauseReason;

  /** Required when the reason is "Other" (REQ-ENG-013). */
  @IsOptional()
  @IsString()
  note?: string;
}

/** Return a submitted step to its executor (REQ-ENG-005). Note required. */
export class ReturnStepDto {
  @IsInt()
  @Min(1)
  version!: number;

  @IsString()
  @IsNotEmpty()
  note!: string;
}

/** Assign or reassign a step to a named user (REQ-ENG-011). */
export class AssignStepDto {
  @IsInt()
  @Min(1)
  version!: number;

  @IsInt()
  @Min(1)
  assigneeId!: number;

  /** Required on a reassign (REQ-ENG-011). */
  @IsOptional()
  @IsString()
  reason?: string;
}

/** Release a claimed step (REQ-ENG-011). Reason required. */
export class ReleaseStepDto {
  @IsInt()
  @Min(1)
  version!: number;

  @IsString()
  @IsNotEmpty()
  reason!: string;
}
