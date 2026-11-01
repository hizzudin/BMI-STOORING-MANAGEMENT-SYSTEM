/**
 * Design tokens for the BMI Stooring mobile app, transcribed from the root
 * `DESIGN.md` "Petrol Complement" system (DEC-84). Pure data — no React Native
 * import — so the theme is shared by screens and unit-tested without the native
 * toolchain.
 *
 * Binding rules carried into the token names (DESIGN.md "Colors"):
 *  - **The Stamp Ink Rule**: `brandRed` is the one action / place / stamp ink.
 *  - **The Second Ink Rule**: `petrol` carries information + links, never a
 *    primary action and never an error.
 *  - **The Words First Rule**: every status pill below carries a text label; the
 *    colour only reinforces it (WCAG 2.2 AA, PRODUCT.md accessibility baseline).
 */

export const colors = {
  brandRed: '#AD2713',
  brandRedDeep: '#8A1D0C',
  brandGold: '#C09D11',
  goldLight: '#F2D98A',
  petrol: '#1F4E5F',
  ink: '#14262E',
  inkRaised: '#1F3640',
  stone: '#CBD5DA',
  stoneMuted: '#93A4AC',
  text: '#1F2937',
  textMuted: '#4B5563',
  textSubtle: '#6B7280',
  borderStrong: '#9CA3AF',
  border: '#E5E7EB',
  divider: '#F3F4F6',
  page: '#F4F7F8',
  surface: '#FFFFFF',
  mist: '#E6EFF1',
  mistLight: '#F0F5F6',
  frost: '#F7FAFB',
  success: '#15803D',
  successBg: '#DCFCE7',
  successText: '#14532D',
  warning: '#B45309',
  warningBg: '#FEF3C7',
  warningText: '#78350F',
  danger: '#B91C1C',
  dangerBg: '#FEE2E2',
  dangerTint: '#FEF2F2',
  dangerText: '#7F1D1D',
  infoBg: '#DCEBEF',
  infoText: '#1F4E5F',
  neutralPillBg: '#F3F4F6',
  neutralPillText: '#374151',
} as const;

export type ColorToken = keyof typeof colors;

/** Spacing scale (DESIGN.md `spacing`). */
export const spacing = {
  xxs: 4,
  xs: 6,
  sm: 8,
  md: 12,
  lg: 16,
  page: 22,
  xl: 24,
  xxl: 32,
} as const;

/** Corner radii (DESIGN.md `rounded`). */
export const radius = {
  sm: 6,
  md: 8,
  lg: 10,
  pill: 999,
} as const;

/**
 * Minimum touch-target heights. DESIGN.md: "give every phone target at least
 * 48px and every Pass/Fail control at least 44px tall." The field app is built
 * for gloves + sunlight (PRODUCT.md principle 3), so 48 is the default.
 */
export const touchTarget = {
  min: 48,
  passFail: 44,
} as const;

/** Mobile typography (DESIGN.md `body-mobile` is 15px; titles 15/700). */
export const typography = {
  headline: { fontSize: 22, fontWeight: '700', lineHeight: 28 },
  title: { fontSize: 17, fontWeight: '700', lineHeight: 22 },
  metric: { fontSize: 20, fontWeight: '700', lineHeight: 24 },
  body: { fontSize: 15, fontWeight: '400', lineHeight: 22 },
  label: { fontSize: 13, fontWeight: '600', lineHeight: 17 },
} as const;
