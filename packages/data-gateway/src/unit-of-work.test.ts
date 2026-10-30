/**
 * Unit-of-work tests — all-or-nothing writes (NFR-INTEGRITY / NFR-01).
 *
 * The required proof: a transaction that throws mid-way leaves ZERO partial
 * writes. We also cover the happy path (multi-repo writes commit together) and
 * idempotency-key replay.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  WorkOrderStatus,
  WorkOrderSource,
  WorkOrderCategory,
  WorkOrderPriority,
  type WorkOrderDto,
} from '@bmi/shared';

import { createDummyDataGateway, SEED_IDS } from './dummy/index.js';
import type { DummyDataGateway } from './dummy/index.js';

function newWorkOrder(number: string): Omit<WorkOrderDto, 'id' | 'version'> {
  return {
    number,
    vehicleId: SEED_IDS.vehicle,
    status: WorkOrderStatus.Draft,
    source: WorkOrderSource.ManualPlanner,
    category: WorkOrderCategory.Corrective,
    priority: WorkOrderPriority.Normal,
    description: 'new WO',
    findingNote: null,
    offDays: 0,
    createdBy: SEED_IDS.users.planner,
    createdAt: '2026-11-04T00:00:00.000Z',
  };
}

describe('unitOfWork — all-or-nothing (NFR-INTEGRITY / NFR-01)', () => {
  let gw: DummyDataGateway;

  beforeEach(() => {
    gw = createDummyDataGateway();
  });

  it('commits every write in a transaction together', async () => {
    const before = await gw.repos.workOrders.count();

    await gw.unitOfWork(async (ctx) => {
      await ctx.repos.workOrders.insert(newWorkOrder('WO-0200'));
      await ctx.repos.workOrders.insert(newWorkOrder('WO-0201'));
    });

    expect(await gw.repos.workOrders.count()).toBe(before + 2);
    expect(await gw.repos.workOrders.findOneBy('number', 'WO-0200')).not.toBeNull();
    expect(await gw.repos.workOrders.findOneBy('number', 'WO-0201')).not.toBeNull();
  });

  it('rolls back ALL writes when the transaction throws mid-way — zero partial state', async () => {
    const before = await gw.repos.workOrders.count();
    const vehicleBefore = await gw.repos.vehicles.requireById(
      SEED_IDS.vehicle as unknown as number,
    );

    const boom = new Error('mid-write failure');
    await expect(
      gw.unitOfWork(async (ctx) => {
        // First write succeeds inside the snapshot...
        await ctx.repos.workOrders.insert(newWorkOrder('WO-0300'));
        // ...a second aggregate is mutated...
        await ctx.repos.vehicles.update({ ...vehicleBefore, odometerKm: 99999 });
        // ...then the transaction fails before it can resolve.
        throw boom;
      }),
    ).rejects.toBe(boom);

    // Nothing from the failed transaction is visible on the committed store.
    expect(await gw.repos.workOrders.count()).toBe(before);
    expect(await gw.repos.workOrders.findOneBy('number', 'WO-0300')).toBeNull();
    const vehicleAfter = await gw.repos.vehicles.requireById(
      SEED_IDS.vehicle as unknown as number,
    );
    expect(vehicleAfter.odometerKm).toBe(vehicleBefore.odometerKm);
    expect(vehicleAfter.version).toBe(vehicleBefore.version);
  });

  it('returns the callback result and increments version on a committed update', async () => {
    const vehicle = await gw.repos.vehicles.requireById(SEED_IDS.vehicle as unknown as number);

    const saved = await gw.unitOfWork((ctx) =>
      ctx.repos.vehicles.update({ ...vehicle, odometerKm: vehicle.odometerKm + 10 }),
    );

    expect(saved.version).toBe(vehicle.version + 1);
    const reread = await gw.repos.vehicles.requireById(SEED_IDS.vehicle as unknown as number);
    expect(reread.odometerKm).toBe(vehicle.odometerKm + 10);
    expect(reread.version).toBe(vehicle.version + 1);
  });

  it('skips a transaction whose idempotency key was already committed (NFR-01)', async () => {
    const key = 'submit-wo-0142';
    await gw.unitOfWork(
      async (ctx) => {
        await ctx.repos.workOrders.insert(newWorkOrder('WO-0400'));
      },
      { idempotencyKey: key },
    );
    const afterFirst = await gw.repos.workOrders.count();

    // Replay with the same key: no additional write.
    await gw.unitOfWork(
      async (ctx) => {
        await ctx.repos.workOrders.insert(newWorkOrder('WO-0400'));
      },
      { idempotencyKey: key },
    );

    expect(await gw.repos.workOrders.count()).toBe(afterFirst);
  });

  it('forgets an idempotency key claimed inside a rolled-back transaction', async () => {
    await expect(
      gw.unitOfWork((ctx) => {
        expect(ctx.claimIdempotencyKey('k1')).toBe(true);
        throw new Error('rollback');
      }),
    ).rejects.toThrow('rollback');

    // The key did not survive the rollback, so it can be claimed again.
    const claimedAgain = await gw.unitOfWork((ctx) => ctx.claimIdempotencyKey('k1'));
    expect(claimedAgain).toBe(true);
  });
});
