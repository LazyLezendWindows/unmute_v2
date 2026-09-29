"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmailCodeService = void 0;
const crypto_1 = __importDefault(require("crypto"));
const database_1 = require("../config/database");
const errorHandler_1 = require("../middleware/errorHandler");
const emailSender_1 = require("./auth/emailSender");
const TTL_SECONDS = 30 * 60;
const RESEND_AFTER_SECONDS = 30;
const MAX_PER_HOUR = 5;
const MAX_ATTEMPTS = 5;
const hash = (email, purpose, code) => crypto_1.default.createHash('sha256').update(`${email}:${purpose}:${code}`).digest('hex');
/** 6-digit codes sent by email, stored only as hashes, single-use and short-lived (like SMS codes). */
class EmailCodeService {
    static async send(email, purpose) {
        const db = (0, database_1.getDatabase)();
        const recent = await db.get(`SELECT COUNT(*) AS n, TIMESTAMPDIFF(SECOND, MAX(created_at), UTC_TIMESTAMP()) AS since FROM email_codes
       WHERE email = ? AND purpose = ? AND created_at > UTC_TIMESTAMP() - INTERVAL 1 HOUR`, [email, purpose]);
        if (recent?.since !== null && recent?.since !== undefined && Number(recent.since) < RESEND_AFTER_SECONDS) {
            throw new errorHandler_1.AppError(`Please wait ${RESEND_AFTER_SECONDS - Number(recent.since)} seconds before asking for another code.`, 429);
        }
        if (Number(recent?.n ?? 0) >= MAX_PER_HOUR)
            throw new errorHandler_1.AppError('Too many codes were sent. Please try again in an hour.', 429);
        const code = crypto_1.default.randomInt(0, 1_000_000).toString().padStart(6, '0');
        await db.transaction(async (tx) => {
            await tx.run('UPDATE email_codes SET consumed_at = UTC_TIMESTAMP() WHERE email = ? AND purpose = ? AND consumed_at IS NULL', [email, purpose]);
            await tx.run(`INSERT INTO email_codes (id, email, purpose, code_hash, created_at, expires_at)
         VALUES (?, ?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP() + INTERVAL ? SECOND)`, [crypto_1.default.randomUUID(), email, purpose, hash(email, purpose, code), TTL_SECONDS]);
        });
        const subject = purpose === 'verify' ? 'Your Unmute verification code' : 'Reset your Unmute password';
        const body = purpose === 'verify'
            ? `Your Unmute email verification code is ${code}. It expires in 30 minutes.`
            : `Your Unmute password reset code is ${code}. It expires in 30 minutes. If you didn't ask for this, ignore this email; your password stays the same.`;
        await (0, emailSender_1.sendEmail)(email, subject, body);
        return (0, emailSender_1.revealEmailCodes)() ? { devCode: code } : {};
    }
    /** Checks and uses up a code inside `tx`; throws a message the member can act on. */
    static async consume(tx, email, purpose, code) {
        const row = await tx.get(`SELECT id, code_hash, attempts FROM email_codes
       WHERE email = ? AND purpose = ? AND consumed_at IS NULL AND expires_at > UTC_TIMESTAMP()
       ORDER BY created_at DESC LIMIT 1`, [email, purpose]);
        if (!row || row.attempts >= MAX_ATTEMPTS)
            throw new errorHandler_1.AppError('This code has expired. Request a new one.', 400);
        const ok = crypto_1.default.timingSafeEqual(Buffer.from(row.code_hash, 'hex'), Buffer.from(hash(email, purpose, code), 'hex'));
        if (!ok) {
            // Counted outside the transaction, so a wrong guess still counts when the caller rolls back.
            await (0, database_1.getDatabase)().run('UPDATE email_codes SET attempts = attempts + 1 WHERE id = ?', [row.id]);
            throw new errorHandler_1.AppError(row.attempts + 1 < MAX_ATTEMPTS ? "That code isn't right. Check the email and try again." : 'Too many wrong codes. Request a new one.', 400);
        }
        // Conditional, so two requests racing with the same code can't both use it.
        const { changes } = await tx.run('UPDATE email_codes SET consumed_at = UTC_TIMESTAMP() WHERE id = ? AND consumed_at IS NULL', [row.id]);
        if (!changes)
            throw new errorHandler_1.AppError('This code has already been used. Request a new one.', 400);
    }
}
exports.EmailCodeService = EmailCodeService;
