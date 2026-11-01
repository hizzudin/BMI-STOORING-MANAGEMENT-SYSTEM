import { describe, expect, it } from 'vitest';
import { SIGNED_LINK_TTL_MS, SignedLinkService } from './signed-link.service.js';

/**
 * Signed-link coverage (TASK-116, REQ-FUP-004, NFR-13): tokens are unguessable
 * (HMAC), scoped to their op, and expire after a few minutes. Validates:
 * signed-link expiry + tamper-resistance.
 */
describe('SignedLinkService (TASK-116)', () => {
  const svc = new SignedLinkService();
  const t0 = Date.UTC(2026, 10, 11, 0, 0, 0);

  it('issues a token that verifies for its op within the TTL', () => {
    const token = svc.issue('dev/2026/11/wo/x.jpg', 'put', SIGNED_LINK_TTL_MS, t0);
    const result = svc.verify(token, 'put', t0 + 60_000);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.link.key).toBe('dev/2026/11/wo/x.jpg');
      expect(result.link.op).toBe('put');
    }
  });

  it('rejects a token after it expires (5 min, NFR-13)', () => {
    const token = svc.issue('k', 'put', SIGNED_LINK_TTL_MS, t0);
    const result = svc.verify(token, 'put', t0 + SIGNED_LINK_TTL_MS + 1);
    expect(result).toEqual({ ok: false, reason: 'expired' });
  });

  it('rejects a token presented for the wrong op', () => {
    const put = svc.issue('k', 'put', SIGNED_LINK_TTL_MS, t0);
    expect(svc.verify(put, 'get', t0 + 1)).toEqual({ ok: false, reason: 'wrong_op' });
  });

  it('rejects a tampered token (bad signature)', () => {
    const token = svc.issue('k', 'get', SIGNED_LINK_TTL_MS, t0);
    const dot = token.lastIndexOf('.');
    const tampered = `${token.slice(0, dot)}.${'A'.repeat(token.length - dot - 1)}`;
    const result = svc.verify(tampered, 'get', t0 + 1);
    expect(result.ok).toBe(false);
  });

  it('rejects a malformed token', () => {
    expect(svc.verify('garbage', 'put', t0)).toEqual({ ok: false, reason: 'malformed' });
  });

  it('two tokens for the same key differ (unguessable nonce)', () => {
    const a = svc.issue('k', 'put', SIGNED_LINK_TTL_MS, t0);
    const b = svc.issue('k', 'put', SIGNED_LINK_TTL_MS, t0);
    expect(a).not.toBe(b);
  });
});
