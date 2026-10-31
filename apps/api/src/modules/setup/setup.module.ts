import { Module } from '@nestjs/common';
import { AuditModule } from '../../core/audit/audit.module.js';
import { IamModule } from '../iam/iam.module.js';
import { SetupController } from './setup.controller.js';
import { SetupService } from './setup.service.js';
import { BulkImportService } from './bulk-import.service.js';
import { OpeningBalanceService } from './opening-balance.service.js';
import { MasterDataService } from './master-data.service.js';

/**
 * FG-14 — Setup mode & Go live (REQ-SETUP, REQ-IAM-010/011, REQ-INV-013, ASM-64).
 *
 * TASK-105 delivers, against the dummy gateway:
 *   - **Setup-mode gating** — the sign-in restriction (only System Admin +
 *     Access Manager) is reused from the IAM `AuthService`; "no approvals in
 *     Setup" is expressed by `AppSettingsService.approvalsEnabled()`.
 *   - **Bulk import** ({@link BulkImportService}) — Setup-only, validated
 *     server-side, all-or-nothing in one `unitOfWork` (REQ-IAM-011 / AC-IAM-007).
 *   - **Opening balance** ({@link OpeningBalanceService}) — Setup-only, one-time,
 *     no approval (REQ-INV-013 / AC-INV-006).
 *   - **One-way Go-live** ({@link SetupService}) — Setup → Live, irreversible.
 *
 * It imports {@link IamModule} to reuse the single `AppSettingsService` instance
 * (the lifecycle scalars live there, not duplicated) and {@link AuditModule} for
 * the cross-cutting audit of every mutating call.
 */
@Module({
  imports: [IamModule, AuditModule],
  controllers: [SetupController],
  providers: [SetupService, BulkImportService, OpeningBalanceService, MasterDataService],
  exports: [SetupService, OpeningBalanceService, MasterDataService],
})
export class SetupModule {}
