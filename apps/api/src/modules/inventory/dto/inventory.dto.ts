import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

/**
 * DTOs for FG-8 Inventory & Tyres (REQ-BSL, REQ-INV, REQ-TYR). Server-side
 * validation only (fullstack-guardian: never trust the client) — these
 * shape/bound checks run under the global whitelist `ValidationPipe` before any
 * service rule.
 */

// --- Parts catalog (REQ-INV-001/002/003) -----------------------------------

/** `POST /inventory/parts` — add a catalog part (opens at quantity 0). */
export class AddPartDto {
  @IsString()
  @MinLength(1)
  sku!: string;

  @IsString()
  @MinLength(1)
  partName!: string;

  @IsString()
  @MinLength(1)
  unit!: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  brand?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  reorderPoint?: number;

  @IsOptional()
  @IsString()
  rack?: string;
}

/** `PATCH /inventory/parts/:sku` — edit a catalog part with a reason. */
export class EditPartDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  partName?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  unit?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  brand?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  reorderPoint?: number;

  @IsOptional()
  @IsString()
  rack?: string;

  @IsString()
  @MinLength(1)
  reason!: string;
}

// --- Goods Receipt & corrections (REQ-INV-004/005) -------------------------

/** One Goods Receipt line (SKU, quantity, unit price, optional rack). */
export class GoodsReceiptLineDto {
  @IsString()
  @MinLength(1)
  sku!: string;

  @IsNumber()
  @Min(0.0001)
  qty!: number;

  @IsNumber()
  @Min(0)
  unitPrice!: number;

  @IsOptional()
  @IsString()
  rack?: string;
}

/** `POST /inventory/goods-receipts` — create and post a Goods Receipt. */
export class PostGoodsReceiptDto {
  @IsOptional()
  @IsString()
  supplier?: string;

  @IsOptional()
  @IsString()
  invoiceNumber?: string;

  @IsOptional()
  @IsString()
  receiptDate?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => GoodsReceiptLineDto)
  lines!: GoodsReceiptLineDto[];
}

/** `POST /inventory/goods-receipts/:id/correct` — post a GR correction. */
export class CorrectGoodsReceiptDto {
  @IsString()
  @MinLength(1)
  sku!: string;

  /** Signed quantity delta (may be negative to remove over-received stock). */
  @IsNumber()
  qtyDelta!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  unitPrice?: number;

  @IsString()
  @MinLength(1)
  reason!: string;
}

// --- Stock opname (REQ-INV-010/011) ----------------------------------------

/** One stock-opname row (SKU, counted physical quantity, variance reason). */
export class StockOpnameRowDto {
  @IsString()
  @MinLength(1)
  sku!: string;

  @IsNumber()
  @Min(0)
  physicalQty!: number;

  /** Required only when the variance is non-zero (REQ-INV-010). */
  @IsOptional()
  @IsIn(['Damaged', 'Entry_Error', 'Lost', 'Found'])
  reasonCode?: string;

  @IsOptional()
  @IsString()
  note?: string;
}

/** `POST /inventory/stock-opname` — create a Draft stock opname. */
export class CreateStockOpnameDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => StockOpnameRowDto)
  rows!: StockOpnameRowDto[];
}

/** `POST /inventory/stock-opname/:id/reject` — return to Draft with a reason. */
export class RejectDto {
  @IsString()
  @MinLength(1)
  reason!: string;
}

// --- Tyres (REQ-TYR) --------------------------------------------------------

/** One received tyre (serial, brand, size, type, tread, cost, rack). */
export class ReceiveTyreLineDto {
  @IsString()
  @MinLength(1)
  serialNumber!: string;

  @IsString()
  @MinLength(1)
  brand!: string;

  @IsString()
  @MinLength(1)
  size!: string;

  @IsIn(['Tube', 'Tubeless'])
  tyreType!: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  treadMm?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  cost?: number;

  @IsOptional()
  @IsString()
  rack?: string;
}

/** `POST /inventory/tyres/receive` — receive New/Existing tyres. */
export class ReceiveTyresDto {
  /** `Supplier` (invoice required) or `Existing` (go-live, no invoice). */
  @IsIn(['Supplier', 'Existing'])
  source!: string;

  @IsOptional()
  @IsString()
  invoiceNumber?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReceiveTyreLineDto)
  tyres!: ReceiveTyreLineDto[];
}

/** `POST /inventory/tyres/:id/worn-out` — mark a Needs_Retread tyre Worn_Out. */
export class WornOutDto {
  @IsString()
  @MinLength(1)
  reason!: string;

  @IsOptional()
  @IsString()
  note?: string;
}

/** `POST /inventory/tyres/:id/scrap` — scrap a Needs_Retread / Worn_Out tyre. */
export class ScrapTyreDto {
  @IsString()
  @MinLength(1)
  reason!: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsString()
  disposalReference?: string;
}

// --- Retread dispatch & return (REQ-TYR-008/009) ---------------------------

/** `POST /inventory/retread/dispatch` — send Needs_Retread tyres to a vendor. */
export class RetreadDispatchDto {
  @IsString()
  @MinLength(1)
  vendor!: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsInt({ each: true })
  tyreIds!: number[];

  @IsOptional()
  @IsString()
  deliveryNoteNumber?: string;

  @IsOptional()
  @IsString()
  expectedReturn?: string;
}

/** One retread-return result for a dispatched tyre. */
export class RetreadReturnResultDto {
  @IsInt()
  tyreId!: number;

  @IsIn(['Accepted', 'Rejected', 'NotReturnedYet'])
  result!: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  cost?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  newTreadMm?: number;

  @IsOptional()
  @IsString()
  invoiceNumber?: string;

  /** Required when the result is Rejected (REQ-TYR-009). */
  @IsOptional()
  @IsString()
  rejectReason?: string;
}

/** `POST /inventory/retread/:id/return` — confirm a retread return. */
export class RetreadReturnDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RetreadReturnResultDto)
  results!: RetreadReturnResultDto[];
}

// --- Tyre count (REQ-TYR-011/012) ------------------------------------------

/** One tyre-count row (Found / Missing with a reason). */
export class TyreCountRowDto {
  @IsInt()
  tyreId!: number;

  @IsIn(['Found', 'Missing'])
  result!: string;

  /** Required when Missing (REQ-TYR-011). */
  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  note?: string;
}

/** `POST /inventory/tyre-count` — create a Draft tyre count. */
export class CreateTyreCountDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => TyreCountRowDto)
  rows!: TyreCountRowDto[];
}
