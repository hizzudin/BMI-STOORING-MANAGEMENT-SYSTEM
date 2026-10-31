import { Module } from '@nestjs/common';
import { AuditModule } from '../../core/audit/audit.module.js';
import { VehiclesController } from './vehicles.controller.js';
import { VehiclesService } from './vehicles.service.js';
import { VehicleClassService } from './vehicle-class.service.js';
import { DocumentService } from './document.service.js';
import { DocumentTypeService } from './document-type.service.js';
import { OdometerService } from './odometer.service.js';
import { VehicleStatusService } from './vehicle-status.service.js';

/**
 * FG-7 — Vehicles, documents & odometer (REQ-VEH, REQ-DOC, SM-VEH, SM-DOC,
 * DEC-92).
 *
 * TASK-106 delivers, against the dummy gateway:
 *   - **Vehicles** ({@link VehiclesService}) — CRUD/registration, class/layout
 *     change guards, deactivation, driver assignment (REQ-VEH-002..004/010).
 *   - **Classes & data-driven chassis layouts** ({@link VehicleClassService}) —
 *     layouts generated from their definition, no hard-coded layout (REQ-PLC-017).
 *   - **Documents** ({@link DocumentService}) — first entry / correction /
 *     renewal and the SM-DOC status machine (REQ-DOC-006..009; §3.5).
 *   - **Document types** ({@link DocumentTypeService}) — master data (REQ-DOC-001/002).
 *   - **Odometer** ({@link OdometerService}) — manual/driver readings, void, and
 *     the jump warning surfaced, never silently corrected (REQ-VEH-005..007).
 *   - **Derived vehicle status** ({@link VehicleStatusService}) — SM-VEH with the
 *     new **OFF** state, computed from the governing facts by precedence
 *     (Inactive > OFF > Blocked > Repair > Active), never a free-set field (DEC-92).
 *
 * It imports {@link AuditModule} for the cross-cutting audit of every mutating
 * call; the role guard, validation pipe and idempotency interceptor are global.
 */
@Module({
  imports: [AuditModule],
  controllers: [VehiclesController],
  providers: [
    VehiclesService,
    VehicleClassService,
    DocumentService,
    DocumentTypeService,
    OdometerService,
    VehicleStatusService,
  ],
  exports: [VehiclesService, VehicleClassService, DocumentTypeService],
})
export class VehiclesModule {}
