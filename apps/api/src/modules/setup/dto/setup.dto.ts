import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

/**
 * DTOs for FG-14 Setup mode (REQ-IAM-011 bulk import, REQ-INV-013 opening
 * balance, REQ-IAM-010 go-live). Server-side validation only (fullstack-guardian:
 * never trust the client) — these shape+bound checks run before the service
 * applies the entity's own business rules.
 */

/** One row of a vehicles bulk import (REQ-IAM-011, AC-IAM-007). */
export class VehicleImportRowDto {
  /** Plate, e.g. `B 1234 ABC` (REQ-VEH-*: unique, non-empty). */
  @IsString()
  @MinLength(1)
  plate!: string;

  /** The vehicle class id — must be a known class or the row fails. */
  @IsInt()
  @IsPositive()
  classId!: number;

  /** The chassis layout id for the class. */
  @IsInt()
  @IsPositive()
  chassisLayoutId!: number;

  /** Opening odometer reading (km); 0 or more. */
  @IsInt()
  @Min(0)
  odometerKm!: number;

  /** Optional billing customer id. */
  @IsOptional()
  @IsInt()
  @IsPositive()
  customerId?: number;
}

/**
 * `POST /setup/import/vehicles` — bulk import a vehicles file (REQ-IAM-011).
 * All rows import in one transaction, or none do (AC-IAM-007). `fileName` keeps
 * the original file reference the import-batch record stores.
 */
export class VehicleImportDto {
  @IsString()
  @MinLength(1)
  fileName!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => VehicleImportRowDto)
  rows!: VehicleImportRowDto[];
}

/** One row of the opening balance (REQ-INV-013, AC-INV-006). */
export class OpeningBalanceRowDto {
  /** The part SKU, e.g. `SKU-1029`. */
  @IsString()
  @MinLength(1)
  sku!: string;

  /** Physical quantity on hand at go-live; 0 or more. */
  @IsNumber()
  @Min(0)
  quantity!: number;

  /** Unit cost in Rupiah; 0 or more. */
  @IsNumber()
  @Min(0)
  unitCost!: number;

  /** Rack / storage location. */
  @IsString()
  @MinLength(1)
  rack!: string;
}

/**
 * `POST /setup/opening-balance` — the one-time opening balance (REQ-INV-013).
 * Setup-mode only; refused once Live.
 */
export class OpeningBalanceDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => OpeningBalanceRowDto)
  rows!: OpeningBalanceRowDto[];
}

/** `POST /setup/go-live` — confirm the one-way switch to Live (REQ-IAM-010). */
export class GoLiveDto {
  /**
   * The System Admin's explicit confirmation after seeing the checklist
   * (REQ-IAM-010 "presses Go live and confirms"). Must be the literal `true`.
   */
  @IsOptional()
  confirm?: boolean;
}
