import {
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { InvoiceLineKind } from '@bmi/shared';

/**
 * Request DTOs for the Billing module (FG-11, REQ-WOD, REQ-BIL, REQ-BIL-012).
 *
 * Every field is validated by the global `ValidationPipe`
 * (`whitelist + forbidNonWhitelisted + transform`), so an unknown field is
 * rejected and types are coerced before a service sees the payload
 * (fullstack-guardian: never trust client input).
 */

/** One billable item used on a WO, fed into invoice generation (REQ-BIL-003). */
export class WorkOrderBillableLineDto {
  /** The line kind (`Part`, `Tyre`, `Service`, `Document`, `Stooring`). Never `Off_Unit`/`Adjustment` — those are system-generated. */
  @IsIn([
    InvoiceLineKind.Part,
    InvoiceLineKind.Tyre,
    InvoiceLineKind.Service,
    InvoiceLineKind.Document,
    InvoiceLineKind.Stooring,
  ])
  kind!: Exclude<InvoiceLineKind, 'Off_Unit' | 'Adjustment'>;

  @IsString()
  @IsNotEmpty()
  description!: string;

  @IsOptional()
  @IsString()
  sku?: string;

  @IsNumber()
  @Min(0)
  qty!: number;

  /** The cost on the WO line (average cost, purchase or workshop price), at cost. */
  @IsNumber()
  @Min(0)
  unitCost!: number;
}

/** Record the billable lines a completed WO contributes (Phase-1 facts source). */
export class SetWorkOrderBillablesDto {
  @IsInt()
  @Min(1)
  workOrderId!: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkOrderBillableLineDto)
  lines!: WorkOrderBillableLineDto[];
}

/** Generate / refresh the Draft invoice for a completed WO (REQ-BIL-002). */
export class GenerateInvoiceDto {
  @IsInt()
  @Min(1)
  workOrderId!: number;
}

/** Add a manual adjustment line (discount/extra) to a Draft invoice (REQ-BIL-003). */
export class AddAdjustmentDto {
  @IsInt()
  @Min(1)
  invoiceId!: number;

  @IsInt()
  version!: number;

  @IsString()
  @IsNotEmpty()
  description!: string;

  /** Amount; negative for a discount. */
  @IsNumber()
  amount!: number;

  @IsString()
  @IsNotEmpty()
  reason!: string;
}

/** Issue a Draft invoice (SM-INV Issue): assign the running number, lock lines. */
export class IssueInvoiceDto {
  @IsInt()
  version!: number;

  /** Issue date (ISO instant); defaults to now. Drives the number's dd-mm-yy and due date. */
  @IsOptional()
  @IsString()
  issueDate?: string;
}

/** Record a payment (SM-INV Pay): sets the invoice Paid (REQ-BIL-006). */
export class PayInvoiceDto {
  @IsInt()
  version!: number;

  @IsString()
  @IsNotEmpty()
  method!: string;

  @IsOptional()
  @IsString()
  reference?: string;

  /** Amount (must equal the total; no partial payment in R1). */
  @IsNumber()
  @Min(1)
  amount!: number;

  @IsOptional()
  @IsString()
  paidOn?: string;
}

/** Void a Draft or Issued invoice (SM-INV Void): requires a reason (REQ-BIL-006). */
export class VoidInvoiceDto {
  @IsInt()
  version!: number;

  @IsString()
  @IsNotEmpty()
  reason!: string;
}

/** Create a customer (REQ-BIL-001). */
export class CreateCustomerDto {
  @IsString()
  @IsNotEmpty()
  code!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  billingAddress!: string;

  @IsOptional()
  @IsString()
  taxNumber?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  paymentTermsDays?: number;
}

/** Update the global OFF-unit daily rate (REQ-BIL-012, DEC-92). System Admin only. */
export class SetOffUnitRateDto {
  /** Non-negative whole rupiah. */
  @IsInt()
  @Min(0)
  rate!: number;
}
