import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { currentSession, currentLocale } from '@/lib/session';
import { Sidebar } from '@/components/Sidebar';
import { Topbar } from '@/components/Topbar';
import styles from './app-shell.module.css';

/**
 * Authenticated shell layout — the petrol-ink sidebar frame around white
 * working sheets on a pale page (DESIGN.md). Any route under `(app)` requires a
 * live session; unauthenticated visitors are sent to sign-in. The API remains
 * the sole authority on access — these cookies only drive the shell.
 */
export default function AppLayout({ children }: { children: ReactNode }): JSX.Element {
  const session = currentSession();
  if (!session) {
    redirect('/login');
  }
  const locale = currentLocale();

  return (
    <div className={styles.shell}>
      <Sidebar role={session.role} locale={locale} />
      <div className={styles.main}>
        <Topbar role={session.role} locale={locale} />
        <main id="main" className={styles.content}>
          {children}
        </main>
      </div>
    </div>
  );
}
