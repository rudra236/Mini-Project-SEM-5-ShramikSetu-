import { describe, it, expect } from 'vitest';
import { auditTranslations } from '../../scripts/audit-i18n';
import { enTranslations, hiTranslations, mrTranslations, getTranslation } from '../../src/locales/index';

describe('i18n String Completeness & Non-Bilingual Audit', () => {
  it('audits all translation keys: zero missing keys across hi and mr', () => {
    const audit = auditTranslations();
    expect(audit.success).toBe(true);
    expect(audit.totalKeys).toBeGreaterThan(150);
    expect(audit.errors).toHaveLength(0);
  });

  it('guarantees no English-with-Hindi-subtitle patterns in translations', () => {
    // Check that Hindi and Marathi translations do not contain the subtitle pattern " · " or " / " with English words
    const checkNoSubtitlePattern = (obj: any, locale: string) => {
      for (const [key, val] of Object.entries(obj)) {
        if (typeof val === 'string') {
          // Should not contain " · " followed by Hindi/Marathi if the string itself is meant to be pure Hindi/Marathi
          // Or conversely, shouldn't contain English letters alongside Devanagari in a bilingual subtitle format
          if (locale === 'hi' || locale === 'mr') {
            const hasEnglishWords = /[A-Z]{3,}/.test(val);
            const hasSeparator = val.includes(' · ') || val.includes(' / ');
            // If it has both multiple uppercase English letters and a separator, it's a bilingual subtitle pattern!
            expect(
              hasEnglishWords && hasSeparator,
              `Found bilingual subtitle pattern in [${locale}] key "${key}": "${val}"`
            ).toBe(false);
          }
        } else if (typeof val === 'object' && val !== null) {
          checkNoSubtitlePattern(val, locale);
        }
      }
    };

    checkNoSubtitlePattern(hiTranslations, 'hi');
    checkNoSubtitlePattern(mrTranslations, 'mr');
  });

  it('ensures getTranslation returns correct locale dictionary and falls back safely', () => {
    const en = getTranslation('en');
    const hi = getTranslation('hi');
    const mr = getTranslation('mr');

    expect(en.nav.home).toBe('Home');
    expect(hi.nav.home).toBe('मुख्यपृष्ठ');
    expect(mr.nav.home).toBe('मुख्यपृष्ठ');

    expect(en.attendance.title).toBe('Mark Daily Attendance');
    expect(hi.attendance.title).toBe('दैनिक हाजिरी लगाएं');
    expect(mr.attendance.title).toBe('दैनंदिन हजेरी लावा');

    expect(en.wallet.unpaidWagesHero).toBe('Total Unpaid Wages');
    expect(hi.wallet.unpaidWagesHero).toBe('कुल बकाया मजदूरी');
    expect(mr.wallet.unpaidWagesHero).toBe('एकूण थकीत मजुरी');

    // Unknown locale falls back to en
    const fallback = getTranslation('invalid' as any);
    expect(fallback.nav.home).toBe('Home');
  });
});
