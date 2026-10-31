import { describe, expect, it, beforeEach } from 'vitest';
import { ConflictException } from '@nestjs/common';
import { Role, idValue } from '@bmi/shared';
import { createDummyDataGateway, SEED_IDS } from '@bmi/data-gateway';
import { AccountsService } from './accounts.service.js';
import { PasswordService } from './password.service.js';
import { SessionService } from './session.service.js';

/**
 * BR-14 invariants enforced server-side (AC-IAM-001/002/004): one role per user
 * and exactly one System Admin, and the atomic System-Admin move.
 */
describe('AccountsService — BR-14 invariants', () => {
  let accounts: AccountsService;

  beforeEach(() => {
    const gateway = createDummyDataGateway();
    accounts = new AccountsService(gateway, new PasswordService(), new SessionService());
  });

  it('refuses a second System Admin account (AC-IAM-001)', async () => {
    await expect(
      accounts.create({
        fullName: 'Second Admin',
        email: 'admin2@bmi.test',
        role: Role.SystemAdmin,
        temporaryPassword: 'Temp1234',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('creates a non-admin account with exactly one role and forced first-change', async () => {
    const user = await accounts.create({
      fullName: 'New Planner',
      email: 'new.planner@bmi.test',
      role: Role.Planner,
      temporaryPassword: 'Temp1234',
    });
    expect(user.role).toBe(Role.Planner);
    expect(user.mustChangePassword).toBe(true);
    // The hash is stored, never the plaintext.
    expect(user.passwordHash).not.toContain('Temp1234');
  });

  it('refuses a duplicate email', async () => {
    await expect(
      accounts.create({
        fullName: 'Dup',
        email: 'planner@bmi.test', // seeded
        role: Role.Mechanic,
        temporaryPassword: 'Temp1234',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('moves the System Admin role atomically: target becomes SA, former holder does not (AC-IAM-002)', async () => {
    const fromId = idValue(SEED_IDS.users.systemAdmin);
    const toId = idValue(SEED_IDS.users.planner);

    const result = await accounts.moveSystemAdmin(toId);

    expect(idValue(result.to.id)).toBe(toId);
    expect(result.to.role).toBe(Role.SystemAdmin);
    expect(idValue(result.from.id)).toBe(fromId);
    expect(result.from.role).not.toBe(Role.SystemAdmin);
  });

  it('refuses moving the System Admin role to itself', async () => {
    const saId = idValue(SEED_IDS.users.systemAdmin);
    await expect(accounts.moveSystemAdmin(saId)).rejects.toBeInstanceOf(ConflictException);
  });

  it('refuses deactivating the System Admin account (BR-14)', async () => {
    const saId = idValue(SEED_IDS.users.systemAdmin);
    await expect(accounts.update(saId, { isActive: false })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('leaves exactly one System Admin after a move', async () => {
    const gateway = createDummyDataGateway();
    const svc = new AccountsService(gateway, new PasswordService(), new SessionService());
    await svc.moveSystemAdmin(idValue(SEED_IDS.users.supervisor));
    const admins = await gateway.repos.users.findBy('role', Role.SystemAdmin);
    expect(admins).toHaveLength(1);
  });
});
