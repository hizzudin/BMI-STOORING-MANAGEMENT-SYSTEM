'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  apiFetch,
  ApiError,
  SESSION_COOKIE,
  ROLE_COOKIE,
  UID_COOKIE,
  SIDEBAR_COOKIE,
} from '@/lib/api';
import { LOCALE_COOKIE, isLocale } from '@/lib/i18n';

/**
 * Server Actions for authentication and locale. Credentials never reach the
 * browser: the form posts to the server, which calls `POST /auth/login` and
 * stores the opaque session token in an httpOnly cookie (NFR-05 — the token is
 * not readable by client JS).
 */

const COOKIE_BASE = {
  httpOnly: true,
  sameSite: 'lax' as const,
  path: '/',
  // Secure in production (HTTPS); allow http on local dev.
  secure: process.env.NODE_ENV === 'production',
};

interface LoginResponse {
  readonly token: string;
  readonly role: string;
  readonly userId: number;
  readonly mustChangePassword: boolean;
}

export interface LoginState {
  readonly error?: string;
}

/** Sign in (REQ-IAM-001). On success, set the session cookies and redirect. */
export async function loginAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  if (!email || !password) {
    return { error: 'login.error' };
  }

  let result: LoginResponse;
  try {
    result = await apiFetch<LoginResponse>('/auth/login', {
      method: 'POST',
      auth: false,
      body: { email, password, platform: 'web' },
    });
  } catch (err) {
    if (err instanceof ApiError) {
      return { error: 'login.error' };
    }
    return { error: 'error.generic' };
  }

  const jar = cookies();
  jar.set(SESSION_COOKIE, result.token, COOKIE_BASE);
  // Role/uid are convenience cookies for the shell; not security-bearing (the
  // API re-derives the principal from the session token on every request).
  jar.set(ROLE_COOKIE, result.role, { ...COOKIE_BASE, httpOnly: false });
  jar.set(UID_COOKIE, String(result.userId), { ...COOKIE_BASE, httpOnly: false });

  redirect('/dashboard');
}

/** Sign out: revoke the session server-side and clear cookies. */
export async function logoutAction(): Promise<void> {
  try {
    await apiFetch<{ ok: true }>('/auth/logout', { method: 'POST' });
  } catch {
    // Even if the revoke call fails, clear the local cookies so the user is out.
  }
  const jar = cookies();
  jar.delete(SESSION_COOKIE);
  jar.delete(ROLE_COOKIE);
  jar.delete(UID_COOKIE);
  redirect('/login');
}

/**
 * Toggle the collapsed-navigation preference (DEC-82, §7.9 C-02). The choice is
 * saved per user in a cookie so it survives reloads and the main area takes the
 * freed width. No navigation happens — only the preference flips.
 */
export async function toggleSidebarAction(formData: FormData): Promise<void> {
  const collapsed = String(formData.get('collapsed') ?? '') === '1';
  cookies().set(SIDEBAR_COOKIE, collapsed ? '1' : '0', {
    httpOnly: false,
    sameSite: 'lax',
    path: '/',
    secure: process.env.NODE_ENV === 'production',
  });
}

/** Switch the UI language (Indonesian default + English). */
export async function setLocaleAction(formData: FormData): Promise<void> {
  const next = String(formData.get('locale') ?? '');
  if (isLocale(next)) {
    cookies().set(LOCALE_COOKIE, next, {
      httpOnly: false,
      sameSite: 'lax',
      path: '/',
      secure: process.env.NODE_ENV === 'production',
    });
  }
}
