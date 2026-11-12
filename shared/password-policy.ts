/**
 * Shared Password Policy Module
 * Enforced uniformly across server-side authentication and client-side forms.
 *
 * Requirements:
 * - Minimum 12 characters
 * - Must contain letters and numbers/symbols
 * - Blocked common / dictionary passwords
 * - Cannot contain user's email address or local-part (>= 3 chars)
 * - Cannot contain user's name parts (words >= 3 chars)
 */

export const COMMON_PASSWORDS: ReadonlySet<string> = new Set([
  '123456789012',
  'password1234',
  'password12345',
  'admin123456!',
  'administrator',
  'welcome12345',
  'qwerty123456',
  'letmein12345',
  'changeme1234',
  'iloveyou1234',
  'trustnoone12',
  'omniasset123',
  'omniasset123!',
  'admin12345678',
  'company123456',
  'system123456',
  'password123456',
  '1234567890123'
]);

export interface PasswordPolicyUserContext {
  email?: string | null;
  fullName?: string | null;
}

export interface PasswordPolicyResult {
  valid: boolean;
  error?: string;
  message?: string;
}

export function validatePasswordPolicy(
  password: string,
  user?: PasswordPolicyUserContext
): PasswordPolicyResult {
  if (!password || typeof password !== 'string') {
    return {
      valid: false,
      error: 'Password is required.',
      message: 'Password is required.'
    };
  }

  if (password.length < 12) {
    return {
      valid: false,
      error: 'Password must be at least 12 characters long.',
      message: 'Password must be at least 12 characters long.'
    };
  }

  // Must contain at least one letter and at least one number
  const hasLetter = /[A-Za-z]/.test(password);
  const hasDigitOrSymbol = /[\d\W_]/.test(password);
  if (!hasLetter || !hasDigitOrSymbol) {
    return {
      valid: false,
      error: 'Password must include both letters and numbers/special characters.',
      message: 'Password must include both letters and numbers/special characters.'
    };
  }

  const lower = password.toLowerCase();
  if (COMMON_PASSWORDS.has(lower)) {
    return {
      valid: false,
      error: 'Password is too common. Please choose a more complex passphrase.',
      message: 'Password is too common. Please choose a more complex passphrase.'
    };
  }

  if (user?.email) {
    const emailLower = user.email.toLowerCase().trim();
    const localPart = emailLower.split('@')[0] || '';
    if (lower === emailLower || (localPart.length >= 3 && lower.includes(localPart))) {
      return {
        valid: false,
        error: 'Password must not contain your email address.',
        message: 'Password must not contain your email address.'
      };
    }
  }

  if (user?.fullName) {
    const nameLower = user.fullName.toLowerCase().trim();
    const words = nameLower.split(/\s+/).filter(w => w.length >= 3);
    for (const w of words) {
      if (lower.includes(w)) {
        return {
          valid: false,
          error: 'Password must not contain parts of your name.',
          message: 'Password must not contain parts of your name.'
        };
      }
    }
  }

  return {
    valid: true,
    message: 'Password meets security requirements.'
  };
}

