/**
 * Validates and normalizes Indian mobile numbers server-side.
 * Format requirement: exactly 10 digits, starting with 6, 7, 8, or 9.
 */

export interface PhoneValidationResult {
  isValid: boolean;
  cleanPhone: string;
  e164Phone: string;
  error?: string;
}

export function validateIndianMobileNumber(rawPhone: string | null | undefined): PhoneValidationResult {
  if (!rawPhone || typeof rawPhone !== 'string') {
    return {
      isValid: false,
      cleanPhone: '',
      e164Phone: '',
      error: 'Mobile number is required',
    };
  }

  // Strip all non-digit characters
  const digitsOnly = rawPhone.replace(/\D/g, '');

  let cleanPhone = digitsOnly;

  // Handle +91 prefix (12 digits)
  if (digitsOnly.length === 12 && digitsOnly.startsWith('91')) {
    cleanPhone = digitsOnly.slice(2);
  }
  // Handle leading 0 prefix (11 digits)
  else if (digitsOnly.length === 11 && digitsOnly.startsWith('0')) {
    cleanPhone = digitsOnly.slice(1);
  }

  // Must be exactly 10 digits
  if (cleanPhone.length !== 10) {
    return {
      isValid: false,
      cleanPhone,
      e164Phone: '',
      error: 'Invalid phone length. Indian mobile numbers must be exactly 10 digits.',
    };
  }

  // Must start with 6, 7, 8, or 9
  const firstDigit = cleanPhone[0];
  if (!['6', '7', '8', '9'].includes(firstDigit)) {
    return {
      isValid: false,
      cleanPhone,
      e164Phone: '',
      error: 'Invalid Indian mobile number. First digit must be 6, 7, 8, or 9.',
    };
  }

  return {
    isValid: true,
    cleanPhone,
    e164Phone: `+91${cleanPhone}`,
  };
}
