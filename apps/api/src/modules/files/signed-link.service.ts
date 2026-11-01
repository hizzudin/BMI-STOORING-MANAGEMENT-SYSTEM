import { Injectable } from '@nestjs/common';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Short-lived signed links for direct upload and read (FG-16, REQ-FUP-004,
 * NFR-13, DEC-32).
 *
 * A signed link lets a client talk to the (local/dummy in Phase 1) object store
 * directly, "only after a permission check" (REQ-FUP-004) — the permission check
 * happens in the controller/guard before a link is minted. Links are:
 *   - **unguessable** — each carries a 128-bit random nonce and an HMAC-SHA-256
 *     signature over `key|op|nonce|expiry`, so a client cannot forge or mutate
 *     one; and
 *   - **short-lived** — they expire after a few minutes (NFR-13); the default is
 *     5 minutes, matching the Mechanic seamless-upload window (AC-FUP-007).
 *
 * Phase-1 modelling: the HMAC key is an in-process random secret (never a
 * committed secret, fullstack-guardian). TASK-204 issues the real store's native
 * pre-signed URLs (R2/S3) behind this same contract; the signing secret moves to
 * Secret Manager.
 */

/** A signed link's operation. */
export type LinkOp = 'put' | 'get';

/** The default link lifetime: 5 minutes (NFR-13 "a few minutes"). */
export const SIGNED_LINK_TTL_MS = 5 * 60 * 1000;

/** The verified payload of a signed token. */
export interface SignedLink {
  readonly key: string;
  readonly op: LinkOp;
  readonly expiresAt: number;
}

/** The result of verifying a token. */
export type VerifyResult =
  | { readonly ok: true; readonly link: SignedLink }
  | { readonly ok: false; readonly reason: 'malformed' | 'bad_signature' | 'expired' | 'wrong_op' };

@Injectable()
export class SignedLinkService {
  /** In-process signing secret (Phase 1). Rotated on every process start. */
  private readonly secret = randomBytes(32);

  /**
   * Mint a signed token for `op` on `key`, valid for `ttlMs` from `now`. The
   * caller is responsible for the permission check before calling this
   * (REQ-FUP-004). `now`/`nonce` are injectable for deterministic tests.
   */
  issue(
    key: string,
    op: LinkOp,
    ttlMs: number = SIGNED_LINK_TTL_MS,
    now: number = Date.now(),
    nonce: string = randomBytes(16).toString('hex'),
  ): string {
    const expiresAt = now + ttlMs;
    const payload = this.payload(key, op, nonce, expiresAt);
    const sig = this.sign(payload);
    // base64url the "key|op|nonce|expiry" + signature so the token is opaque.
    return `${Buffer.from(payload, 'utf8').toString('base64url')}.${sig}`;
  }

  /**
   * Verify a token for the expected `op` at `now`. Returns the decoded link on
   * success, or a typed failure reason — never throws, so the caller maps it to
   * the right HTTP status.
   */
  verify(token: string, expectedOp: LinkOp, now: number = Date.now()): VerifyResult {
    const dot = token.lastIndexOf('.');
    if (dot <= 0) {
      return { ok: false, reason: 'malformed' };
    }
    const payload = Buffer.from(token.slice(0, dot), 'base64url').toString('utf8');
    const sig = token.slice(dot + 1);
    const parts = payload.split('|');
    if (parts.length !== 4) {
      return { ok: false, reason: 'malformed' };
    }
    const [key, op, , expiryStr] = parts as [string, string, string, string];
    if (!this.signatureMatches(payload, sig)) {
      return { ok: false, reason: 'bad_signature' };
    }
    if (op !== expectedOp) {
      return { ok: false, reason: 'wrong_op' };
    }
    const expiresAt = Number(expiryStr);
    if (!Number.isFinite(expiresAt) || now >= expiresAt) {
      return { ok: false, reason: 'expired' };
    }
    return { ok: true, link: { key, op: op as LinkOp, expiresAt } };
  }

  private payload(key: string, op: LinkOp, nonce: string, expiresAt: number): string {
    return `${key}|${op}|${nonce}|${expiresAt}`;
  }

  private sign(payload: string): string {
    return createHmac('sha256', this.secret).update(payload).digest('base64url');
  }

  private signatureMatches(payload: string, sig: string): boolean {
    const expected = Buffer.from(this.sign(payload), 'utf8');
    const got = Buffer.from(sig, 'utf8');
    if (expected.length !== got.length) {
      return false;
    }
    return timingSafeEqual(expected, got);
  }
}
