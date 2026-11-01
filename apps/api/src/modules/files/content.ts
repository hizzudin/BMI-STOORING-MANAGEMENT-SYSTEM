/**
 * Content detection + the Phase-1 image/metadata model (FG-16, REQ-FUP-002/003/005).
 *
 * Two concerns live here, both pure and deterministic:
 *
 *  1. **Content sniffing by magic bytes** ({@link detectContentType}) — the real
 *     leading bytes of a buffer decide its type, NOT its name or extension, so
 *     an MP4 renamed `.jpg` is detected as video and refused (AC-FUP-002).
 *
 *  2. **A deterministic image envelope** — Phase 1 does not run a real image
 *     codec (that is TASK-204's concern with the real store/worker). Instead a
 *     test/device builds a real-magic-byte file whose pixel dimensions, EXIF-GPS
 *     presence and logical byte size are carried in a trailing JSON sidecar
 *     after a sentinel. The compress stub reads this envelope, computes the
 *     resized dimensions and resulting size exactly per the profile, and strips
 *     the EXIF GPS — so the size/dimension/EXIF-strip transformation is modelled
 *     and fully testable without pixels. TASK-204 replaces the envelope with a
 *     real decode of the uploaded bytes behind the same function signatures.
 */

/** Detected logical content type, decided by the leading magic bytes only. */
export type DetectedType = 'image/jpeg' | 'image/png' | 'image/heic' | 'application/pdf' | 'video/mp4' | 'unknown';

/** The accepted (convertible) input types by content (NFR-06): JPG/PNG/HEIC + PDF. */
export const ACCEPTED_INPUT_TYPES: readonly DetectedType[] = [
  'image/jpeg',
  'image/png',
  'image/heic',
  'application/pdf',
];

/** Whether a detected type is an image (NFR-06 image rules apply). */
export function isImageType(type: DetectedType): boolean {
  return type === 'image/jpeg' || type === 'image/png' || type === 'image/heic';
}

/**
 * Detect the content type from the buffer's leading magic bytes.
 *
 * The check is deliberately by content, never by filename/extension — the AC-002
 * attack ("an MP4 renamed .jpg") is defeated here because an MP4's `ftyp` box
 * carries an `mp4`/`isom`/`M4V` major brand which we classify as `video/mp4`,
 * whereas a HEIC's `ftyp` carries `heic`/`heix`/`mif1`.
 */
export function detectContentType(bytes: Buffer): DetectedType {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'image/png';
  }
  // PDF: starts with "%PDF"
  if (bytes.length >= 4 && bytes.toString('ascii', 0, 4) === '%PDF') {
    return 'application/pdf';
  }
  // ISO base-media (ftyp box): bytes 4..8 are "ftyp"; the major brand (8..12)
  // distinguishes HEIC images from MP4/MOV video.
  if (bytes.length >= 12 && bytes.toString('ascii', 4, 8) === 'ftyp') {
    const brand = bytes.toString('ascii', 8, 12);
    if (brand === 'heic' || brand === 'heix' || brand === 'mif1' || brand === 'heis') {
      return 'image/heic';
    }
    return 'video/mp4';
  }
  return 'unknown';
}

// --- The Phase-1 deterministic envelope ------------------------------------

/** Metadata carried alongside a Phase-1 test/device file (the "envelope"). */
export interface FileEnvelope {
  /** Pixel width of the source image (0 for a PDF). */
  readonly width: number;
  readonly height: number;
  /** Logical byte size the source represents (REQ-FUP-003 original_bytes). */
  readonly logicalBytes: number;
  /** Whether the source carries EXIF GPS that must be stripped (AC-FUP-001). */
  readonly hasExifGps: boolean;
  /** EXIF capture time (the only kept EXIF field, REQ-FUP-003), or null. */
  readonly capturedAt: string | null;
  /** Page count for a PDF (REQ-FUP-002 ≤ 20). */
  readonly pageCount: number;
}

const ENVELOPE_SENTINEL = Buffer.from('\n--BMI-FUP-ENVELOPE--\n', 'ascii');

/** The leading magic bytes for a detected type, so the envelope sniffs correctly. */
const MAGIC: Partial<Record<DetectedType, Buffer>> = {
  'image/jpeg': Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
  'image/png': Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  'image/heic': Buffer.from([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63]),
  'application/pdf': Buffer.from('%PDF-1.7\n', 'ascii'),
  'video/mp4': Buffer.from([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32]),
};

/**
 * Build a Phase-1 file buffer: the real magic bytes for `type` followed by the
 * envelope sentinel and JSON metadata. Used by tests and the device-side helper
 * so the whole pipeline runs on genuine `Buffer`s with genuine magic bytes.
 */
export function buildFileBuffer(type: DetectedType, env: FileEnvelope): Buffer {
  const magic = MAGIC[type] ?? Buffer.from([0x00]);
  const json = Buffer.from(JSON.stringify(env), 'utf8');
  return Buffer.concat([magic, ENVELOPE_SENTINEL, json]);
}

/** Read the envelope back from a buffer, or `null` when it carries none. */
export function readEnvelope(bytes: Buffer): FileEnvelope | null {
  const idx = bytes.indexOf(ENVELOPE_SENTINEL);
  if (idx < 0) {
    return null;
  }
  const json = bytes.subarray(idx + ENVELOPE_SENTINEL.length).toString('utf8');
  try {
    return JSON.parse(json) as FileEnvelope;
  } catch {
    return null;
  }
}
