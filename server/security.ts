import crypto from 'crypto';

export const SUPER_ADMIN_UID = 'vibenexa_super_admin';
export const SUPER_ADMIN_EMAIL = 'satpalsinghrawat640@gmail.com';
export const SUPER_ADMIN_MOBILE = '+918306657355';
export const SUPER_ADMIN_USERNAME = 'satpal_admin';

export function normalizeEmail(raw?: string | null): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return undefined;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(trimmed) ? trimmed : undefined;
}

export function normalizeMobile(raw?: string | null): string | undefined {
  if (!raw) return undefined;
  const digits = raw.replace(/[^\d+]/g, '').trim();
  if (!digits) return undefined;
  if (digits.startsWith('+91') && digits.length === 13) return digits;
  if (digits.startsWith('91') && digits.length === 12) return `+${digits}`;
  if (/^\d{10}$/.test(digits)) return `+91${digits}`;
  if (/^\+\d{10,15}$/.test(digits)) return digits;
  return undefined;
}

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isValidUsername(username: string): boolean {
  return /^[a-z0-9_]{3,30}$/.test(username);
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const [, salt, hexKey] = parts;
  const derived = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(hexKey, 'hex');
  if (derived.length !== expected.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}

export function generateSessionToken(): { rawToken: string; tokenHash: string } {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(rawToken);
  return { rawToken, tokenHash };
}

export function hashToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

export function generateId(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
}

export function isSuperAdminIdentifier(identifier: string): boolean {
  const trimmed = identifier.trim();
  const email = normalizeEmail(trimmed);
  if (email && email === SUPER_ADMIN_EMAIL) return true;
  const mobile = normalizeMobile(trimmed);
  if (mobile && mobile === SUPER_ADMIN_MOBILE) return true;
  if (normalizeUsername(trimmed) === SUPER_ADMIN_USERNAME) return true;
  return false;
}

/**
 * Validates Day / Month / Year strictly against Gregorian calendar rules
 * (rejects Feb 30, Apr 31, non-leap Feb 29, future dates, and implausible ages).
 */
export function validateAndComputeDob(
  day: number,
  month: number,
  year: number
): { valid: true; dob: string; age: number; ageGroup: 'adult' | 'minor' } | { valid: false; error: string } {
  if (!Number.isInteger(day) || !Number.isInteger(month) || !Number.isInteger(year)) {
    return { valid: false, error: 'Please select a valid Day, Month, and Year.' };
  }
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1920) {
    return { valid: false, error: 'Invalid calendar date.' };
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return { valid: false, error: 'Selected calendar date does not exist.' };
  }
  const now = new Date();
  const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (date > todayUtc) {
    return { valid: false, error: 'Date of birth cannot be in the future.' };
  }
  let age = now.getUTCFullYear() - year;
  const monthDiff = now.getUTCMonth() + 1 - month;
  if (monthDiff < 0 || (monthDiff === 0 && now.getUTCDate() < day)) {
    age -= 1;
  }
  if (age < 13) {
    return { valid: false, error: 'Users must be at least 13 years old to create an account.' };
  }
  if (age > 110) {
    return { valid: false, error: 'Please enter a realistic birth year.' };
  }
  const dob = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return {
    valid: true,
    dob,
    age,
    ageGroup: age >= 18 ? 'adult' : 'minor',
  };
}

export function sanitizeText(input: unknown, maxLen: number): string {
  if (typeof input !== 'string') return '';
  return input.trim().slice(0, maxLen);
}
