import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { currentLocale } from '@/lib/session';
import { t } from '@/lib/i18n';
import '@/styles/tokens.css';
import '@/styles/controls.css';

export const metadata: Metadata = {
  title: 'BMI Stooring System',
  description: 'Work Order driven preventive-maintenance for the BMI fleet.',
};

/**
 * Root layout. The `<html lang>` reflects the active UI locale (Indonesian
 * default + English) so assistive tech announces the right language
 * (NFR-A11Y). Global design tokens and control styles load once here.
 */
export default function RootLayout({ children }: { children: ReactNode }): JSX.Element {
  const locale = currentLocale();
  return (
    <html lang={locale}>
      <body>
        <a href="#main" className="sr-only">
          {t(locale, 'common.view')}
        </a>
        {children}
      </body>
    </html>
  );
}
