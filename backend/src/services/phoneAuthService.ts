import crypto from 'crypto';
import { getDatabase } from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { isAtLeast18YearsOld } from '../utils/age';
import { UserRepository } from '../repositories/userRepository';
import { AuthAccountRepository } from '../repositories/authAccountRepository';
import { ProfileRepository } from '../repositories/profileRepository';
import { PhoneCodeRepository } from '../repositories/phoneCodeRepository';
import { revealCodesToClient, sendSms } from './auth/smsSender';
import { PhoneLinkInput, PhoneStartInput, PhoneVerifyInput } from '../validators/authValidator';

const CODE_TTL_SECONDS = 10 * 60;
/** Wait before another code can be sent to the same number. */
export const RESEND_AFTER_SECONDS = 30;
const MAX_CODES_PER_HOUR = 5;
/** Wrong guesses allowed per code; the code then stops working and a new one must be requested. */
const MAX_ATTEMPTS = 5;

export type PhoneAuthResult =
  | { requiresProfile: true }
  | { requiresProfile: false; isNewUser: boolean; userId: string };

function hashCode(phone: string, code: string): string {
  return crypto.createHash('sha256').update(`${phone}:${code}`).digest('hex');
}

function sameHash(a: string, b: string): boolean {
  return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}

export class PhoneAuthService {
  /** Sends a 6-digit sign-in code to `phone` (already normalised to E.164 by the validator). */
  static async start({ phone }: PhoneStartInput): Promise<{ resendAfter: number; expiresIn: number; devCode?: string }> {
    const recent = await PhoneCodeRepository.recent(phone, 60 * 60);
    if (recent.secondsSinceLast !== null && recent.secondsSinceLast < RESEND_AFTER_SECONDS) {
      throw new AppError(`Please wait ${RESEND_AFTER_SECONDS - recent.secondsSinceLast} seconds before asking for another code.`, 429);
    }
    if (recent.count >= MAX_CODES_PER_HOUR) {
      throw new AppError('Too many codes were sent to this number. Please try again in an hour.', 429);
    }

    const code = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
    await PhoneCodeRepository.issue(phone, hashCode(phone, code), CODE_TTL_SECONDS);
    await sendSms(phone, `${code} is your Unmute sign-in code. It expires in 10 minutes. Never share it with anyone.`);
    return {
      resendAfter: RESEND_AFTER_SECONDS,
      expiresIn: CODE_TTL_SECONDS,
      ...(revealCodesToClient() ? { devCode: code } : {}),
    };
  }

  /**
   * The usable code for `phone` if `code` matches it (not yet consumed: the caller consumes it in
   * the same transaction that uses it). Wrong guesses count towards the code's lockout.
   */
  static async checkCode(phone: string, code: string): Promise<{ id: string }> {
    const active = await PhoneCodeRepository.active(phone);
    if (!active || active.attempts >= MAX_ATTEMPTS) {
      throw new AppError('This code has expired. Request a new one.', 400);
    }
    if (!sameHash(active.code_hash, hashCode(phone, code))) {
      await PhoneCodeRepository.recordWrongGuess(active.id);
      const left = MAX_ATTEMPTS - active.attempts - 1;
      throw new AppError(left > 0 ? "That code isn't right. Check the SMS and try again." : 'Too many wrong codes. Request a new one.', 400);
    }
    return active;
  }

  /** Confirms a number for a signed-in member; it replaces any number they had and works for sign-in. */
  static async link(userId: string, { phone, code }: PhoneLinkInput): Promise<void> {
    const owner = await AuthAccountRepository.findUser('phone', phone);
    if (owner && owner.id !== userId) {
      throw new AppError('This phone number belongs to another account.', 409);
    }
    const active = await PhoneAuthService.checkCode(phone, code);
    await getDatabase().transaction(async (tx) => {
      if (!(await PhoneCodeRepository.consume(tx, active.id))) {
        throw new AppError('This code has already been used. Request a new one.', 400);
      }
      await tx.run("DELETE FROM auth_accounts WHERE user_id = ? AND provider = 'phone'", [userId]);
      await AuthAccountRepository.insert(tx, { userId, provider: 'phone', providerAccountId: phone });
    });
  }

  /**
   * Checks the code. A known number signs in; a new number must also send a name and a date of
   * birth (18+), so the first answer for it is `requiresProfile` and the code stays valid for the
   * follow-up request, as with Google sign-up.
   */
  static async verify(input: PhoneVerifyInput, beforeCreate?: () => Promise<void>): Promise<PhoneAuthResult> {
    const { phone } = input;
    const active = await PhoneAuthService.checkCode(phone, input.code);

    const db = getDatabase();
    const linked = await AuthAccountRepository.findUser('phone', phone);
    if (linked) {
      if (!linked.is_active) throw new AppError('Your account has been deactivated', 403);
      if (!(await PhoneCodeRepository.consume(db, active.id))) {
        throw new AppError('This code has already been used. Request a new one.', 400);
      }
      return { requiresProfile: false, isNewUser: false, userId: linked.id };
    }

    await beforeCreate?.();
    if (!input.displayName || !input.dateOfBirth) {
      return { requiresProfile: true };
    }
    if (!isAtLeast18YearsOld(input.dateOfBirth)) {
      throw new AppError('You must be at least 18 years of age to join Unmute', 400);
    }

    const userId = await db.transaction(async (tx) => {
      if (!(await PhoneCodeRepository.consume(tx, active.id))) {
        throw new AppError('This code has already been used. Request a new one.', 400);
      }
      const id = await UserRepository.insert(tx, null);
      await ProfileRepository.insert(tx, { userId: id, displayName: input.displayName!, dateOfBirth: input.dateOfBirth! });
      await AuthAccountRepository.insert(tx, { userId: id, provider: 'phone', providerAccountId: phone });
      return id;
    });
    console.info(`[Auth] Created account ${userId} via phone`);
    return { requiresProfile: false, isNewUser: true, userId };
  }
}
