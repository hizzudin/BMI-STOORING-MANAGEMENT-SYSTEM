import { IsIn, IsInt, IsOptional, IsString, Min, ValidateIf } from 'class-validator';

/**
 * DTOs for the approvals inbox endpoints (FG-10, REQ-APR). Validated
 * server-side by the global ValidationPipe (NFR-04); unknown fields are
 * rejected (`forbidNonWhitelisted`).
 */

/** A decision on an inbox item (REQ-APR-004). A rejection needs a reason. */
export class DecideApprovalDto {
  @IsIn(['approve', 'reject'])
  action!: 'approve' | 'reject';

  /** Required when rejecting (REQ-APR-004, AC-APR-004); refused empty server-side. */
  @ValidateIf((o: DecideApprovalDto) => o.action === 'reject')
  @IsString()
  reason?: string;

  /** Optimistic-lock version for a WO decision; the inbox resolves current if omitted. */
  @IsOptional()
  @IsInt()
  @Min(1)
  version?: number;
}
