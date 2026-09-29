"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionService = void 0;
const crypto_1 = __importDefault(require("crypto"));
const cookie_1 = require("cookie");
const sessionRepository_1 = require("../repositories/sessionRepository");
const env_1 = require("../config/env");
function hashToken(token) {
    return crypto_1.default.createHash('sha256').update(token).digest('hex');
}
class SessionService {
    /** Creates a session for `userId` and returns the raw token (only ever sent in the cookie). */
    static async create(userId, meta) {
        const token = crypto_1.default.randomBytes(32).toString('base64url');
        const expiresAt = new Date(Date.now() + env_1.config.session.ttlDays * 24 * 60 * 60 * 1000);
        await sessionRepository_1.SessionRepository.insert({
            userId,
            tokenHash: hashToken(token),
            ip: (meta.ip || '').slice(0, 64),
            userAgent: (meta.userAgent || '').slice(0, 255),
            ttlDays: env_1.config.session.ttlDays,
        });
        return { token, expiresAt };
    }
    /** Returns the live session for a raw token, or null if unknown, expired, revoked or the user is inactive. */
    static async resolve(token) {
        if (!token || token.length > 128)
            return null;
        const row = await sessionRepository_1.SessionRepository.findLiveByTokenHash(hashToken(token));
        if (!row)
            return null;
        await sessionRepository_1.SessionRepository.touch(row.id);
        return { sessionId: row.id, userId: row.user_id };
    }
    static async revoke(token) {
        return token ? sessionRepository_1.SessionRepository.revokeByTokenHash(hashToken(token)) : null;
    }
    static readToken(cookieHeader) {
        if (!cookieHeader)
            return undefined;
        return (0, cookie_1.parse)(cookieHeader)[env_1.config.session.cookieName];
    }
    static tokenFromRequest(req) {
        return this.readToken(req.headers.cookie);
    }
    static setCookie(res, token, expiresAt) {
        res.cookie(env_1.config.session.cookieName, token, {
            httpOnly: true,
            secure: env_1.config.session.secure,
            sameSite: env_1.config.session.sameSite,
            path: '/',
            expires: expiresAt,
        });
    }
    static clearCookie(res) {
        res.clearCookie(env_1.config.session.cookieName, {
            httpOnly: true,
            secure: env_1.config.session.secure,
            sameSite: env_1.config.session.sameSite,
            path: '/',
        });
    }
}
exports.SessionService = SessionService;
