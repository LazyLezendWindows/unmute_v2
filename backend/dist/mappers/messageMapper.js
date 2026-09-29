"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toMessage = toMessage;
/** API shape for every message (REST history, send responses and realtime events alike). */
function toMessage(row) {
    return {
        id: row.id,
        conversationId: row.conversation_id,
        senderId: row.sender_id,
        content: row.content,
        status: row.status,
        createdAt: row.created_at,
        kind: (['call', 'image', 'voice'].includes(row.kind ?? '') ? row.kind : 'text'),
        ...(row.kind === 'call'
            ? { call: { mode: row.call_mode, outcome: row.call_outcome, seconds: row.call_seconds ?? 0 } }
            : {}),
    };
}
