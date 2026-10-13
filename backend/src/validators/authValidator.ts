import { z } from 'zod';
import { isAtLeast18YearsOld, isValidDateOfBirth } from '../utils/age';

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

const dateOfBirth = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date of birth must be in YYYY-MM-DD format')
  .refine(isValidDateOfBirth, { message: 'Please enter a valid date of birth' })
  .refine((dob) => !isValidDateOfBirth(dob) || isAtLeast18YearsOld(dob), {
    message: 'You must be at least 18 years of age to join Unmute',
  });

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
  dateOfBirth,
  /** Optional mobile number; it is linked (and usable for phone sign-in) only with its SMS code. */
  phone: phoneNumber.optional(),
  code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code from the SMS').optional(),
  /** A friend's referral code (both get two weeks free once this account's phone is verified). */
  referralCode: z.string().trim().max(30).optional(),
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
    dateOfBirth: dateOfBirth.optional(),
    referralCode: z.string().trim().max(30).optional(),
  })
  .strict();

export const phoneLinkSchema = z
  .object({ phone: phoneNumber, code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code from the SMS') })
  .strict();

export const forgotPasswordSchema = z.object({ email: z.string().email('Please enter a valid email address') }).strict();

export const resetPasswordSchema = z
  .object({
    email: z.string().email('Please enter a valid email address'),
    code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code from the SMS'),
    password: z.string().min(8, 'Password must be at least 8 characters long').max(100, 'Password is too long'),
  })
  .strict();

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
    dateOfBirth: dateOfBirth.optional(),
    referralCode: z.string().trim().max(30).optional(),
  })
  .strict();

export type RegisterInput = z.infer<typeof registerSchema>;
export type PhoneLinkInput = z.infer<typeof phoneLinkSchema>;
export type PhoneStartInput = z.infer<typeof phoneStartSchema>;
export type PhoneVerifyInput = z.infer<typeof phoneVerifySchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type GoogleAuthInput = z.infer<typeof googleAuthSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().max(100).optional(),
    newPassword: z.string().min(8, 'Password must be at least 8 characters long').max(100, 'Password is too long'),
  })
  .strict();

const totpOrRecoveryCode = z
  .string()
  .trim()
  .refine((val) => /^\d{6}$/.test(val) || /^[A-Za-z0-9]{4}-?[A-Za-z0-9]{4}$/.test(val), {
    message: 'Enter a valid 6-digit authenticator code or 8-character recovery code',
  });

export const totpEnableSchema = z
  .object({
    code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code from your authenticator app'),
  })
  .strict();

export const totpVerifyLoginSchema = z
  .object({
    pendingToken: z.string().trim().min(20, 'Pending authentication token is required').max(128),
    code: totpOrRecoveryCode,
  })
  .strict();

export const totpReauthSchema = z
  .object({
    password: z.string().min(1).max(100).optional(),
    code: totpOrRecoveryCode.optional(),
  })
  .strict()
  .refine((data) => Boolean(data.password || data.code), {
    message: 'Please confirm with your authenticator code or password',
  });

