import { Role } from '@bmi/shared';

/**
 * Role → navigation model. Office roles use the desktop web app; the links a
 * role sees reflect the §2.2 capability view (convenience only — the API
 * enforces access server-side). Field-only roles (Driver, Field Coordinator)
 * live primarily in the mobile app; on web they see a minimal set.
 */

export interface NavItem {
  readonly key: string;
  readonly href: string;
  readonly labelKey: string;
}

const ALL: readonly NavItem[] = [
  { key: 'dashboard', href: '/dashboard', labelKey: 'nav.dashboard' },
  { key: 'work-orders', href: '/work-orders', labelKey: 'nav.workOrders' },
  { key: 'requests', href: '/requests', labelKey: 'nav.requests' },
  { key: 'schedule', href: '/schedule', labelKey: 'nav.schedule' },
  { key: 'approvals', href: '/approvals', labelKey: 'nav.approvals' },
  { key: 'inventory', href: '/inventory', labelKey: 'nav.inventory' },
  { key: 'vehicles', href: '/vehicles', labelKey: 'nav.vehicles' },
];

function keys(... k: string[]): readonly NavItem[] {
  return ALL.filter((i) => k.includes(i.key));
}

/** The nav items visible to a role. Unknown roles get the safe read-only set. */
export function navItemsForRole(role: string): readonly NavItem[] {
  switch (role) {
    case Role.Planner:
      return keys('dashboard', 'work-orders', 'requests', 'schedule', 'approvals', 'vehicles');
    case Role.SystemAdmin:
      return ALL;
    case Role.WarehouseManager:
      return keys('dashboard', 'work-orders', 'inventory', 'approvals');
    case Role.Supervisor:
    case Role.GM:
      return keys('dashboard', 'work-orders', 'approvals', 'schedule', 'vehicles');
    case Role.FieldCoordinator:
      return keys('dashboard', 'work-orders', 'requests', 'vehicles');
    case Role.Mechanic:
      return keys('dashboard', 'work-orders');
    case Role.Accounting:
      return keys('dashboard', 'work-orders', 'vehicles');
    default:
      return keys('dashboard', 'work-orders');
  }
}
