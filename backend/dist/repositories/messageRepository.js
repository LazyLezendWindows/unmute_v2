"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MessageRepository = void 0;
const crypto_1 = __importDefault(require("crypto"));
const database_1 = require("../config/database");
const sql_1 = require("./sql");
const MESSAGE_COLUMNS = 'id, conversation_id, sender_id, content, status, created_at, kind, call_mode, call_outcome, call_seconds';
class MessageRepository {
    /** A text message, or with `call` the record of a call (the caller is the sender). */
    static async insert(conversationId, senderId, content, call) {
        const row = {
            id: crypto_1.default.randomUUID(),
            conversation_id: conversationId,
            sender_id: senderId,
            content,
            status: 'sent',
            created_at: new Date().toISOString(),
            kind: call ? 'call' : 'text',
            call_mode: call?.mode ?? null,
            call_outcome: call?.outcome ?? null,
            call_seconds: call?.seconds ?? null,
        };
        await (0, database_1.getDatabase)().run(`INSERT INTO messages (${MESSAGE_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
            row.id, row.conversation_id, row.sender_id, row.content, row.status, row.created_at,
            row.kind, row.call_mode, row.call_outcome, row.call_seconds,
        ]);
        return row;
    }
    /** The newest `limit` messages (skipping `offset` newer ones), returned oldest-first for display. */
    static page(conversationId, limit, offset) {
        return (0, database_1.getDatabase)().query(`SELECT * FROM (
         SELECT ${MESSAGE_COLUMNS} FROM messages
         WHERE conversation_id = ?
         ORDER BY created_at DESC, id DESC
         LIMIT ? OFFSET ?
       ) recent
       ORDER BY created_at ASC, id ASC`, [conversationId, limit, offset]);
    }
    /** Latest message per conversation, in one query. */
    static async latestFor(conversationIds) {
        if (conversationIds.length === 0)
            return new Map();
        const rows = await (0, database_1.getDatabase)().query(`SELECT ${MESSAGE_COLUMNS} FROM (
         SELECT ${MESSAGE_COLUMNS},
                ROW_NUMBER() OVER (PARTITION BY conversation_id ORDER BY created_at DESC, id DESC) AS rn
         FROM messages
         WHERE conversation_id IN (${(0, sql_1.placeholders)(conversationIds.length)})
       ) ranked
       WHERE rn = 1`, conversationIds);
        return new Map(rows.map((r) => [r.conversation_id, r]));
    }
    /** Unread messages addressed to `readerId`, per conversation. */
    static async unreadCounts(conversationIds, readerId) {
        if (conversationIds.length === 0)
            return new Map();
        const rows = await (0, database_1.getDatabase)().query(`SELECT conversation_id, COUNT(*) AS n FROM messages
       WHERE conversation_id IN (${(0, sql_1.placeholders)(conversationIds.length)}) AND sender_id <> ? AND status <> 'read'
       GROUP BY conversation_id`, [...conversationIds, readerId]);
        return new Map(rows.map((r) => [r.conversation_id, Number(r.n)]));
    }
    static async markRead(conversationId, readerId) {
        await (0, database_1.getDatabase)().run(`UPDATE messages SET status = 'read' WHERE conversation_id = ? AND sender_id <> ? AND status <> 'read'`, [conversationId, readerId]);
    }
}
exports.MessageRepository = MessageRepository;
