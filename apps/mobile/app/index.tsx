import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import type { Role } from '@bmi/shared';
import { useApp } from '../src/app-context.js';
import { Banner, Button, Field, Screen } from '../src/components/ui.js';
import { menuForRole, FieldMenu } from '../src/logic/role-menu.js';
import { ApiError } from '../src/api/client.js';
import { colors, spacing, typography } from '../src/theme/tokens.js';

/** The route each field menu lives at. */
const MENU_ROUTE: Record<FieldMenu, string> = {
  [FieldMenu.Driver]: '/driver',
  [FieldMenu.FieldCoordinator]: '/field-coordinator',
  [FieldMenu.SystemAdmin]: '/system-admin',
  [FieldMenu.Mechanic]: '/mechanic',
};

/**
 * MobileLogin (REQ-IAM-001, PRD §7.11). Signs in against the API and routes to
 * the correct field menu for the returned role (REQ-MOB "menu follows role").
 * An office-only role is told to use the web app rather than left on a blank
 * screen.
 */
export default function LoginScreen(): React.JSX.Element {
  const { api, t, setSession } = useApp();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSignIn = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const session = await api.login(email.trim(), password);
      setSession(session);
      const menu = menuForRole(session.role as Role);
      if (menu === null) {
        setError(
          t('loginFailed') === 'Invalid email or password.'
            ? 'This role uses the desktop web app.'
            : 'Peran ini memakai aplikasi web desktop.',
        );
        return;
      }
      router.replace(MENU_ROUTE[menu] as never);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('loginFailed'));
    } finally {
      setBusy(false);
    }
  }, [api, email, password, setSession, t]);

  const canSubmit = email.trim().length > 0 && password.length > 0 && !busy;

  return (
    <Screen title={t('appName')}>
      <View style={styles.brandTile} accessibilityRole="image" accessibilityLabel="BMI">
        <Text style={styles.brandText}>BMI</Text>
      </View>
      <Text style={styles.heading}>{t('loginTitle')}</Text>
      {error ? <Banner text={error} tone="danger" /> : null}
      <Field
        label={t('email')}
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        placeholder="nama@bmi.test"
      />
      <Field label={t('password')} value={password} onChangeText={setPassword} secureTextEntry />
      <Button
        label={busy ? t('signingIn') : t('signIn')}
        onPress={onSignIn}
        disabled={!canSubmit}
        busy={busy}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  brandTile: {
    alignSelf: 'center',
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    marginVertical: spacing.md,
  },
  brandText: { color: colors.brandRed, fontSize: 32, fontWeight: '800', letterSpacing: 1 },
  heading: { fontSize: typography.headline.fontSize, fontWeight: '700', color: colors.text },
});
