import 'server-only';
import { cookies } from 'next/headers';
import { SESSION_COOKIE, ROLE_COOKIE, UID_COOKIE, SIDEBAR_COOKIE } from './api';
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, type Locale } from './i18n';

/** The signed-in principal as the web shell knows it (from login cookies). */
export interface WebSession {
  readonly token: string;
  readonly role: string;
  readonly userId: number;
}

/** Read the current session from cookies, or null when signed out. */
export function currentSession(): WebSession | null {
  const jar = cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  const role = jar.get(ROLE_COOKIE)?.value;
  const uid = jar.get(UID_COOKIE)?.value;
  if (!token || !role || !uid) {
    return null;
  }
  return { token, role, userId: Number.parseInt(uid, 10) };
}

/** The active UI locale (cookie-backed, Indonesian default). */
export function currentLocale(): Locale {
  const raw = cookies().get(LOCALE_COOKIE)?.value;
  return isLocale(raw) ? raw : DEFAULT_LOCALE;
}

/**
 * Whether the user collapsed the navigation to the 64px icon rail (DEC-82,
 * §7.9 C-02). The choice is saved per user in a cookie and read server-side so
 * the first paint already honours it (no flash). Expanded is the default.
 */
export function sidebarCollapsed(): boolean {
  return cookies().get(SIDEBAR_COOKIE)?.value === '1';
}
