"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PasswordResetService = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const database_1 = require("../config/database");
const errorHandler_1 = require("../middleware/errorHandler");
const chatSocket_1 = require("../sockets/chatSocket");
const phoneAuthService_1 = require("./phoneAuthService");
const phoneCodeRepository_1 = require("../repositories/phoneCodeRepository");
const emailCodeService_1 = require("./emailCodeService");
const emailSender_1 = require("./auth/emailSender");
const smsSender_1 = require("./auth/smsSender");
/**
 * "Forgot password": a 6-digit code goes to the account's email and, if it has one, its verified
 * phone. Either code sets a new password. Answers never say whether an email is registered.
 */
async function accountFor(email) {
    return (0, database_1.getDatabase)().get(`SELECT u.id, u.email, a.provider_account_id AS phone
     FROM users u LEFT JOIN auth_accounts a ON a.user_id = u.id AND a.provider = 'phone'
     WHERE u.email = ? AND u.is_active = 1`, [email.toLowerCase()]);
}
class PasswordResetService {
    static async start(email) {
        const account = await accountFor(email);
        if (!account)
            return {};
        let devCode;
        if ((0, emailSender_1.emailAvailable)())
            devCode = (await emailCodeService_1.EmailCodeService.send(account.email, 'reset')).devCode;
        if (account.phone) {
            const sms = await phoneAuthService_1.PhoneAuthService.start({ phone: account.phone }).catch(() => null);
            devCode ??= (0, smsSender_1.revealCodesToClient)() ? sms?.devCode : undefined;
        }
        return devCode ? { devCode } : {};
    }
    static async finish(email, code, password) {
        const account = await accountFor(email);
        if (!account)
            throw new errorHandler_1.AppError('This code has expired. Request a new one.', 400);
        const hash = await bcryptjs_1.default.hash(password, 12);
        // The code may have come by email or by SMS.
        const useCode = async (tx) => {
            try {
                await emailCodeService_1.EmailCodeService.consume(tx, account.email, 'reset', code);
                await tx.run('UPDATE users SET email_verified_at = COALESCE(email_verified_at, UTC_TIMESTAMP()) WHERE id = ?', [account.id]);
            }
            catch (emailErr) {
                if (!account.phone)
                    throw emailErr;
                const active = await phoneAuthService_1.PhoneAuthService.checkCode(account.phone, code).catch(() => {
                    throw emailErr;
                });
                if (!(await phoneCodeRepository_1.PhoneCodeRepository.consume(tx, active.id)))
                    throw new errorHandler_1.AppError('This code has already been used. Request a new one.', 400);
            }
        };
        await (0, database_1.getDatabase)().transaction(async (tx) => {
            await useCode(tx);
            const now = new Date().toISOString();
            const { changes } = await tx.run("UPDATE auth_accounts SET password_hash = ?, updated_at = ? WHERE user_id = ? AND provider = 'password'", [hash, now, account.id]);
            if (!changes) {
                await tx.run(`INSERT INTO auth_accounts (id, user_id, provider, provider_account_id, password_hash, created_at, updated_at)
           VALUES (UUID(), ?, 'password', ?, ?, ?, ?)`, [account.id, account.id, hash, now, now]);
            }
            // Anyone signed in with the old password is signed out everywhere.
            await tx.run('UPDATE sessions SET revoked_at = UTC_TIMESTAMP() WHERE user_id = ? AND revoked_at IS NULL', [account.id]);
        });
        (0, chatSocket_1.getSocketServer)()?.in(`user:${account.id}`).disconnectSockets(true);
    }
}
exports.PasswordResetService = PasswordResetService;
