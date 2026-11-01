import { describe, expect, it } from 'vitest';
import {
  canSendFcDraftForReview,
  canSubmitBreakdown,
  type BreakdownFormState,
} from './field-validation.js';

const captured = { lat: -6.2, lng: 106.8, capturedAt: '2026-11-11T03:00:00.000Z' };

describe('canSubmitBreakdown (REQ-PM-005, REQ-MBL-002, REQ-WO-016)', () => {
  it('allows a report with a vehicle + a non-empty finding note (location captured)', () => {
    const state: BreakdownFormState = {
      vehicleId: 1,
      location: captured,
      findingNote: 'Engine overheating on the toll road',
    };
    expect(canSubmitBreakdown(state)).toEqual({ ok: true });
  });

  it('BLOCKS a report with an empty / whitespace finding note', () => {
    const base: BreakdownFormState = { vehicleId: 1, location: captured, findingNote: '' };
    expect(canSubmitBreakdown(base)).toEqual({ ok: false, reasonKey: 'findingNoteRequired' });
    expect(canSubmitBreakdown({ ...base, findingNote: '   ' })).toEqual({
      ok: false,
      reasonKey: 'findingNoteRequired',
    });
  });

  it('still requires a note even when location could not be captured (denied/unavailable)', () => {
    const state: BreakdownFormState = { vehicleId: 1, location: null, findingNote: '' };
    expect(canSubmitBreakdown(state).ok).toBe(false);
  });

  it('allows the report without a location once a note is present (location is optional on-device)', () => {
    const state: BreakdownFormState = { vehicleId: 1, location: null, findingNote: 'Flat tyre' };
    expect(canSubmitBreakdown(state)).toEqual({ ok: true });
  });

  it('requires a vehicle to be chosen', () => {
    const state: BreakdownFormState = { vehicleId: null, location: captured, findingNote: 'x' };
    expect(canSubmitBreakdown(state).ok).toBe(false);
  });
});

describe('canSendFcDraftForReview (REQ-WO-016, DEC-91)', () => {
  it('requires a typed finding note before send-for-review', () => {
    expect(canSendFcDraftForReview({ findingNote: '' })).toEqual({
      ok: false,
      reasonKey: 'draftNoteRequired',
    });
    expect(canSendFcDraftForReview({ findingNote: '\n\t ' }).ok).toBe(false);
  });

  it('allows send once a note is typed', () => {
    expect(canSendFcDraftForReview({ findingNote: 'Brake line leak noticed in the field' })).toEqual({
      ok: true,
    });
  });
});
