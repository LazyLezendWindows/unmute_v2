import bcrypt from 'bcryptjs';
import { BanService } from './banService';
import { getDatabase, IDatabase } from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { isAtLeast18YearsOld } from '../utils/age';
import { toOwnProfile } from '../mappers/profileMapper';
import { UserRepository } from '../repositories/userRepository';
import { AuthAccountRepository } from '../repositories/authAccountRepository';
import { ProfileRepository } from '../repositories/profileRepository';
import { InterestRepository } from '../repositories/interestRepository';
import { verifyGoogleCredential } from './auth/googleIdentity';
import { PhoneAuthService } from './phoneAuthService';
import { PhoneCodeRepository } from '../repositories/phoneCodeRepository';
import { TotpService } from './totpService';
import { RegisterInput, LoginInput, GoogleAuthInput } from '../validators/authValidator';

export type GoogleAuthResult =
  | { requiresDob: true; profile: { email: string; displayName: string; avatarUrl: string } }
  | { requiresDob: false; isNewUser: boolean; userId: string };

async function createUserWithProfile(
  tx: IDatabase,
  input: { email: string; displayName: string; dateOfBirth: string; avatarUrl?: string }
): Promise<string> {
  const userId = await UserRepository.insert(tx, input.email);
  await ProfileRepository.insert(tx, { userId, ...input });
  return userId;
}

// Compared against when the email is unknown so response time does not reveal which emails exist.
const DUMMY_PASSWORD_HASH = bcrypt.hashSync('unmute-timing-equaliser', 12);

export class AuthService {
  /**
   * Registers an email/password account and returns the new user's ID. With a phone number, the
   * first call (no code) only checks the details and answers `requiresPhoneCode`; the client then
   * texts a code (POST /auth/phone/start) and repeats the call with it, which links the number.
   */
  static async register(input: RegisterInput, beforeCreate?: () => Promise<void>): Promise<string | { requiresPhoneCode: true }> {
    if (!isAtLeast18YearsOld(input.dateOfBirth)) {
      throw new AppError('You must be at least 18 years of age to join Unmute', 400);
    }

    const email = input.email.toLowerCase();
    const db = getDatabase();
    if (await UserRepository.findByEmail(email)) {
      throw new AppError('An account with this email address already exists', 409);
    }
    await BanService.assertAllowed({ email, phone: input.phone });

    const { phone, code } = input;
    if (phone) {
      if (await AuthAccountRepository.findUser('phone', phone)) {
        throw new AppError('This phone number is already registered. Sign in with Phone instead.', 409);
      }
      if (!code) return { requiresPhoneCode: true };
    }
    const phoneCode = phone && code ? await PhoneAuthService.checkCode(phone, code) : null;

    await beforeCreate?.();
    const passwordHash = await bcrypt.hash(input.password, 12);
    return db.transaction(async (tx) => {
      if (phoneCode && !(await PhoneCodeRepository.consume(tx, phoneCode.id))) {
        throw new AppError('This code has already been used. Request a new one.', 400);
      }
      const userId = await createUserWithProfile(tx, { email, displayName: input.displayName, dateOfBirth: input.dateOfBirth });
      await AuthAccountRepository.insert(tx, { userId, provider: 'password', passwordHash });
      if (phone) await AuthAccountRepository.insert(tx, { userId, provider: 'phone', providerAccountId: phone });
      return userId;
    });
  }

  /** Verifies email/password credentials and returns the user's ID. */
  static async login(input: LoginInput): Promise<string> {
    const user = await AuthAccountRepository.findPasswordLogin(input.email.toLowerCase());

    if (user && user.is_active && !user.password_hash) {
      throw new AppError('This account uses Google sign-in. Please continue with Google.', 400);
    }
    const passwordMatches = await bcrypt.compare(input.password, user?.password_hash || DUMMY_PASSWORD_HASH);
    if (!user || !user.is_active || !passwordMatches) {
      throw new AppError('Invalid email or password', 401);
    }
    return user.id;
  }

  /**
   * Signs in with a Google ID token. Identity comes exclusively from the verified token.
   * New users must supply a date of birth (18+); the client re-sends the same credential with it.
   */
  static async googleAuth(input: GoogleAuthInput, beforeCreate?: () => Promise<void>): Promise<GoogleAuthResult> {
    const identity = await verifyGoogleCredential(input.credential);
    const db = getDatabase();

    // 1. Returning Google user, matched by the stable Google subject.
    const linked = await AuthAccountRepository.findUser('google', identity.subject);
    if (linked) {
      if (!linked.is_active) throw new AppError('Your account has been deactivated', 403);
      await BanService.assertAllowed({ email: identity.email });
      return { requiresDob: false, isNewUser: false, userId: linked.id };
    }

    // Email-based linking and account creation rely on Google having verified the address.
    if (!identity.emailVerified) {
      throw new AppError('Your Google email address is not verified', 403);
    }

    await BanService.assertAllowed({ email: identity.email });

    // 2. Existing Unmute account with the same verified email: safely link Google to it
    // unless it is already bound to a different Google subject.
    const existing = await UserRepository.findByEmail(identity.email);
    if (existing) {
      if (!existing.is_active) throw new AppError('Your account has been deactivated', 403);
      const existingSub = await AuthAccountRepository.googleSubOf(existing.id);
      if (existingSub && existingSub !== identity.subject) {
        const isDevPlaceholder =
          existingSub === `dev-google-${identity.email}` ||
          existingSub === `google-${identity.email}`;
        if (isDevPlaceholder) {
          await AuthAccountRepository.updateGoogleSub(db, existing.id, identity.subject);
        } else {
          throw new AppError('This account is already linked to a different Google account', 409);
        }
      } else if (!existingSub) {
        await AuthAccountRepository.insert(db, { userId: existing.id, provider: 'google', providerAccountId: identity.subject });
        console.info(`[Auth] Linked Google account to existing user ${existing.id}`);
      }
      return { requiresDob: false, isNewUser: false, userId: existing.id };
    }

    await beforeCreate?.();
    // 3. New user: the 18+ policy requires a date of birth before an account is created.
    if (!input.dateOfBirth) {
      return {
        requiresDob: true,
        profile: { email: identity.email, displayName: identity.name, avatarUrl: identity.picture },
      };
    }
    if (!isAtLeast18YearsOld(input.dateOfBirth)) {
      throw new AppError('You must be at least 18 years of age to join Unmute', 400);
    }

    try {
      const userId = await db.transaction(async (tx) => {
        const id = await createUserWithProfile(tx, {
          email: identity.email,
          displayName: (identity.name || identity.email.split('@')[0]).slice(0, 50),
          dateOfBirth: input.dateOfBirth!,
          avatarUrl: identity.picture,
        });
        await AuthAccountRepository.insert(tx, { userId: id, provider: 'google', providerAccountId: identity.subject });
        return id;
      });
      console.info(`[Auth] Created account ${userId} via Google`);
      return { requiresDob: false, isNewUser: true, userId };
    } catch (err: any) {
      if (err?.code === 'ER_DUP_ENTRY') {
        throw new AppError('An account with this email address already exists', 409);
      }
      throw err;
    }
  }

  static async getCurrentUser(userId: string) {
    const user = await UserRepository.findById(userId);
    if (!user || !user.is_active) {
      throw new AppError('User not found or inactive', 404);
    }
    const [profile, interests, phone, hasPassword, twoFactorEnabled] = await Promise.all([
      ProfileRepository.findByUserId(userId),
      InterestRepository.forUser(userId),
      AuthAccountRepository.phoneOf(userId),
      AuthAccountRepository.hasPassword(userId),
      TotpService.isEnabled(userId),
    ]);
    return {
      id: user.id,
      email: user.email,
      phone,
      hasPassword,
      twoFactorEnabled,
      isPaused: Boolean(user.paused_at),
      profile: profile ? toOwnProfile(profile, interests) : null,
    };
  }
}
