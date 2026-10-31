import { Module } from '@nestjs/common';
import { AuditModule } from '../../core/audit/audit.module.js';
import { StockModule } from '../stock/stock.module.js';
import { InventoryController } from './inventory.controller.js';
import { PartsInventoryService } from './parts-inventory.service.js';
import { TyreRegisterService } from './tyre-register.service.js';

/**
 * FG-8 — Parts baseline, inventory & tyres (REQ-BSL, REQ-INV, REQ-TYR, BR-06,
 * BR-11).
 *
 * TASK-112 delivers, against the dummy gateway:
 *   - **Parts catalog + baseline master data** ({@link PartsInventoryService}) —
 *     add a part (opening quantity 0), edit with a reason (SKU/unit locked once
 *     the part has moved), deactivate (refused when quantity ≠ 0). REQ-INV-001/002/003.
 *   - **Goods Receipts & corrections** — a GR raises stock, recomputes the
 *     moving-average cost (DEC-60, **reusing** the Stock module's
 *     `PartsLedgerService`) and writes a GR stock-card row; a correction is a
 *     posted correcting movement, never a silent edit. REQ-INV-004/005, BR-06.
 *   - **Stock card** — the append-only running card per SKU (GR/GI/GRC/opname),
 *     each row with a running balance and a document number. REQ-INV-007.
 *   - **Stock opname** — a physical count whose adjustment requires APPROVAL
 *     before it posts (four-eyes, §2.2); an unapproved adjustment changes no
 *     stock. REQ-INV-010/011, BR-03/BR-12.
 *   - **Tyres end-to-end** ({@link TyreRegisterService}) — receive / retread
 *     dispatch / retread return / worn-out / scrap / count, with generated
 *     `TY-xxxx` codes (NFR-15) and `tyre_events`, driving tyre status through
 *     the SM-TYRE guard (§3.6, unlisted transition refused) transactionally with
 *     the register. Mount/rotate/demount placement is owned by TASK-111; this
 *     module owns the warehouse-side non-placement lifecycle. REQ-TYR, BR-11.
 *
 * **Reuse, not reimplement:** the module imports {@link StockModule} for the
 * exported `PartsLedgerService` (catalog + stock ledger + the single DEC-60
 * moving-average rule), so Goods Receipt extends/consumes that rule rather than
 * duplicating it. The Setup one-time opening balance (TASK-105) is a separate
 * path and is not duplicated here. The gateway is injected via the global
 * `DATA_GATEWAY` token (tyre writes run in its `unitOfWork`). The dependency is
 * one-directional (Inventory → Stock), so there is no import cycle.
 */
@Module({
  imports: [AuditModule, StockModule],
  controllers: [InventoryController],
  providers: [PartsInventoryService, TyreRegisterService],
  exports: [PartsInventoryService, TyreRegisterService],
})
export class InventoryModule {}
