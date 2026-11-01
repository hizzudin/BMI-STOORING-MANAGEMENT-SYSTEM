import { describe, it, expect } from 'vitest';
import { t, isLocale, DEFAULT_LOCALE, LOCALES } from './i18n';

describe('i18n — bilingual ID default + EN', () => {
  it('defaults to Indonesian', () => {
    expect(DEFAULT_LOCALE).toBe('id');
    expect(LOCALES).toContain('id');
    expect(LOCALES).toContain('en');
  });

  it('translates known keys per locale', () => {
    expect(t('id', 'nav.workOrders')).toBe('Work Order');
    expect(t('en', 'nav.workOrders')).toBe('Work Orders');
  });

  it('falls back to Indonesian then to the key for unknown keys', () => {
    expect(t('en', 'nonexistent.key')).toBe('nonexistent.key');
  });

  it('recognises valid locales only', () => {
    expect(isLocale('id')).toBe(true);
    expect(isLocale('en')).toBe(true);
    expect(isLocale('fr')).toBe(false);
    expect(isLocale(undefined)).toBe(false);
  });
});
