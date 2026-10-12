import crypto from 'crypto';
import { getDatabase } from '../config/database';
import { MessageRow, Reaction } from '../mappers/messageMapper';
import { placeholders } from './sql';

const INSERT_COLUMNS = 'id, conversation_id, sender_id, content, status, created_at, kind, call_mode, call_outcome, call_seconds, reply_to_id';

/** A message plus a few fields of the message it replies to. */
const MESSAGE_SELECT = `m.id, m.conversation_id, m.sender_id, m.content, m.status, m.created_at, m.kind,
  m.call_mode, m.call_outcome, m.call_seconds, m.reply_to_id, m.deleted_at,
  r.sender_id AS reply_sender_id, r.kind AS reply_kind, r.content AS reply_content, r.deleted_at AS reply_deleted_at`;
const MESSAGE_FROM = 'messages m LEFT JOIN messages r ON r.id = m.reply_to_id';

export class MessageRepository {
  /** A text message, or with `call` the record of a call (the caller is the sender). */
  static async insert(
    conversationId: string,
    senderId: string,
    content: string,
    call?: { mode: string; outcome: string; seconds: number },
    kind: 'text' | 'image' | 'voice' | 'gif' = 'text',
    replyTo?: MessageRow | null
  ): Promise<MessageRow> {
    const row: MessageRow = {
      id: crypto.randomUUID(),
      conversation_id: conversationId,
      sender_id: senderId,
      content,
      status: 'sent',
      created_at: new Date().toISOString(),
      kind: call ? 'call' : kind,
      call_mode: call?.mode ?? null,
      call_outcome: call?.outcome ?? null,
      call_seconds: call?.seconds ?? null,
      reply_to_id: replyTo?.id ?? null,
      reply_sender_id: replyTo?.sender_id ?? null,
      reply_kind: replyTo?.kind ?? null,
      reply_content: replyTo?.content ?? null,
      reply_deleted_at: replyTo?.deleted_at ?? null,
      deleted_at: null,
    };
    await getDatabase().run(
      `INSERT INTO messages (${INSERT_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        row.id, row.conversation_id, row.sender_id, row.content, row.status, row.created_at,
        row.kind, row.call_mode, row.call_outcome, row.call_seconds, row.reply_to_id,
      ]
    );
    return row;
  }

  /** One message, only if it belongs to `conversationId`. */
  static findInConversation(messageId: string, conversationId: string): Promise<MessageRow | null> {
    return getDatabase().get(`SELECT ${MESSAGE_SELECT} FROM ${MESSAGE_FROM} WHERE m.id = ? AND m.conversation_id = ?`, [messageId, conversationId]);
  }

  /** The newest `limit` messages (skipping `offset` newer ones), returned oldest-first for display. */
  static page(conversationId: string, limit: number, offset: number): Promise<MessageRow[]> {
    return getDatabase().query(
      `SELECT * FROM (
         SELECT ${MESSAGE_SELECT} FROM ${MESSAGE_FROM}
         WHERE m.conversation_id = ?
         ORDER BY m.created_at DESC, m.id DESC
         LIMIT ? OFFSET ?
       ) recent
       ORDER BY created_at ASC, id ASC`,
      [conversationId, limit, offset]
    );
  }

  /** Latest message per conversation, in one query. */
  static async latestFor(conversationIds: string[]): Promise<Map<string, MessageRow>> {
    if (conversationIds.length === 0) return new Map();
    const rows = await getDatabase().query<MessageRow>(
      `SELECT ranked.* FROM (
         SELECT ${MESSAGE_SELECT},
                ROW_NUMBER() OVER (PARTITION BY m.conversation_id ORDER BY m.created_at DESC, m.id DESC) AS rn
         FROM ${MESSAGE_FROM}
         WHERE m.conversation_id IN (${placeholders(conversationIds.length)})
       ) ranked
       WHERE ranked.rn = 1`,
      conversationIds
    );
    return new Map(rows.map((r) => [r.conversation_id, r]));
  }

  /** Unread messages addressed to `readerId`, per conversation. */
  static async unreadCounts(conversationIds: string[], readerId: string): Promise<Map<string, number>> {
    if (conversationIds.length === 0) return new Map();
    const rows = await getDatabase().query<{ conversation_id: string; n: number }>(
      `SELECT conversation_id, COUNT(*) AS n FROM messages
       WHERE conversation_id IN (${placeholders(conversationIds.length)}) AND sender_id <> ? AND status <> 'read' AND deleted_at IS NULL
       GROUP BY conversation_id`,
      [...conversationIds, readerId]
    );
    return new Map(rows.map((r) => [r.conversation_id, Number(r.n)]));
  }

  static async markRead(conversationId: string, readerId: string): Promise<void> {
    await getDatabase().run(
      `UPDATE messages SET status = 'read' WHERE conversation_id = ? AND sender_id <> ? AND status <> 'read'`,
      [conversationId, readerId]
    );
  }

  /** The sender's latest text messages in a conversation from the last `minutes`, newest first (up to 5). */
  static async recentTextBySender(conversationId: string, senderId: string, minutes: number): Promise<string[]> {
    const since = new Date(Date.now() - minutes * 60_000).toISOString();
    const rows = await getDatabase().query<{ content: string }>(
      `SELECT content FROM messages
       WHERE conversation_id = ? AND sender_id = ? AND kind = 'text' AND deleted_at IS NULL AND created_at > ?
       ORDER BY created_at DESC, id DESC LIMIT 5`,
      [conversationId, senderId, since]
    );
    return rows.map((r) => r.content);
  }

  /** Unsend: the row stays (so replies and order still make sense) but its content is cleared. */
  static async softDelete(messageId: string): Promise<void> {
    const db = getDatabase();
    await db.run("UPDATE messages SET content = '', deleted_at = UTC_TIMESTAMP() WHERE id = ?", [messageId]);
    await db.run('DELETE FROM message_reactions WHERE message_id = ?', [messageId]);
  }

  /** Sets (or with `null` removes) this member's reaction to a message. */
  static async react(messageId: string, userId: string, emoji: string | null): Promise<void> {
    const db = getDatabase();
    if (emoji === null) {
      await db.run('DELETE FROM message_reactions WHERE message_id = ? AND user_id = ?', [messageId, userId]);
      return;
    }
    await db.run(
      `INSERT INTO message_reactions (message_id, user_id, emoji, created_at) VALUES (?, ?, ?, UTC_TIMESTAMP())
       ON DUPLICATE KEY UPDATE emoji = VALUES(emoji), created_at = VALUES(created_at)`,
      [messageId, userId, emoji]
    );
  }

  /** Reactions for these messages, oldest first. */
  static async reactionsFor(messageIds: string[]): Promise<Map<string, Reaction[]>> {
    const map = new Map<string, Reaction[]>();
    if (messageIds.length === 0) return map;
    const rows = await getDatabase().query<{ message_id: string; user_id: string; emoji: string }>(
      `SELECT message_id, user_id, emoji FROM message_reactions WHERE message_id IN (${placeholders(messageIds.length)}) ORDER BY created_at`,
      messageIds
    );
    for (const r of rows) map.set(r.message_id, [...(map.get(r.message_id) ?? []), { emoji: r.emoji, userId: r.user_id }]);
    return map;
  }
}
