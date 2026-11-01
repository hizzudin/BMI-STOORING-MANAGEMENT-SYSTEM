import { describe, expect, it } from 'vitest';
import { Role } from '@bmi/shared';
import { FieldMenu, hasFieldMenu, menuForRole } from './role-menu.js';

/**
 * Menu-follows-role (VERIFY: "Menu follows role — each role lands on its
 * correct field menu"). Every role is covered so a future role addition fails
 * the exhaustive switch at compile time and this test at runtime.
 */
describe('menuForRole (PRD §7.11, FG-15)', () => {
  it('routes each field role to its own menu', () => {
    expect(menuForRole(Role.Driver)).toBe(FieldMenu.Driver);
    expect(menuForRole(Role.FieldCoordinator)).toBe(FieldMenu.FieldCoordinator);
    expect(menuForRole(Role.SystemAdmin)).toBe(FieldMenu.SystemAdmin);
    expect(menuForRole(Role.Mechanic)).toBe(FieldMenu.Mechanic);
  });

  it('gives office-only roles no mobile menu in R1', () => {
    for (const role of [
      Role.Planner,
      Role.WarehouseManager,
      Role.Supervisor,
      Role.GM,
      Role.Accounting,
      Role.AccessManager,
    ] as const) {
      expect(menuForRole(role)).toBeNull();
      expect(hasFieldMenu(role)).toBe(false);
    }
  });

  it('every field role reports a mobile menu', () => {
    for (const role of [Role.Driver, Role.FieldCoordinator, Role.SystemAdmin, Role.Mechanic] as const) {
      expect(hasFieldMenu(role)).toBe(true);
    }
  });
});
