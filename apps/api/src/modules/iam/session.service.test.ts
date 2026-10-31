import { describe, expect, it } from 'vitest';
import { Role } from '@bmi/shared';
import {
  SessionService,
  WEB_IDLE_TIMEOUT_MS,
  MOBILE_ABSOLUTE_TIMEOUT_MS,
} from './session.service.js';

/**
 * NFR-05 session rules 4 and 5: web idle timeout 30 minutes, mobile absolute
 * expiry 30 days. Time is injected so the clock is deterministic.
 */
describe('SessionService — web idle / mobile expiry (NFR-05)', () => {
  const t0 = 1_000_000_000_000;

  it('resolves a fresh web session', () => {
    const svc = new SessionService();
    const s = svc.issue(1, Role.Planner, 'web', t0);
    expect(svc.resolve(s.token, t0)?.userId).toBe(1);
  });

  it('expires a web session after 30 minutes of inactivity', () => {
    const svc = new SessionService();
    const s = svc.issue(1, Role.Planner, 'web', t0);
    // Just before the timeout: still live.
    expect(svc.resolve(s.token, t0 + WEB_IDLE_TIMEOUT_MS - 1)).not.toBeNull();
    // Activity slides the idle clock to that moment.
    const t1 = t0 + WEB_IDLE_TIMEOUT_MS - 1;
    // From t1, another near-full window is still live…
    expect(svc.resolve(s.token, t1 + WEB_IDLE_TIMEOUT_MS - 1)).not.toBeNull();
  });

  it('expires an idle web session (no activity for 30 minutes)', () => {
    const svc = new SessionService();
    const s = svc.issue(1, Role.Planner, 'web', t0);
    expect(svc.resolve(s.token, t0 + WEB_IDLE_TIMEOUT_MS)).toBeNull();
  });

  it('keeps a mobile session alive well past the web idle window', () => {
    const svc = new SessionService();
    const s = svc.issue(1, Role.Driver, 'mobile', t0);
    // A full day of inactivity: a web session would be long gone, mobile is live.
    expect(svc.resolve(s.token, t0 + 24 * 60 * 60 * 1000)).not.toBeNull();
  });

  it('expires a mobile session after 30 days (absolute, regardless of activity)', () => {
    const svc = new SessionService();
    const s = svc.issue(1, Role.Driver, 'mobile', t0);
    expect(svc.resolve(s.token, t0 + MOBILE_ABSOLUTE_TIMEOUT_MS - 1)).not.toBeNull();
    expect(svc.resolve(s.token, t0 + MOBILE_ABSOLUTE_TIMEOUT_MS)).toBeNull();
  });

  it('revokes a session on logout and all sessions for a user', () => {
    const svc = new SessionService();
    const a = svc.issue(1, Role.Planner, 'web', t0);
    const b = svc.issue(1, Role.Planner, 'mobile', t0);
    svc.revoke(a.token);
    expect(svc.resolve(a.token, t0)).toBeNull();
    expect(svc.resolve(b.token, t0)).not.toBeNull();
    svc.revokeAllForUser(1);
    expect(svc.resolve(b.token, t0)).toBeNull();
  });
});
