import { Module } from '@nestjs/common';
import { AuditModule } from '../../core/audit/audit.module.js';
import { IamModule } from '../iam/iam.module.js';
import { WorkOrdersModule } from '../work-orders/work-orders.module.js';
import { PlacementModule } from '../placement/placement.module.js';
import { BillingController } from './billing.controller.js';
import { CustomerService } from './customer.service.js';
import { InvoiceService } from './invoice.service.js';
import { WoDocumentService } from './wo-document.service.js';

/**
 * FG-11 — WO document & invoices (REQ-WOD, REQ-BIL, REQ-BIL-012, SM-INV, BR-15,
 * DEC-92).
 *
 * TASK-115 delivers, against the dummy gateway:
 *   - **WO document renderer** ({@link WoDocumentService}) — the approval block
 *     (REQ-WOD-003), the per-step execution-time table with the longest phase
 *     and entered-start times marked (REQ-WOD-008), and the black-and-white
 *     placement snapshot **reused** from the Placement module (REQ-PLC-014,
 *     REQ-WOD-007), plus a **PDF-generation stub** (real PDF = TASK-206).
 *   - **Invoices** ({@link InvoiceService}) — one Draft per vehicle per day
 *     (DEC-43), part/tyre markup + services/stooring/document at cost, the
 *     half-up money helpers (REQ-BIL-003/004, NFR-16), the never-reused running
 *     number (REQ-BIL-005, DEC-46/50) and the SM-INV state machine
 *     Draft→Issued→Paid→Void via the shared `smInvoice` guard. The **`Off_Unit`
 *     line** = `work_orders.off_days` × the global `app_settings.off_unit_daily_rate`
 *     at cost (no markup), included in subtotal and PPN (DEC-92) — `off_days` is
 *     read from the WO (owned by the FG-12 daily job), never recomputed here.
 *   - **Customers master** ({@link CustomerService}) — REQ-BIL-001.
 *   - **OFF-unit daily rate master** — read/update via {@link AppSettingsService}
 *     (`app_settings.off_unit_daily_rate`), System Admin only (REQ-BIL-012).
 *
 * It imports {@link WorkOrdersModule} (WO + step-time ledger reuse),
 * {@link PlacementModule} (the B/W placement snapshot), {@link IamModule} (the
 * shared `AppSettingsService` that owns the `app_settings` store) and
 * {@link AuditModule}. The role guard, validation pipe and idempotency
 * interceptor are global. Dependencies are one-directional (no import cycle).
 */
@Module({
  imports: [AuditModule, IamModule, WorkOrdersModule, PlacementModule],
  controllers: [BillingController],
  providers: [CustomerService, InvoiceService, WoDocumentService],
  exports: [CustomerService, InvoiceService, WoDocumentService],
})
export class BillingModule {}
