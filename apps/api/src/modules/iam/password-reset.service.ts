import { Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'node:crypto';

/** A reset link expires after this window (DQ-02 "expires after a set time"). */
export const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;

/** A stored reset token. Times are epoch milliseconds (UTC). */
interface ResetTokenRecord {
  readonly token: string;
  readonly userId: number;
  readonly expiresAt: number;
  /** A token is single-use; consuming it marks it spent. */
  used: boolean;
}

/**
 * Email password-reset token lifecycle (DQ-02 / §7.11).
 *
 * The flow: a user requests a reset → a single-use, time-limited token is
 * issued and "emailed" (a dev stub logs it; the real WhatsApp/email adapter is
 * P2, out of R1 scope) → the user opens the link and sets a new password,
 * consuming the token. DQ-02 supersedes REQ-IAM-009's "no email reset in R1"
 * note; the Access Manager can still issue a temporary password (REQ-IAM-009),
 * which is the account-creation path.
 *
 * Phase-1 dev keeps tokens in memory; design.md pins this to Redis alongside
 * sessions in later phases, behind the same contract. Tokens are opaque 256-bit
 * random strings so they cannot be guessed.
 */
@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);
  private readonly tokens = new Map<string, ResetTokenRecord>();

  /**
   * Issue a reset token for a user and send the link (dev stub). Returns the
   * token so the dev flow / tests can follow the link; a real deployment would
   * only email it. `now` is injectable for tests.
   */
  issue(userId: number, email: string, now: number = Date.now()): string {
    const token = randomBytes(32).toString('hex');
    this.tokens.set(token, {
      token,
      userId,
      expiresAt: now + RESET_TOKEN_TTL_MS,
      used: false,
    });
    this.sendResetEmail(email, token);
    return token;
  }

  /**
   * Resolve a reset token to its user id, or `null` if the token is unknown,
   * expired or already used. Does not consume it — call {@link consume} once the
   * new password is successfully set.
   */
  resolve(token: string | undefined, now: number = Date.now()): number | null {
    if (!token) {
      return null;
    }
    const record = this.tokens.get(token);
    if (!record || record.used || now >= record.expiresAt) {
      return null;
    }
    return record.userId;
  }

  /** Mark a token spent (single-use). Safe to call for an unknown token. */
  consume(token: string): void {
    const record = this.tokens.get(token);
    if (record) {
      record.used = true;
    }
  }

  /**
   * Dev email stub — logs that a reset link was issued WITHOUT logging the token
   * value, so the secret never lands in logs. The real adapter (WhatsApp/email)
   * is P2 and out of R1 scope.
   */
  private sendResetEmail(email: string, _token: string): void {
    this.logger.log(`Password reset link issued for ${email} (dev stub; email adapter is P2).`);
  }
}
