import { z } from 'zod';
import { AppError } from '../../errors/app-error.js';

export const RegisterSchema = z
  .object({
    phone: z.string().min(10).max(15),
    password: z.string().min(10, 'Password must be at least 10 characters long'),
    businessName: z.string().min(1).max(100),
    ownerName: z.string().max(100).optional(),
    businessType: z.string().max(50).optional(),
    city: z.string().max(50).optional(),
    edition: z.enum(['cloud', 'local']).optional(),
  })
  .strict();

export const RegisterStallSchema = z
  .object({
    phone: z.string().min(10).max(15),
    password: z.string().min(10, 'Password must be at least 10 characters long'),
    businessName: z.string().min(1).max(100),
    ownerName: z.string().max(100).optional(),
    businessType: z.string().max(50).optional(),
    city: z.string().max(50).optional(),
    edition: z.enum(['cloud', 'local']).optional(),
    upiId: z.string().max(100).optional(),
    quickPin: z.string().regex(/^\d{4}$/, 'Quick PIN must be exactly 4 digits').optional(),
    presetKey: z.string().max(50).optional(),
  })
  .strict();

export const LoginSchema = z
  .object({
    phone: z.string().min(10).max(15),
    password: z.string().min(1),
  })
  .strict();

export const SetupPinSchema = z
  .object({
    pin: z.string().min(1, '4-digit PIN is required'),
  })
  .strict();

export const VerifyPinSchema = z
  .object({
    pin: z.string().min(1, 'PIN is required'),
  })
  .strict();

export const OwnerPinSetSchema = z
  .object({
    pin: z.string().regex(/^\d{4}$/, 'Owner PIN must be exactly 4 digits'),
    currentPin: z.string().regex(/^\d{4}$/, 'Current Owner PIN must be exactly 4 digits').optional(),
    accountPassword: z.string().min(1, 'Account password cannot be empty').optional(),
  })
  .strict();

export const OwnerPinVerifySchema = z
  .object({
    pin: z.string().regex(/^\d{4}$/, 'Owner PIN must be exactly 4 digits'),
  })
  .strict();

export const BiometricRegisterSchema = z
  .object({
    credentialId: z.string().min(1, 'credentialId is required'),
    publicKey: z.string().min(1, 'publicKey is required'),
    deviceName: z.string().max(100).optional(),
  })
  .strict();

export const BiometricVerifySchema = z
  .object({
    credentialId: z.string().min(1, 'credentialId is required'),
  })
  .strict();

export const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
export const FSSAI_REGEX = /^\d{14}$/;
export const UPI_VPA_REGEX = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/;
export const ALLOWED_GST_RATE_BPS = [0, 500, 1200, 1800] as const;

export const UpdateVendorProfileSchema = z
  .object({
    businessName: z.string().trim().min(1).max(100).optional(),
    ownerName: z.string().trim().min(1).max(100).optional(),
    city: z.string().trim().max(50).optional(),
    stallAddress: z.string().trim().max(240).nullable().optional(),
    upiId: z
      .string()
      .trim()
      .max(120)
      .transform((val) => (val === '' ? null : val))
      .nullable()
      .optional()
      .refine((val) => val === undefined || val === null || UPI_VPA_REGEX.test(val), {
        message: 'Invalid UPI ID format. Must be in username@bank format (e.g. stall@okaxis)',
      }),
    payeeName: z
      .string()
      .trim()
      .max(120)
      .transform((val) => (val === '' ? null : val))
      .nullable()
      .optional(),
    taxMode: z.enum(['unregistered', 'composition', 'regular']).optional(),
    gstin: z
      .string()
      .trim()
      .transform((val) => (val === '' ? null : val.toUpperCase()))
      .nullable()
      .optional()
      .refine((val) => val === undefined || val === null || GSTIN_REGEX.test(val), {
        message: 'Invalid 15-character Indian GSTIN format (e.g. 36AABCU9603R1ZM)',
      }),
    fssaiNumber: z
      .string()
      .trim()
      .transform((val) => (val === '' ? null : val))
      .nullable()
      .optional()
      .refine((val) => val === undefined || val === null || FSSAI_REGEX.test(val), {
        message: 'FSSAI number must be exactly 14 digits',
      }),
    gstRateBps: z
      .number()
      .int()
      .refine((val) => (ALLOWED_GST_RATE_BPS as readonly number[]).includes(val), {
        message: 'gstRateBps must be one of 0, 500, 1200, 1800',
      })
      .optional(),
  })
  .strict();

export function validateSchema<T>(schema: z.ZodSchema<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `${i.path.join('.') || 'root'}: ${i.message}`)
      .join('; ');

    let errorCode = 'VALIDATION_ERROR';
    const firstIssue = result.error.issues[0];
    const firstField = firstIssue?.path[0];
    const dataObj = data as Record<string, any> | undefined;

    if (firstField === 'phone') {
      errorCode = 'INVALID_PHONE';
    } else if (firstField === 'businessName') {
      errorCode = 'MISSING_BUSINESS_NAME';
    } else if (firstField === 'password') {
      errorCode = !dataObj?.password ? 'MISSING_PASSWORD' : 'WEAK_PASSWORD';
    }

    throw AppError.badRequest(`Validation failed: ${issues}`, errorCode);
  }
  return result.data;
}
