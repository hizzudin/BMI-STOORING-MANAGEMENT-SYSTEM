import { FileProfile } from '@bmi/shared';
import {
  buildFileBuffer,
  detectContentType,
  isImageType,
  readEnvelope,
  type FileEnvelope,
} from './content.js';
import { profileSpec, THUMBNAIL_LONG_EDGE } from './file-profiles.js';

/**
 * Device-side + server-side image transforms (FG-16, REQ-FUP-003/005).
 *
 * Phase 1 does not run a real codec; the transforms operate on the deterministic
 * {@link FileEnvelope} so the size / dimension / EXIF-strip outcome is modelled
 * and testable (TASK-204 swaps in a real decode behind the same signatures). All
 * functions are pure.
 */

/** The result of a compress pass: the new bytes + what changed. */
export interface CompressResult {
  readonly bytes: Buffer;
  readonly width: number;
  readonly height: number;
  readonly storedBytes: number;
  /** Always `false` after a compress — EXIF GPS is stripped (AC-FUP-001). */
  readonly hasExifGps: boolean;
  /** The single kept EXIF field (REQ-FUP-003). */
  readonly capturedAt: string | null;
  /** Re-encoded output type — always JPEG for an image (REQ-FUP-003). */
  readonly outputType: 'image/jpeg';
}

/** Resize a (width, height) to a long-edge cap, preserving aspect ratio. */
export function resizeToLongEdge(
  width: number,
  height: number,
  maxLongEdge: number,
): { width: number; height: number } {
  const longEdge = Math.max(width, height);
  if (longEdge <= maxLongEdge || maxLongEdge <= 0) {
    return { width, height };
  }
  const scale = maxLongEdge / longEdge;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/**
 * Deterministic model of the compressed JPEG byte size: proportional to the
 * output pixel count, driven below the profile's target ceiling. This models the
 * real "resize + re-encode to JPEG below ~1 MB" outcome (AC-FUP-001/003/008)
 * without a codec; TASK-204 reports the real encoder size here.
 */
function modelJpegBytes(width: number, height: number, targetMaxBytes: number): number {
  // ~0.25 bytes per pixel after JPEG compression — a realistic rough ratio.
  const modelled = Math.round(width * height * 0.25);
  const ceiling = targetMaxBytes > 0 ? targetMaxBytes - 1 : modelled;
  return Math.max(1, Math.min(modelled, ceiling));
}

/**
 * **Device-side compress stub** (REQ-FUP-003, AC-FUP-001/008).
 *
 * Represents the on-device auto-rotate → resize → re-encode-to-JPEG → strip-EXIF
 * step a client runs before upload. For a non-image (PDF) it returns the bytes
 * unchanged. For an image it resizes to the profile's long-edge cap, re-encodes
 * to a modelled JPEG below the target ceiling, strips every EXIF field except
 * the capture time, and rebuilds a genuine JPEG-magic buffer so the server
 * re-check still sees a real image.
 */
export function compressForProfile(bytes: Buffer, profile: FileProfile): CompressResult {
  const spec = profileSpec(profile);
  const detected = detectContentType(bytes);
  const env = readEnvelope(bytes);
  if (!env || !isImageType(detected)) {
    // PDF or codec-less fallback: no image transform, no EXIF to strip.
    return {
      bytes,
      width: env?.width ?? 0,
      height: env?.height ?? 0,
      storedBytes: env?.logicalBytes ?? bytes.length,
      hasExifGps: false,
      capturedAt: env?.capturedAt ?? null,
      outputType: 'image/jpeg',
    };
  }

  const { width, height } = resizeToLongEdge(env.width, env.height, spec.maxLongEdge);
  const storedBytes = modelJpegBytes(width, height, spec.targetMaxBytes);
  const nextEnv: FileEnvelope = {
    width,
    height,
    logicalBytes: storedBytes,
    hasExifGps: false, // stripped (AC-FUP-001)
    capturedAt: env.capturedAt, // the only EXIF field kept (REQ-FUP-003)
    pageCount: 0,
  };
  return {
    bytes: buildFileBuffer('image/jpeg', nextEnv),
    width,
    height,
    storedBytes,
    hasExifGps: false,
    capturedAt: env.capturedAt,
    outputType: 'image/jpeg',
  };
}

/**
 * Build the 320 px JPEG thumbnail model for a stored file (AC-FUP-001/005).
 * For an image it shrinks the stored dimensions to the 320 px long edge; for a
 * PDF it models a first-page thumbnail at 320 px (REQ-FUP-002, AC-FUP-005).
 */
export function buildThumbnail(
  bytes: Buffer,
  profile: FileProfile,
): { width: number; height: number; bytes: number } {
  const env = readEnvelope(bytes);
  if (profile === FileProfile.PDF) {
    // First-page thumbnail stub: a 320 px-tall A4-ish page preview.
    const height = THUMBNAIL_LONG_EDGE;
    const width = Math.round(height * 0.707); // A4 portrait ratio
    return { width, height, bytes: modelJpegBytes(width, height, 0) };
  }
  const srcW = env?.width ?? THUMBNAIL_LONG_EDGE;
  const srcH = env?.height ?? THUMBNAIL_LONG_EDGE;
  const { width, height } = resizeToLongEdge(srcW, srcH, THUMBNAIL_LONG_EDGE);
  return { width, height, bytes: modelJpegBytes(width, height, 0) };
}
