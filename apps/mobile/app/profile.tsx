import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useApp } from '../src/app-context.js';
import { Banner, Button, Card, Screen } from '../src/components/ui.js';
import { LANGS, type Lang } from '../src/i18n/strings.js';
import { colors, radius, spacing, touchTarget, typography } from '../src/theme/tokens.js';

/**
 * Shared MobileProfile (REQ-MOB, DQ-01). Every field role reaches the same
 * profile: notification settings (push / email, DQ-01) and the UI language
 * (Indonesian / English, PRODUCT.md). Settings are 48px toggle rows; the
 * language is a two-option segmented control. Changing the language re-renders
 * every string immediately.
 */
export default function ProfileScreen(): React.JSX.Element {
  const { t, lang, setLang, notifications, setNotifications, session } = useApp();
  const [push, setPush] = useState(notifications.push);
  const [email, setEmail] = useState(notifications.email);
  const [saved, setSaved] = useState(false);

  const onSave = useCallback(() => {
    setNotifications({ push, email });
    setSaved(true);
  }, [push, email, setNotifications]);

  return (
    <Screen title={t('profile')} onBack={() => router.back()} backLabel={t('back')}>
      {saved ? <Banner text={t('saved')} tone="success" /> : null}

      {session ? (
        <Card>
          <Text style={styles.role}>{session.role}</Text>
        </Card>
      ) : null}

      <Text style={styles.section}>{t('language')}</Text>
      <View style={styles.segmented}>
        {LANGS.map((l: Lang) => {
          const active = l === lang;
          return (
            <Pressable
              key={l}
              onPress={() => setLang(l)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={l === 'id' ? 'Bahasa Indonesia' : 'English'}
              style={[styles.segment, active && styles.segmentActive]}
            >
              <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                {l === 'id' ? 'Indonesia' : 'English'}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.section}>{t('notificationSettings')}</Text>
      <Card>
        <ToggleRow label={t('pushNotifications')} value={push} onValueChange={setPush} />
        <View style={styles.divider} />
        <ToggleRow label={t('emailNotifications')} value={email} onValueChange={setEmail} />
      </Card>

      <Button label={t('save')} onPress={onSave} />
    </Screen>
  );
}

function ToggleRow({
  label,
  value,
  onValueChange,
}: {
  label: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
}): React.JSX.Element {
  return (
    <View style={styles.toggleRow}>
      <Text style={styles.toggleLabel}>{label}</Text>
      {/* Status carries text via the label; the switch state is also announced. */}
      <Switch
        value={value}
        onValueChange={onValueChange}
        accessibilityLabel={label}
        trackColor={{ true: colors.petrol, false: colors.stone }}
        thumbColor={colors.surface}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  role: { fontSize: typography.title.fontSize, fontWeight: '700', color: colors.text },
  section: { fontSize: typography.label.fontSize, fontWeight: '600', color: colors.textMuted },
  segmented: { flexDirection: 'row', gap: spacing.sm },
  segment: {
    flex: 1,
    minHeight: touchTarget.min,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  segmentActive: { backgroundColor: colors.petrol, borderColor: colors.petrol },
  segmentText: { fontSize: typography.body.fontSize, fontWeight: '700', color: colors.text },
  segmentTextActive: { color: colors.surface },
  toggleRow: {
    minHeight: touchTarget.min,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  toggleLabel: { fontSize: typography.body.fontSize, color: colors.text, fontWeight: '600' },
  divider: { height: 1, backgroundColor: colors.divider },
});
