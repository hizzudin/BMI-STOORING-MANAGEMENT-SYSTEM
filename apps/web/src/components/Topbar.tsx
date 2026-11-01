import Link from 'next/link';
import { translator, type Locale } from '@/lib/i18n';
import { humanizeRole } from '@/lib/roles';
import { setLocaleAction, logoutAction } from '@/app/actions';
import { IconSignOut, IconBell } from './icons';
import styles from './Topbar.module.css';

/**
 * Page header of the working area (PRD §7.2 App shell): the title sits in each
 * page; the header's right side holds the user/role, the notification bell
 * (§7.9 C-03 / REQ-NTF-001 — the badge shows the unread count), the bilingual
 * language toggle (ID / EN) and sign-out. The language and sign-out controls
 * are Server-Action forms so they work without client JS and keep the session
 * server-authoritative.
 *
 * Phase-1 note: the dedicated NotificationCenter panel is a later screen
 * (TASK-124+); the bell links to the dashboard where notifications surface, so
 * the header control and its unread badge exist now per §7.2.
 */
export function Topbar({
  role,
  locale,
  unreadCount = 0,
}: {
  role: string;
  locale: Locale;
  unreadCount?: number;
}): JSX.Element {
  const tr = translator(locale);
  return (
    <header className={styles.topbar}>
      <span className={styles.roleChip}>
        <span className="sr-only">{tr('common.role')}: </span>
        {humanizeRole(role)}
      </span>

      <div className={styles.right}>
        <Link
          href="/dashboard"
          className={styles.bell}
          aria-label={
            unreadCount > 0
              ? `${tr('nav.notifications')} (${unreadCount})`
              : tr('nav.notifications')
          }
        >
          <IconBell />
          {unreadCount > 0 ? (
            <span className={`${styles.badge} tnum`} aria-hidden="true">
              {unreadCount}
            </span>
          ) : null}
        </Link>

        <form action={setLocaleAction} className={styles.langForm}>
          <label htmlFor="locale" className="sr-only">
            {tr('common.language')}
          </label>
          <select id="locale" name="locale" defaultValue={locale} className={styles.langSelect}>
            <option value="id">Bahasa Indonesia</option>
            <option value="en">English</option>
          </select>
          <button type="submit" className="btn btn-secondary">
            {tr('common.save')}
          </button>
        </form>

        <form action={logoutAction}>
          <button type="submit" className="btn btn-secondary">
            <IconSignOut />
            {tr('nav.signOut')}
          </button>
        </form>
      </div>
    </header>
  );
}
