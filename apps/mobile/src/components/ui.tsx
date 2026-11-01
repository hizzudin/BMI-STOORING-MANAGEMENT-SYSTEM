import React, { memo, useCallback } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, spacing, touchTarget, typography } from '../theme/tokens.js';
import type { PillStyle } from '../theme/pills.js';

/**
 * Field-first UI primitives (PRD §7.11, DESIGN.md). Every interactive control is
 * at least 48px tall; status is always written (Words First Rule); one filled
 * red primary action per screen (Stamp Ink Rule). Built for sunlight, gloves and
 * older Android (large targets, high contrast, no colour-only meaning).
 */

/** The petrol-ink framed screen with a title bar and a scrollable sheet. */
export function Screen({
  title,
  children,
  onBack,
  backLabel,
}: {
  title: string;
  children: React.ReactNode;
  onBack?: () => void;
  backLabel?: string;
}): React.JSX.Element {
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.header} accessibilityRole="header">
        {onBack ? (
          <Pressable
            onPress={onBack}
            accessibilityRole="button"
            accessibilityLabel={backLabel ?? 'Back'}
            style={styles.backBtn}
            hitSlop={8}
          >
            <Text style={styles.backText}>{'\u2039'}</Text>
          </Pressable>
        ) : (
          <View style={styles.backBtn} />
        )}
        <Text style={styles.headerTitle} numberOfLines={1}>
          {title}
        </Text>
        <View style={styles.backBtn} />
      </View>
      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

/** Primary (filled red) or secondary (outlined) action, min 48px tall. */
export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  busy = false,
  accessibilityHint,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  busy?: boolean;
  accessibilityHint?: string;
}): React.JSX.Element {
  const isDisabled = disabled || busy;
  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy }}
      accessibilityLabel={label}
      {...(accessibilityHint !== undefined ? { accessibilityHint } : {})}
      style={({ pressed }) => [
        styles.btnBase,
        variant === 'primary' && styles.btnPrimary,
        variant === 'secondary' && styles.btnSecondary,
        variant === 'danger' && styles.btnDanger,
        pressed && !isDisabled && styles.btnPressed,
        isDisabled && styles.btnDisabled,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={variant === 'primary' ? colors.surface : colors.brandRed} />
      ) : (
        <Text
          style={[
            styles.btnLabel,
            variant === 'primary' ? styles.btnLabelOnRed : styles.btnLabelDark,
            variant === 'danger' && styles.btnLabelDanger,
          ]}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

/** A labelled text field, min 48px tall, with an optional error message. */
export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  secureTextEntry,
  multiline,
  error,
  required,
  autoCapitalize,
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'email-address' | 'number-pad';
  secureTextEntry?: boolean;
  multiline?: boolean;
  error?: string | null;
  required?: boolean;
  autoCapitalize?: 'none' | 'sentences';
}): React.JSX.Element {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>
        {label}
        {required ? <Text style={styles.req}> *</Text> : null}
      </Text>
      <TextInput
        style={[styles.input, multiline && styles.inputMultiline, error ? styles.inputError : null]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textSubtle}
        keyboardType={keyboardType ?? 'default'}
        secureTextEntry={secureTextEntry ?? false}
        multiline={multiline ?? false}
        autoCapitalize={autoCapitalize ?? 'sentences'}
        accessibilityLabel={label}
      />
      {error ? (
        <Text style={styles.fieldError} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

/** A status / urgency pill — colour + its text label (Words First Rule, WCAG). */
export const Pill = memo(function Pill({ pill }: { pill: PillStyle }): React.JSX.Element {
  return (
    <View style={[styles.pill, { backgroundColor: pill.backgroundColor }]}>
      <Text style={[styles.pillText, { color: pill.textColor }]}>{pill.label}</Text>
    </View>
  );
});

/** A large tappable menu tile that routes to a field action (48px+). */
export function MenuTile({
  label,
  description,
  onPress,
}: {
  label: string;
  description?: string;
  onPress: () => void;
}): React.JSX.Element {
  const handle = useCallback(onPress, [onPress]);
  return (
    <Pressable
      onPress={handle}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.tile, pressed && styles.tilePressed]}
    >
      <Text style={styles.tileLabel}>{label}</Text>
      {description ? <Text style={styles.tileDesc}>{description}</Text> : null}
    </Pressable>
  );
}

/** A plain card container (hairline border, no resting shadow — DESIGN.md). */
export function Card({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}): React.JSX.Element {
  return <View style={[styles.card, style]}>{children}</View>;
}

/** An inline status banner that always carries text (never colour alone). */
export function Banner({
  text,
  tone = 'info',
}: {
  text: string;
  tone?: 'info' | 'success' | 'warning' | 'danger';
}): React.JSX.Element {
  const toneStyle =
    tone === 'success'
      ? styles.bannerSuccess
      : tone === 'warning'
        ? styles.bannerWarning
        : tone === 'danger'
          ? styles.bannerDanger
          : styles.bannerInfo;
  return (
    <View style={[styles.banner, toneStyle]} accessibilityLiveRegion="polite">
      <Text style={styles.bannerText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.page },
  header: {
    height: 56,
    backgroundColor: colors.ink,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    color: colors.surface,
    fontSize: typography.title.fontSize,
    fontWeight: '700',
  },
  backBtn: {
    width: touchTarget.min,
    height: touchTarget.min,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backText: { color: colors.surface, fontSize: 28, fontWeight: '700' },
  body: { flex: 1 },
  bodyContent: { padding: spacing.lg, gap: spacing.md },
  btnBase: {
    minHeight: touchTarget.min,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
  },
  btnPrimary: { backgroundColor: colors.brandRed },
  btnSecondary: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderStrong },
  btnDanger: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.danger },
  btnPressed: { opacity: 0.88, transform: [{ scale: 0.99 }] },
  btnDisabled: { opacity: 0.45 },
  btnLabel: { fontSize: typography.body.fontSize, fontWeight: '700' },
  btnLabelOnRed: { color: colors.surface },
  btnLabelDark: { color: colors.text },
  btnLabelDanger: { color: colors.danger },
  fieldWrap: { gap: spacing.xs },
  fieldLabel: { fontSize: typography.label.fontSize, fontWeight: '600', color: colors.textMuted },
  req: { color: colors.danger },
  input: {
    minHeight: touchTarget.min,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: typography.body.fontSize,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  inputMultiline: { minHeight: 96, textAlignVertical: 'top' },
  inputError: { borderColor: colors.danger },
  fieldError: { color: colors.dangerText, fontSize: typography.label.fontSize, fontWeight: '600' },
  pill: {
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xxs,
  },
  pillText: { fontSize: typography.label.fontSize, fontWeight: '700' },
  tile: {
    minHeight: 72,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    justifyContent: 'center',
    gap: spacing.xxs,
  },
  tilePressed: { backgroundColor: colors.mist },
  tileLabel: { fontSize: typography.title.fontSize, fontWeight: '700', color: colors.text },
  tileDesc: { fontSize: typography.body.fontSize, color: colors.textMuted },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  banner: { borderRadius: radius.md, padding: spacing.md, borderWidth: 1 },
  bannerInfo: { backgroundColor: colors.infoBg, borderColor: colors.petrol },
  bannerSuccess: { backgroundColor: colors.successBg, borderColor: colors.success },
  bannerWarning: { backgroundColor: colors.warningBg, borderColor: colors.warning },
  bannerDanger: { backgroundColor: colors.dangerBg, borderColor: colors.danger },
  bannerText: { fontSize: typography.body.fontSize, color: colors.text, fontWeight: '600' },
});
