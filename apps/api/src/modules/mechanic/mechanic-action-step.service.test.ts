import { describe, expect, it, beforeEach } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { Team, toId, type AssignmentDto } from '@bmi/shared';
import { ServiceCatalogService } from './service-catalog.service.js';
import { MechanicActionStepService } from './mechanic-action-step.service.js';

/**
 * Unit coverage for the Mechanic Action step (FG-5, REQ-MEC, BR-07, DEC-90):
 * the read-only catalog price snapshot (AC-MEC-001/003), the labour-cost sum
 * (REQ-MEC-004), and the DEC-90 retirement — a submit records **no location**
 * (AC-MEC-004) and **Rp 0 stooring** (AC-MEC-005).
 */
describe('MechanicActionStepService (TASK-110)', () => {
  let catalog: ServiceCatalogService;
  let service: MechanicActionStepService;

  beforeEach(() => {
    catalog = new ServiceCatalogService();
    service = new MechanicActionStepService(catalog);
  });

  /** A minimal Mechanic Action step row. */
  function step(id: number, workOrderId = 100): AssignmentDto {
    return {
      id: toId<'AssignmentId'>(id),
      workOrderId: toId<'WorkOrderId'>(workOrderId),
      moduleCode: 'Mechanic_Action',
    } as unknown as AssignmentDto;
  }

  it('AC-MEC-001 / BR-07 — Internal takes the catalog price read-only and snapshots it', () => {
    const action = service.submit(step(1), {
      team: Team.Internal,
      internalServices: [{ serviceCode: 'SVC-010' }], // Brake pad labour @ 250.000
      photos: ['r2://repair/1.jpg'],
    });
    expect(action.lines).toHaveLength(1);
    expect(action.lines[0]!.price).toBe(250000); // read-only catalog price
    expect(action.lines[0]!.serviceCode).toBe('SVC-010');
    expect(action.laborCost).toBe(250000);

    // AC-MEC-003: a later catalog price change does NOT move the saved line.
    catalog.upsert({ serviceCode: 'SVC-010', serviceName: 'Brake pad replacement labour', standardPrice: 300000 });
    expect(service.actionOf(1)!.lines[0]!.price).toBe(250000);
  });

  it('REQ-MEC-004 — labour cost is the sum of the service lines', () => {
    const action = service.submit(step(2, 101), {
      team: Team.Internal,
      internalServices: [{ serviceCode: 'SVC-010' }, { serviceCode: 'SVC-020' }], // 250.000 + 120.000
      photos: ['r2://repair/a.jpg'],
    });
    expect(action.laborCost).toBe(370000);
    expect(service.laborCostOf(101)).toBe(370000);
  });

  it('AC-MEC-004 / AC-MEC-005 / DEC-90 — a submit records NO location and Rp 0 stooring', () => {
    const action = service.submit(step(3), {
      team: Team.Internal,
      internalServices: [{ serviceCode: 'SVC-010' }],
      photos: ['r2://repair/x.jpg'],
    });
    // The retirement is explicit: stooring is literally Rp 0 and location is null.
    expect(action.stooringCost).toBe(0);
    expect(action.location).toBeNull();
    // And the shape carries no location/stooring input fields at all.
    expect(Object.keys(action)).not.toContain('locationLat');
    expect(Object.keys(action)).not.toContain('deviceatitude');
  });

  it('AC-MEC-002 — an External service with no invoice image does not save', () => {
    expect(() =>
      service.submit(step(4), {
        team: Team.External,
        vendor: 'Bengkel Jaya',
        externalServices: [{ description: 'Weld bracket', price: 500000 }],
        // no photos (invoice image)
      }),
    ).toThrow(BadRequestException);
    expect(service.actionOf(4)).toBeUndefined();
  });

  it('REQ-MEC-003 — External takes vendor + free description + free price', () => {
    const action = service.submit(step(5, 102), {
      team: Team.External,
      vendor: 'Bengkel Jaya',
      externalServices: [{ description: 'Weld bracket', price: 500000 }],
      photos: ['r2://invoice/ext.jpg'],
    });
    expect(action.team).toBe(Team.External);
    expect(action.lines[0]!.vendorName).toBe('Bengkel Jaya');
    expect(action.lines[0]!.serviceCode).toBeNull();
    expect(action.lines[0]!.price).toBe(500000);
    expect(action.laborCost).toBe(500000);
    expect(action.stooringCost).toBe(0);
  });

  it('REQ-MEC-002 — an Internal service not in the catalog is refused', () => {
    expect(() =>
      service.submit(step(6), {
        team: Team.Internal,
        internalServices: [{ serviceCode: 'SVC-999' }],
        photos: ['r2://repair/1.jpg'],
      }),
    ).toThrow();
  });
});
