import { describe, it, expect } from 'vitest';
import { toId, idValue, type WorkOrderId, type VehicleId } from './ids.js';

describe('branded IDs', () => {
  it('round-trips the underlying numeric value', () => {
    const wo: WorkOrderId = toId<'WorkOrderId'>(142);
    expect(idValue(wo)).toBe(142);
  });

  it('keeps distinct brands assignable only to their own type (compile-time)', () => {
    const wo: WorkOrderId = toId<'WorkOrderId'>(1);
    const veh: VehicleId = toId<'VehicleId'>(1);
    // At runtime both are plain numbers; the brand is erased.
    expect(idValue(wo)).toBe(idValue(veh));
    // @ts-expect-error — a VehicleId must not be assignable to a WorkOrderId.
    const bad: WorkOrderId = veh;
    expect(idValue(bad)).toBe(1);
  });
});
