import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import {
  CaptureSource,
  FileProfile,
  FileStatus,
  StoredMimeType,
  idValue,
  toId,
  type StoredFileDto,
} from '@bmi/shared';
import { wibDayOf } from '@bmi/config';
import { buildThumbnail, compressForProfile } from './compression.js';
import {
  ACCEPTED_INPUT_TYPES,
  detectContentType,
  isImageType,
  readEnvelope,
  type DetectedType,
} from './content.js';
import {
  MAX_IMAGE_INPUT_BYTES,
  MAX_PDF_INPUT_BYTES,
  MAX_PDF_PAGES,
  profileSpec,
} from './file-profiles.js';
import { OBJECT_STORE, type ObjectStore } from './local-object-store.js';
import { SIGNED_LINK_TTL_MS, SignedLinkService } from './signed-link.service.js';

/** How long after upload an unattached Pending/Rejected file is orphaned (REQ-FUP-009). */
export const ORPHAN_TTL_MS = 24 * 60 * 60 * 1000;

/** The environment prefix in a storage key (`{env}/...`, PRD §9). */
const STORAGE_ENV = 'dev';

/** Input to request a signed upload slot (REQ-FUP-001/004). */
export interface SignUploadInput {
  readonly profile: FileProfile;
  readonly originalName?: string | null;
  readonly captureSource?: CaptureSource | null;
  /** The entity the file will attach to (drives the storage-key folder). */
  readonly entity?: string;
}

/** The issued signed upload slot. */
export interface SignUploadResult {
  readonly file: StoredFileDto;
  /** Short-lived signed token to PUT the bytes to the store (NFR-13). */
  readonly uploadToken: string;
  /** When the upload token expires (epoch ms). */
  readonly expiresAt: number;
}

/**
 * **FUP files service** (FG-16, REQ-FUP, NFR-06/NFR-13, BR-10).
 *
 * Owns the `stored_files` lifecycle against the local/dummy object store:
 *
 *  - **Sign** ({@link signUpload}) — after the permission check (controller
 *    guard), create a `Pending` row with a generated unguessable storage key and
 *    mint a short-lived signed PUT token (REQ-FUP-004, NFR-13). Note the row's
 *    `originalBytes`/dimensions are filled by the device-side compress on upload.
 *  - **Upload** ({@link upload}) — accept the device-compressed bytes against a
 *    valid signed token (the Phase-1 stand-in for a direct-to-bucket PUT); the
 *    server does NOT keep files on its own disk, the bytes land in the store.
 *  - **Finalize worker** ({@link finalize}) — re-check the REAL content type
 *    (an MP4 renamed .jpg → Rejected, AC-FUP-002), re-check size/dimensions,
 *    compress an image still above its profile (AC-FUP-003), store a PDF
 *    unchanged with a first-page thumbnail (AC-FUP-005), compute the SHA-256 and
 *    set `Ready` or `Rejected` (REQ-FUP-005). Idempotent — re-running on a
 *    Ready/Rejected row is a no-op.
 *  - **Read link** ({@link signRead}) — a short-lived signed GET link to serve a
 *    stored file (NFR-13), minted only for a Ready file.
 *  - **Attach / orphan cleanup** — a Ready file attached to a record is never
 *    changed or deleted (REQ-FUP-008, BR-10); the idempotent
 *    {@link cleanupOrphans} marks unattached Pending/Rejected files older than
 *    24 h `Expired` and removes their bytes (REQ-FUP-009, AC-FUP-006).
 *
 * Phase-1 modelling: the dummy gateway models the nine business aggregates only,
 * so `stored_files` is an API-layer in-memory home (TASK-103/104/115 precedent)
 * behind the {@link ObjectStore} seam; TASK-201/202 re-home the row behind the
 * §9 table and TASK-204 the store behind R2 — both contracts unchanged.
 */
@Injectable()
export class FilesService {
  private readonly files = new Map<number, StoredFileDto>();
  private nextId = 1;

  constructor(
    @Inject(OBJECT_STORE) private readonly store: ObjectStore,
    private readonly links: SignedLinkService,
  ) {}

  // --- sign (REQ-FUP-001/004) ---------------------------------------------

  /**
   * Issue a signed upload slot. The permission check is the controller's job
   * (REQ-FUP-004); here we create the `Pending` row and mint the PUT token.
   */
  signUpload(input: SignUploadInput, uploadedBy: number, now: number = Date.now()): SignUploadResult {
    const id = this.nextId++;
    const storageKey = this.makeStorageKey(input.profile, input.entity ?? 'misc', now);
    const file: StoredFileDto = {
      id: toId<'StoredFileId'>(id),
      storageKey,
      thumbKey: null,
      profile: input.profile,
      mimeType: input.profile === FileProfile.PDF ? StoredMimeType.Pdf : StoredMimeType.Jpeg,
      originalName: input.originalName ?? null,
      originalBytes: null,
      storedBytes: null,
      width: null,
      height: null,
      pageCount: null,
      sha256: null,
      capturedAt: null,
      captureSource: input.captureSource ?? null,
      status: FileStatus.Pending,
      rejectReason: null,
      uploadedBy: toId<'UserId'>(uploadedBy),
      uploadedAt: new Date(now).toISOString(),
      attachedAt: null,
      version: 1,
    };
    this.files.set(id, file);
    const uploadToken = this.links.issue(storageKey, 'put', SIGNED_LINK_TTL_MS, now);
    return { file, uploadToken, expiresAt: now + SIGNED_LINK_TTL_MS };
  }

  // --- upload (REQ-FUP-004/012) -------------------------------------------

  /**
   * Accept the device-compressed bytes for a signed slot (the Phase-1 stand-in
   * for the direct-to-bucket PUT). Refuses an expired/forged token (NFR-13) and
   * a byte payload whose slot is unknown. Records the as-uploaded
   * `originalBytes` and dimensions from the device envelope (REQ-FUP-003), then
   * runs the finalize worker.
   */
  async upload(
    uploadToken: string,
    bytes: Buffer,
    now: number = Date.now(),
  ): Promise<StoredFileDto> {
    const verified = this.links.verify(uploadToken, 'put', now);
    if (!verified.ok) {
      throw new BadRequestException(`Upload link ${verified.reason}.`);
    }
    const file = this.requireByKey(verified.link.key);
    if (file.status !== FileStatus.Pending) {
      // Append-only: a Ready/Rejected/Expired row is never re-uploaded in place.
      throw new ConflictException(`File ${file.id} is ${file.status}; upload a new file.`);
    }
    const env = readEnvelope(bytes);
    this.patch(idValue(file.id), {
      originalBytes: env?.logicalBytes ?? bytes.length,
      width: env?.width ?? null,
      height: env?.height ?? null,
      pageCount: env?.pageCount ?? null,
      capturedAt: env?.capturedAt ?? null,
    });
    await this.store.put(file.storageKey, bytes);
    return this.finalize(idValue(file.id), now);
  }

  // --- finalize worker (REQ-FUP-002/005) ----------------------------------

  /**
   * Server re-check + compress worker. Runs after the bytes land. Idempotent:
   * a Ready/Rejected row is returned unchanged.
   */
  async finalize(id: number, now: number = Date.now()): Promise<StoredFileDto> {
    const file = this.require(id);
    if (file.status === FileStatus.Ready || file.status === FileStatus.Rejected) {
      return file;
    }
    const bytes = await this.store.get(file.storageKey);
    if (!bytes) {
      return this.reject(id, 'No bytes were uploaded.');
    }

    // 1. Re-check the REAL content type by its bytes, not its name (AC-FUP-002).
    const detected = detectContentType(bytes);
    if (!ACCEPTED_INPUT_TYPES.includes(detected)) {
      await this.store.remove(file.storageKey);
      return this.reject(id, `Rejected: content is ${detected}, not an accepted image or PDF.`);
    }

    // 2. Profile vs content consistency + size/dimension re-check (REQ-FUP-002).
    const limitError = this.checkLimits(file.profile, detected, bytes);
    if (limitError) {
      await this.store.remove(file.storageKey);
      return this.reject(id, limitError);
    }

    if (file.profile === FileProfile.PDF) {
      return this.finalizePdf(id, bytes, now);
    }
    return this.finalizeImage(id, bytes, now);
  }

  /** PDF: stored unchanged + first-page thumbnail (AC-FUP-005). */
  private async finalizePdf(id: number, bytes: Buffer, now: number): Promise<StoredFileDto> {
    const file = this.require(id);
    const env = readEnvelope(bytes);
    const thumb = buildThumbnail(bytes, FileProfile.PDF);
    const thumbKey = this.thumbKeyFor(file.storageKey);
    await this.store.put(thumbKey, Buffer.alloc(thumb.bytes, 1));
    return this.patch(id, {
      status: FileStatus.Ready,
      mimeType: StoredMimeType.Pdf,
      storedBytes: env?.logicalBytes ?? bytes.length,
      pageCount: env?.pageCount ?? 1,
      thumbKey,
      width: thumb.width,
      height: thumb.height,
      sha256: this.hash(bytes),
      capturedAt: env?.capturedAt ?? null,
      finalizedAt: now,
    });
  }

  /** Image: compress to the profile if still above it, then Ready (AC-FUP-003). */
  private async finalizeImage(id: number, bytes: Buffer, now: number): Promise<StoredFileDto> {
    const file = this.require(id);
    const spec = profileSpec(file.profile);
    const env = readEnvelope(bytes);
    const longEdge = Math.max(env?.width ?? 0, env?.height ?? 0);
    const needsCompress =
      longEdge > spec.maxLongEdge || (env?.logicalBytes ?? bytes.length) > spec.targetMaxBytes;

    const result = needsCompress
      ? compressForProfile(bytes, file.profile)
      : {
          bytes,
          width: env?.width ?? 0,
          height: env?.height ?? 0,
          storedBytes: env?.logicalBytes ?? bytes.length,
          capturedAt: env?.capturedAt ?? null,
        };

    // Persist the (possibly re-compressed) output bytes back to the store, then
    // the 320 px thumbnail (AC-FUP-001). The main `width/height` on the row hold
    // the stored-image dimensions, not the thumbnail's.
    await this.store.put(file.storageKey, result.bytes);
    const thumb = buildThumbnail(result.bytes, file.profile);
    const thumbKey = this.thumbKeyFor(file.storageKey);
    await this.store.put(thumbKey, Buffer.alloc(thumb.bytes, 1));

    return this.patch(id, {
      status: FileStatus.Ready,
      mimeType: StoredMimeType.Jpeg,
      width: result.width,
      height: result.height,
      storedBytes: result.storedBytes,
      thumbKey,
      sha256: this.hash(result.bytes),
      capturedAt: result.capturedAt,
      finalizedAt: now,
    });
  }

  // --- read link (NFR-13) --------------------------------------------------

  /** Mint a short-lived signed GET link for a Ready file (NFR-13). */
  signRead(id: number, now: number = Date.now()): { token: string; expiresAt: number } {
    const file = this.require(id);
    if (file.status !== FileStatus.Ready) {
      throw new ConflictException(`File ${id} is ${file.status}; only a Ready file can be served.`);
    }
    const token = this.links.issue(file.storageKey, 'get', SIGNED_LINK_TTL_MS, now);
    return { token, expiresAt: now + SIGNED_LINK_TTL_MS };
  }

  /** Resolve a signed GET token to the stored bytes (the dummy "serve"). */
  async serve(token: string, now: number = Date.now()): Promise<Buffer> {
    const verified = this.links.verify(token, 'get', now);
    if (!verified.ok) {
      throw new BadRequestException(`Read link ${verified.reason}.`);
    }
    const bytes = await this.store.get(verified.link.key);
    if (!bytes) {
      throw new NotFoundException('The stored file no longer exists.');
    }
    return bytes;
  }

  // --- attach + append-only (REQ-FUP-008, BR-10) --------------------------

  /**
   * Attach a Ready file to a record. Once attached it is never changed or
   * deleted; attaching an already-attached file is idempotent (same timestamp
   * kept). Refuses attaching a file that is not Ready (the server must refuse a
   * submit referencing a not-Ready file, REQ-FUP-006).
   */
  attach(id: number, now: number = Date.now()): StoredFileDto {
    const file = this.require(id);
    if (file.status !== FileStatus.Ready) {
      throw new ConflictException(`File ${id} is ${file.status}; a submit cannot reference it (REQ-FUP-006).`);
    }
    if (file.attachedAt !== null) {
      return file;
    }
    return this.patch(id, { attachedAt: new Date(now).toISOString() });
  }

  // --- orphan cleanup (REQ-FUP-009, AC-FUP-006) ---------------------------

  /**
   * Idempotent 24 h orphan cleanup. Every Pending/Rejected file that is not
   * attached to any record and older than 24 h is removed from storage and its
   * row marked `Expired` (REQ-FUP-009). A Ready or attached file is never
   * touched (REQ-FUP-008, BR-10). Safe to re-run — an already-Expired row is
   * skipped, so a second run removes nothing more (NFR-12 idempotent jobs).
   */
  async cleanupOrphans(now: number = Date.now()): Promise<{ expired: number }> {
    let expired = 0;
    for (const file of this.files.values()) {
      const unattached = file.attachedAt === null;
      const cleanable = file.status === FileStatus.Pending || file.status === FileStatus.Rejected;
      const age = now - Date.parse(file.uploadedAt);
      if (unattached && cleanable && age >= ORPHAN_TTL_MS) {
        await this.store.remove(file.storageKey);
        if (file.thumbKey) {
          await this.store.remove(file.thumbKey);
        }
        this.patch(idValue(file.id), { status: FileStatus.Expired });
        expired += 1;
      }
    }
    return { expired };
  }

  // --- reads ---------------------------------------------------------------

  /** The stored file row, throwing when unknown. */
  require(id: number): StoredFileDto {
    const file = this.files.get(id);
    if (!file) {
      throw new NotFoundException(`Stored file ${id} not found.`);
    }
    return file;
  }

  /** Current total stored bytes (NFR-13 storage-budget usage). */
  totalStoredBytes(): Promise<number> {
    return this.store.totalBytes();
  }

  // --- helpers -------------------------------------------------------------

  private requireByKey(key: string): StoredFileDto {
    for (const file of this.files.values()) {
      if (file.storageKey === key) {
        return file;
      }
    }
    throw new NotFoundException(`No upload slot for key '${key}'.`);
  }

  /** `{env}/{yyyy}/{mm}/{entity}/{uuid}.jpg|pdf` (PRD §9). Unguessable via UUID. */
  private makeStorageKey(profile: FileProfile, entity: string, now: number): string {
    const day = wibDayOf(now);
    const yyyy = String(day.year).padStart(4, '0');
    const mm = String(day.month).padStart(2, '0');
    const ext = profile === FileProfile.PDF ? 'pdf' : 'jpg';
    const safeEntity = entity.replace(/[^a-z0-9_-]/gi, '').slice(0, 40) || 'misc';
    return `${STORAGE_ENV}/${yyyy}/${mm}/${safeEntity}/${randomUUID()}.${ext}`;
  }

  private thumbKeyFor(storageKey: string): string {
    return storageKey.replace(/\.(jpg|pdf)$/i, '.thumb.jpg');
  }

  private checkLimits(profile: FileProfile, detected: DetectedType, bytes: Buffer): string | null {
    const env = readEnvelope(bytes);
    const logicalBytes = env?.logicalBytes ?? bytes.length;
    if (profile === FileProfile.PDF) {
      if (detected !== 'application/pdf') {
        return `Rejected: the PDF slot received ${detected}.`;
      }
      if (logicalBytes > MAX_PDF_INPUT_BYTES) {
        return 'Rejected: the PDF is above the 10 MB limit.';
      }
      if ((env?.pageCount ?? 1) > MAX_PDF_PAGES) {
        return `Rejected: the PDF has more than ${MAX_PDF_PAGES} pages.`;
      }
      return null;
    }
    // Image profiles (Photo/Document): content must be an image.
    if (!isImageType(detected)) {
      return `Rejected: an image slot received ${detected}.`;
    }
    if (logicalBytes > MAX_IMAGE_INPUT_BYTES) {
      return 'Rejected: the image is above the 30 MB limit.';
    }
    return null;
  }

  private reject(id: number, reason: string): StoredFileDto {
    return this.patch(id, { status: FileStatus.Rejected, rejectReason: reason });
  }

  private hash(bytes: Buffer): string {
    return createHash('sha256').update(bytes).digest('hex');
  }

  /**
   * Append-only patch: produce a new immutable row with a bumped version. The
   * `finalizedAt` key is stripped (it is not a DTO field) — it only signals a
   * finalize happened for internal clarity.
   */
  private patch(
    id: number,
    patch: Partial<StoredFileDto> & { finalizedAt?: number },
  ): StoredFileDto {
    const current = this.require(id);
    const { finalizedAt: _finalizedAt, ...rest } = patch;
    const next: StoredFileDto = { ...current, ...rest, version: current.version + 1 };
    this.files.set(id, next);
    return next;
  }

  /** Test hook: wipe the in-memory rows between cases. */
  resetForTests(): void {
    this.files.clear();
    this.nextId = 1;
  }
}
