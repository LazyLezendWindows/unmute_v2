"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.InteractionRepository = void 0;
const crypto_1 = __importDefault(require("crypto"));
const database_1 = require("../config/database");
const sql_1 = require("./sql");
class InteractionRepository {
    /** Idempotent: repeating a like is a no-op (unique (liker_id, likee_id)). */
    static async like(likerId, likeeId, isSuper = false) {
        await (0, database_1.getDatabase)().run(`INSERT INTO likes (id, liker_id, likee_id, created_at, is_super) VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE is_super = GREATEST(is_super, VALUES(is_super))`, [crypto_1.default.randomUUID(), likerId, likeeId, new Date().toISOString(), isSuper ? 1 : 0]);
    }
    /** Super Likes sent by `userId` since `sinceIso`. */
    static async countSuperLikesSince(userId, sinceIso) {
        const row = await (0, database_1.getDatabase)().get('SELECT COUNT(*) AS n FROM likes WHERE liker_id = ? AND is_super = 1 AND created_at > ?', [userId, sinceIso]);
        return Number(row?.n ?? 0);
    }
    static async isSuperLike(likerId, likeeId) {
        return Boolean(await (0, database_1.getDatabase)().get('SELECT id FROM likes WHERE liker_id = ? AND likee_id = ? AND is_super = 1', [likerId, likeeId]));
    }
    /** Takes back a recent pass (Rewind); false when there's none from the last hour. */
    static async undoPass(passerId, passeeId, sinceIso) {
        const { changes } = await (0, database_1.getDatabase)().run('DELETE FROM passes WHERE passer_id = ? AND passee_id = ? AND created_at > ?', [passerId, passeeId, sinceIso]);
        return changes > 0;
    }
    static async pass(passerId, passeeId) {
        await (0, database_1.getDatabase)().run('INSERT INTO passes (id, passer_id, passee_id, created_at) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE id = id', [crypto_1.default.randomUUID(), passerId, passeeId, new Date().toISOString()]);
    }
    /** How many members like `userId`, leaving out anyone blocked either way. */
    static async countLikesReceived(userId) {
        const row = await (0, database_1.getDatabase)().get(`SELECT COUNT(*) AS n FROM likes l WHERE l.likee_id = ? AND NOT ${(0, sql_1.blockedBetween)('l.likee_id', 'l.liker_id')}`, [userId]);
        return Number(row?.n ?? 0);
    }
    static async hasLiked(likerId, likeeId) {
        return Boolean(await (0, database_1.getDatabase)().get('SELECT id FROM likes WHERE liker_id = ? AND likee_id = ?', [likerId, likeeId]));
    }
    /** Profiles the user liked that haven't matched back yet (no mutual match, no block, still active). */
    static async getLikedNotMatched(userId) {
        return (0, database_1.getDatabase)().query(`SELECT l.likee_id, l.created_at, l.is_super FROM likes l
       JOIN users u ON u.id = l.likee_id AND u.is_active = 1
       WHERE l.liker_id = ?
         AND NOT EXISTS (
           SELECT 1 FROM matches m
           WHERE (m.user_a_id = l.liker_id AND m.user_b_id = l.likee_id)
              OR (m.user_a_id = l.likee_id AND m.user_b_id = l.liker_id)
         )
         AND NOT ${(0, sql_1.blockedBetween)('l.liker_id', 'l.likee_id')}
       ORDER BY l.created_at DESC`, [userId]);
    }
    /** People who liked the user and are still waiting for an answer (not liked back or passed yet). */
    static async getLikersPending(userId) {
        return (0, database_1.getDatabase)().query(`SELECT l.liker_id, l.created_at, l.is_super FROM likes l
       JOIN users u ON u.id = l.liker_id AND u.is_active = 1
       WHERE l.likee_id = ?
         AND NOT EXISTS (SELECT 1 FROM likes back WHERE back.liker_id = l.likee_id AND back.likee_id = l.liker_id)
         AND NOT EXISTS (SELECT 1 FROM passes p WHERE p.passer_id = l.likee_id AND p.passee_id = l.liker_id)
         AND NOT ${(0, sql_1.blockedBetween)('l.liker_id', 'l.likee_id')}
       -- Super Likes first, then likes from paid (Premium) members, then newest.
       ORDER BY l.is_super DESC,
                EXISTS (SELECT 1 FROM subscriptions sp WHERE sp.user_id = l.liker_id AND sp.plan_expires_at > UTC_TIMESTAMP() AND sp.plan_started_at <= UTC_TIMESTAMP()) DESC,
                l.created_at DESC`, [userId]);
    }
}
exports.InteractionRepository = InteractionRepository;
