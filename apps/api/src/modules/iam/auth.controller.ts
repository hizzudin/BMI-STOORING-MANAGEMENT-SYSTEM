import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../../core/auth/current-user.js';
import { Public } from '../../core/auth/public.decorator.js';
import { enrichAudit } from '../../core/audit/audit-context.js';
import { AuthService } from './auth.service.js';
import { ChangePasswordDto, LoginDto, ResetConfirmDto, ResetRequestDto } from './dto/auth.dto.js';

/** Bearer-token header name for the session token (opaque, server-revocable). */
export const SESSION_HEADER = 'authorization';

/**
 * FG-13 authentication endpoints (REQ-IAM-001/009, DQ-02, NFR-05).
 *
 * `/auth/login`, `/auth/reset/request` and `/auth/reset/confirm` are `@Public()`
 * (no principal yet). `/auth/change-password` and `/auth/logout` require a
 * resolved session. Mutating calls are audited by the global interceptor; the
 * handlers enrich the record where the acting user is known (e.g. logout) but
 * never log credential values.
 */
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** Sign in (REQ-IAM-001). Returns the session token and the first-change flag. */
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto): Promise<{
    token: string;
    role: string;
    userId: number;
    mustChangePassword: boolean;
  }> {
    const result = await this.auth.login(dto.email, dto.password, dto.platform ?? 'web');
    return {
      token: result.session.token,
      role: result.user.role,
      userId: result.session.userId,
      mustChangePassword: result.mustChangePassword,
    };
  }

  /** Forced first-sign-in change / voluntary change (REQ-IAM-009). */
  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  async changePassword(
    @Req() req: AuthenticatedRequest,
    @Body() dto: ChangePasswordDto,
  ): Promise<{ ok: true }> {
    const principal = req.currentUser;
    if (!principal) {
      throw new UnauthorizedException('Authentication required.');
    }
    await this.auth.changePassword(principal.userId, dto.currentPassword, dto.newPassword);
    enrichAudit(req, { entity: 'users', entityId: principal.userId, reason: 'change_password' });
    return { ok: true };
  }

  /** Ask for an emailed reset link (DQ-02). Always 202, never reveals existence. */
  @Public()
  @Post('reset/request')
  @HttpCode(HttpStatus.ACCEPTED)
  async requestReset(@Body() dto: ResetRequestDto): Promise<{ ok: true }> {
    await this.auth.requestReset(dto.email);
    return { ok: true };
  }

  /** Set a new password from the reset link (DQ-02). */
  @Public()
  @Post('reset/confirm')
  @HttpCode(HttpStatus.OK)
  async confirmReset(@Body() dto: ResetConfirmDto): Promise<{ ok: true }> {
    await this.auth.confirmReset(dto.token, dto.newPassword);
    return { ok: true };
  }

  /** Sign out: revoke the current session. */
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  logout(@Req() req: AuthenticatedRequest): { ok: true } {
    const token = extractBearer(req.header(SESSION_HEADER));
    this.auth.logout(token);
    return { ok: true };
  }
}

/** Pull the token out of an `Authorization: Bearer <token>` header. */
export function extractBearer(header: string | undefined): string | undefined {
  if (!header) {
    return undefined;
  }
  const [scheme, value] = header.split(' ');
  if (scheme?.toLowerCase() === 'bearer' && value) {
    return value;
  }
  return undefined;
}
