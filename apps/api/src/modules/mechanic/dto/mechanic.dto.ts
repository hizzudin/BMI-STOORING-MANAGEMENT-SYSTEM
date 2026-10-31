import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { Team } from '@bmi/shared';

/**
 * DTOs for the Mechanic Action & Part Check step endpoints (FG-5, REQ-MEC /
 * REQ-CHK). Validated server-side by the global ValidationPipe (NFR-04); money
 * and quantities are typed, never free-text parsed.
 *
 * DEC-90: a Mechanic Action step captures **no location and no stooring** — no
 * DTO here carries a position, device coordinate or stooring field (REQ-MEC-007
 * …009 retired). The work location lives on the WO's Mobilisasi step (TASK-110a).
 */

/** One internal service line, taken from the service catalog (REQ-MEC-002). */
export class InternalServiceLineDto {
  /** The catalog service code; its price is read-only from the catalog (BR-07). */
  @IsString()
  @IsNotEmpty()
  serviceCode!: string;
}

/** One external service line: vendor + free description + free price (REQ-MEC-003). */
export class ExternalServiceLineDto {
  @IsString()
  @IsNotEmpty()
  description!: string;

  @IsNumber()
  @Min(0)
  price!: number;
}

/** Stage a Mechanic Action step before the engine submit (REQ-MEC-001..003). */
export class StageMechanicActionDto {
  /** Internal (catalog) or External (vendor) — chosen before filling (REQ-MEC-001). */
  @IsEnum(Team)
  team!: Team;

  /** Internal: at least one catalog service line (price read-only). */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InternalServiceLineDto)
  internalServices?: InternalServiceLineDto[];

  /** External: the vendor/workshop name (REQ-MEC-003). */
  @IsOptional()
  @IsString()
  vendor?: string;

  /** External: at least one free description + free price line (REQ-MEC-003). */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ExternalServiceLineDto)
  externalServices?: ExternalServiceLineDto[];

  /**
   * Photo references (R2 keys): at least one **repair** photo for Internal, at
   * least one **invoice** image for External (REQ-MEC-002/003). Phase-1 these
   * are opaque string references (file upload is TASK-116).
   */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  photos?: string[];
}

/** One Part Check line outcome at submit (REQ-CHK-002). */
export class CheckItemResultDto {
  /** The line number of the checked part on this step (`work_order_check_items.line_no`). */
  @IsNumber()
  @Min(1)
  lineNo!: number;

  /** The condition the executor wrote — required at submit (REQ-CHK-002). */
  @IsString()
  @IsNotEmpty()
  conditionNote!: string;

  /** Good / Repair / Replace — required at submit (REQ-CHK-002). */
  @IsIn(['Good', 'Repair', 'Replace'])
  decision!: 'Good' | 'Repair' | 'Replace';

  /** A Repair/Replace line MAY be marked Unsafe to drive (REQ-CHK-002/005). */
  @IsOptional()
  @IsBoolean()
  unsafeToDrive?: boolean;

  /** At least one Check_Photo per line — required at submit (REQ-CHK-002). */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  photos?: string[];
}

/** One part the executor adds that was not listed (REQ-CHK-002, "Added by mechanic"). */
export class AddedCheckItemDto {
  /** What the line shows, e.g. "Air brake hose, axle 2" (`label`). */
  @IsString()
  @IsNotEmpty()
  label!: string;

  @IsOptional()
  @IsString()
  sku?: string;

  @IsOptional()
  @IsString()
  tyrePosition?: string;

  @IsString()
  @IsNotEmpty()
  conditionNote!: string;

  @IsIn(['Good', 'Repair', 'Replace'])
  decision!: 'Good' | 'Repair' | 'Replace';

  @IsOptional()
  @IsBoolean()
  unsafeToDrive?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  photos?: string[];
}

/** Stage a Part Check step before the engine submit (REQ-CHK-002, DEC-89). */
export class StagePartCheckDto {
  /** Internal (catalog) or External (vendor) check — the check service (REQ-CHK-007). */
  @IsEnum(Team)
  team!: Team;

  /** Results for every listed part (REQ-CHK-002). */
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CheckItemResultDto)
  results!: CheckItemResultDto[];

  /** Parts not listed that the executor adds under the same rules (REQ-CHK-002). */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AddedCheckItemDto)
  addedParts?: AddedCheckItemDto[];

  /** Internal check service lines, from the catalog (REQ-CHK-007). */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InternalServiceLineDto)
  internalServices?: InternalServiceLineDto[];

  /** External check: vendor name (REQ-CHK-007). */
  @IsOptional()
  @IsString()
  vendor?: string;

  /** External check service lines (vendor description + price, REQ-CHK-007). */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ExternalServiceLineDto)
  externalServices?: ExternalServiceLineDto[];

  /** The invoice image for an external check (REQ-CHK-007). */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  invoiceImages?: string[];
}
