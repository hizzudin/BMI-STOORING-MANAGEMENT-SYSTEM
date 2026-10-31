import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsISO8601,
  IsOptional,
  IsPositive,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

/**
 * DTOs for FG-7 Vehicles, documents and odometer (REQ-VEH, REQ-DOC).
 *
 * Server-side validation only (fullstack-guardian: never trust the client).
 * These shape/bound checks run before the services apply the entity's own
 * business rules (unique plate, SM-DOC transitions, the odometer jump/decrease
 * rules of BR-09, correct-entry-before-renewal, etc.).
 */

// ===========================================================================
// Vehicle classes & data-driven chassis layouts (REQ-VEH-002, REQ-PLC-017)
// ===========================================================================

/** One axle in a chassis layout definition (REQ-PLC-017: role + tyres per side). */
export class AxleDefinitionDto {
  /** Axle role: Steer, Drive or Trailer. */
  @IsString()
  @MinLength(1)
  role!: string;

  /** Tyres per side on this axle — 1 (single) or 2 (dual). */
  @IsInt()
  @Min(1)
  tyresPerSide!: number;
}

/**
 * A data-driven chassis layout definition (REQ-PLC-017). The positions are
 * GENERATED from the axles + spare count when the layout is saved — no layout
 * is hard-coded, so a new class appears with no engine edit.
 */
export class ChassisLayoutDefinitionDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => AxleDefinitionDto)
  axles!: AxleDefinitionDto[];

  /** Number of spare positions (0 or more). */
  @IsInt()
  @Min(0)
  spareCount!: number;
}

/** `POST /vehicles/classes` — register a vehicle class + its chassis layout. */
export class CreateVehicleClassDto {
  /** Class code, e.g. `Tractor_Head` (unique). */
  @IsString()
  @MinLength(1)
  code!: string;

  @IsString()
  @MinLength(1)
  name!: string;

  /** `Powered` (has odometer) or `Towed` (days only, no odometer). */
  @IsOptional()
  @IsString()
  unitKind?: string;

  @ValidateNested()
  @Type(() => ChassisLayoutDefinitionDto)
  layout!: ChassisLayoutDefinitionDto;
}

// ===========================================================================
// Vehicles (REQ-VEH-002..004, REQ-VEH-010)
// ===========================================================================

/** `POST /vehicles` — register a vehicle (REQ-VEH-002). */
export class CreateVehicleDto {
  /** Plate, e.g. `B 1234 ABC` (unique, non-empty). */
  @IsString()
  @MinLength(1)
  plate!: string;

  @IsInt()
  @IsPositive()
  classId!: number;

  /** Optional explicit layout; defaults to the class's default layout. */
  @IsOptional()
  @IsInt()
  @IsPositive()
  chassisLayoutId?: number;

  /** Opening odometer (km) for a Powered unit; 0 for a Towed unit. */
  @IsOptional()
  @IsInt()
  @Min(0)
  odometerKm?: number;

  /** Optional billing customer id (NULL = not billable). */
  @IsOptional()
  @IsInt()
  @IsPositive()
  customerId?: number;
}

/** `PATCH /vehicles/{id}` — edit a vehicle (REQ-VEH-003). Reason is required. */
export class EditVehicleDto {
  /** Optimistic-lock version the caller last read (NFR-03). */
  @IsInt()
  @Min(1)
  version!: number;

  /** A required reason, written to the audit log (REQ-VEH-003). */
  @IsString()
  @MinLength(1)
  reason!: string;

  /** New class — refused if a tyre is mounted or a WO is open (REQ-VEH-003). */
  @IsOptional()
  @IsInt()
  @IsPositive()
  classId?: number;

  @IsOptional()
  @IsInt()
  @IsPositive()
  chassisLayoutId?: number;

  @IsOptional()
  @IsInt()
  @IsPositive()
  customerId?: number;
}

/** `POST /vehicles/{id}/deactivate` — set a vehicle Inactive (REQ-VEH-004). */
export class DeactivateVehicleDto {
  @IsInt()
  @Min(1)
  version!: number;

  @IsString()
  @MinLength(1)
  reason!: string;
}

/** `POST /vehicles/{id}/driver` — set the current driver (REQ-VEH-010). */
export class SetDriverDto {
  /** The driver's id (one driver per vehicle, one vehicle per driver). */
  @IsInt()
  @IsPositive()
  driverId!: number;
}

// ===========================================================================
// Odometer (REQ-VEH-005..007, BR-09)
// ===========================================================================

/** `POST /vehicles/{id}/odometer` — record a manual reading (REQ-VEH-006). */
export class RecordOdometerDto {
  /** The reading in whole km — must be positive and not below the last valid. */
  @IsInt()
  @IsPositive()
  reading!: number;

  /** When it was read (ISO-8601), not when entered. */
  @IsISO8601()
  readingAt!: string;

  /** Optional source: `Admin`, `Driver` or `GPS` (defaults to Admin). */
  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  @IsString()
  note?: string;
}

/** `POST /vehicles/odometer/{logId}/void` — void a reading (REQ-VEH-007). */
export class VoidOdometerDto {
  @IsString()
  @MinLength(1)
  reason!: string;
}

// ===========================================================================
// Documents (REQ-DOC-001..009)
// ===========================================================================

/** `POST /vehicles/document-types` — maintain a document type (REQ-DOC-002). */
export class CreateDocumentTypeDto {
  /** Type code, e.g. `STNK_Annual`, `KIR`, `Insurance` (unique). */
  @IsString()
  @MinLength(1)
  code!: string;

  @IsString()
  @MinLength(1)
  name!: string;

  /** Usual validity in months (prefills renewal expiry, REQ-DOC-007). */
  @IsOptional()
  @IsInt()
  @IsPositive()
  usualValidityMonths?: number;

  /** Warning days before expiry (default 30; the only place it is set). */
  @IsOptional()
  @IsInt()
  @IsPositive()
  warningDays?: number;

  /** Whether a renewal receipt image is required. */
  @IsOptional()
  @IsBoolean()
  receiptRequired?: boolean;

  /** The vehicle-class ids that must carry this document type. */
  @IsArray()
  @IsInt({ each: true })
  requiredForClassIds!: number[];
}

/** `POST /vehicles/{id}/documents` — first entry of a document (REQ-DOC-008). */
export class FirstEntryDocumentDto {
  @IsInt()
  @IsPositive()
  documentTypeId!: number;

  @IsString()
  @MinLength(1)
  documentNumber!: string;

  @IsOptional()
  @IsString()
  issuer?: string;

  @IsOptional()
  @IsISO8601()
  issueDate?: string;

  /** Expiry date (YYYY-MM-DD). A past date saves as Expired (AC-DOC-005). */
  @IsISO8601()
  expiryDate!: string;

  /** Storage key of the uploaded scan (REQ-DOC-008). */
  @IsString()
  @MinLength(1)
  fileUrl!: string;
}

/** One corrected field in a Correct-entry request (REQ-DOC-009). */
export class DocumentCorrectionFieldDto {
  /** The field being corrected: `document_number`, `issue_date`, `expiry_date`, `issuer` or `file_url`. */
  @IsString()
  @MinLength(1)
  field!: string;

  @IsString()
  newValue!: string;
}

/**
 * `POST /vehicles/documents/{docId}/correct` — Correct entry (REQ-DOC-009).
 * Allowed only before the first renewal WO exists for the document.
 */
export class CorrectDocumentDto {
  @IsInt()
  @Min(1)
  version!: number;

  @IsString()
  @MinLength(1)
  reason!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => DocumentCorrectionFieldDto)
  fields!: DocumentCorrectionFieldDto[];
}

/**
 * `POST /vehicles/documents/{docId}/renew` — renewal (REQ-DOC-007), the effect
 * of a verified Document step. Records a renewal (keeping the old record as
 * history) and recomputes the status from the new expiry.
 */
export class RenewDocumentDto {
  @IsInt()
  @Min(1)
  version!: number;

  @IsString()
  @MinLength(1)
  documentNumber!: string;

  @IsISO8601()
  issueDate!: string;

  /** New expiry — must be later than the old one (REQ-DOC-007). */
  @IsISO8601()
  expiryDate!: string;

  @IsString()
  @MinLength(1)
  fileUrl!: string;

  /** Renewal cost in Rupiah, added to the WO (REQ-DOC-007). */
  @IsInt()
  @Min(0)
  renewalCost!: number;

  /** Receipt image storage key, required when the type requires it. */
  @IsOptional()
  @IsString()
  receiptUrl?: string;
}
