import 'reflect-metadata';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  Role,
  StepStatus,
  Team,
  toId,
  type AssignmentDto,
} from '@bmi/shared';
import { AuditService } from '../../core/audit/audit.service.js';
import type { CurrentUser } from '../../core/auth/current-user.js';
import { StooringRatesService } from './stooring-rates.service.js';
import { MobilisasiStepService } from './mobilisasi-step.service.js';

/**
 * Unit coverage for the Mobilisasi step rules (TASK-110a, FG-5a): the
 * In_Progress-only location trail (stops at submit), the stooring fee charged
 * once per WO/region/WIB-day with the exact Rp amount, and the trail-read
 * privacy boundary + access-log-per-read (RSK-09).
 */
describe('MobilisasiStepService (TASK-110a)', () => {
  let rates: StooringRatesService;
  let audit: AuditService;
  let service: MobilisasiStepService;

  beforeEach(() => {
    rates = new StooringRatesService();
    audit = new AuditService();
    service = new MobilisasiStepService(rates, audit);
  });

  /** Build a Mobilisasi step DTO with a given status / region / destination. */
  function step(
    overrides: Omit<Partial<AssignmentDto>, 'id' | 'workOrderId'> & {
      region?: string;
      lat?: number;
      lng?: number;
      id?: number;
      workOrderId?: number;
    } = {},
  ): AssignmentDto {
    const { region, lat, lng, id, workOrderId, ...rest } = overrides;
    return {
      id: toId<'AssignmentId'>(id ?? 900),
      version: 1,
      workOrderId: toId<'WorkOrderId'>(workOrderId ?? 700),
      moduleId: toId<'AssignmentModuleId'>(4),
      moduleCode: 'Mobilisasi',
      sequence: 1,
      status: StepStatus.InProgress,
      stepConfig: {
        ...(lat === undefined ? {} : { locationLat: lat }),
        ...(lng === undefined ? {} : { locationLng: lng }),
        ...(region === undefined ? {} : { stooringRegion: region }),
      },
      isOptional: false,
      executorRoles: [Role.Mechanic],
      verifierRole: Role.Planner,
      isPaused: false,
      team: Team.Internal,
      assigneeId: null,
      claimedAt: null,
      openedAt: null,
      executedBy: null,
      startedAt: new Date().toISOString(),
      startEntered: false,
      attemptNo: 1,
      workedSeconds: null,
      pausedSeconds: null,
      submittedAt: null,
      verifiedBy: null,
      verifiedAt: null,
      selfVerified: false,
      returnNote: null,
      skipReason: null,
      ...rest,
    } as AssignmentDto;
  }

  const planner: CurrentUser = { userId: 1, role: Role.Planner };
  const mechanic: CurrentUser = { userId: 2, role: Role.Mechanic };

  // --- AC-MBL-003: trail recorded only while In_Progress, stops at submit ----

  it('records trail points only while In_Progress (a point before Start is refused)', () => {
    const locked = step({ status: StepStatus.Open });
    expect(() => service.recordPoint(locked, { lat: -6.2, lng: 107.0 })).toThrow(BadRequestException);
    expect(service.trailLengthOf(Number(locked.id))).toBe(0);
  });

  it('records trail points while In_Progress and stops recording at submit', () => {
    const s = step({ region: 'BEKASI' });
    service.start(s);
    service.recordPoint(s, { lat: -6.21, lng: 107.01 });
    service.recordPoint(s, { lat: -6.22, lng: 107.02 });
    expect(service.trailLengthOf(Number(s.id))).toBe(2);

    // Submit stops the trail (RSK-09): a point after submit is refused.
    service.onSubmit(s);
    const afterSubmit = step({ id: s.id, status: StepStatus.Submitted });
    expect(() => service.recordPoint(afterSubmit, { lat: -6.23, lng: 107.03 })).toThrow(BadRequestException);
    expect(service.trailLengthOf(Number(s.id))).toBe(2); // unchanged
  });

  // --- AC-MBL-004 / REQ-MBL-006: stooring once per WO/region/WIB-day ----------

  it('charges the exact region fee once per WO/region/WIB-day; a repeat adds Rp 0', () => {
    const wo = 700;
    const first = step({ id: 901, workOrderId: wo, region: 'BEKASI' });
    const charge1 = service.onSubmit(first);
    expect(charge1.fee).toBe(250000); // AC-MBL-004: Bekasi Rp 250.000
    expect(charge1.firstForWoRegionDay).toBe(true);
    expect(service.stooringCostOf(wo)).toBe(250000);

    // A second Mobilisasi step of the same WO at Bekasi on the same WIB day → Rp 0.
    const second = step({ id: 902, workOrderId: wo, region: 'BEKASI' });
    const charge2 = service.onSubmit(second);
    expect(charge2.fee).toBe(0);
    expect(charge2.firstForWoRegionDay).toBe(false);
    expect(service.stooringCostOf(wo)).toBe(250000); // not doubled
  });

  it('charges Rp 0 for the workshop region', () => {
    const s = step({ id: 903, workOrderId: 701, region: 'WORKSHOP' });
    const charge = service.onSubmit(s);
    expect(charge.fee).toBe(0);
    expect(service.stooringCostOf(701)).toBe(0);
  });

  it('charges each distinct region on the same WO independently', () => {
    const wo = 702;
    service.onSubmit(step({ id: 904, workOrderId: wo, region: 'BEKASI' })); // 250.000
    service.onSubmit(step({ id: 905, workOrderId: wo, region: 'KARAWANG' })); // 180.000
    expect(service.stooringCostOf(wo)).toBe(430000);
  });

  // --- AC-MBL-003 / RSK-09: trail read privacy + access-log-per-read ----------

  it('refuses a non-Planner/SA read of the trail (403) and writes no access log', () => {
    const s = step({ id: 906 });
    service.start(s);
    service.recordPoint(s, { lat: -6.2, lng: 107.0 });
    const before = audit.count();
    expect(() => service.readTrail(s, mechanic)).toThrow(ForbiddenException);
    expect(audit.count()).toBe(before); // a refused read writes nothing
  });

  it('lets a Planner read the trail and writes exactly one access-log record per read', () => {
    const s = step({ id: 907 });
    service.start(s);
    service.recordPoint(s, { lat: -6.2, lng: 107.0 });
    service.recordPoint(s, { lat: -6.21, lng: 107.01 });

    const before = audit.findByEntity('mobilisation_location_trail', Number(s.id)).length;
    const trail = service.readTrail(s, planner);
    expect(trail).toHaveLength(2);
    const after = audit.findByEntity('mobilisation_location_trail', Number(s.id)).length;
    expect(after).toBe(before + 1); // exactly one record per read

    // A second read logs a second record.
    service.readTrail(s, planner);
    expect(audit.findByEntity('mobilisation_location_trail', Number(s.id)).length).toBe(before + 2);
  });

  // --- REQ-MBL-003/004: route + arrival ---------------------------------------

  it('returns the destination + region route payload at Start (REQ-MBL-003)', () => {
    const s = step({ id: 908, region: 'BEKASI', lat: -6.3, lng: 107.1 });
    const route = service.start(s);
    expect(route.destination).toEqual({ lat: -6.3, lng: 107.1 });
    expect(route.region).toMatchObject({ code: 'BEKASI', price: 250000 });
  });

  it('reports arrival within the threshold and not outside it (REQ-MBL-004)', () => {
    const s = step({ id: 909, region: 'BEKASI', lat: -6.3, lng: 107.1 });
    expect(service.hasArrived(s, { lat: -6.3, lng: 107.1 })).toBe(true); // at destination
    expect(service.hasArrived(s, { lat: -6.5, lng: 107.4 })).toBe(false); // far away
  });
});
