import {
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { type UserDto, idValue } from '@bmi/shared';
import type { DataGateway } from '@bmi/data-gateway';
import { DATA_GATEWAY } from '../../core/data-gateway/data-gateway.module.js';
import { PasswordService } from './password.service.js';
import { SessionService, type SessionPlatform, type SessionRecord } from './session.service.js';
import { PasswordResetService } from './password-reset.service.js';
import { AppSettingsService } from './app-settings.service.js';

/** The number of consecutive failures that locks an account (NFR-05, DEC-55). */
export const MAX_FAILED_LOGINS = 5;
/** How long a locked account stays locked (NFR-05, DEC-55). */
export const LOCKOUT_DURATION_MS = 15 * 60 * 1000;

/** A successful sign-in result. */
export interface LoginResult {
  readonly session: SessionRecord;
  readonly user: UserDto;
  /** True when the user must change the password before doing anything else. */
  readonly mustChangePassword: boolean;
}

/**
 * Authentication: sign-in, lockout, first-sign-in change and email reset
 * (REQ-IAM-001/009, DQ-02, NFR-05).
 *
 * All five NFR-05 auth rules live here or in the services this coordinates:
 *   1. hashed passwords, policy ≥8 chars letters+digits → {@link PasswordService}.
 *   2. first-sign-in forced change → `mustChangePassword` gate on login.
 *   3. 5 failed sign-ins lock the account 15 minutes → {@link login}.
 *   4. web idle 30 min / 5. mobile 30 days → {@link SessionService}.
 *
 * To avoid leaking which accounts exist, every "bad email / bad password /
 * inactive" path returns the same generic 401.
 */
@Injectable()
export class AuthService {
  constructor(
    @Inject(DATA_GATEWAY) private readonly gateway: DataGateway,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
    private readonly resets: PasswordResetService,
    private readonly settings: AppSettingsService,
  ) {}

  /**
   * Sign a user in. On success, resets the failure counter and issues a session
   * for the platform (web idle / mobile absolute expiry). On a bad password,
   * increments the counter and locks the account at {@link MAX_FAILED_LOGINS}.
   * A locked, inactive or unknown account is refused.
   *
   * Setup-mode gating (REQ-IAM-010 / AC-IAM-006): while the system is in Setup
   * mode, only System Admin and Access Manager may sign in; every other role is
   * refused with "The system is being set up".
   */
  async login(
    email: string,
    password: string,
    platform: SessionPlatform,
    now: number = Date.now(),
  ): Promise<LoginResult> {
    const normalized = email.trim().toLowerCase();

    const user = await this.gateway.unitOfWork(async (ctx) => {
      const found = await ctx.repos.users.findOneBy('email', normalized);
      if (!found || !found.isActive) {
        return null;
      }

      // Locked? (NFR-05 rule 3)
      if (found.lockedUntil !== null && new Date(found.lockedUntil).getTime() > now) {
        throw new UnauthorizedException('Account locked. Try again later or ask an Access Manager.');
      }

      const ok = await this.passwords.verify(password, found.passwordHash);
      if (!ok) {
        const failedLogins = found.failedLogins + 1;
        const locks = failedLogins >= MAX_FAILED_LOGINS;
        await ctx.repos.users.update({
          ...found,
          failedLogins,
          lockedUntil: locks ? new Date(now + LOCKOUT_DURATION_MS).toISOString() : found.lockedUntil,
        });
        return null;
      }

      // Success: clear the counter and any stale lock window.
      if (found.failedLogins !== 0 || found.lockedUntil !== null) {
        return ctx.repos.users.update({ ...found, failedLogins: 0, lockedUntil: null });
      }
      return found;
    });

    if (!user) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    this.assertMaySignInForMode(user);

    const session = this.sessions.issue(idValue(user.id), user.role, platform, now);
    return { session, user, mustChangePassword: user.mustChangePassword };
  }

  /**
   * Change the signed-in user's password (first-sign-in forced change,
   * REQ-IAM-009, or a voluntary change). Verifies the current password, applies
   * the NFR-05 policy to the new one, clears `must_change_password`, and revokes
   * other sessions so a changed password takes effect everywhere.
   */
  async changePassword(
    userId: number,
    currentPassword: string,
    newPassword: string,
  ): Promise<UserDto> {
    this.passwords.assertMeetsPolicy(newPassword);
    const newHash = await this.passwords.hash(newPassword);

    const updated = await this.gateway.unitOfWork(async (ctx) => {
      const user = await ctx.repos.users.getById(userId);
      if (!user) {
        throw new UnauthorizedException('Authentication required.');
      }
      const ok = await this.passwords.verify(currentPassword, user.passwordHash);
      if (!ok) {
        throw new UnauthorizedException('The current password is incorrect.');
      }
      return ctx.repos.users.update({
        ...user,
        passwordHash: newHash,
        mustChangePassword: false,
      });
    });

    this.sessions.revokeAllForUser(userId);
    return updated;
  }

  /**
   * Request an emailed reset link (DQ-02). Always succeeds from the caller's
   * point of view — it never reveals whether the email matched an account — but
   * only issues a token when it did.
   */
  async requestReset(email: string, now: number = Date.now()): Promise<void> {
    const normalized = email.trim().toLowerCase();
    const user = await this.gateway.repos.users.findOneBy('email', normalized);
    if (user && user.isActive) {
      this.resets.issue(idValue(user.id), normalized, now);
    }
  }

  /**
   * Complete a reset with the token from the email link (DQ-02): validate the
   * token, apply the policy to the new password, set it, consume the token and
   * revoke the user's sessions.
   */
  async confirmReset(token: string, newPassword: string, now: number = Date.now()): Promise<void> {
    const userId = this.resets.resolve(token, now);
    if (userId === null) {
      throw new ForbiddenException('The reset link is invalid or has expired.');
    }
    this.passwords.assertMeetsPolicy(newPassword);
    const newHash = await this.passwords.hash(newPassword);

    await this.gateway.unitOfWork(async (ctx) => {
      const user = await ctx.repos.users.getById(userId);
      if (!user) {
        throw new ForbiddenException('The reset link is invalid or has expired.');
      }
      await ctx.repos.users.update({
        ...user,
        passwordHash: newHash,
        mustChangePassword: false,
      });
    });

    this.resets.consume(token);
    this.sessions.revokeAllForUser(userId);
  }

  /** Sign out: revoke the current session. */
  logout(token: string | undefined): void {
    this.sessions.revoke(token);
  }

  /**
   * Setup-mode sign-in gate (REQ-IAM-010 / AC-IAM-006). While in Setup mode only
   * System Admin and Access Manager may sign in.
   */
  private assertMaySignInForMode(user: UserDto): void {
    if (this.settings.isLive()) {
      return;
    }
    const allowedInSetup = user.role === 'System_Admin' || user.role === 'Access_Manager';
    if (!allowedInSetup) {
      throw new ForbiddenException('The system is being set up.');
    }
  }
}
