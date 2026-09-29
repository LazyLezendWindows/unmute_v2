"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SafetyRepository = void 0;
const crypto_1 = __importDefault(require("crypto"));
const database_1 = require("../config/database");
class SafetyRepository {
    static async isBlockedBetween(userX, userY) {
        return Boolean(await (0, database_1.getDatabase)().get('SELECT id FROM blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)', [userX, userY, userY, userX]));
    }
    /** Idempotent: blocking twice keeps the original block (unique (blocker_id, blocked_id)). */
    static async block(blockerId, blockedId, reason) {
        await (0, database_1.getDatabase)().run(`INSERT INTO blocks (id, blocker_id, blocked_id, reason, created_at) VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE id = id`, [crypto_1.default.randomUUID(), blockerId, blockedId, reason, new Date().toISOString()]);
    }
    static async unblock(blockerId, blockedId) {
        await (0, database_1.getDatabase)().run('DELETE FROM blocks WHERE blocker_id = ? AND blocked_id = ?', [blockerId, blockedId]);
    }
    static listBlockedBy(blockerId) {
        return (0, database_1.getDatabase)().query(`SELECT b.id, b.blocked_id, b.reason, b.created_at, p.display_name, p.date_of_birth, p.avatar_url
       FROM blocks b
       JOIN profiles p ON p.user_id = b.blocked_id
       WHERE b.blocker_id = ?
       ORDER BY b.created_at DESC`, [blockerId]);
    }
    static async insertReport(report) {
        const id = crypto_1.default.randomUUID();
        await (0, database_1.getDatabase)().run(`INSERT INTO reports (id, reporter_id, reported_id, reason_category, details, status, created_at)
       VALUES (?, ?, ?, ?, ?, 'pending', ?)`, [id, report.reporterId, report.reportedId, report.category, report.details, new Date().toISOString()]);
        return id;
    }
}
exports.SafetyRepository = SafetyRepository;
