import { describe, expect, it } from 'vitest';
import { Role } from '@bmi/shared';
import { Capabilities, roleHasCapability } from './permission-matrix.js';

/**
 * Unit coverage of the server-side encoding of the PRD §2.2 matrix. Confirms
 * the guard's decision function grants and refuses exactly the §2.2 cells the
 * role guard depends on (NFR-04 / REQ-IAM-006).
 */
describe('permission-matrix (PRD §2.2)', () => {
  it('grants wo.create to Planner, Mechanic, Field Coordinator and System Admin', () => {
    expect(roleHasCapability(Role.Planner, Capabilities.WoCreate)).toBe(true);
    expect(roleHasCapability(Role.Mechanic, Capabilities.WoCreate)).toBe(true);
    expect(roleHasCapability(Role.FieldCoordinator, Capabilities.WoCreate)).toBe(true);
    expect(roleHasCapability(Role.SystemAdmin, Capabilities.WoCreate)).toBe(true);
  });

  it('refuses wo.create to roles with a blank §2.2 cell', () => {
    expect(roleHasCapability(Role.Accounting, Capabilities.WoCreate)).toBe(false);
    expect(roleHasCapability(Role.Driver, Capabilities.WoCreate)).toBe(false);
    expect(roleHasCapability(Role.WarehouseManager, Capabilities.WoCreate)).toBe(false);
    expect(roleHasCapability(Role.AccessManager, Capabilities.WoCreate)).toBe(false);
  });

  it('treats a switchable (S) cell as NOT granted by default (Planner approval, RL-7)', () => {
    // Planner approval is off by default until an Access Manager switches it on.
    expect(roleHasCapability(Role.Planner, Capabilities.WoApprove)).toBe(false);
    // Supervisor/GM/System Admin hold the locked X cell, so they are granted.
    expect(roleHasCapability(Role.Supervisor, Capabilities.WoApprove)).toBe(true);
    expect(roleHasCapability(Role.GM, Capabilities.WoApprove)).toBe(true);
    expect(roleHasCapability(Role.SystemAdmin, Capabilities.WoApprove)).toBe(true);
  });

  it('keeps account management with Access Manager, never System Admin (RL-4, BR-14)', () => {
    expect(roleHasCapability(Role.AccessManager, Capabilities.AccountsManage)).toBe(true);
    expect(roleHasCapability(Role.SystemAdmin, Capabilities.AccountsManage)).toBe(false);
  });

  it('does not grant a view-only (V) cell for a mutating capability', () => {
    // Field Coordinator may only view the schedule (V), not manage it.
    expect(roleHasCapability(Role.FieldCoordinator, Capabilities.ScheduleManage)).toBe(false);
    expect(roleHasCapability(Role.Planner, Capabilities.ScheduleManage)).toBe(true);
  });

  it('defaults to deny for an unknown capability', () => {
    expect(roleHasCapability(Role.SystemAdmin, 'nonexistent.capability')).toBe(false);
  });
});
