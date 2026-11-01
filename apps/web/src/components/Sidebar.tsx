'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ComponentType, SVGProps } from 'react';
import { translator, type Locale } from '@/lib/i18n';
import { navItemsForRole } from '@/lib/nav';
import { toggleSidebarAction } from '@/app/actions';
import { Logo } from './Logo';
import {
  IconDashboard,
  IconWorkOrder,
  IconRequests,
  IconSchedule,
  IconApprovals,
  IconInventory,
  IconVehicle,
  IconCollapse,
} from './icons';
import styles from './Sidebar.module.css';

const ICONS: Record<string, ComponentType<SVGProps<SVGSVGElement>>> = {
  dashboard: IconDashboard,
  'work-orders': IconWorkOrder,
  requests: IconRequests,
  schedule: IconSchedule,
  approvals: IconApprovals,
  inventory: IconInventory,
  vehicles: IconVehicle,
};

/**
 * The petrol-ink web sidebar (DESIGN.md Navigation; PRD §7.2 App shell). Each
 * item is an outline icon beside its name; the active item is filled BMI red.
 * Which items show is role-driven (the §2.2 capability view), but the API
 * remains authoritative — hiding a link is convenience, not a security
 * boundary.
 *
 * A toggle at the foot (Collapse menu, §7.9 C-02 / DEC-82) shrinks the nav to a
 * 64px icon rail and back. The choice is saved per user (cookie, server-side)
 * so the first paint already honours it; in the rail each item shows its name
 * as a tooltip, the active item stays highlighted, and the main area takes the
 * freed width. The toggle is a Server-Action form so it works by keyboard and
 * without client JS.
 */
export function Sidebar({
  role,
  locale,
  collapsed = false,
}: {
  role: string;
  locale: Locale;
  collapsed?: boolean;
}): JSX.Element {
  const pathname = usePathname();
  const tr = translator(locale);
  const items = navItemsForRole(role);

  return (
    <nav
      className={`${styles.sidebar} ${collapsed ? styles.collapsed : ''}`}
      aria-label={tr('app.name')}
      data-collapsed={collapsed ? 'true' : 'false'}
    >
      <div className={styles.logoTile}>
        <Logo withText={!collapsed} />
      </div>
      <ul className={styles.navList}>
        {items.map((item) => {
          const Icon = ICONS[item.key] ?? IconDashboard;
          const label = tr(item.labelKey);
          const active =
            pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
          return (
            <li key={item.key}>
              <Link
                href={item.href}
                className={`${styles.navItem} ${active ? styles.active : ''}`}
                aria-current={active ? 'page' : undefined}
                title={collapsed ? label : undefined}
              >
                <Icon className={styles.icon} />
                <span className={styles.navLabel}>{label}</span>
                {collapsed ? <span className="sr-only">{label}</span> : null}
              </Link>
            </li>
          );
        })}
      </ul>

      <form action={toggleSidebarAction} className={styles.collapseForm}>
        <input type="hidden" name="collapsed" value={collapsed ? '0' : '1'} />
        <button
          type="submit"
          className={styles.collapseToggle}
          title={collapsed ? tr('nav.expand') : tr('nav.collapse')}
          aria-pressed={collapsed}
        >
          <IconCollapse className={styles.icon} />
          <span className={styles.navLabel}>
            {collapsed ? tr('nav.expand') : tr('nav.collapse')}
          </span>
        </button>
      </form>
    </nav>
  );
}
