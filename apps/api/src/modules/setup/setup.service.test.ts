import { beforeEach, describe, expect, it } from 'vitest';
import { ConflictException } from '@nestjs/common';
import { createDummyDataGateway, type DataGateway } from '@bmi/data-gateway';
import { AppSettingsService } from '../iam/app-settings.service.js';
import { SetupService } from './setup.service.js';
import { BulkImportService, type VehicleImportRow } from './bulk-import.service.js';
import { OpeningBalanceService } from './opening-balance.service.js';
import { MasterDataService } from './master-data.service.js';

/**
 * TASK-105 Setup / Go-live unit coverage against the dummy gateway:
 *   - AC-INV-006 — opening balance in Setup, refused once Live.
 *   - AC-IAM-007 — vehicles import all-or-nothing, refused once Live.
 *   - REQ-IAM-010 — Go-live is one-way (cannot be reverted) and disables
 *     approvals while in Setup.
 */
describe('Setup / Go-live (TASK-105)', () => {
  let settings: AppSettingsService;
  let gateway: DataGateway;
  let setup: SetupService;
  let imports: BulkImportService;
  let openingBalance: OpeningBalanceService;
  let masterData: MasterDataService;

  beforeEach(() => {
    settings = new AppSettingsService(); // starts in Setup (REQ-IAM-010)
    gateway = createDummyDataGateway();
    masterData = new MasterDataService();
    setup = new SetupService(settings);
    imports = new BulkImportService(gateway, settings, masterData);
    openingBalance = new OpeningBalanceService(settings);
  });

  // --- REQ-IAM-010: Setup defaults + one-way Go-live -----------------------

  it('starts in Setup mode with approvals disabled', () => {
    const status = setup.status();
    expect(status.mode).toBe('Setup');
    expect(status.isLive).toBe(false);
    expect(status.approvalsEnabled).toBe(false);
  });

  it('REQ-IAM-010 — Go live switches to Live, records the time, and enables approvals', () => {
    const at = '2026-11-05T01:00:00.000Z';
    const status = setup.goLive(at);
    expect(status.mode).toBe('Live');
    expect(status.isLive).toBe(true);
    expect(status.wentLiveAt).toBe(at);
    expect(status.approvalsEnabled).toBe(true);
  });

  it('REQ-IAM-010 — Go live is one-way: a second attempt is refused (cannot revert)', () => {
    setup.goLive();
    expect(() => setup.goLive()).toThrow(ConflictException);
    // The system is still Live — there is no way back to Setup.
    expect(setup.status().isLive).toBe(true);
  });

  // --- AC-INV-006: opening balance -----------------------------------------

  it('AC-INV-006 — saves 420 L of SKU-1029 at Rp 76.500 in Setup: stock 420, one OB row, no approval', () => {
    const result = openingBalance.save([
      { sku: 'SKU-1029', quantity: 420, unitCost: 76500, rack: 'A-01' },
    ]);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.movementType).toBe('OB');
    const skuStock = result.stock.get('SKU-1029');
    expect(skuStock?.quantity).toBe(420);
    expect(skuStock?.averageCost).toBe(76500);
  });

  it('AC-INV-006 — once Live, any opening balance is refused', () => {
    setup.goLive();
    expect(() =>
      openingBalance.save([{ sku: 'SKU-1029', quantity: 420, unitCost: 76500, rack: 'A-01' }]),
    ).toThrow(ConflictException);
  });

  // --- AC-IAM-007: vehicles bulk import ------------------------------------

  /** Build `count` valid vehicle rows (unique plates), optionally with bad classes. */
  function buildVehicleRows(count: number, badClassRows: number[] = []): VehicleImportRow[] {
    const rows: VehicleImportRow[] = [];
    for (let n = 1; n <= count; n += 1) {
      const badClass = badClassRows.includes(n);
      rows.push({
        plate: `D ${1000 + n} IMP`,
        classId: badClass ? 999 : 1, // class 1 is the known seeded class
        chassisLayoutId: 1,
        odometerKm: 0,
      });
    }
    return rows;
  }

  it('AC-IAM-007 — a 100-row file with 2 unknown-class rows lists those 2 and imports nothing', async () => {
    const before = await gateway.repos.vehicles.count();
    const rows = buildVehicleRows(100, [17, 58]);
    const result = await imports.importVehicles('vehicles.xlsx', rows);

    expect(result.imported).toBe(false);
    expect(result.createdCount).toBe(0);
    expect(result.errors).toHaveLength(2);
    expect(result.errors.map((e) => e.row).sort((a, b) => a - b)).toEqual([17, 58]);
    expect(result.errors.every((e) => e.message.includes('Unknown vehicle class'))).toBe(true);
    // Nothing was imported (all-or-nothing).
    expect(await gateway.repos.vehicles.count()).toBe(before);
  });

  it('AC-IAM-007 — when the 2 rows are fixed, all 100 vehicles are created in one import', async () => {
    const before = await gateway.repos.vehicles.count();
    const result = await imports.importVehicles('vehicles.xlsx', buildVehicleRows(100));

    expect(result.imported).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.createdCount).toBe(100);
    expect(await gateway.repos.vehicles.count()).toBe(before + 100);
    // The import kept a batch record (file reference + row count).
    expect(result.batch?.fileName).toBe('vehicles.xlsx');
    expect(result.batch?.rowCount).toBe(100);
    expect(imports.listBatches()).toHaveLength(1);
  });

  it('AC-IAM-007 — once Live, the import is refused', async () => {
    setup.goLive();
    await expect(imports.importVehicles('vehicles.xlsx', buildVehicleRows(1))).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(imports.listBatches()).toHaveLength(0);
  });

  it('rejects a duplicate plate within the file (server-side validation)', async () => {
    const rows: VehicleImportRow[] = [
      { plate: 'D 2000 DUP', classId: 1, chassisLayoutId: 1, odometerKm: 0 },
      { plate: 'D 2000 DUP', classId: 1, chassisLayoutId: 1, odometerKm: 0 },
    ];
    const result = await imports.importVehicles('dup.xlsx', rows);
    expect(result.imported).toBe(false);
    expect(result.errors.some((e) => e.message.includes('Duplicate plate'))).toBe(true);
  });
});
