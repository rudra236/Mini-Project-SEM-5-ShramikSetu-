/**
 * Audit i18n strings across en, hi, and mr locales.
 * Fails the process (exit code 1) if any key in en is missing or empty in hi or mr.
 */

import { enTranslations, hiTranslations, mrTranslations, Locale } from '../src/locales/index';

function getLeafKeys(obj: any, prefix = ''): { path: string; value: string }[] {
  let results: { path: string; value: string }[] = [];
  for (const key of Object.keys(obj)) {
    const fullPath = prefix ? `${prefix}.${key}` : key;
    const val = obj[key];
    if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
      results = results.concat(getLeafKeys(val, fullPath));
    } else {
      results.push({ path: fullPath, value: String(val) });
    }
  }
  return results;
}

function getValueAtPath(obj: any, path: string): any {
  const parts = path.split('.');
  let current = obj;
  for (const part of parts) {
    if (current === undefined || current === null) return undefined;
    current = current[part];
  }
  return current;
}

export function auditTranslations(): {
  success: boolean;
  totalKeys: number;
  errors: { locale: Locale; key: string; issue: string }[];
} {
  const enKeys = getLeafKeys(enTranslations);
  const errors: { locale: Locale; key: string; issue: string }[] = [];
  const targetLocales: Locale[] = ['hi', 'mr'];

  for (const locale of targetLocales) {
    const targetObj = locale === 'hi' ? hiTranslations : mrTranslations;
    for (const { path } of enKeys) {
      const val = getValueAtPath(targetObj, path);
      if (val === undefined || val === null) {
        errors.push({ locale, key: path, issue: 'Key missing' });
      } else if (typeof val !== 'string' || val.trim().length === 0) {
        errors.push({ locale, key: path, issue: 'Empty or blank translation' });
      }
    }
  }

  return {
    success: errors.length === 0,
    totalKeys: enKeys.length,
    errors,
  };
}

if (require.main === module || process.argv[1]?.includes('audit-i18n')) {
  const result = auditTranslations();
  if (!result.success) {
    console.error('❌ i18n AUDIT FAILED! Missing or empty translation keys found:');
    for (const err of result.errors) {
      console.error(`  [${err.locale}] ${err.key}: ${err.issue}`);
    }
    process.exit(1);
  } else {
    console.log(`✓ i18n audit passed: ${result.totalKeys} keys verified in 'hi' and 'mr' with zero missing entries.`);
  }
}
