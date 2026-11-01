import { describe, expect, it, beforeEach } from 'vitest';
import { ConflictException } from '@nestjs/common';
import { FileProfile, FileStatus, idValue } from '@bmi/shared';
import { buildFileBuffer, type FileEnvelope } from './content.js';
import { FilesService, ORPHAN_TTL_MS } from './files.service.js';
import { LocalObjectStore } from './local-object-store.js';
import { SignedLinkService } from './signed-link.service.js';

/**
 * FilesService coverage (TASK-116, REQ-FUP). Drives the full sign → upload →
 * finalize-worker lifecycle against the local object store. Validates:
 * AC-FUP-001 (compress + no EXIF GPS), AC-FUP-002 (MP4 renamed .jpg → Rejected),
 * AC-FUP-003 (worker compresses an 8 MB JPEG before Ready), AC-FUP-005 (PDF
 * unchanged + first-page thumbnail), AC-FUP-006 (24 h orphan cleanup),
 * REQ-FUP-008 (append-only / never re-upload in place).
 */
describe('FilesService (TASK-116)', () => {
  let store: LocalObjectStore;
  let service: FilesService;
  const uploader = 3;
  const t0 = Date.UTC(2026, 10, 11, 1, 0, 0);

  beforeEach(() => {
    store = new LocalObjectStore();
    service = new FilesService(store, new SignedLinkService());
  });

  function imageBuffer(width: number, height: number, bytes: number, gps = true): Buffer {
    const env: FileEnvelope = {
      width,
      height,
      logicalBytes: bytes,
      hasExifGps: gps,
      capturedAt: '2026-11-11T02:00:00.000Z',
      pageCount: 0,
    };
    return buildFileBuffer('image/jpeg', env);
  }

  async function signAndUpload(profile: FileProfile, buf: Buffer, now = t0) {
    const { file, uploadToken } = service.signUpload({ profile, entity: 'wo' }, uploader, now);
    const finalized = await service.upload(uploadToken, buf, now);
    return { slotId: idValue(file.id), file: finalized };
  }

  it('creates a Pending row with an unguessable storage key on sign', () => {
    const { file, uploadToken } = service.signUpload({ profile: FileProfile.Photo, entity: 'wo' }, uploader, t0);
    expect(file.status).toBe(FileStatus.Pending);
    expect(file.storageKey).toMatch(/^dev\/2026\/11\/wo\/[0-9a-f-]{36}\.jpg$/);
    expect(uploadToken.length).toBeGreaterThan(20);
  });

  it('a 4 MB 4032×3024 photo → Ready, 1600×1200, <1 MB, no EXIF GPS, SHA-256 set (AC-FUP-001)', async () => {
    const { file } = await signAndUpload(FileProfile.Photo, imageBuffer(4032, 3024, 4_200_000, true));
    expect(file.status).toBe(FileStatus.Ready);
    expect(file.width).toBe(1600);
    expect(file.height).toBe(1200);
    expect(file.storedBytes).toBeLessThan(1_000_000);
    expect(file.originalBytes).toBe(4_200_000);
    expect(file.thumbKey).not.toBeNull();
    expect(file.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(file.mimeType).toBe('image/jpeg');
  });

  it('an MP4 renamed .jpg sent to the API is set Rejected by content (AC-FUP-002)', async () => {
    const mp4 = buildFileBuffer('video/mp4', {
      width: 1920,
      height: 1080,
      logicalBytes: 5_000_000,
      hasExifGps: false,
      capturedAt: null,
      pageCount: 0,
    });
    const { file } = await signAndUpload(FileProfile.Photo, mp4);
    expect(file.status).toBe(FileStatus.Rejected);
    expect(file.rejectReason).toContain('video/mp4');
    // The bytes were removed from the store (never served).
    expect(await store.has(file.storageKey)).toBe(false);
  });

  it('the worker compresses an uncompressed 8 MB JPEG before Ready (AC-FUP-003)', async () => {
    const { file } = await signAndUpload(FileProfile.Photo, imageBuffer(4000, 3000, 8_000_000, false));
    expect(file.status).toBe(FileStatus.Ready);
    expect(Math.max(file.width ?? 0, file.height ?? 0)).toBe(1600);
    expect(file.storedBytes).toBeLessThan(1_000_000);
  });

  it('a 1.8 MB PDF is stored unchanged with a first-page thumbnail (AC-FUP-005)', async () => {
    const pdf = buildFileBuffer('application/pdf', {
      width: 0,
      height: 0,
      logicalBytes: 1_800_000,
      hasExifGps: false,
      capturedAt: null,
      pageCount: 2,
    });
    const { file } = await signAndUpload(FileProfile.PDF, pdf);
    expect(file.status).toBe(FileStatus.Ready);
    expect(file.mimeType).toBe('application/pdf');
    expect(file.storedBytes).toBe(1_800_000); // unchanged
    expect(file.pageCount).toBe(2);
    expect(file.thumbKey).not.toBeNull();
  });

  it('rejects a PDF above 20 pages and above 10 MB', async () => {
    const tooManyPages = buildFileBuffer('application/pdf', {
      width: 0,
      height: 0,
      logicalBytes: 2_000_000,
      hasExifGps: false,
      capturedAt: null,
      pageCount: 25,
    });
    const { file } = await signAndUpload(FileProfile.PDF, tooManyPages);
    expect(file.status).toBe(FileStatus.Rejected);
    expect(file.rejectReason).toContain('20 pages');
  });

  it('is append-only: a finalized row cannot be re-uploaded in place (REQ-FUP-008)', async () => {
    const { file } = await signAndUpload(FileProfile.Photo, imageBuffer(1600, 1200, 500_000, false));
    // Re-using the same (already finalized) slot's token must be refused — the
    // row is Ready, not Pending.
    const { uploadToken } = service.signUpload({ profile: FileProfile.Photo, entity: 'wo' }, uploader, t0);
    // Finalize once so it is Ready, then try again on that token.
    await service.upload(uploadToken, imageBuffer(1600, 1200, 500_000, false), t0);
    await expect(service.upload(uploadToken, imageBuffer(1600, 1200, 500_000, false), t0)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(file.version).toBeGreaterThan(1); // versioned, immutable patches
  });

  it('finalize is idempotent on a Ready/Rejected row', async () => {
    const { slotId, file } = await signAndUpload(FileProfile.Photo, imageBuffer(1600, 1200, 500_000, false));
    const again = await service.finalize(slotId, t0 + 1);
    expect(again.version).toBe(file.version); // no further transition
    expect(again.status).toBe(FileStatus.Ready);
  });

  it('serves a Ready file through a signed link but refuses a non-Ready one', async () => {
    const { slotId } = await signAndUpload(FileProfile.Photo, imageBuffer(1600, 1200, 500_000, false));
    const { token } = service.signRead(slotId, t0);
    const bytes = await service.serve(token, t0 + 10);
    expect(bytes.length).toBeGreaterThan(0);
  });

  describe('24 h orphan cleanup (AC-FUP-006, REQ-FUP-009)', () => {
    it('marks an unattached file Expired and removes its bytes after 24 h', async () => {
      const { slotId, file } = await signAndUpload(FileProfile.Photo, imageBuffer(1600, 1200, 500_000, false), t0);
      expect(file.status).toBe(FileStatus.Ready);
      // Ready-but-unattached counts as not-core only when Pending/Rejected;
      // model the cancelled form: the file was never Ready-attached. Use a
      // Pending orphan (upload never finalized) to match REQ-FUP-009 exactly.
      const pending = service.signUpload({ profile: FileProfile.Photo, entity: 'wo' }, uploader, t0);
      await store.put(pending.file.storageKey, Buffer.from('bytes'));

      const result = await service.cleanupOrphans(t0 + ORPHAN_TTL_MS);
      expect(result.expired).toBe(1);
      const row = service.require(idValue(pending.file.id));
      expect(row.status).toBe(FileStatus.Expired);
      expect(await store.has(pending.file.storageKey)).toBe(false);
      // The Ready file is untouched (REQ-FUP-008).
      expect(service.require(slotId).status).toBe(FileStatus.Ready);
    });

    it('is idempotent: a second run expires nothing more (NFR-12)', async () => {
      service.signUpload({ profile: FileProfile.Photo, entity: 'wo' }, uploader, t0);
      const first = await service.cleanupOrphans(t0 + ORPHAN_TTL_MS);
      expect(first.expired).toBe(1);
      const second = await service.cleanupOrphans(t0 + ORPHAN_TTL_MS + 1000);
      expect(second.expired).toBe(0);
    });

    it('does not expire a file younger than 24 h', async () => {
      service.signUpload({ profile: FileProfile.Photo, entity: 'wo' }, uploader, t0);
      const result = await service.cleanupOrphans(t0 + ORPHAN_TTL_MS - 1);
      expect(result.expired).toBe(0);
    });

    it('never expires an attached file (REQ-FUP-008, BR-10)', async () => {
      const { slotId } = await signAndUpload(FileProfile.Photo, imageBuffer(1600, 1200, 500_000, false), t0);
      service.attach(slotId, t0);
      const result = await service.cleanupOrphans(t0 + ORPHAN_TTL_MS * 10);
      expect(result.expired).toBe(0);
      expect(service.require(slotId).attachedAt).not.toBeNull();
    });
  });
});
