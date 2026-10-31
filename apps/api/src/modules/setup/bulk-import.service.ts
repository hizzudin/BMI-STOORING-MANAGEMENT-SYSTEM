import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { VehicleStatus, toId, type VehicleDto } from '@bmi/shared';
import type { DataGateway } from '@bmi/data-gateway';
import { DATA_GATEWAY } from '../../core/data-gateway/data-gateway.module.js';
import { AppSettingsService } from '../iam/app-settings.service.js';
import { MasterDataService } from './master-data.service.js';

/** A single row's validation error (REQ-IAM-011 "the error of each failed row"). */
export interface RowError {
  /** 1-based row number as it appears in the file. */
  readonly row: number;
  readonly message: string;
}

/** A validated vehicle import row (shape the service persists). */
export interface VehicleImportRow {
  readonly plate: string;
  readonly classId: number;
  readonly chassisLayoutId: number;
  readonly odometerKm: number;
  readonly customerId?: number;
}

/** The kept import-batch record (PRD §9 `import_batches`). */
export interface ImportBatch {
  readonly id: number;
  readonly entity: string;
  readonly fileName: string;
  readonly rowCount: number;
  readonly importedAt: string;
}

/** The outcome of an import attempt. */
export interface ImportResult {
  readonly imported: boolean;
  /** Rows that failed validation (empty when `imported` is true). */
  readonly errors: readonly RowError[];
  /** Number of rows created (0 when any row failed — all-or-nothing). */
  readonly createdCount: number;
  /** The kept import-batch record, present only on a successful import. */
  readonly batch?: ImportBatch;
}

/**
 * Setup-mode bulk import of master data (REQ-IAM-011 / AC-IAM-007).
 *
 * WHILE Setup: validate every row with the entity's own rules, and import **all
 * rows in one transaction only when no row fails** — a single bad row imports
 * nothing (AC-IAM-007). Every import keeps its file reference and writes an
 * import-batch record. WHEN Live: the import is refused.
 *
 * Phase 1 implements the vehicles entity (the one AC-IAM-007 exercises) against
 * the dummy gateway's `vehicles` repository; the remaining REQ-IAM-011 entities
 * (customers, vendors, services, stooring rates, parts catalog, documents,
 * tyres, baseline, opening balance) arrive with their aggregates in later tasks
 * behind the same validate-then-all-or-nothing contract. The `import_batches`
 * log is an API-layer in-memory list in Phase 1 (TASK-201 moves it to the table).
 */
@Injectable()
export class BulkImportService {
  private readonly batches: ImportBatch[] = [];
  private nextBatchId = 1;

  constructor(
    @Inject(DATA_GATEWAY) private readonly gateway: DataGateway,
    private readonly settings: AppSettingsService,
    private readonly masterData: MasterDataService,
  ) {}

  /**
   * Import a vehicles file (REQ-IAM-011). Refused once Live. Validates each row
   * (non-empty unique plate, known vehicle class); when every row is valid,
   * inserts them all in one `unitOfWork` and records an import batch. When any
   * row fails, nothing is inserted and the failed rows are returned with their
   * errors.
   *
   * @throws ConflictException when the system is already Live.
   */
  async importVehicles(fileName: string, rows: readonly VehicleImportRow[]): Promise<ImportResult> {
    this.assertSetupMode();

    const errors = await this.validateVehicleRows(rows);
    if (errors.length > 0) {
      // A single bad row imports nothing (AC-IAM-007).
      return { imported: false, errors, createdCount: 0 };
    }

    const created = await this.gateway.unitOfWork(async (ctx) => {
      const out: VehicleDto[] = [];
      for (const row of rows) {
        const vehicle = await ctx.repos.vehicles.insert({
          plate: row.plate.trim(),
          classId: toId<'VehicleClassId'>(row.classId),
          chassisLayoutId: toId<'ChassisLayoutId'>(row.chassisLayoutId),
          odometerKm: row.odometerKm,
          // A freshly imported vehicle carries no open WO or blocking document
          // yet, so its derived status opens Active (SM-VEH); documents imported
          // later (REQ-DOC-013) recompute it.
          status: VehicleStatus.Active,
          customerId: row.customerId === undefined ? null : toId<'CustomerId'>(row.customerId),
        });
        out.push(vehicle);
      }
      return out;
    });

    const batch = this.recordBatch('vehicles', fileName, created.length);
    return { imported: true, errors: [], createdCount: created.length, batch };
  }

  /** Every kept import-batch record (read-only). */
  listBatches(): readonly ImportBatch[] {
    return [...this.batches];
  }

  /** Test-only reset of the in-memory batch log. */
  resetForTests(): void {
    this.batches.length = 0;
    this.nextBatchId = 1;
  }

  /**
   * Validate vehicle rows with the same rules as the Add-vehicle form: plate is
   * non-empty and unique (within the file and against existing vehicles), and
   * the class id is a known vehicle class (AC-IAM-007 "unknown vehicle class").
   */
  private async validateVehicleRows(rows: readonly VehicleImportRow[]): Promise<RowError[]> {
    const errors: RowError[] = [];
    const existing = await this.gateway.repos.vehicles.list();
    const existingPlates = new Set(existing.map((v) => v.plate.trim().toUpperCase()));
    const seenPlates = new Set<string>();

    rows.forEach((row, index) => {
      const rowNo = index + 1;
      const plate = row.plate.trim();
      if (plate.length === 0) {
        errors.push({ row: rowNo, message: 'Plate is required.' });
      } else {
        const key = plate.toUpperCase();
        if (existingPlates.has(key) || seenPlates.has(key)) {
          errors.push({ row: rowNo, message: `Duplicate plate: ${plate}.` });
        }
        seenPlates.add(key);
      }
      if (!this.masterData.isKnownVehicleClass(row.classId)) {
        errors.push({ row: rowNo, message: `Unknown vehicle class: ${row.classId}.` });
      }
    });

    return errors;
  }

  /** Refuse any import once the system is Live (REQ-IAM-011). */
  private assertSetupMode(): void {
    if (this.settings.isLive()) {
      throw new ConflictException('The system is live. Bulk import is Setup-mode only.');
    }
  }

  /** Keep an import-batch record (file reference + row count + time). */
  private recordBatch(entity: string, fileName: string, rowCount: number): ImportBatch {
    const batch: ImportBatch = {
      id: this.nextBatchId,
      entity,
      fileName,
      rowCount,
      importedAt: new Date().toISOString(),
    };
    this.nextBatchId += 1;
    this.batches.push(batch);
    return batch;
  }
}
