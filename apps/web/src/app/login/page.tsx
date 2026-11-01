import { redirect } from 'next/navigation';
import { hasSession } from '@/lib/api';
import { currentLocale } from '@/lib/session';
import { translator } from '@/lib/i18n';
import { Logo } from '@/components/Logo';
import { LoginForm } from './LoginForm';
import styles from './login.module.css';

/**
 * Sign-in screen (REQ-IAM-001). Already-signed-in users skip straight to the
 * dashboard. The form is a Client Component so it can show the inline error
 * state from the login Server Action without a full reload.
 */
export default function LoginPage(): JSX.Element {
  if (hasSession()) {
    redirect('/dashboard');
  }
  const locale = currentLocale();
  const tr = translator(locale);

  return (
    <main id="main" className={styles.screen}>
      <div className={styles.frame}>
        <div className={styles.brandBar}>
          <Logo />
        </div>
        <div className={styles.panel}>
          <h1 className={styles.title}>{tr('login.title')}</h1>
          <p className={styles.subtitle}>{tr('login.subtitle')}</p>
          <LoginForm
            labels={{
              email: tr('login.email'),
              password: tr('login.password'),
              submit: tr('login.submit'),
              error: tr('login.error'),
              generic: tr('error.generic'),
              hint: tr('login.hint'),
            }}
          />
        </div>
      </div>
    </main>
  );
}
