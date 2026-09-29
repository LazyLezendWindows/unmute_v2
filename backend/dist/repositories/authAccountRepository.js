"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthAccountRepository = void 0;
const crypto_1 = __importDefault(require("crypto"));
const database_1 = require("../config/database");
class AuthAccountRepository {
    /** The user linked to an external identity (e.g. a Google `sub`). */
    static findUser(provider, providerAccountId) {
        return (0, database_1.getDatabase)().get(`SELECT u.id, u.is_active FROM auth_accounts a
       JOIN users u ON u.id = a.user_id
       WHERE a.provider = ? AND a.provider_account_id = ?`, [provider, providerAccountId]);
    }
    /** The phone number (E.164) a user signs in with, if any. */
    static async phoneOf(userId) {
        const row = await (0, database_1.getDatabase)().get("SELECT provider_account_id AS phone FROM auth_accounts WHERE user_id = ? AND provider = 'phone'", [userId]);
        return row?.phone ?? null;
    }
    /** Email lookup for password sign-in; password_hash is null when the account has no password. */
    static findPasswordLogin(email) {
        return (0, database_1.getDatabase)().get(`SELECT u.id, u.is_active, a.password_hash
       FROM users u
       LEFT JOIN auth_accounts a ON a.user_id = u.id AND a.provider = 'password'
       WHERE u.email = ?`, [email]);
    }
    /** Password credentials are keyed by user id so an email change never orphans them. */
    static async insert(db, account) {
        const now = new Date().toISOString();
        await db.run(`INSERT INTO auth_accounts (id, user_id, provider, provider_account_id, password_hash, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`, [
            crypto_1.default.randomUUID(),
            account.userId,
            account.provider,
            account.providerAccountId ?? account.userId,
            account.passwordHash ?? null,
            now,
            now,
        ]);
    }
}
exports.AuthAccountRepository = AuthAccountRepository;
