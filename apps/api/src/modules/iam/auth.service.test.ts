import { describe, expect, it, beforeEach } from 'vitest';
import { BadRequestException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Role, idValue } from '@bmi/shared';
import { createDummyDataGateway, SEED_IDS, SEED_PASSWORD, type DataGateway } from '@bmi/data-gateway';
import { AuthService, MAX_FAILED_LOGINS, LOCKOUT_DURATION_MS } from './auth.service.js';
import { PasswordService } from './password.service.js';
import { SessionService } from './session.service.js';
import { PasswordResetService } from './password-reset.service.js';
import { AppSettingsService } from './app-settings.service.js';

function buildAuth(settings: AppSettingsService): {
  auth: AuthService;
  gateway: DataGateway;
  resets: PasswordResetService;
  sessions: SessionService;
} {
  const gateway = createDummyDataGateway();
  const sessions = new SessionService();
  const resets = new PasswordResetService();
  const auth = new AuthService(gateway, new PasswordService(), sessions, resets, settings);
  return { auth, gateway, resets, sessions };
}

describe('AuthService — NFR-05 auth rules', () => {
  let liveSettings: AppSettingsService;

  beforeEach(() => {
    liveSettings = new AppSettingsService();
    liveSettings.goLive(new Date().toISOString()); // Live so any role may sign in
  });

  it('rule 1 — password policy: rejects short / letters-only / digits-only', () => {
    const p = new PasswordService();
    expect(() => p.assertMeetsPolicy('Ab1')).toThrow(BadRequestException); // too short
    expect(() => p.assertMeetsPolicy('abcdefgh')).toThrow(BadRequestException); // no digit
    expect(() => p.assertMeetsPolicy('12345678')).toThrow(BadRequestException); // no letter
    expect(() => p.assertMeetsPolicy('Bmi12345')).not.toThrow();
  });

  it('signs in with the correct password and issues a session', async () => {
    const { auth } = buildAuth(liveSettings);
    const result = await auth.login('planner@bmi.test', SEED_PASSWORD, 'web');
    expect(result.session.token).toBeTruthy();
    expect(result.user.role).toBe(Role.Planner);
    expect(result.mustChangePassword).toBe(false);
  });

  it('rule 3 — locks the account for 15 minutes after 5 failed sign-ins (DEC-55)', async () => {
    const { auth, gateway } = buildAuth(liveSettings);
    const now = Date.now();
    for (let i = 0; i < MAX_FAILED_LOGINS; i += 1) {
      await expect(auth.login('planner@bmi.test', 'wrong-pass-1', 'web', now)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    }
    const planner = await gateway.repos.users.findOneBy('email', 'planner@bmi.test');
    expect(planner?.failedLogins).toBeGreaterThanOrEqual(MAX_FAILED_LOGINS);
    expect(planner?.lockedUntil).not.toBeNull();

    // Even the CORRECT password is refused while locked.
    await expect(auth.login('planner@bmi.test', SEED_PASSWORD, 'web', now + 1000)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );

    // After the lock window, the correct password works again.
    const after = now + LOCKOUT_DURATION_MS + 1;
    const ok = await auth.login('planner@bmi.test', SEED_PASSWORD, 'web', after);
    expect(ok.session.token).toBeTruthy();
  });

  it('a successful sign-in resets the failure counter', async () => {
    const { auth, gateway } = buildAuth(liveSettings);
    const now = Date.now();
    await expect(auth.login('planner@bmi.test', 'nope1234', 'web', now)).rejects.toThrow();
    await auth.login('planner@bmi.test', SEED_PASSWORD, 'web', now + 1);
    const planner = await gateway.repos.users.findOneBy('email', 'planner@bmi.test');
    expect(planner?.failedLogins).toBe(0);
  });

  it('rule 2 — a created account must change its password at first sign-in', async () => {
    const { auth, gateway } = buildAuth(liveSettings);
    // Seed a must-change account directly.
    await gateway.unitOfWork(async (ctx) => {
      const hash = await new PasswordService().hash('Temp1234');
      await ctx.repos.users.insert({
        id: 0 as never,
        fullName: 'First Timer',
        role: Role.Mechanic,
        isActive: true,
        email: 'first@bmi.test',
        passwordHash: hash,
        mustChangePassword: true,
        failedLogins: 0,
        lockedUntil: null,
      });
    });
    const result = await auth.login('first@bmi.test', 'Temp1234', 'web');
    expect(result.mustChangePassword).toBe(true);

    // After changing, the flag clears and the new password works.
    await auth.changePassword(result.session.userId, 'Temp1234', 'NewPass99');
    const again = await auth.login('first@bmi.test', 'NewPass99', 'web');
    expect(again.mustChangePassword).toBe(false);
  });

  it('rejects an unknown email and an inactive account with the same generic 401', async () => {
    const { auth } = buildAuth(liveSettings);
    await expect(auth.login('nobody@bmi.test', SEED_PASSWORD, 'web')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('email reset (DQ-02): a valid token sets a new password, then is single-use', async () => {
    const { auth, resets } = buildAuth(liveSettings);
    const now = Date.now();
    await auth.requestReset('planner@bmi.test', now);
    // Grab the issued token the way the email link would carry it.
    const token = resets.issue(idValue(SEED_IDS.users.planner), 'planner@bmi.test', now);
    await auth.confirmReset(token, 'Reset1234', now);
    const ok = await auth.login('planner@bmi.test', 'Reset1234', 'web');
    expect(ok.session.token).toBeTruthy();
    // The token cannot be reused.
    await expect(auth.confirmReset(token, 'Other1234', now)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('Setup-mode gating (AC-IAM-006): a Planner cannot sign in while in Setup mode', async () => {
    const setupSettings = new AppSettingsService(); // defaults to Setup
    const { auth } = buildAuth(setupSettings);
    await expect(auth.login('planner@bmi.test', SEED_PASSWORD, 'web')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    // System Admin and Access Manager can.
    const sa = await auth.login('sysadmin@bmi.test', SEED_PASSWORD, 'web');
    expect(sa.user.role).toBe(Role.SystemAdmin);

    // After go-live the Planner signs in.
    setupSettings.goLive(new Date().toISOString());
    const pln = await auth.login('planner@bmi.test', SEED_PASSWORD, 'web');
    expect(pln.user.role).toBe(Role.Planner);
  });
});
