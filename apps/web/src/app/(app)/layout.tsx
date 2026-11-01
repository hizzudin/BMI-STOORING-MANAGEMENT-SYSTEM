import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { currentSession, currentLocale, sidebarCollapsed } from '@/lib/session';
import { getDashboard } from '@/lib/resources';
import { Sidebar } from '@/components/Sidebar';
import { Topbar } from '@/components/Topbar';
import styles from './app-shell.module.css';

/**
 * Authenticated shell layout — the petrol-ink sidebar frame around white
 * working sheets on a pale page (DESIGN.md; PRD §7.2 App shell). Any route under
 * `(app)` requires a live session; unauthenticated visitors are sent to
 * sign-in. The API remains the sole authority on access — these cookies only
 * drive the shell. The nav honours the per-user collapsed-rail preference
 * (DEC-82) and the header bell shows the unread-notification count (C-03).
 */
export default async function AppLayout({ children }: { children: ReactNode }): Promise<JSX.Element> {
  const session = currentSession();
  if (!session) {
    redirect('/login');
  }
  const locale = currentLocale();
  const collapsed = sidebarCollapsed();

  // Unread-notification count for the header bell (§7.9 C-03). Best-effort:
  // if the dashboard read fails the shell still renders (bell shows no badge).
  let unread = 0;
  try {
    unread = (await getDashboard()).unreadNotifications;
  } catch {
    unread = 0;
  }

  return (
    <div className={styles.shell}>
      <Sidebar role={session.role} locale={locale} collapsed={collapsed} />
      <div className={styles.main}>
        <Topbar role={session.role} locale={locale} unreadCount={unread} />
        <main id="main" className={styles.content}>
          {children}
        </main>
      </div>
    </div>
  );
}
