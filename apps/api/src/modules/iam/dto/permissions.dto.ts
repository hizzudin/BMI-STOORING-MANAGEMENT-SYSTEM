import { ArrayNotEmpty, IsArray, IsBoolean, IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import type { PlannerApprovalKind } from '../app-settings.service.js';

const APPROVAL_KINDS: readonly PlannerApprovalKind[] = [
  'wo_creation',
  'wo_amendment',
  'wo_completion',
  'stock_opname',
  'tyre_count',
];

/**
 * `PUT /roles/planner-approval` — switch Planner approval on/off (REQ-IAM-008,
 * Access Manager only). A reason is required; an optional end time and the set
 * of ticked approval kinds are supplied when turning it on.
 */
export class PlannerApprovalSwitchDto {
  @IsBoolean()
  on!: boolean;

  @IsString()
  @MinLength(1)
  reason!: string;

  /** ISO-8601 UTC end time; the switch turns off when it passes. */
  @IsOptional()
  @IsString()
  until?: string;

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsIn(APPROVAL_KINDS, { each: true })
  kinds?: PlannerApprovalKind[];
}
