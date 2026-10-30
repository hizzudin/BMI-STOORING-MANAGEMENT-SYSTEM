/**
 * Optimistic-locking tests — the concurrent-save proof (NFR-CONCURRENCY / NFR-03).
 *
 * Two saves carry the same starting `version`; exactly one commits and the
 * stale one is refused with a clear `StaleVersionError`. We also cover the
 * version increment, a `remove` with a stale version, and `NotFoundError`.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { StaleVersionError, NotFoundError } from './errors.js';
import { createDummyDataGateway, SEED_IDS } from './dummy/index.js';
import type { DummyDataGateway } from './dummy/index.js';

const vehicleId = SEED_IDS.vehicle as unknown as number;

describe('optimistic locking — concurrent saves (NFR-CONCURRENCY / NFR-03)', () => {
  let gw: DummyDataGateway;

  beforeEach(() => {
    gw = createDummyDataGateway();
  });

  it('rejects the stale save: exactly one of two concurrent saves wins', async () => {
    // Both readers load the vehicle at the same version (simulating two clients).
    const readA = await gw.repos.vehicles.requireById(vehicleId);
    const readB = await gw.repos.vehicles.requireById(vehicleId);
    expect(readA.version).toBe(readB.version);

    // Client A commits first.
    const savedA = await gw.unitOfWork((ctx) =>
      ctx.repos.vehicles.update({ ...readA, odometerKm: readA.odometerKm + 100 }),
    );
    expect(savedA.version).toBe(readA.version + 1);

    // Client B commits second with the now-stale version → refused.
    let error: unknown;
    await gw
      .unitOfWork((ctx) => ctx.repos.vehicles.update({ ...readB, odometerKm: readB.odometerKm + 5 }))
      .catch((e: unknown) => {
        error = e;
      });

    expect(error).toBeInstanceOf(StaleVersionError);
    const staleError = error as StaleVersionError;
    expect(staleError.aggregate).toBe('vehicles');
    expect(staleError.expectedVersion).toBe(readB.version);
    expect(staleError.actualVersion).toBe(readA.version + 1);

    // The store reflects A's write only; B's stale change never landed.
    const finalState = await gw.repos.vehicles.requireById(vehicleId);
    expect(finalState.odometerKm).toBe(readA.odometerKm + 100);
    expect(finalState.version).toBe(readA.version + 1);
  });

  it('allows the stale client to succeed after re-reading the fresh version', async () => {
    const stale = await gw.repos.vehicles.requireById(vehicleId);
    await gw.unitOfWork((ctx) => ctx.repos.vehicles.update({ ...stale, odometerKm: 50000 }));

    // Re-read, then save against the fresh version → succeeds.
    const fresh = await gw.repos.vehicles.requireById(vehicleId);
    const saved = await gw.unitOfWork((ctx) =>
      ctx.repos.vehicles.update({ ...fresh, odometerKm: 50123 }),
    );
    expect(saved.odometerKm).toBe(50123);
    expect(saved.version).toBe(fresh.version + 1);
  });

  it('rejects a remove carrying a stale version', async () => {
    const wo = await gw.repos.workOrders.requireById(SEED_IDS.workOrder as unknown as number);
    // Bump the version via an update so the original version is now stale.
    await gw.unitOfWork((ctx) => ctx.repos.workOrders.update({ ...wo, offDays: 1 }));

    await expect(
      gw.unitOfWork((ctx) =>
        ctx.repos.workOrders.remove(SEED_IDS.workOrder as unknown as number, wo.version),
      ),
    ).rejects.toBeInstanceOf(StaleVersionError);
  });

  it('throws NotFoundError when updating an unknown aggregate', async () => {
    await expect(
      gw.unitOfWork((ctx) =>
        ctx.repos.invoices.remove(999_999, 1),
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
