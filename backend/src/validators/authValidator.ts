import { z } from 'zod';
import { isAtLeast18YearsOld } from '../utils/age';

export const registerSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters long')
    .max(100, 'Password is too long'),
  displayName: z
    .string()
    .trim()
    .min(2, 'Display name must be at least 2 characters')
    .max(50, 'Display name cannot exceed 50 characters'),
  dateOfBirth: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date of birth must be in YYYY-MM-DD format')
    .refine((dob) => isAtLeast18YearsOld(dob), {
      message: 'You must be at least 18 years of age to join Unmute',
    }),
});

export const loginSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

// Only the Google ID token is accepted; profile fields are read from the verified token server-side.
// `.strict()` rejects client-asserted identity fields (email, googleId, ...) outright.
export const googleAuthSchema = z
  .object({
    credential: z.string().min(20, 'Google credential is required').max(4096),
    dateOfBirth: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date of birth must be in YYYY-MM-DD format')
      .refine((dob) => isAtLeast18YearsOld(dob), {
        message: 'You must be at least 18 years of age to join Unmute',
      })
      .optional(),
  })
  .strict();

/**
 * A mobile number in international form. A bare 10-digit number starting 6–9 is taken as Indian
 * (+91); anything else must carry its country code. Spaces, dashes and brackets are ignored.
 */
const phoneNumber = z
  .string()
  .max(24)
  .transform((raw) => {
    const digits = raw.replace(/[\s\-()]/g, '');
    if (/^[6-9]\d{9}$/.test(digits)) return `+91${digits}`;
    if (/^0[6-9]\d{9}$/.test(digits)) return `+91${digits.slice(1)}`;
    return digits.startsWith('+') ? digits : `+${digits}`;
  })
  .refine((phone) => /^\+[1-9]\d{7,14}$/.test(phone), { message: 'Please enter a valid mobile number' });

export const phoneStartSchema = z.object({ phone: phoneNumber }).strict();

// Name and date of birth are only needed (and only accepted) to create an account for a new number.
export const phoneVerifySchema = z
  .object({
    phone: phoneNumber,
    code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code from the SMS'),
    displayName: z
      .string()
      .trim()
      .min(2, 'Display name must be at least 2 characters')
      .max(50, 'Display name cannot exceed 50 characters')
      .optional(),
    dateOfBirth: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date of birth must be in YYYY-MM-DD format')
      .refine((dob) => isAtLeast18YearsOld(dob), {
        message: 'You must be at least 18 years of age to join Unmute',
      })
      .optional(),
  })
  .strict();

export type RegisterInput = z.infer<typeof registerSchema>;
export type PhoneStartInput = z.infer<typeof phoneStartSchema>;
export type PhoneVerifyInput = z.infer<typeof phoneVerifySchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type GoogleAuthInput = z.infer<typeof googleAuthSchema>;
