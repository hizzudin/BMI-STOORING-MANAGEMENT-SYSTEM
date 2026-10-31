import { BadRequestException, Injectable } from '@nestjs/common';
import bcrypt from 'bcryptjs';

/** Minimum password length (NFR-05: "≥8 chars letters+digits"). */
export const MIN_PASSWORD_LENGTH = 8;

/**
 * Password hashing + policy (NFR-05 / REQ-IAM-001).
 *
 * Passwords are **never** stored or logged in plaintext — only the bcrypt hash
 * is persisted (PRD §9.2 `users.password_hash`). bcrypt (via the pure-JS
 * `bcryptjs`) is used so there is no native build step; the work factor is a
 * deliberate trade-off for the Phase-1 dev gateway and is raised with the real
 * deployment in later phases.
 *
 * Policy (NFR-05): at least {@link MIN_PASSWORD_LENGTH} characters, containing
 * at least one letter and at least one digit.
 */
@Injectable()
export class PasswordService {
  private readonly saltRounds = 10;

  /**
   * Validate a plaintext password against the NFR-05 policy. Throws
   * `BadRequestException` with a clear, non-sensitive message on failure; the
   * password value itself is never echoed.
   */
  assertMeetsPolicy(password: string): void {
    if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
      throw new BadRequestException(
        `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
      );
    }
    const hasLetter = /[A-Za-z]/.test(password);
    const hasDigit = /[0-9]/.test(password);
    if (!hasLetter || !hasDigit) {
      throw new BadRequestException('Password must contain both letters and digits.');
    }
  }

  /** Hash a plaintext password (policy must already hold). */
  async hash(password: string): Promise<string> {
    return bcrypt.hash(password, this.saltRounds);
  }

  /**
   * Constant-time-ish verification of a plaintext against a stored hash. Returns
   * `false` for any malformed hash rather than throwing, so a login never leaks
   * whether the stored value was well-formed.
   */
  async verify(password: string, hash: string): Promise<boolean> {
    if (!hash) {
      return false;
    }
    try {
      return await bcrypt.compare(password, hash);
    } catch {
      return false;
    }
  }
}
