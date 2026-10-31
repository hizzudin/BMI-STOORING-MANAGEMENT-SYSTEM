import { IsBoolean, IsEmail, IsIn, IsInt, IsOptional, IsPositive, IsString, MinLength } from 'class-validator';
import { Role } from '@bmi/shared';

const ROLE_VALUES = Object.values(Role);

/**
 * `POST /users` — create an account (Access Manager only, REQ-IAM-002). Each
 * account gets exactly one role (BR-14); a one-time temporary password is issued
 * and a first-sign-in change is forced (REQ-IAM-009).
 */
export class CreateAccountDto {
  @IsString()
  @MinLength(1)
  fullName!: string;

  @IsEmail()
  email!: string;

  @IsIn(ROLE_VALUES)
  role!: Role;

  /** The one-time temporary password (must meet the NFR-05 policy). */
  @IsString()
  @MinLength(1)
  temporaryPassword!: string;
}

/** `PATCH /users/:id` — edit an account's active flag (REQ-IAM-002). */
export class UpdateAccountDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  fullName?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

/**
 * `POST /users/move-system-admin` — move the single System Admin role to another
 * active account, with a reason (REQ-IAM-004, BR-14).
 */
export class MoveSystemAdminDto {
  @IsInt()
  @IsPositive()
  toUserId!: number;

  @IsString()
  @MinLength(1)
  reason!: string;
}
