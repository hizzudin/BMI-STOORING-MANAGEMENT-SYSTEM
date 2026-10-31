import { Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type { Role } from '@bmi/shared';

/** The client platform a session belongs to; drives its expiry policy (NFR-05). */
export type SessionPlatform = 'web' | 'mobile';

/** Web sessions expire after 30 minutes of inactivity (NFR-05). */
export const WEB_IDLE_TIMEOUT_MS = 30 * 60 * 1000;
/** Mobile sessions live for 30 days from issue (NFR-05). */
export const MOBILE_ABSOLUTE_TIMEOUT_MS = 30 * 24 * 60 * 60 * 1000;

/** A stored session record. Times are epoch milliseconds (UTC). */
export interface SessionRecord {
  readonly token: string;
  readonly userId: number;
  readonly role: Role;
  readonly platform: SessionPlatform;
  /** When the session was issued. */
  readonly createdAt: number;
  /** Last time the session was seen on a request (web idle clock). */
  lastSeenAt: number;
}

/** The principal resolved from a valid session (shape consumed by the guard). */
export interface ResolvedPrincipal {
  readonly userId: number;
  readonly role: Role;
}

/**
 * Session store (NFR-05 session rules). Phase-1 dev uses this in-memory map; the
 * design pins sessions to Redis (design.md "Redis backs jobs/queues and
 * sessions"), which TASK-202/205 wire in behind this same service contract.
 *
 * Expiry rules, enforced on every {@link resolve}:
 *   - **web**    → idle timeout: expires {@link WEB_IDLE_TIMEOUT_MS} after the
 *     last request. Each successful resolve slides the clock (touch).
 *   - **mobile** → absolute expiry: lives {@link MOBILE_ABSOLUTE_TIMEOUT_MS}
 *     from issue regardless of activity.
 *
 * Tokens are opaque 256-bit random strings (not JWTs) so a session can be
 * revoked server-side (logout, lockout, account deactivation).
 */
@Injectable()
export class SessionService {
  private readonly sessions = new Map<string, SessionRecord>();

  /** Issue a new session for a user on a platform. `now` is injectable for tests. */
  issue(userId: number, role: Role, platform: SessionPlatform, now: number = Date.now()): SessionRecord {
    const token = randomBytes(32).toString('hex');
    const record: SessionRecord = {
      token,
      userId,
      role,
      platform,
      createdAt: now,
      lastSeenAt: now,
    };
    this.sessions.set(token, record);
    return record;
  }

  /**
   * Resolve a token to its principal, or `null` if the token is unknown or the
   * session has expired. A live web session is touched (idle clock slides); an
   * expired session is evicted.
   */
  resolve(token: string | undefined, now: number = Date.now()): ResolvedPrincipal | null {
    if (!token) {
      return null;
    }
    const record = this.sessions.get(token);
    if (!record) {
      return null;
    }
    if (this.isExpired(record, now)) {
      this.sessions.delete(token);
      return null;
    }
    // Slide the idle clock for web sessions; mobile uses an absolute expiry.
    if (record.platform === 'web') {
      record.lastSeenAt = now;
    }
    return { userId: record.userId, role: record.role };
  }

  /** Revoke a single session (sign-out). */
  revoke(token: string | undefined): void {
    if (token) {
      this.sessions.delete(token);
    }
  }

  /** Revoke every session of a user (lockout, deactivation, password change). */
  revokeAllForUser(userId: number): void {
    for (const [token, record] of this.sessions) {
      if (record.userId === userId) {
        this.sessions.delete(token);
      }
    }
  }

  private isExpired(record: SessionRecord, now: number): boolean {
    if (record.platform === 'web') {
      return now - record.lastSeenAt >= WEB_IDLE_TIMEOUT_MS;
    }
    return now - record.createdAt >= MOBILE_ABSOLUTE_TIMEOUT_MS;
  }
}
