/**
 * Pure client-side gates for the field flows. These mirror the server's own
 * refusals (the API is authoritative) so the phone blocks an invalid submit
 * *before* a round trip — important on weak signal (PRODUCT.md principle 3) —
 * but they never replace the server check.
 */

/** A captured GPS fix (lat/lng), captured ONCE on a breakdown report. */
export interface CapturedLocation {
  readonly lat: number;
  readonly lng: number;
  readonly capturedAt: string;
}

/** The driver breakdown form state the submit gate evaluates. */
export interface BreakdownFormState {
  readonly vehicleId: number | null;
  /** Captured once; may be null if the driver denied/could not get a fix. */
  readonly location: CapturedLocation | null;
  /** The mandatory field-finding note → the draft's `finding_note`. */
  readonly findingNote: string;
}

export interface GateResult {
  readonly ok: boolean;
  /** A translation key the screen resolves, when blocked. */
  readonly reasonKey?: 'findingNoteRequired';
}

/**
 * Breakdown submit gate (REQ-PM-005, REQ-MBL-002, REQ-WO-016). A non-empty
 * finding note is **mandatory** — it becomes the draft's `finding_note` — so an
 * empty/whitespace note blocks the submit. A vehicle must be chosen. Location is
 * captured once but may legitimately be absent (denied/unavailable), so it does
 * not block the report; its presence is surfaced to the user separately.
 */
export function canSubmitBreakdown(state: BreakdownFormState): GateResult {
  if (state.vehicleId === null) {
    return { ok: false };
  }
  if (state.findingNote.trim().length === 0) {
    return { ok: false, reasonKey: 'findingNoteRequired' };
  }
  return { ok: true };
}

/** The Field Coordinator mobile draft form state the send gate evaluates. */
export interface FcDraftFormState {
  readonly findingNote: string;
}

export interface FcGateResult {
  readonly ok: boolean;
  readonly reasonKey?: 'draftNoteRequired';
}

/**
 * Field Coordinator draft "send for review" gate (REQ-WO-016, DEC-91). A typed
 * finding note is required before a FC draft can be sent for review; an
 * empty/whitespace note blocks the send (the server refuses it too).
 */
export function canSendFcDraftForReview(state: FcDraftFormState): FcGateResult {
  if (state.findingNote.trim().length === 0) {
    return { ok: false, reasonKey: 'draftNoteRequired' };
  }
  return { ok: true };
}
