import { afterEach, describe, expect, it, vi } from 'vitest';
import { calculateAge, isAtLeast18YearsOld, isValidDateOfBirth } from '../src/utils/age';
import { googleAuthSchema, phoneVerifySchema, registerSchema } from '../src/validators/authValidator';

afterEach(() => vi.useRealTimers());

describe('Date of birth validation', () => {
  it.each(['2000-02-31', '2001-02-29', '2000-04-31', '2000-13-01', '2000-00-01', '2000-01-00', 'not-a-date'])(
    'rejects the invalid calendar date %s',
    (dob) => {
      expect(isValidDateOfBirth(dob)).toBe(false);
      expect(calculateAge(dob)).toBe(-1);
      expect(isAtLeast18YearsOld(dob)).toBe(false);
    }
  );

  it('accepts leap days only in leap years', () => {
    expect(isValidDateOfBirth('2000-02-29')).toBe(true);
    expect(isValidDateOfBirth('1900-02-29')).toBe(false);
    expect(isValidDateOfBirth('2004-02-29')).toBe(true);
  });

  it('uses the same UTC birthday boundary as discovery', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-06T23:59:59Z'));
    expect(calculateAge('2008-10-07')).toBe(17);
    expect(isAtLeast18YearsOld('2008-10-07')).toBe(false);
    vi.setSystemTime(new Date('2026-10-07T00:00:00Z'));
    expect(calculateAge('2008-10-07')).toBe(18);
    expect(isAtLeast18YearsOld('2008-10-07')).toBe(true);
  });

  it('rejects impossible birthdays in email, Google and phone registration', () => {
    const dateOfBirth = '2000-02-31';
    const results = [
      registerSchema.safeParse({ email: 'birthday@example.com', password: 'Password123!', displayName: 'Birthday', dateOfBirth }),
      googleAuthSchema.safeParse({ credential: 'test-google-credential', dateOfBirth }),
      phoneVerifySchema.safeParse({ phone: '+919876543210', code: '123456', displayName: 'Birthday', dateOfBirth }),
    ];
    for (const result of results) {
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.issues).toContainEqual(expect.objectContaining({ message: 'Please enter a valid date of birth' }));
    }
  });
});
