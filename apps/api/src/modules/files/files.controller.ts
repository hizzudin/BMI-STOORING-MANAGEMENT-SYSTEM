import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { AuthenticatedRequest, CurrentUser } from '../../core/auth/current-user.js';
import { RequireCapability } from '../../core/auth/require-capability.decorator.js';
import { Capabilities } from '../../core/auth/permission-matrix.js';
import { enrichAudit } from '../../core/audit/audit-context.js';
import { idValue } from '@bmi/shared';
import { FilesService } from './files.service.js';
import { AttachFileDto, SignUploadDto, UploadBytesDto } from './dto/files.dto.js';

/**
 * FG-16 — File upload pipeline (REQ-FUP, NFR-06/NFR-13, BR-10).
 *
 * The signed-link upload flow (REQ-FUP-004): a client first asks for a signed
 * slot (`POST /uploads/sign`, gated by `files.upload` after the §2.2 check),
 * uploads the device-compressed bytes against the short-lived signed token
 * (`POST /uploads` — the Phase-1 stand-in for a direct-to-bucket PUT), and the
 * server re-check/compress worker runs on landing. A Ready file is served through
 * a short-lived signed GET link (`GET /files/:id/link`, NFR-13).
 *
 * Mutating endpoints carry the §2.2 RolesGuard, the global ValidationPipe, the
 * IdempotencyInterceptor and exactly one audit record via the AuditInterceptor.
 * Reads (`GET`) only require an authenticated principal. There is no optimistic-
 * lock `version` on the client-facing calls because the append-only `stored_files`
 * lifecycle is server-driven (the worker transitions it), never a client PUT.
 */
@Controller()
export class FilesController {
  constructor(private readonly files: FilesService) {}

  /** Issue a signed upload slot after the permission check (REQ-FUP-004). */
  @Post('uploads/sign')
  @RequireCapability(Capabilities.FilesUpload)
  @HttpCode(HttpStatus.CREATED)
  sign(@Req() req: AuthenticatedRequest, @Body() dto: SignUploadDto): unknown {
    const user = this.principal(req);
    const result = this.files.signUpload(
      {
        profile: dto.profile,
        originalName: dto.originalName ?? null,
        captureSource: dto.captureSource ?? null,
        ...(dto.entity === undefined ? {} : { entity: dto.entity }),
      },
      user.userId,
    );
    enrichAudit(req, {
      entity: 'stored_files',
      entityId: idValue(result.file.id),
      after: { profile: result.file.profile, storageKey: result.file.storageKey },
      reason: 'sign_upload',
    });
    return result;
  }

  /**
   * Upload the device-compressed bytes to a signed slot, then run the worker.
   * The server does not keep files on its own disk — the bytes land in the
   * object store (REQ-FUP-004).
   */
  @Post('uploads')
  @RequireCapability(Capabilities.FilesUpload)
  @HttpCode(HttpStatus.OK)
  async upload(@Req() req: AuthenticatedRequest, @Body() dto: UploadBytesDto): Promise<unknown> {
    this.principal(req);
    const file = await this.files.upload(dto.uploadToken, Buffer.from(dto.bytes, 'base64'));
    enrichAudit(req, {
      entity: 'stored_files',
      entityId: idValue(file.id),
      after: { status: file.status, storedBytes: file.storedBytes },
      reason: 'upload_file',
    });
    return { file };
  }

  /** The stored-file row (metadata for the detail panel, REQ-FUP-007). */
  @Get('files/:id')
  detail(@Param('id', ParseIntPipe) id: number): unknown {
    return { file: this.files.require(id) };
  }

  /** Mint a short-lived signed GET link for a Ready file (REQ-FUP-016, NFR-13). */
  @Get('files/:id/link')
  readLink(@Param('id', ParseIntPipe) id: number): unknown {
    return this.files.signRead(id);
  }

  /** Attach a Ready file to its record; append-only afterwards (REQ-FUP-008). */
  @Post('files/attach')
  @RequireCapability(Capabilities.FilesUpload)
  @HttpCode(HttpStatus.OK)
  attach(@Req() req: AuthenticatedRequest, @Body() dto: AttachFileDto): unknown {
    this.principal(req);
    const file = this.files.attach(dto.fileId);
    enrichAudit(req, {
      entity: 'stored_files',
      entityId: dto.fileId,
      after: { attachedAt: file.attachedAt },
      reason: 'attach_file',
    });
    return { file };
  }

  private principal(req: AuthenticatedRequest): CurrentUser {
    if (!req.currentUser) {
      throw new UnauthorizedException('Authentication required.');
    }
    return req.currentUser;
  }
}
