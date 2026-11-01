import { FileProfile } from '@bmi/shared';

/**
 * Upload-profile limits and output rules (NFR-06, §8.1, REQ-FUP-001/002/003).
 *
 * Every upload slot has exactly one profile; the profile fixes the accepted
 * input limits and the compressed output. These are the authoritative numbers
 * from NFR-06 / §8.1 kept in one place so the device stub and the server worker
 * apply identical rules (REQ-FUP-002: "refuse it again on the server").
 */
export interface ProfileSpec {
  readonly profile: FileProfile;
  /** Long-edge pixel cap for an image profile (Photo 1600, Document 2400). */
  readonly maxLongEdge: number;
  /** Thumbnail long-edge (320 px JPEG, AC-FUP-001). */
  readonly thumbLongEdge: number;
  /** Target compressed size ceiling in bytes an image is driven below. */
  readonly targetMaxBytes: number;
}

/** The 320 px JPEG thumbnail long edge, shared by every profile (AC-FUP-001). */
export const THUMBNAIL_LONG_EDGE = 320;

/** Compressed-image target ceiling: below 1 MB (AC-FUP-001/008). */
export const IMAGE_TARGET_MAX_BYTES = 1_000_000;

export const PROFILE_SPECS: Readonly<Record<FileProfile, ProfileSpec>> = {
  [FileProfile.Photo]: {
    profile: FileProfile.Photo,
    maxLongEdge: 1600,
    thumbLongEdge: THUMBNAIL_LONG_EDGE,
    targetMaxBytes: IMAGE_TARGET_MAX_BYTES,
  },
  [FileProfile.Document]: {
    profile: FileProfile.Document,
    maxLongEdge: 2400,
    thumbLongEdge: THUMBNAIL_LONG_EDGE,
    targetMaxBytes: IMAGE_TARGET_MAX_BYTES,
  },
  [FileProfile.PDF]: {
    // A PDF is stored unchanged (AC-FUP-005); the image caps do not apply.
    profile: FileProfile.PDF,
    maxLongEdge: 0,
    thumbLongEdge: THUMBNAIL_LONG_EDGE,
    targetMaxBytes: 0,
  },
};

// --- Accepted-input limits (NFR-06 / REQ-FUP-002) --------------------------

/** An image is refused above 30 MB before compression (NFR-06). */
export const MAX_IMAGE_INPUT_BYTES = 30 * 1024 * 1024;
/** A PDF is refused above 10 MB (NFR-06). */
export const MAX_PDF_INPUT_BYTES = 10 * 1024 * 1024;
/** A PDF is refused above 20 pages (REQ-FUP-002). */
export const MAX_PDF_PAGES = 20;

/** Resolve the profile spec for a slot profile. */
export function profileSpec(profile: FileProfile): ProfileSpec {
  return PROFILE_SPECS[profile];
}
