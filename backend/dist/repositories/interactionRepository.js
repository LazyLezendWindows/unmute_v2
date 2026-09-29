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
    static async like(likerId, likeeId) {
        await (0, database_1.getDatabase)().run('INSERT INTO likes (id, liker_id, likee_id, created_at) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE id = id', [crypto_1.default.randomUUID(), likerId, likeeId, new Date().toISOString()]);
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
}
exports.InteractionRepository = InteractionRepository;
