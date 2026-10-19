/**
 * Money utilities for ShramikSetu.
 * Backend stores monetary values in integer paise (bigint / int).
 * All client-side calculations and conversions must be exact integers.
 */

export function paiseToRupees(paise: number | bigint | string | null | undefined): number {
  if (paise === null || paise === undefined) return 0;
  const num = typeof paise === 'bigint' ? Number(paise) : Number(paise);
  if (isNaN(num)) return 0;
  return num / 100;
}

export function rupeesToPaise(rupees: number | string | null | undefined): number {
  if (rupees === null || rupees === undefined) return 0;
  const num = Number(rupees);
  if (isNaN(num)) return 0;
  return Math.round(num * 100);
}

/**
 * Format paise into Indian Rupee representation (e.g. ₹1,250.00 or ₹700)
 */
export function formatRupees(
  paise: number | bigint | string | null | undefined,
  includeDecimals: boolean = false
): string {
  if (paise === null || paise === undefined) return '₹0';
  const rupees = paiseToRupees(paise);
  
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: includeDecimals ? 2 : (rupees % 1 === 0 ? 0 : 2),
    maximumFractionDigits: 2,
  }).format(rupees);
}

/**
 * Format raw rupees (when API returns or expects rupees directly, e.g. dailyWage in contract creation)
 */
export function formatRawRupees(
  rupees: number | string | null | undefined,
  includeDecimals: boolean = false
): string {
  if (rupees === null || rupees === undefined) return '₹0';
  const num = Number(rupees);
  if (isNaN(num)) return '₹0';

  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: includeDecimals ? 2 : (num % 1 === 0 ? 0 : 2),
    maximumFractionDigits: 2,
  }).format(num);
}
