"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdminAuthService = void 0;
exports.requireAdmin = requireAdmin;
const crypto_1 = __importDefault(require("crypto"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const cookie_1 = require("cookie");
const env_1 = require("../config/env");
const database_1 = require("../config/database");
const errorHandler_1 = require("../middleware/errorHandler");
/** Admin sessions are separate from members' and only sent to the admin API. */
const COOKIE = env_1.config.isProduction ? '__Secure-unmute_admin' : 'unmute_admin';
const COOKIE_PATH = '/api/v1/admin';
const TTL_HOURS = 12;
const hashToken = (token) => crypto_1.default.createHash('sha256').update(token).digest('hex');
// Compared against when the email is unknown, so timing doesn't reveal which admin emails exist.
const DUMMY_HASH = bcryptjs_1.default.hashSync('unmute-admin-timing', 12);
class AdminAuthService {
    static async createAdmin(email, name, password, db = (0, database_1.getDatabase)()) {
        if (password.length < 10)
            throw new errorHandler_1.AppError('Admin passwords must be at least 10 characters.', 400);
        const id = crypto_1.default.randomUUID();
        await db.run('INSERT INTO admins (id, email, name, password_hash, created_at) VALUES (?, ?, ?, ?, UTC_TIMESTAMP())', [id, email.toLowerCase(), name, await bcryptjs_1.default.hash(password, 12)]);
        return id;
    }
    static async list() {
        return (0, database_1.getDatabase)().query('SELECT id, email, name, created_at, last_login_at FROM admins ORDER BY created_at ASC');
    }
    /** Removes an admin (never yourself, never the last one) and ends their sessions. */
    static async remove(byAdminId, adminId) {
        if (byAdminId === adminId)
            throw new errorHandler_1.AppError('You can’t remove your own admin account.', 400);
        if ((await this.count()) <= 1)
            throw new errorHandler_1.AppError('There must always be at least one admin.', 400);
        const { changes } = await (0, database_1.getDatabase)().run('DELETE FROM admins WHERE id = ?', [adminId]);
        if (!changes)
            throw new errorHandler_1.AppError('Admin not found', 404);
    }
    // ---- First admin, from the browser ----
    // While no admin exists, the login page offers to create one. Outside development this needs a
    // one-time code printed in the server log, so whoever runs the server is the one who can claim it.
    static setupCode = null;
    static setupRequiresCode() {
        return env_1.config.env !== 'development' && env_1.config.env !== 'test';
    }
    /** Makes (and logs) a setup code when there are no admins yet; called at startup. */
    static async announceSetup() {
        if ((await this.count()) > 0)
            return;
        if (this.setupRequiresCode()) {
            this.setupCode = crypto_1.default.randomInt(0, 1_000_000_000).toString().padStart(9, '0').replace(/(\d{3})(?=\d)/g, '$1-');
            console.warn(`[Unmute] No admin yet. Open /admin to create one, using setup code: ${this.setupCode}`);
        }
        else {
            console.warn('[Unmute] No admin yet. Open /admin in the browser to create the first admin.');
        }
    }
    static async createFirstAdmin(email, name, password, code, res) {
        if (this.setupRequiresCode() && (!this.setupCode || code?.trim() !== this.setupCode)) {
            throw new errorHandler_1.AppError('That setup code isn’t right. Find it in the server log.', 403);
        }
        await (0, database_1.getDatabase)().transaction(async (tx) => {
            // Locks the table so two people can't both create "the first" admin at once.
            const row = await tx.get('SELECT COUNT(*) AS n FROM admins FOR UPDATE');
            if (Number(row?.n ?? 0) > 0)
                throw new errorHandler_1.AppError('An admin already exists. Sign in instead.', 409);
            await this.createAdmin(email, name, password, tx);
        });
        this.setupCode = null;
        return this.login(email, password, res);
    }
    static async count() {
        const row = await (0, database_1.getDatabase)().get('SELECT COUNT(*) AS n FROM admins');
        return Number(row?.n ?? 0);
    }
    static async login(email, password, res) {
        const db = (0, database_1.getDatabase)();
        const admin = await db.get('SELECT id, email, name, password_hash FROM admins WHERE email = ?', [email.toLowerCase()]);
        const ok = await bcryptjs_1.default.compare(password, admin?.password_hash || DUMMY_HASH);
        if (!admin || !ok)
            throw new errorHandler_1.AppError('Invalid admin email or password', 401);
        const token = crypto_1.default.randomBytes(32).toString('base64url');
        await db.run(`INSERT INTO admin_sessions (id, admin_id, token_hash, created_at, expires_at)
       VALUES (?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP() + INTERVAL ${TTL_HOURS} HOUR)`, [crypto_1.default.randomUUID(), admin.id, hashToken(token)]);
        await db.run('UPDATE admins SET last_login_at = UTC_TIMESTAMP() WHERE id = ?', [admin.id]);
        res.cookie(COOKIE, token, {
            httpOnly: true,
            secure: env_1.config.isProduction,
            sameSite: 'strict',
            path: COOKIE_PATH,
            maxAge: TTL_HOURS * 3600_000,
        });
        return { id: admin.id, email: admin.email, name: admin.name };
    }
    static async logout(req, res) {
        const token = (0, cookie_1.parse)(req.headers.cookie || '')[COOKIE];
        if (token)
            await (0, database_1.getDatabase)().run('UPDATE admin_sessions SET revoked_at = UTC_TIMESTAMP() WHERE token_hash = ?', [hashToken(token)]);
        res.clearCookie(COOKIE, { path: COOKIE_PATH });
    }
    static async resolve(req) {
        const token = (0, cookie_1.parse)(req.headers.cookie || '')[COOKIE];
        if (!token || token.length > 128)
            return null;
        return (0, database_1.getDatabase)().get(`SELECT a.id, a.email, a.name FROM admin_sessions s JOIN admins a ON a.id = s.admin_id
       WHERE s.token_hash = ? AND s.revoked_at IS NULL AND s.expires_at > UTC_TIMESTAMP()`, [hashToken(token)]);
    }
}
exports.AdminAuthService = AdminAuthService;
async function requireAdmin(req, res, next) {
    try {
        const admin = await AdminAuthService.resolve(req);
        if (!admin) {
            res.status(401).json({ success: false, error: 'Please sign in to the admin panel.' });
            return;
        }
        req.admin = admin;
        next();
    }
    catch (err) {
        next(err);
    }
}
