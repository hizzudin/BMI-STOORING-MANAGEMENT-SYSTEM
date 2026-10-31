import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Min,
} from 'class-validator';

/**
 * DTOs for the Part Replacement step endpoints (FG-6, REQ-PLC, BR-11, SM-TYRE).
 * Validated server-side by the global ValidationPipe (NFR-04); positions and
 * tyre ids are typed, never free-text parsed. The global whitelist pipe rejects
 * any field not declared here.
 */

/**
 * Mount (or replace) a tyre at a position (REQ-PLC-002/003).
 *
 * "Replace" is a mount onto a position: if the position already carries a tyre
 * the client demounts it first (its own call). The tyre must be Issued to this
 * WO (BR-11, AC-PLC-001) and the position must exist in the vehicle's generated
 * chassis map.
 */
export class MountTyreDto {
  /** The position code from the generated chassis map (e.g. `A1_L`, `SPARE_1`). */
  @IsString()
  @IsNotEmpty()
  position!: string;

  /** The tyre to mount — must be Issued to this WO (REQ-PLC-003, BR-11). */
  @IsInt()
  @IsPositive()
  tyreId!: number;

  /** Tread depth (mm) recorded at mount (REQ-PLC-007); optional. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  treadMm?: number;

  /** Pressure (PSI) recorded at mount (REQ-PLC-007); optional. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  pressurePsi?: number;
}

/**
 * Rotate: move a mounted tyre to another position, or swap two mounted tyres
 * (REQ-PLC-005/019). Both tyres stay Mounted; only their positions change.
 */
export class RotateTyreDto {
  /** The position currently holding the tyre to move. */
  @IsString()
  @IsNotEmpty()
  fromPosition!: string;

  /** The target position (empty → move; occupied → swap). */
  @IsString()
  @IsNotEmpty()
  toPosition!: string;
}

/** The three legal demount conditions (REQ-PLC-004, SM-TYRE §3.6). */
export const DEMOUNT_CONDITIONS = ['Needs_Retread', 'Worn_Out', 'In_Stock'] as const;

/**
 * Demount a tyre from a position and set its condition (REQ-PLC-004). The
 * condition drives the SM-TYRE transition to Needs_Retread / Worn_Out / In_Stock
 * (back to stock).
 */
export class DemountTyreDto {
  @IsString()
  @IsNotEmpty()
  position!: string;

  /** The condition chosen at demount (REQ-PLC-004). */
  @IsString()
  @IsIn(DEMOUNT_CONDITIONS as unknown as string[])
  condition!: (typeof DEMOUNT_CONDITIONS)[number];
}

/** Scrap a tyre from a position (REQ-PLC-002, SM-TYRE Mounted → Scrapped). */
export class ScrapTyreDto {
  @IsString()
  @IsNotEmpty()
  position!: string;
}
