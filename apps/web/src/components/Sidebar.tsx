'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ComponentType, SVGProps } from 'react';
import { translator, type Locale } from '@/lib/i18n';
import { navItemsForRole } from '@/lib/nav';
import { Logo } from './Logo';
import {
  IconDashboard,
  IconWorkOrder,
  IconRequests,
  IconSchedule,
  IconApprovals,
  IconInventory,
  IconVehicle,
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
 * The petrol-ink web sidebar (DESIGN.md Navigation). Each item is an outline
 * icon beside its name; the active item is filled BMI red. Which items show is
 * role-driven (the §2.2 capability view), but the API remains authoritative —
 * hiding a link is convenience, not a security boundary.
 */
export function Sidebar({ role, locale }: { role: string; locale: Locale }): JSX.Element {
  const pathname = usePathname();
  const tr = translator(locale);
  const items = navItemsForRole(role);

  return (
    <nav className={styles.sidebar} aria-label={tr('app.name')}>
      <div className={styles.logoTile}>
        <Logo />
      </div>
      <ul className={styles.navList}>
        {items.map((item) => {
          const Icon = ICONS[item.key] ?? IconDashboard;
          const active =
            pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
          return (
            <li key={item.key}>
              <Link
                href={item.href}
                className={`${styles.navItem} ${active ? styles.active : ''}`}
                aria-current={active ? 'page' : undefined}
              >
                <Icon className={styles.icon} />
                <span>{tr(item.labelKey)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
