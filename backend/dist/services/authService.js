"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const database_1 = require("../config/database");
const errorHandler_1 = require("../middleware/errorHandler");
const age_1 = require("../utils/age");
const profileMapper_1 = require("../mappers/profileMapper");
const userRepository_1 = require("../repositories/userRepository");
const authAccountRepository_1 = require("../repositories/authAccountRepository");
const profileRepository_1 = require("../repositories/profileRepository");
const interestRepository_1 = require("../repositories/interestRepository");
const googleIdentity_1 = require("./auth/googleIdentity");
const phoneAuthService_1 = require("./phoneAuthService");
const phoneCodeRepository_1 = require("../repositories/phoneCodeRepository");
async function createUserWithProfile(tx, input) {
    const userId = await userRepository_1.UserRepository.insert(tx, input.email);
    await profileRepository_1.ProfileRepository.insert(tx, { userId, ...input });
    return userId;
}
// Compared against when the email is unknown so response time does not reveal which emails exist.
const DUMMY_PASSWORD_HASH = bcryptjs_1.default.hashSync('unmute-timing-equaliser', 12);
class AuthService {
    /**
     * Registers an email/password account and returns the new user's ID. With a phone number, the
     * first call (no code) only checks the details and answers `requiresPhoneCode`; the client then
     * texts a code (POST /auth/phone/start) and repeats the call with it, which links the number.
     */
    static async register(input, beforeCreate) {
        if (!(0, age_1.isAtLeast18YearsOld)(input.dateOfBirth)) {
            throw new errorHandler_1.AppError('You must be at least 18 years of age to join Unmute', 400);
        }
        const email = input.email.toLowerCase();
        const db = (0, database_1.getDatabase)();
        if (await userRepository_1.UserRepository.findByEmail(email)) {
            throw new errorHandler_1.AppError('An account with this email address already exists', 409);
        }
        const { phone, code } = input;
        if (phone) {
            if (await authAccountRepository_1.AuthAccountRepository.findUser('phone', phone)) {
                throw new errorHandler_1.AppError('This phone number is already registered. Sign in with Phone instead.', 409);
            }
            if (!code)
                return { requiresPhoneCode: true };
        }
        const phoneCode = phone && code ? await phoneAuthService_1.PhoneAuthService.checkCode(phone, code) : null;
        await beforeCreate?.();
        const passwordHash = await bcryptjs_1.default.hash(input.password, 12);
        return db.transaction(async (tx) => {
            if (phoneCode && !(await phoneCodeRepository_1.PhoneCodeRepository.consume(tx, phoneCode.id))) {
                throw new errorHandler_1.AppError('This code has already been used. Request a new one.', 400);
            }
            const userId = await createUserWithProfile(tx, { email, displayName: input.displayName, dateOfBirth: input.dateOfBirth });
            await authAccountRepository_1.AuthAccountRepository.insert(tx, { userId, provider: 'password', passwordHash });
            if (phone)
                await authAccountRepository_1.AuthAccountRepository.insert(tx, { userId, provider: 'phone', providerAccountId: phone });
            return userId;
        });
    }
    /** Verifies email/password credentials and returns the user's ID. */
    static async login(input) {
        const user = await authAccountRepository_1.AuthAccountRepository.findPasswordLogin(input.email.toLowerCase());
        if (user && user.is_active && !user.password_hash) {
            throw new errorHandler_1.AppError('This account uses Google sign-in. Please continue with Google.', 400);
        }
        const passwordMatches = await bcryptjs_1.default.compare(input.password, user?.password_hash || DUMMY_PASSWORD_HASH);
        if (!user || !user.is_active || !passwordMatches) {
            throw new errorHandler_1.AppError('Invalid email or password', 401);
        }
        return user.id;
    }
    /**
     * Signs in with a Google ID token. Identity comes exclusively from the verified token.
     * New users must supply a date of birth (18+); the client re-sends the same credential with it.
     */
    static async googleAuth(input, beforeCreate) {
        const identity = await (0, googleIdentity_1.verifyGoogleCredential)(input.credential);
        const db = (0, database_1.getDatabase)();
        // 1. Returning Google user, matched by the stable Google subject.
        const linked = await authAccountRepository_1.AuthAccountRepository.findUser('google', identity.subject);
        if (linked) {
            if (!linked.is_active)
                throw new errorHandler_1.AppError('Your account has been deactivated', 403);
            return { requiresDob: false, isNewUser: false, userId: linked.id };
        }
        // Email-based linking and account creation rely on Google having verified the address.
        if (!identity.emailVerified) {
            throw new errorHandler_1.AppError('Your Google email address is not verified', 403);
        }
        // 2. Existing Unmute account with the same email: link Google to it.
        const existing = await userRepository_1.UserRepository.findByEmail(identity.email);
        if (existing) {
            if (!existing.is_active)
                throw new errorHandler_1.AppError('Your account has been deactivated', 403);
            await authAccountRepository_1.AuthAccountRepository.insert(db, { userId: existing.id, provider: 'google', providerAccountId: identity.subject });
            console.info(`[Auth] Linked Google account to existing user ${existing.id}`);
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
        if (!(0, age_1.isAtLeast18YearsOld)(input.dateOfBirth)) {
            throw new errorHandler_1.AppError('You must be at least 18 years of age to join Unmute', 400);
        }
        const userId = await db.transaction(async (tx) => {
            const id = await createUserWithProfile(tx, {
                email: identity.email,
                displayName: (identity.name || identity.email.split('@')[0]).slice(0, 50),
                dateOfBirth: input.dateOfBirth,
                avatarUrl: identity.picture,
            });
            await authAccountRepository_1.AuthAccountRepository.insert(tx, { userId: id, provider: 'google', providerAccountId: identity.subject });
            return id;
        });
        console.info(`[Auth] Created account ${userId} via Google`);
        return { requiresDob: false, isNewUser: true, userId };
    }
    static async getCurrentUser(userId) {
        const user = await userRepository_1.UserRepository.findById(userId);
        if (!user || !user.is_active) {
            throw new errorHandler_1.AppError('User not found or inactive', 404);
        }
        const [profile, interests, phone] = await Promise.all([
            profileRepository_1.ProfileRepository.findByUserId(userId),
            interestRepository_1.InterestRepository.forUser(userId),
            authAccountRepository_1.AuthAccountRepository.phoneOf(userId),
        ]);
        return {
            id: user.id,
            email: user.email,
            phone,
            profile: profile ? (0, profileMapper_1.toOwnProfile)(profile, interests) : null,
        };
    }
}
exports.AuthService = AuthService;
