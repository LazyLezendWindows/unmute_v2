"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.phoneVerifySchema = exports.phoneStartSchema = exports.resetPasswordSchema = exports.forgotPasswordSchema = exports.phoneLinkSchema = exports.googleAuthSchema = exports.loginSchema = exports.registerSchema = void 0;
const zod_1 = require("zod");
const age_1 = require("../utils/age");
/**
 * A mobile number in international form. A bare 10-digit number starting 6–9 is taken as Indian
 * (+91); anything else must carry its country code. Spaces, dashes and brackets are ignored.
 */
const phoneNumber = zod_1.z
    .string()
    .max(24)
    .transform((raw) => {
    const digits = raw.replace(/[\s\-()]/g, '');
    if (/^[6-9]\d{9}$/.test(digits))
        return `+91${digits}`;
    if (/^0[6-9]\d{9}$/.test(digits))
        return `+91${digits.slice(1)}`;
    return digits.startsWith('+') ? digits : `+${digits}`;
})
    .refine((phone) => /^\+[1-9]\d{7,14}$/.test(phone), { message: 'Please enter a valid mobile number' });
const dateOfBirth = zod_1.z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date of birth must be in YYYY-MM-DD format')
    .refine(age_1.isValidDateOfBirth, { message: 'Please enter a valid date of birth' })
    .refine((dob) => !(0, age_1.isValidDateOfBirth)(dob) || (0, age_1.isAtLeast18YearsOld)(dob), {
    message: 'You must be at least 18 years of age to join Unmute',
});
exports.registerSchema = zod_1.z.object({
    email: zod_1.z.string().email('Please enter a valid email address'),
    password: zod_1.z
        .string()
        .min(8, 'Password must be at least 8 characters long')
        .max(100, 'Password is too long'),
    displayName: zod_1.z
        .string()
        .trim()
        .min(2, 'Display name must be at least 2 characters')
        .max(50, 'Display name cannot exceed 50 characters'),
    dateOfBirth,
    /** Optional mobile number; it is linked (and usable for phone sign-in) only with its SMS code. */
    phone: phoneNumber.optional(),
    code: zod_1.z.string().regex(/^\d{6}$/, 'Enter the 6-digit code from the SMS').optional(),
});
exports.loginSchema = zod_1.z.object({
    email: zod_1.z.string().email('Please enter a valid email address'),
    password: zod_1.z.string().min(1, 'Password is required'),
});
// Only the Google ID token is accepted; profile fields are read from the verified token server-side.
// `.strict()` rejects client-asserted identity fields (email, googleId, ...) outright.
exports.googleAuthSchema = zod_1.z
    .object({
    credential: zod_1.z.string().min(20, 'Google credential is required').max(4096),
    dateOfBirth: dateOfBirth.optional(),
})
    .strict();
exports.phoneLinkSchema = zod_1.z
    .object({ phone: phoneNumber, code: zod_1.z.string().regex(/^\d{6}$/, 'Enter the 6-digit code from the SMS') })
    .strict();
exports.forgotPasswordSchema = zod_1.z.object({ email: zod_1.z.string().email('Please enter a valid email address') }).strict();
exports.resetPasswordSchema = zod_1.z
    .object({
    email: zod_1.z.string().email('Please enter a valid email address'),
    code: zod_1.z.string().regex(/^\d{6}$/, 'Enter the 6-digit code from the SMS'),
    password: zod_1.z.string().min(8, 'Password must be at least 8 characters long').max(100, 'Password is too long'),
})
    .strict();
exports.phoneStartSchema = zod_1.z.object({ phone: phoneNumber }).strict();
// Name and date of birth are only needed (and only accepted) to create an account for a new number.
exports.phoneVerifySchema = zod_1.z
    .object({
    phone: phoneNumber,
    code: zod_1.z.string().regex(/^\d{6}$/, 'Enter the 6-digit code from the SMS'),
    displayName: zod_1.z
        .string()
        .trim()
        .min(2, 'Display name must be at least 2 characters')
        .max(50, 'Display name cannot exceed 50 characters')
        .optional(),
    dateOfBirth: dateOfBirth.optional(),
})
    .strict();
