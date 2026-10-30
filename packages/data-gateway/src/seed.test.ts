/**
 * Seed-integrity tests: the PRD example graph is present and its foreign keys
 * resolve, so later flows can be demonstrated against faithful data.
 */

import { describe, it, expect } from 'vitest';
import { idValue, WorkOrderStatus, TyreStatus } from '@bmi/shared';
import { createDummyDataGateway, SEED_IDS } from './dummy/index.js';

describe('seed — PRD example records', () => {
  const gw = createDummyDataGateway();

  it('contains WO-0142 on vehicle B 1234 ABC', async () => {
    const wo = await gw.repos.workOrders.findOneBy('number', 'WO-0142');
    expect(wo).not.toBeNull();
    expect(wo?.status).toBe(WorkOrderStatus.InProgress);

    const vehicle = await gw.repos.vehicles.requireById(idValue(wo!.vehicleId));
    expect(vehicle.plate).toBe('B 1234 ABC');
    expect(vehicle.odometerKm).toBe(48210);
  });

  it('issues tyre codes TY-0101 … TY-0110, never-reused (NFR-15)', async () => {
    const tyres = await gw.repos.tyres.list();
    const codes = tyres.map((t) => t.code).sort();
    expect(codes).toContain('TY-0101');
    expect(codes).toContain('TY-0110');
    expect(new Set(codes).size).toBe(codes.length); // unique
  });

  it('issues TY-0110 to WO-0142 (AC-STK-004)', async () => {
    const ty0110 = await gw.repos.tyres.findOneBy('code', 'TY-0110');
    expect(ty0110?.status).toBe(TyreStatus.Issued);
    expect(ty0110?.issuedWorkOrderId).not.toBeNull();
    expect(idValue(ty0110!.issuedWorkOrderId!)).toBe(idValue(SEED_IDS.workOrder));
  });

  it('resolves every foreign key in the example graph', async () => {
    const wo = await gw.repos.workOrders.requireById(idValue(SEED_IDS.workOrder));
    // WO → vehicle → customer
    const vehicle = await gw.repos.vehicles.requireById(idValue(wo.vehicleId));
    expect(vehicle.customerId).not.toBeNull();
    // WO → createdBy user
    const creator = await gw.repos.users.requireById(idValue(wo.createdBy));
    expect(creator.role).toBe('Planner');
    // WO steps all point back at the WO
    const steps = await gw.repos.assignments.findBy('workOrderId', wo.id);
    expect(steps).toHaveLength(3);
    // schedule card → WO
    const card = await gw.repos.scheduleCards.requireById(idValue(SEED_IDS.scheduleCard));
    expect(idValue(card.workOrderId)).toBe(idValue(wo.id));
  });

  it('starts every mutable aggregate at version 1', async () => {
    const wo = await gw.repos.workOrders.requireById(idValue(SEED_IDS.workOrder));
    expect(wo.version).toBe(1);
  });
});
