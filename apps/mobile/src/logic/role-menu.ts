import { Role } from '@bmi/shared';

/**
 * The field menus the R1 Android app ships (PRD §7.11, FG-15, REQ-MOB). Each
 * role that signs in on the phone lands on exactly one of these. Office roles
 * (Planner, Warehouse Manager, Supervisor, GM, Accounting, Access Manager) use
 * the desktop web app in R1 and have no mobile menu.
 */
export const FieldMenu = {
  Driver: 'driver',
  FieldCoordinator: 'field-coordinator',
  SystemAdmin: 'system-admin',
  /** R2 mechanic menu (REQ-MOB-010). Wired now; surfaced in Release 2. */
  Mechanic: 'mechanic',
} as const;
export type FieldMenu = (typeof FieldMenu)[keyof typeof FieldMenu];

/**
 * Route a signed-in role to its field menu, or `null` when the role has no
 * mobile presence in R1 (an office-only role). The caller shows an
 * "office roles use the web app" message for `null`.
 *
 * Mapping (PRD §2.2 / §7.11):
 *  - Driver → driver menu (inspection / odometer / breakdown / history)
 *  - Field Coordinator (Korlap) → FC menu (requests / purchase)
 *  - System Admin → System Admin field menu (incl. breakdown on behalf)
 *  - Mechanic → mechanic menu (R2 today-task list)
 */
export function menuForRole(role: Role): FieldMenu | null {
  switch (role) {
    case Role.Driver:
      return FieldMenu.Driver;
    case Role.FieldCoordinator:
      return FieldMenu.FieldCoordinator;
    case Role.SystemAdmin:
      return FieldMenu.SystemAdmin;
    case Role.Mechanic:
      return FieldMenu.Mechanic;
    case Role.Planner:
    case Role.WarehouseManager:
    case Role.Supervisor:
    case Role.GM:
    case Role.Accounting:
    case Role.AccessManager:
      return null;
    default: {
      const _exhaustive: never = role;
      return _exhaustive;
    }
  }
}

/** Whether a role has any mobile field menu in R1/R2. */
export function hasFieldMenu(role: Role): boolean {
  return menuForRole(role) !== null;
}
