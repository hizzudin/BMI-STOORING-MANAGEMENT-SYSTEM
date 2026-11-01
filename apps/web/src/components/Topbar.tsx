import { translator, type Locale } from '@/lib/i18n';
import { humanizeRole } from '@/lib/roles';
import { setLocaleAction, logoutAction } from '@/app/actions';
import { IconSignOut } from './icons';
import styles from './Topbar.module.css';

/**
 * Top bar of the working area: the signed-in role chip, the bilingual language
 * toggle (ID / EN) and sign-out. Both controls are Server-Action forms so they
 * work without client JS and keep the session server-authoritative.
 */
export function Topbar({ role, locale }: { role: string; locale: Locale }): JSX.Element {
  const tr = translator(locale);
  return (
    <header className={styles.topbar}>
      <span className={styles.roleChip}>
        <span className="sr-only">{tr('common.role')}: </span>
        {humanizeRole(role)}
      </span>

      <div className={styles.right}>
        <form action={setLocaleAction} className={styles.langForm}>
          <label htmlFor="locale" className="sr-only">
            {tr('common.language')}
          </label>
          <select
            id="locale"
            name="locale"
            defaultValue={locale}
            className={styles.langSelect}
            // Submit the surrounding form on change without client JS via the
            // native form-submit of the parent form.
          >
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
