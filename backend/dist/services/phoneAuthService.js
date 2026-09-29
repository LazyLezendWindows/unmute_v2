"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PhoneAuthService = exports.RESEND_AFTER_SECONDS = void 0;
const crypto_1 = __importDefault(require("crypto"));
const database_1 = require("../config/database");
const errorHandler_1 = require("../middleware/errorHandler");
const age_1 = require("../utils/age");
const userRepository_1 = require("../repositories/userRepository");
const authAccountRepository_1 = require("../repositories/authAccountRepository");
const profileRepository_1 = require("../repositories/profileRepository");
const phoneCodeRepository_1 = require("../repositories/phoneCodeRepository");
const smsSender_1 = require("./auth/smsSender");
const CODE_TTL_SECONDS = 10 * 60;
/** Wait before another code can be sent to the same number. */
exports.RESEND_AFTER_SECONDS = 30;
const MAX_CODES_PER_HOUR = 5;
/** Wrong guesses allowed per code; the code then stops working and a new one must be requested. */
const MAX_ATTEMPTS = 5;
function hashCode(phone, code) {
    return crypto_1.default.createHash('sha256').update(`${phone}:${code}`).digest('hex');
}
function sameHash(a, b) {
    return crypto_1.default.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}
class PhoneAuthService {
    /** Sends a 6-digit sign-in code to `phone` (already normalised to E.164 by the validator). */
    static async start({ phone }) {
        const recent = await phoneCodeRepository_1.PhoneCodeRepository.recent(phone, 60 * 60);
        if (recent.secondsSinceLast !== null && recent.secondsSinceLast < exports.RESEND_AFTER_SECONDS) {
            throw new errorHandler_1.AppError(`Please wait ${exports.RESEND_AFTER_SECONDS - recent.secondsSinceLast} seconds before asking for another code.`, 429);
        }
        if (recent.count >= MAX_CODES_PER_HOUR) {
            throw new errorHandler_1.AppError('Too many codes were sent to this number. Please try again in an hour.', 429);
        }
        const code = crypto_1.default.randomInt(0, 1_000_000).toString().padStart(6, '0');
        await phoneCodeRepository_1.PhoneCodeRepository.issue(phone, hashCode(phone, code), CODE_TTL_SECONDS);
        await (0, smsSender_1.sendSms)(phone, `${code} is your Unmute sign-in code. It expires in 10 minutes. Never share it with anyone.`);
        return {
            resendAfter: exports.RESEND_AFTER_SECONDS,
            expiresIn: CODE_TTL_SECONDS,
            ...((0, smsSender_1.revealCodesToClient)() ? { devCode: code } : {}),
        };
    }
    /**
     * The usable code for `phone` if `code` matches it (not yet consumed: the caller consumes it in
     * the same transaction that uses it). Wrong guesses count towards the code's lockout.
     */
    static async checkCode(phone, code) {
        const active = await phoneCodeRepository_1.PhoneCodeRepository.active(phone);
        if (!active || active.attempts >= MAX_ATTEMPTS) {
            throw new errorHandler_1.AppError('This code has expired. Request a new one.', 400);
        }
        if (!sameHash(active.code_hash, hashCode(phone, code))) {
            await phoneCodeRepository_1.PhoneCodeRepository.recordWrongGuess(active.id);
            const left = MAX_ATTEMPTS - active.attempts - 1;
            throw new errorHandler_1.AppError(left > 0 ? "That code isn't right. Check the SMS and try again." : 'Too many wrong codes. Request a new one.', 400);
        }
        return active;
    }
    /** Confirms a number for a signed-in member; it replaces any number they had and works for sign-in. */
    static async link(userId, { phone, code }) {
        const owner = await authAccountRepository_1.AuthAccountRepository.findUser('phone', phone);
        if (owner && owner.id !== userId) {
            throw new errorHandler_1.AppError('This phone number belongs to another account.', 409);
        }
        const active = await PhoneAuthService.checkCode(phone, code);
        await (0, database_1.getDatabase)().transaction(async (tx) => {
            if (!(await phoneCodeRepository_1.PhoneCodeRepository.consume(tx, active.id))) {
                throw new errorHandler_1.AppError('This code has already been used. Request a new one.', 400);
            }
            await tx.run("DELETE FROM auth_accounts WHERE user_id = ? AND provider = 'phone'", [userId]);
            await authAccountRepository_1.AuthAccountRepository.insert(tx, { userId, provider: 'phone', providerAccountId: phone });
        });
    }
    /**
     * Checks the code. A known number signs in; a new number must also send a name and a date of
     * birth (18+), so the first answer for it is `requiresProfile` and the code stays valid for the
     * follow-up request, as with Google sign-up.
     */
    static async verify(input, beforeCreate) {
        const { phone } = input;
        const active = await PhoneAuthService.checkCode(phone, input.code);
        const db = (0, database_1.getDatabase)();
        const linked = await authAccountRepository_1.AuthAccountRepository.findUser('phone', phone);
        if (linked) {
            if (!linked.is_active)
                throw new errorHandler_1.AppError('Your account has been deactivated', 403);
            if (!(await phoneCodeRepository_1.PhoneCodeRepository.consume(db, active.id))) {
                throw new errorHandler_1.AppError('This code has already been used. Request a new one.', 400);
            }
            return { requiresProfile: false, isNewUser: false, userId: linked.id };
        }
        await beforeCreate?.();
        if (!input.displayName || !input.dateOfBirth) {
            return { requiresProfile: true };
        }
        if (!(0, age_1.isAtLeast18YearsOld)(input.dateOfBirth)) {
            throw new errorHandler_1.AppError('You must be at least 18 years of age to join Unmute', 400);
        }
        const userId = await db.transaction(async (tx) => {
            if (!(await phoneCodeRepository_1.PhoneCodeRepository.consume(tx, active.id))) {
                throw new errorHandler_1.AppError('This code has already been used. Request a new one.', 400);
            }
            const id = await userRepository_1.UserRepository.insert(tx, null);
            await profileRepository_1.ProfileRepository.insert(tx, { userId: id, displayName: input.displayName, dateOfBirth: input.dateOfBirth });
            await authAccountRepository_1.AuthAccountRepository.insert(tx, { userId: id, provider: 'phone', providerAccountId: phone });
            return id;
        });
        console.info(`[Auth] Created account ${userId} via phone`);
        return { requiresProfile: false, isNewUser: true, userId };
    }
}
exports.PhoneAuthService = PhoneAuthService;
