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
