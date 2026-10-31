import { IsEmail, IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import type { SessionPlatform } from '../session.service.js';

/** `POST /auth/login` — sign in with email + password (REQ-IAM-001). */
export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(1)
  password!: string;

  /** Platform drives the session expiry policy (web idle / mobile absolute). */
  @IsOptional()
  @IsIn(['web', 'mobile'])
  platform?: SessionPlatform;
}

/**
 * `POST /auth/change-password` — forced first-sign-in change (REQ-IAM-009) and
 * voluntary change. Requires the current password and a new one.
 */
export class ChangePasswordDto {
  @IsString()
  @MinLength(1)
  currentPassword!: string;

  @IsString()
  @MinLength(1)
  newPassword!: string;
}

/** `POST /auth/reset/request` — ask for an emailed reset link (DQ-02). */
export class ResetRequestDto {
  @IsEmail()
  email!: string;
}

/** `POST /auth/reset/confirm` — set a new password using a reset token (DQ-02). */
export class ResetConfirmDto {
  @IsString()
  @MinLength(1)
  token!: string;

  @IsString()
  @MinLength(1)
  newPassword!: string;
}
