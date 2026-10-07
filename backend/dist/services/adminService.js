"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdminService = void 0;
const crypto_1 = __importDefault(require("crypto"));
const database_1 = require("../config/database");
const errorHandler_1 = require("../middleware/errorHandler");
const chatSocket_1 = require("../sockets/chatSocket");
const profileMapper_1 = require("../mappers/profileMapper");
const profileRepository_1 = require("../repositories/profileRepository");
const interestRepository_1 = require("../repositories/interestRepository");
const authAccountRepository_1 = require("../repositories/authAccountRepository");
const subscriptionService_1 = require("./subscriptionService");
const verificationService_1 = require("./verificationService");
const FILTERS = {
    all: '1 = 1',
    active: 'u.is_active = 1',
    disabled: 'u.is_active = 0',
    verified: 'p.is_verified = 1',
    unverified: 'COALESCE(p.is_verified, 0) = 0',
    paid: 's.plan_expires_at > UTC_TIMESTAMP() AND s.plan_started_at <= UTC_TIMESTAMP()',
    trial: '(s.plan_expires_at IS NULL OR s.plan_expires_at <= UTC_TIMESTAMP()) AND DATE_ADD(s.trial_started_at, INTERVAL 7 DAY) > UTC_TIMESTAMP()',
    reported: 'EXISTS (SELECT 1 FROM reports r WHERE r.reported_id = u.id)',
};
async function log(adminId, userId, action, detail) {
    await (0, database_1.getDatabase)().run('INSERT INTO admin_actions (id, admin_id, user_id, action, detail, created_at) VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP(3))', [crypto_1.default.randomUUID(), adminId, userId, action, detail?.slice(0, 255) ?? null]);
}
class AdminService {
    static async stats() {
        const n = async (sql) => Number((await (0, database_1.getDatabase)().get(sql))?.n ?? 0);
        const [total, active, disabled, verified, paid, newThisWeek, pendingReviews, openReports] = await Promise.all([
            n('SELECT COUNT(*) AS n FROM users'),
            n('SELECT COUNT(*) AS n FROM users WHERE is_active = 1'),
            n('SELECT COUNT(*) AS n FROM users WHERE is_active = 0'),
            n('SELECT COUNT(*) AS n FROM profiles WHERE is_verified = 1'),
            n('SELECT COUNT(*) AS n FROM subscriptions WHERE plan_expires_at > UTC_TIMESTAMP() AND plan_started_at <= UTC_TIMESTAMP()'),
            n("SELECT COUNT(*) AS n FROM users WHERE created_at > DATE_FORMAT(UTC_TIMESTAMP() - INTERVAL 7 DAY, '%Y-%m-%dT%H:%i:%s')"),
            n("SELECT COUNT(*) AS n FROM verification_requests WHERE status = 'pending'"),
            n("SELECT COUNT(*) AS n FROM reports WHERE status = 'pending'"),
        ]);
        return { total, active, disabled, verified, paid, newThisWeek, pendingReviews, openReports };
    }
    /** Every member, newest first, with search (name, email, phone) and a filter; 25 per page. */
    static async listUsers(q, filter, page) {
        const where = [FILTERS[filter] ?? FILTERS.all];
        const params = [];
        const term = q.trim();
        if (term) {
            const like = `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
            where.push(`(p.display_name LIKE ? OR u.email LIKE ? OR ph.provider_account_id LIKE ?)`);
            params.push(like, like, like);
        }
        const from = `FROM users u
      LEFT JOIN profiles p ON p.user_id = u.id
      LEFT JOIN subscriptions s ON s.user_id = u.id
      LEFT JOIN auth_accounts ph ON ph.user_id = u.id AND ph.provider = 'phone'
      WHERE ${where.join(' AND ')}`;
        const db = (0, database_1.getDatabase)();
        const size = 25;
        const [rows, count] = await Promise.all([
            db.query(`SELECT u.id, u.email, u.is_active, u.created_at, u.disabled_reason, p.display_name, p.avatar_url, p.date_of_birth, p.is_verified,
                ph.provider_account_id AS phone,
                IF(s.plan_expires_at > UTC_TIMESTAMP() AND s.plan_started_at <= UTC_TIMESTAMP(), s.plan, NULL) AS plan,
                (SELECT COUNT(*) FROM reports r WHERE r.reported_id = u.id) AS reports
         ${from} ORDER BY u.created_at DESC LIMIT ? OFFSET ?`, [...params, size, (Math.max(1, page) - 1) * size]),
            db.get(`SELECT COUNT(*) AS n ${from}`, params),
        ]);
        const age = (dob) => {
            if (!dob)
                return null;
            const d = new Date(dob);
            const now = new Date();
            return now.getFullYear() - d.getFullYear() - (now < new Date(now.getFullYear(), d.getMonth(), d.getDate()) ? 1 : 0);
        };
        return {
            total: Number(count?.n ?? 0),
            page: Math.max(1, page),
            pageSize: size,
            users: rows.map((r) => ({
                id: r.id,
                name: r.display_name || '(no profile)',
                email: r.email,
                phone: r.phone,
                avatarUrl: r.avatar_url || '',
                age: age(r.date_of_birth),
                isActive: Boolean(r.is_active),
                disabledReason: r.disabled_reason,
                isVerified: Boolean(r.is_verified),
                plan: r.plan,
                reports: Number(r.reports),
                joinedAt: r.created_at,
            })),
        };
    }
    /** Everything about one member. */
    static async userDetail(userId) {
        const db = (0, database_1.getDatabase)();
        const user = await db.get('SELECT id, email, is_active, created_at, email_verified_at, disabled_reason, disabled_at FROM users WHERE id = ?', [userId]);
        if (!user)
            throw new errorHandler_1.AppError('User not found', 404);
        const [row, interests, phone, providers, subscription, verification, reports, counts, lastSeen, actions] = await Promise.all([
            profileRepository_1.ProfileRepository.findByUserId(userId),
            interestRepository_1.InterestRepository.forUser(userId),
            authAccountRepository_1.AuthAccountRepository.phoneOf(userId),
            db.query('SELECT provider FROM auth_accounts WHERE user_id = ?', [userId]),
            subscriptionService_1.SubscriptionService.status(userId),
            verificationService_1.VerificationService.status(userId),
            db.query(`SELECT r.id, r.reason_category, r.details, r.status, r.created_at, p.display_name AS reporter_name, r.reporter_id
         FROM reports r LEFT JOIN profiles p ON p.user_id = r.reporter_id WHERE r.reported_id = ? ORDER BY r.created_at DESC LIMIT 20`, [userId]),
            db.get(`SELECT (SELECT COUNT(*) FROM matches m WHERE m.user_a_id = ? OR m.user_b_id = ?) AS matches,
                (SELECT COUNT(*) FROM likes l WHERE l.likee_id = ?) AS likes_received,
                (SELECT COUNT(*) FROM likes l WHERE l.liker_id = ?) AS likes_sent,
                (SELECT COUNT(*) FROM blocks b WHERE b.blocked_id = ?) AS blocked_by,
                (SELECT COUNT(*) FROM messages m WHERE m.sender_id = ?) AS messages_sent`, [userId, userId, userId, userId, userId, userId]),
            db.get('SELECT MAX(last_used_at) AS at FROM sessions WHERE user_id = ?', [userId]),
            db.query(`SELECT x.action, x.detail, x.created_at, a.name AS admin_name FROM admin_actions x LEFT JOIN admins a ON a.id = x.admin_id
         WHERE x.user_id = ? ORDER BY x.created_at DESC LIMIT 20`, [userId]),
        ]);
        return {
            id: user.id,
            email: user.email,
            emailVerified: Boolean(user.email_verified_at),
            phone,
            signInMethods: providers.map((p) => p.provider),
            isActive: Boolean(user.is_active),
            disabledReason: user.disabled_reason,
            disabledAt: user.disabled_at,
            joinedAt: user.created_at,
            lastActiveAt: lastSeen?.at ?? null,
            profile: row ? { ...(0, profileMapper_1.toOwnProfile)(row, interests), dateOfBirth: row.date_of_birth } : null,
            subscription,
            verification,
            counts: {
                matches: Number(counts?.matches ?? 0),
                likesReceived: Number(counts?.likes_received ?? 0),
                likesSent: Number(counts?.likes_sent ?? 0),
                blockedBy: Number(counts?.blocked_by ?? 0),
                messagesSent: Number(counts?.messages_sent ?? 0),
            },
            reports: reports.map((r) => ({
                id: r.id, category: r.reason_category, details: r.details, status: r.status, createdAt: r.created_at,
                reporter: { id: r.reporter_id, name: r.reporter_name },
            })),
            adminHistory: actions.map((a) => ({ action: a.action, detail: a.detail, at: a.created_at, admin: a.admin_name })),
        };
    }
    /** Disables (signs out everywhere, hidden from everyone) or re-enables an account. */
    static async setActive(adminId, userId, active, reason) {
        const db = (0, database_1.getDatabase)();
        const { changes } = await db.run(active
            ? 'UPDATE users SET is_active = 1, disabled_reason = NULL, disabled_at = NULL WHERE id = ?'
            : 'UPDATE users SET is_active = 0, disabled_reason = ?, disabled_at = UTC_TIMESTAMP() WHERE id = ?', active ? [userId] : [reason?.trim().slice(0, 200) || null, userId]);
        if (!changes)
            throw new errorHandler_1.AppError('User not found', 404);
        if (!active) {
            await db.run('UPDATE sessions SET revoked_at = UTC_TIMESTAMP() WHERE user_id = ? AND revoked_at IS NULL', [userId]);
            (0, chatSocket_1.getSocketServer)()?.in(`user:${userId}`).disconnectSockets(true);
        }
        await log(adminId, userId, active ? 'enabled' : 'disabled', reason);
        return this.userDetail(userId);
    }
    /** Gives or removes the verified badge; a pending selfie is marked approved along with it. */
    static async setVerified(adminId, userId, verified) {
        const db = (0, database_1.getDatabase)();
        const { changes } = await db.run('UPDATE profiles SET is_verified = ? WHERE user_id = ?', [verified ? 1 : 0, userId]);
        if (!changes)
            throw new errorHandler_1.AppError('This member has no profile yet.', 404);
        if (verified) {
            const pending = await db.query("SELECT id FROM verification_requests WHERE user_id = ? AND kind = 'selfie' AND status = 'pending'", [userId]);
            for (const p of pending)
                await verificationService_1.VerificationService.decide(adminId, p.id, true);
        }
        await log(adminId, userId, verified ? 'verified' : 'unverified');
        return this.userDetail(userId);
    }
    /** Marks a report as dealt with. */
    static async resolveReport(adminId, reportId) {
        const row = await (0, database_1.getDatabase)().get('SELECT reported_id FROM reports WHERE id = ?', [reportId]);
        if (!row)
            throw new errorHandler_1.AppError('Report not found', 404);
        await (0, database_1.getDatabase)().run("UPDATE reports SET status = 'resolved' WHERE id = ?", [reportId]);
        await log(adminId, row.reported_id, 'report_resolved', reportId);
    }
    static async logAdmin(adminId, action, detail) {
        await log(adminId, null, action, detail);
    }
    static async logDecision(adminId, requestId, approve) {
        const row = await (0, database_1.getDatabase)().get('SELECT user_id, kind FROM verification_requests WHERE id = ?', [requestId]);
        if (row)
            await log(adminId, row.user_id, `${row.kind}_${approve ? 'approved' : 'rejected'}`);
    }
}
exports.AdminService = AdminService;
