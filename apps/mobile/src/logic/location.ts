import type { CapturedLocation } from './field-validation.js';

/**
 * Capture the device location ONCE (REQ-MBL-002, REQ-WO-016). The breakdown flow
 * records a single fix at report time — not a continuous trail (the continuous
 * mechanic trail belongs only to an In_Progress Mobilisasi step in R2, never the
 * driver app). This indirection keeps `expo-location` out of the pure modules so
 * the capture contract is unit-testable with a fake capturer.
 */
export type LocationCapturer = () => Promise<CapturedLocation | null>;

export type CaptureOutcome =
  | { readonly status: 'captured'; readonly location: CapturedLocation }
  | { readonly status: 'denied' }
  | { readonly status: 'unavailable' };

/**
 * Run a capturer once and classify the outcome. A `null` from the capturer means
 * permission denied or no fix — the report can still proceed (the location is
 * optional on-device; the mandatory finding note is what gates the submit).
 */
export async function captureOnce(capturer: LocationCapturer): Promise<CaptureOutcome> {
  try {
    const location = await capturer();
    if (location === null) {
      return { status: 'denied' };
    }
    return { status: 'captured', location };
  } catch {
    return { status: 'unavailable' };
  }
}
