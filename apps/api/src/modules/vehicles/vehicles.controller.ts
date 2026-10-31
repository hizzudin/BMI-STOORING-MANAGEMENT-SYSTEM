import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { idValue } from '@bmi/shared';
import type { AuthenticatedRequest } from '../../core/auth/current-user.js';
import { RequireCapability } from '../../core/auth/require-capability.decorator.js';
import { Capabilities } from '../../core/auth/permission-matrix.js';
import { enrichAudit } from '../../core/audit/audit-context.js';
import { VehiclesService } from './vehicles.service.js';
import { VehicleClassService } from './vehicle-class.service.js';
import { DocumentService } from './document.service.js';
import { DocumentTypeService } from './document-type.service.js';
import { OdometerService } from './odometer.service.js';
import {
  CorrectDocumentDto,
  CreateDocumentTypeDto,
  CreateVehicleClassDto,
  CreateVehicleDto,
  DeactivateVehicleDto,
  EditVehicleDto,
  FirstEntryDocumentDto,
  RecordOdometerDto,
  RenewDocumentDto,
  SetDriverDto,
  VoidOdometerDto,
} from './dto/vehicles.dto.js';

/**
 * FG-7 — Vehicles, documents and odometer (REQ-VEH, REQ-DOC, SM-VEH, SM-DOC).
 *
 * Master-data writes (classes, document types, vehicles, documents, odometer
 * void) require the §2.2 `vehicle.manage` / `masterdata.manage` capability,
 * which the System Admin holds; a manual odometer reading requires
 * `odometer.manual` (Planner and System Admin). The global RolesGuard refuses
 * every other role a server-side 403 with no extra check. Every mutating call
 * runs through the global ValidationPipe + IdempotencyInterceptor, writes
 * version-checked through the gateway, and leaves exactly one audit record via
 * the AuditInterceptor enriched through the per-request audit-context.
 */
@Controller('vehicles')
export class VehiclesController {
  constructor(
    private readonly vehicles: VehiclesService,
    private readonly classes: VehicleClassService,
    private readonly documents: DocumentService,
    private readonly documentTypes: DocumentTypeService,
    private readonly odometer: OdometerService,
  ) {}

  // --- Vehicle classes & data-driven chassis layouts (REQ-VEH-002, REQ-PLC-017)

  @Get('classes')
  listClasses(): unknown {
    return {
      classes: this.classes.listClasses(),
      layouts: this.classes.listLayouts(),
    };
  }

  @Post('classes')
  @RequireCapability(Capabilities.MasterData)
  @HttpCode(HttpStatus.CREATED)
  createClass(@Req() req: AuthenticatedRequest, @Body() dto: CreateVehicleClassDto): unknown {
    const created = this.classes.createClass({
      code: dto.code,
      name: dto.name,
      ...(dto.unitKind === undefined ? {} : { unitKind: dto.unitKind }),
      layout: { axles: dto.layout.axles, spareCount: dto.layout.spareCount },
    });
    const layout = this.classes.requireLayout(created.defaultChassisLayoutId);
    enrichAudit(req, {
      entity: 'vehicle_classes',
      entityId: created.id,
      after: { code: created.code, layoutId: layout.id, tyreCount: layout.tyreCount },
      reason: 'create_vehicle_class',
    });
    return { class: created, layout };
  }

  // --- Document types (REQ-DOC-001/002) ------------------------------------

  @Get('document-types')
  listDocumentTypes(): unknown {
    return { documentTypes: this.documentTypes.list() };
  }

  @Post('document-types')
  @RequireCapability(Capabilities.MasterData)
  @HttpCode(HttpStatus.CREATED)
  createDocumentType(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateDocumentTypeDto,
  ): unknown {
    const created = this.documentTypes.create({
      code: dto.code,
      name: dto.name,
      ...(dto.usualValidityMonths === undefined
        ? {}
        : { usualValidityMonths: dto.usualValidityMonths }),
      ...(dto.warningDays === undefined ? {} : { warningDays: dto.warningDays }),
      ...(dto.receiptRequired === undefined ? {} : { receiptRequired: dto.receiptRequired }),
      requiredForClassIds: dto.requiredForClassIds,
    });
    enrichAudit(req, {
      entity: 'document_types',
      entityId: created.id,
      after: { code: created.code, warningDays: created.warningDays },
      reason: 'create_document_type',
    });
    return { documentType: created };
  }

  // --- Vehicles (REQ-VEH-002..004, REQ-VEH-010) ----------------------------

  @Get()
  async list(): Promise<unknown> {
    return { vehicles: await this.vehicles.list() };
  }

  @Get(':id')
  async view(@Param('id', ParseIntPipe) id: number): Promise<unknown> {
    return this.vehicles.view(id);
  }

  @Post()
  @RequireCapability(Capabilities.VehicleManage)
  @HttpCode(HttpStatus.CREATED)
  async create(@Req() req: AuthenticatedRequest, @Body() dto: CreateVehicleDto): Promise<unknown> {
    const vehicle = await this.vehicles.create({
      plate: dto.plate,
      classId: dto.classId,
      ...(dto.chassisLayoutId === undefined ? {} : { chassisLayoutId: dto.chassisLayoutId }),
      ...(dto.odometerKm === undefined ? {} : { odometerKm: dto.odometerKm }),
      ...(dto.customerId === undefined ? {} : { customerId: dto.customerId }),
    });
    enrichAudit(req, {
      entity: 'vehicles',
      entityId: idValue(vehicle.id),
      after: { plate: vehicle.plate, status: vehicle.status },
      reason: 'create_vehicle',
    });
    return { vehicle };
  }

  @Patch(':id')
  @RequireCapability(Capabilities.VehicleManage)
  async edit(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: EditVehicleDto,
  ): Promise<unknown> {
    const vehicle = await this.vehicles.edit(id, {
      version: dto.version,
      ...(dto.classId === undefined ? {} : { classId: dto.classId }),
      ...(dto.chassisLayoutId === undefined ? {} : { chassisLayoutId: dto.chassisLayoutId }),
      ...(dto.customerId === undefined ? {} : { customerId: dto.customerId }),
    });
    enrichAudit(req, {
      entity: 'vehicles',
      entityId: id,
      after: { status: vehicle.status },
      reason: dto.reason,
    });
    return { vehicle };
  }

  @Post(':id/deactivate')
  @RequireCapability(Capabilities.VehicleManage)
  @HttpCode(HttpStatus.OK)
  async deactivate(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: DeactivateVehicleDto,
  ): Promise<unknown> {
    const vehicle = await this.vehicles.deactivate(id, { version: dto.version, reason: dto.reason });
    enrichAudit(req, {
      entity: 'vehicles',
      entityId: id,
      after: { status: vehicle.status },
      reason: dto.reason,
    });
    return { vehicle };
  }

  @Post(':id/driver')
  @RequireCapability(Capabilities.VehicleManage)
  @HttpCode(HttpStatus.OK)
  async setDriver(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SetDriverDto,
  ): Promise<unknown> {
    const result = await this.vehicles.setDriver(id, dto.driverId);
    enrichAudit(req, {
      entity: 'drivers',
      entityId: dto.driverId,
      after: { assignedVehicleId: id },
      reason: 'set_driver',
    });
    return result;
  }

  // --- Odometer (REQ-VEH-005..007) -----------------------------------------

  @Get(':id/odometer')
  odometerHistory(@Param('id', ParseIntPipe) id: number): unknown {
    return { readings: this.odometer.listForVehicle(id) };
  }

  @Post(':id/odometer')
  @RequireCapability(Capabilities.OdometerManual)
  @HttpCode(HttpStatus.CREATED)
  async recordOdometer(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RecordOdometerDto,
  ): Promise<unknown> {
    const result = await this.vehicles.recordOdometer(id, {
      reading: dto.reading,
      readingAt: dto.readingAt,
      ...(dto.source === undefined ? {} : { source: dto.source as 'Admin' | 'Driver' | 'GPS' }),
      ...(dto.note === undefined ? {} : { note: dto.note }),
      recordedBy: req.currentUser?.userId ?? null,
    });
    enrichAudit(req, {
      entity: 'odometer_logs',
      entityId: idValue(result.vehicle.id),
      after: {
        reading: dto.reading,
        odometer: result.vehicle.odometerKm,
        jumpWarning: result.jumpWarning,
      },
      reason: 'record_odometer',
    });
    // Surface the warning to the client — never silently corrected (REQ-VEH-005).
    return {
      vehicle: result.vehicle,
      jumpWarning: result.jumpWarning,
      warning: result.warning,
    };
  }

  @Post('odometer/:logId/void')
  @RequireCapability(Capabilities.VehicleManage)
  @HttpCode(HttpStatus.OK)
  async voidOdometer(
    @Req() req: AuthenticatedRequest,
    @Param('logId', ParseIntPipe) logId: number,
    @Body() dto: VoidOdometerDto,
  ): Promise<unknown> {
    const log = this.odometer.getLog(logId);
    if (!log) {
      // Delegate the 404 to the service for a consistent message.
      await this.vehicles.voidOdometer(-1, logId, {
        reason: dto.reason,
        voidedBy: req.currentUser?.userId ?? null,
      });
    }
    const vehicleId = log?.vehicleId ?? -1;
    const vehicle = await this.vehicles.voidOdometer(vehicleId, logId, {
      reason: dto.reason,
      voidedBy: req.currentUser?.userId ?? null,
    });
    enrichAudit(req, {
      entity: 'odometer_logs',
      entityId: logId,
      after: { voided: true, odometer: vehicle.odometerKm },
      reason: dto.reason,
    });
    return { vehicle };
  }

  // --- Documents (REQ-DOC-006..009) ----------------------------------------

  @Get(':id/documents')
  async listDocuments(@Param('id', ParseIntPipe) id: number): Promise<unknown> {
    return { documents: await this.documents.listForVehicle(id) };
  }

  @Post(':id/documents')
  @RequireCapability(Capabilities.VehicleManage)
  @HttpCode(HttpStatus.CREATED)
  async firstEntry(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: FirstEntryDocumentDto,
  ): Promise<unknown> {
    const document = await this.documents.firstEntry({
      vehicleId: id,
      documentTypeId: dto.documentTypeId,
      documentNumber: dto.documentNumber,
      ...(dto.issuer === undefined ? {} : { issuer: dto.issuer }),
      ...(dto.issueDate === undefined ? {} : { issueDate: dto.issueDate }),
      expiryDate: dto.expiryDate,
      fileUrl: dto.fileUrl,
    });
    // First entry can lift/alter the derived vehicle status (Blocked → Active).
    const vehicle = await this.vehicles.recomputeStatus(id);
    enrichAudit(req, {
      entity: 'vehicle_documents',
      entityId: idValue(document.id),
      after: { status: document.status, vehicleStatus: vehicle.status },
      reason: 'document_first_entry',
    });
    return { document, vehicle };
  }

  @Post('documents/:docId/correct')
  @RequireCapability(Capabilities.VehicleManage)
  @HttpCode(HttpStatus.OK)
  async correct(
    @Req() req: AuthenticatedRequest,
    @Param('docId', ParseIntPipe) docId: number,
    @Body() dto: CorrectDocumentDto,
  ): Promise<unknown> {
    const document = await this.documents.correct({
      vehicleDocumentId: docId,
      version: dto.version,
      reason: dto.reason,
      fields: dto.fields.map((f) => ({ field: f.field, newValue: f.newValue })),
      correctedBy: req.currentUser?.userId ?? null,
    });
    const vehicle = await this.vehicles.recomputeStatus(idValue(document.vehicleId));
    enrichAudit(req, {
      entity: 'document_corrections',
      entityId: docId,
      after: { status: document.status, fields: dto.fields.map((f) => f.field) },
      reason: dto.reason,
    });
    return { document, vehicle };
  }

  @Post('documents/:docId/renew')
  @RequireCapability(Capabilities.DocStepExecute)
  @HttpCode(HttpStatus.OK)
  async renew(
    @Req() req: AuthenticatedRequest,
    @Param('docId', ParseIntPipe) docId: number,
    @Body() dto: RenewDocumentDto,
  ): Promise<unknown> {
    const { document, renewal } = await this.documents.renew({
      vehicleDocumentId: docId,
      version: dto.version,
      documentNumber: dto.documentNumber,
      issueDate: dto.issueDate,
      expiryDate: dto.expiryDate,
      fileUrl: dto.fileUrl,
      renewalCost: dto.renewalCost,
      ...(dto.receiptUrl === undefined ? {} : { receiptUrl: dto.receiptUrl }),
    });
    const vehicle = await this.vehicles.recomputeStatus(idValue(document.vehicleId));
    enrichAudit(req, {
      entity: 'document_renewals',
      entityId: renewal.id,
      after: { status: document.status, newExpiry: renewal.newExpiry, cost: renewal.renewalCost },
      reason: 'document_renewal',
    });
    return { document, renewal, vehicle };
  }
}
