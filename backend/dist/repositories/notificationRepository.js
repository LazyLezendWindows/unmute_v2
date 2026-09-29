"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationRepository = void 0;
const crypto_1 = __importDefault(require("crypto"));
const database_1 = require("../config/database");
const sql_1 = require("./sql");
const COLUMNS = 'n.id, n.type, n.actor_id, n.conversation_id, n.item_count, n.preview, n.created_at, n.read_at';
// Notifications from someone blocked either way disappear from the feed and the unread count.
const VISIBLE = `(n.actor_id IS NULL OR NOT ${(0, sql_1.blockedBetween)('n.user_id', 'n.actor_id')})`;
class NotificationRepository {
    static async insert(userId, type, fields = {}, db = (0, database_1.getDatabase)()) {
        const now = new Date().toISOString();
        const row = {
            id: crypto_1.default.randomUUID(),
            type,
            actor_id: fields.actorId ?? null,
            conversation_id: fields.conversationId ?? null,
            item_count: 1,
            preview: fields.preview ?? null,
            created_at: now,
            read_at: fields.read ? now : null,
        };
        await db.run(`INSERT INTO notifications (id, user_id, type, actor_id, conversation_id, item_count, preview, created_at, read_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [row.id, userId, type, row.actor_id, row.conversation_id, row.item_count, row.preview, row.created_at, row.read_at]);
        return row;
    }
    /** Folds a new message into the conversation's unread message notification, or starts one. */
    static async upsertMessage(userId, actorId, conversationId, preview) {
        return (0, database_1.getDatabase)().transaction(async (tx) => {
            const existing = await tx.get(`SELECT ${COLUMNS} FROM notifications n
         WHERE n.user_id = ? AND n.conversation_id = ? AND n.type = 'message' AND n.read_at IS NULL
         FOR UPDATE`, [userId, conversationId]);
            if (!existing) {
                return NotificationRepository.insert(userId, 'message', { actorId, conversationId, preview }, tx);
            }
            const now = new Date().toISOString();
            await tx.run('UPDATE notifications SET item_count = item_count + 1, preview = ?, created_at = ? WHERE id = ?', [
                preview,
                now,
                existing.id,
            ]);
            return { ...existing, item_count: existing.item_count + 1, preview, created_at: now };
        });
    }
    static listForUser(userId, limit, offset) {
        return (0, database_1.getDatabase)().query(`SELECT ${COLUMNS} FROM notifications n
       WHERE n.user_id = ? AND ${VISIBLE}
       ORDER BY n.created_at DESC
       LIMIT ? OFFSET ?`, [userId, limit, offset]);
    }
    static async unreadCount(userId) {
        const row = await (0, database_1.getDatabase)().get(`SELECT COUNT(*) AS n FROM notifications n WHERE n.user_id = ? AND n.read_at IS NULL AND ${VISIBLE}`, [userId]);
        return Number(row?.n ?? 0);
    }
    static async markRead(userId, id) {
        await (0, database_1.getDatabase)().run('UPDATE notifications SET read_at = ? WHERE id = ? AND user_id = ? AND read_at IS NULL', [
            new Date().toISOString(),
            id,
            userId,
        ]);
    }
    static async markAllRead(userId) {
        await (0, database_1.getDatabase)().run('UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL', [
            new Date().toISOString(),
            userId,
        ]);
    }
    /** Opening a conversation reads its message notification too. */
    static async markConversationRead(userId, conversationId) {
        await (0, database_1.getDatabase)().run(`UPDATE notifications SET read_at = ? WHERE user_id = ? AND conversation_id = ? AND type = 'message' AND read_at IS NULL`, [new Date().toISOString(), userId, conversationId]);
    }
    /** Once two people match, the anonymous "someone liked you" from that person is superseded. */
    static async removeLike(userId, actorId) {
        await (0, database_1.getDatabase)().run(`DELETE FROM notifications WHERE user_id = ? AND actor_id = ? AND type = 'like'`, [
            userId,
            actorId,
        ]);
    }
    static async remove(userId, id) {
        const { changes } = await (0, database_1.getDatabase)().run('DELETE FROM notifications WHERE id = ? AND user_id = ?', [id, userId]);
        return changes > 0;
    }
}
exports.NotificationRepository = NotificationRepository;
