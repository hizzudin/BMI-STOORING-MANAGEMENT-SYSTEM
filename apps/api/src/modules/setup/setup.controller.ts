import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import type { AuthenticatedRequest } from '../../core/auth/current-user.js';
import { RequireCapability } from '../../core/auth/require-capability.decorator.js';
import { Capabilities } from '../../core/auth/permission-matrix.js';
import { enrichAudit } from '../../core/audit/audit-context.js';
import { SetupService, type SetupStatus } from './setup.service.js';
import { BulkImportService, type ImportResult } from './bulk-import.service.js';
import { OpeningBalanceService } from './opening-balance.service.js';
import { GoLiveDto, OpeningBalanceDto, VehicleImportDto } from './dto/setup.dto.js';

/**
 * FG-14 Setup mode & Go-live (REQ-SETUP / REQ-IAM-010/011, REQ-INV-013, ASM-64).
 *
 * Every route requires the §2.2 `setup.golive` capability, which only the System
 * Admin holds (`X L` in the matrix). So the global {@link RolesGuard} already
 * refuses every other role a server-side 403 — no extra check here. The
 * Setup-mode *sign-in* gate (only System Admin + Access Manager may sign in)
 * lives in the IAM `AuthService` and is reused, not re-implemented.
 *
 * Bulk import and opening balance are **Setup-mode only**: their services refuse
 * (409) once the system is Live. Go-live is one-way: a second attempt is refused
 * (409), so Setup → Live cannot be reverted. Every mutating call is audited by
 * the global interceptor, enriched through the per-request audit-context.
 */
@Controller('setup')
@RequireCapability(Capabilities.SetupGoLive)
export class SetupController {
  constructor(
    private readonly setup: SetupService,
    private readonly imports: BulkImportService,
    private readonly openingBalance: OpeningBalanceService,
  ) {}

  /** Current Setup/Live status + the checklist the SetupGoLive screen shows. */
  @Get('status')
  status(): SetupStatus {
    return this.setup.status();
  }

  /**
   * Bulk import a vehicles file (REQ-IAM-011 / AC-IAM-007). Setup-mode only.
   * Imports all rows in one transaction, or none when any row fails.
   */
  @Post('import/vehicles')
  @HttpCode(HttpStatus.OK)
  async importVehicles(
    @Req() req: AuthenticatedRequest,
    @Body() dto: VehicleImportDto,
  ): Promise<ImportResult> {
    const result = await this.imports.importVehicles(
      dto.fileName,
      dto.rows.map((r) => ({
        plate: r.plate,
        classId: r.classId,
        chassisLayoutId: r.chassisLayoutId,
        odometerKm: r.odometerKm,
        ...(r.customerId === undefined ? {} : { customerId: r.customerId }),
      })),
    );
    enrichAudit(req, {
      entity: 'import_batches',
      ...(result.batch ? { entityId: result.batch.id } : {}),
      after: {
        entity: 'vehicles',
        fileName: dto.fileName,
        imported: result.imported,
        createdCount: result.createdCount,
        errorCount: result.errors.length,
      },
      reason: result.imported ? 'bulk_import' : 'bulk_import_rejected',
    });
    return result;
  }

  /**
   * Enter the one-time opening balance (REQ-INV-013 / AC-INV-006). Setup-mode
   * only. Sets stock + average cost and writes OB rows without approval.
   */
  @Post('opening-balance')
  @HttpCode(HttpStatus.OK)
  openingBalanceEntry(
    @Req() req: AuthenticatedRequest,
    @Body() dto: OpeningBalanceDto,
  ): { rows: number; skus: string[] } {
    const result = this.openingBalance.save(dto.rows);
    enrichAudit(req, {
      entity: 'stock_cards',
      after: {
        movementType: 'OB',
        rows: result.rows.length,
        skus: result.rows.map((r) => r.sku),
      },
      reason: 'opening_balance',
    });
    return { rows: result.rows.length, skus: result.rows.map((r) => r.sku) };
  }

  /**
   * Go live: switch Setup → Live, once and for all (REQ-IAM-010). Irreversible;
   * a second attempt is refused by the service with a 409.
   */
  @Post('go-live')
  @HttpCode(HttpStatus.OK)
  goLive(@Req() req: AuthenticatedRequest, @Body() _dto: GoLiveDto): SetupStatus {
    const before = this.setup.status();
    const status = this.setup.goLive();
    enrichAudit(req, {
      entity: 'app_settings',
      before: { system_mode: before.mode },
      after: { system_mode: status.mode, went_live_at: status.wentLiveAt },
      reason: 'go_live',
    });
    return status;
  }
}
