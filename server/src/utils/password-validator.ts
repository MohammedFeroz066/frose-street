import { AppError } from '../errors/app-error.js';

// Top common passwords and patterns to prohibit
const COMMON_PASSWORDS = new Set([
  'password123',
  'password123!',
  'password@123',
  'admin12345!',
  'admin@12345',
  '1234567890',
  '12345678901',
  'qwertyuiop',
  'letmein123!',
  'welcome123!',
  'frose12345!',
  'froseguest1!',
  'stallpos123!',
  'iloveyou123',
  'changeme123',
]);

/**
 * Validates that a password satisfies strong security requirements:
 * - Minimum 10 characters
 * - Not in common-password blacklist
 * - Contains uppercase, lowercase, number, and special character
 */
export function validateStrongPassword(password: string | undefined | null): string {
  if (!password || typeof password !== 'string' || password.trim().length === 0) {
    throw AppError.badRequest('Password is required for registration', 'MISSING_PASSWORD');
  }

  const trimmed = password.trim();

  if (trimmed.length < 10) {
    throw AppError.badRequest('Password must be at least 10 characters long', 'WEAK_PASSWORD');
  }

  const normalized = trimmed.toLowerCase();
  if (COMMON_PASSWORDS.has(normalized)) {
    throw AppError.badRequest('This password is too common or easily guessable. Please choose a stronger password', 'COMMON_PASSWORD');
  }

  const hasUpper = /[A-Z]/.test(trimmed);
  const hasLower = /[a-z]/.test(trimmed);
  const hasDigit = /[0-9]/.test(trimmed);
  const hasSpecial = /[^A-Za-z0-9]/.test(trimmed);

  if (!hasUpper || !hasLower || !hasDigit || !hasSpecial) {
    throw AppError.badRequest('Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character', 'WEAK_PASSWORD');
  }

  return trimmed;
}
