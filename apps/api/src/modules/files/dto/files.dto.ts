import { IsBase64, IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { CaptureSource, FileProfile } from '@bmi/shared';

/**
 * Request DTOs for the Files module (FG-16, REQ-FUP). Every field is validated
 * by the global `ValidationPipe` (`whitelist + forbidNonWhitelisted +
 * transform`), so an unknown field is rejected before a service sees it
 * (fullstack-guardian: never trust client input).
 */

/** Request a signed upload slot for one profile (REQ-FUP-001/004). */
export class SignUploadDto {
  @IsIn([FileProfile.Photo, FileProfile.Document, FileProfile.PDF])
  profile!: FileProfile;

  @IsOptional()
  @IsString()
  originalName?: string;

  @IsOptional()
  @IsIn([CaptureSource.Camera, CaptureSource.Gallery, CaptureSource.File])
  captureSource?: CaptureSource;

  /** The record the file will attach to (drives the storage-key folder). */
  @IsOptional()
  @IsString()
  entity?: string;
}

/**
 * Upload the device-compressed bytes to a signed slot (Phase-1 stand-in for the
 * direct-to-bucket PUT). The bytes are base64 so the JSON transport is clean;
 * TASK-204 replaces this with a direct PUT to the pre-signed bucket URL.
 */
export class UploadBytesDto {
  @IsString()
  uploadToken!: string;

  @IsBase64()
  bytes!: string;
}

/** Attach a Ready file to its record (REQ-FUP-008). */
export class AttachFileDto {
  @IsInt()
  @Min(1)
  fileId!: number;
}
