import { Module } from '@nestjs/common';
import { AuditModule } from '../../core/audit/audit.module.js';
import { FilesController } from './files.controller.js';
import { FilesService } from './files.service.js';
import { LocalObjectStore, OBJECT_STORE } from './local-object-store.js';
import { SignedLinkService } from './signed-link.service.js';

/**
 * FG-16 — File upload pipeline (REQ-FUP, NFR-06/NFR-13, BR-10).
 *
 * TASK-116 delivers, against a **local/dummy object store**:
 *   - **Signed-link issue** ({@link SignedLinkService}) — short-lived (5 min),
 *     unguessable HMAC-signed PUT/GET tokens so a client talks to the store
 *     directly only after the permission check (REQ-FUP-004, NFR-13).
 *   - **Device-side compress stub** + **content sniffing** — a deterministic
 *     resize/re-encode/strip-EXIF model (REQ-FUP-003, AC-FUP-001/008) and
 *     magic-byte content detection (an MP4 renamed .jpg is caught by content,
 *     AC-FUP-002).
 *   - **Server re-check / compress worker** ({@link FilesService.finalize}) —
 *     re-checks type/size/dimensions, compresses an image still above its
 *     profile (AC-FUP-003), stores a PDF unchanged with a first-page thumbnail
 *     (AC-FUP-005), writes the SHA-256 and sets Ready/Rejected (REQ-FUP-005).
 *   - **Three states + append-only** — the §9 `stored_files` lifecycle
 *     Pending → Ready/Rejected, with an idempotent 24 h orphan cleanup marking
 *     unattached files Expired (REQ-FUP-007/008/009, AC-FUP-006, BR-10).
 *
 * The {@link OBJECT_STORE} seam ({@link LocalObjectStore} in Phase 1) is swapped
 * by TASK-204 for the S3-compatible adapter (MinIO/R2) behind the same
 * interface, with no change to the pipeline. The role guard, validation pipe and
 * idempotency interceptor are global.
 */
@Module({
  imports: [AuditModule],
  controllers: [FilesController],
  providers: [
    FilesService,
    SignedLinkService,
    { provide: OBJECT_STORE, useClass: LocalObjectStore },
  ],
  exports: [FilesService, SignedLinkService],
})
export class FilesModule {}
