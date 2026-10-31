import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * DTOs for the Stock & Part Purchase step endpoints (FG-4, REQ-STK / REQ-PUR).
 * Validated server-side by the global ValidationPipe (NFR-04); money/quantities
 * are typed, never free-text parsed.
 */

/** One warehouse line to issue on a Stock step (REQ-STK-002). */
export class IssueLineDto {
  @IsString()
  @IsNotEmpty()
  sku!: string;

  @IsInt()
  @Min(1)
  qty!: number;
}

/** Stage the Stock step's issue lines (REQ-STK-002/004/009). */
export class StageStockDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => IssueLineDto)
  lines!: IssueLineDto[];

  /** Confirm a shortfall for any over-issued line (REQ-STK-004, AC-STK-006). */
  @IsOptional()
  @IsBoolean()
  confirmShortfall?: boolean;

  /** At least one invoice image is attached to the transaction (REQ-STK-009). */
  @IsOptional()
  @IsBoolean()
  hasAttachment?: boolean;
}

/** Request a reversal of a posted Stock issue (REQ-STK-008). */
export class ReverseStockDto {
  @IsString()
  @IsNotEmpty()
  reason!: string;
}

/** One typed purchase line (REQ-PUR-002/003). */
export class PurchaseLineDto {
  @IsString()
  @IsNotEmpty()
  sku!: string;

  @IsNumber()
  @Min(0.01)
  quantity!: number;

  @IsNumber()
  @Min(0)
  unitPrice!: number;
}

/** Compute live line/grand totals without saving (REQ-PUR-003). */
export class PurchaseTotalsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PurchaseLineDto)
  lines!: PurchaseLineDto[];
}

/** Submit a Part Purchase step (REQ-PUR-002..007). */
export class SubmitPurchaseDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PurchaseLineDto)
  lines!: PurchaseLineDto[];

  @IsOptional()
  @IsString()
  vendor?: string;

  @IsOptional()
  @IsString()
  receiptNumber?: string;

  @IsOptional()
  @IsString()
  receiptDate?: string;

  @IsOptional()
  @IsString()
  receiptPhoto?: string;

  @IsOptional()
  @IsString()
  nothingBoughtReason?: string;
}
