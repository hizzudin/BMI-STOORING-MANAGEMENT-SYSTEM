import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { ApiClient, type Session } from './api/client.js';
import { resolveApiBaseUrl } from './config/env.js';
import { DEFAULT_LANG, makeT, type Lang, type Translator } from './i18n/strings.js';

/**
 * Per-user notification settings (DQ-01) surfaced on the shared MobileProfile.
 * Phase-1 these live client-side; a later task persists them through the API.
 */
export interface NotificationSettings {
  readonly push: boolean;
  readonly email: boolean;
}

export interface AppState {
  readonly api: ApiClient;
  readonly session: Session | null;
  readonly lang: Lang;
  readonly t: Translator;
  readonly notifications: NotificationSettings;
  setSession(session: Session | null): void;
  setLang(lang: Lang): void;
  setNotifications(settings: NotificationSettings): void;
  signOut(): Promise<void>;
}

const AppContext = createContext<AppState | null>(null);

/** Provider that owns the API client, session, language and profile settings. */
export function AppProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const api = useMemo(() => new ApiClient({ baseUrl: resolveApiBaseUrl() }), []);
  const [session, setSessionState] = useState<Session | null>(null);
  const [lang, setLang] = useState<Lang>(DEFAULT_LANG);
  const [notifications, setNotifications] = useState<NotificationSettings>({ push: true, email: false });

  const setSession = useCallback(
    (next: Session | null) => {
      api.setSession(next);
      setSessionState(next);
    },
    [api],
  );

  const signOut = useCallback(async () => {
    await api.logout();
    setSessionState(null);
  }, [api]);

  const t = useMemo(() => makeT(lang), [lang]);

  const value = useMemo<AppState>(
    () => ({
      api,
      session,
      lang,
      t,
      notifications,
      setSession,
      setLang,
      setNotifications,
      signOut,
    }),
    [api, session, lang, t, notifications, setSession, signOut],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

/** Read the app state; throws if used outside the provider. */
export function useApp(): AppState {
  const ctx = useContext(AppContext);
  if (!ctx) {
    throw new Error('useApp must be used within <AppProvider>.');
  }
  return ctx;
}
