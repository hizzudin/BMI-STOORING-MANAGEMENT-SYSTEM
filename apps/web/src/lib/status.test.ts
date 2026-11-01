import { describe, it, expect } from 'vitest';
import { WorkOrderPriority, WorkOrderStatus, StepStatus, VehicleStatus } from '@bmi/shared';
import {
  priorityPill,
  workOrderStatusPill,
  stepStatusPill,
  vehicleStatusPill,
  humanize,
} from './status';

/**
 * The binding a11y rule (NFR-A11Y / DESIGN.md "The Words First Rule"): every
 * status/urgency mapping MUST return a non-empty text label, so colour is never
 * the only carrier of meaning. These tests assert that invariant across all
 * four pill families plus the specific urgency → colour mapping (REQ-WO-015).
 */

describe('priorityPill — urgency always carries its word (REQ-WO-015, NFR-A11Y)', () => {
  it('maps the four priorities to the DESIGN.md colours with their text label', () => {
    expect(priorityPill(WorkOrderPriority.Urgent)).toEqual({ variant: 'danger', label: 'Urgent' });
    expect(priorityPill(WorkOrderPriority.High)).toEqual({ variant: 'warning', label: 'High' });
    expect(priorityPill(WorkOrderPriority.Normal)).toEqual({ variant: 'info', label: 'Normal' });
    expect(priorityPill(WorkOrderPriority.Low)).toEqual({ variant: 'neutral', label: 'Low' });
  });

  it('every priority yields a non-empty label', () => {
    for (const p of Object.values(WorkOrderPriority)) {
      expect(priorityPill(p).label.length).toBeGreaterThan(0);
    }
  });
});

describe('status pills always carry a text label', () => {
  it('WO status: every value has a label', () => {
    for (const s of Object.values(WorkOrderStatus)) {
      expect(workOrderStatusPill(s).label.length).toBeGreaterThan(0);
    }
  });

  it('step status: every value has a label', () => {
    for (const s of Object.values(StepStatus)) {
      expect(stepStatusPill(s).label.length).toBeGreaterThan(0);
    }
  });

  it('vehicle status: every value has a label', () => {
    for (const s of Object.values(VehicleStatus)) {
      expect(vehicleStatusPill(s).label.length).toBeGreaterThan(0);
    }
  });
});

describe('humanize', () => {
  it('replaces underscores with spaces', () => {
    expect(humanize('Pending_Approval')).toBe('Pending Approval');
    expect(humanize('In_Progress')).toBe('In Progress');
  });
});
