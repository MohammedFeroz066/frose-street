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
 * - Supports passphrases and spaces without forced composition rules
 */
export function validateStrongPassword(password: string | undefined | null): string {
  if (!password || typeof password !== 'string' || password.length === 0) {
    throw AppError.badRequest('Password is required for registration', 'MISSING_PASSWORD');
  }

  // Minimum 10 characters (preserve spaces in passphrases)
  if (password.length < 10) {
    throw AppError.badRequest('Password must be at least 10 characters long', 'WEAK_PASSWORD');
  }

  const normalized = password.trim().toLowerCase();
  if (COMMON_PASSWORDS.has(normalized)) {
    throw AppError.badRequest('This password is too common or easily guessable. Please choose a stronger password', 'COMMON_PASSWORD');
  }

  return password;
}
