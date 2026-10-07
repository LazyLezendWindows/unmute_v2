export interface MessageRow {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  status: string;
  created_at: string;
  kind?: string;
  call_mode?: string | null;
  call_outcome?: string | null;
  call_seconds?: number | null;
  /** The message this one replies to, with a few of its fields (from a self-join). */
  reply_to_id?: string | null;
  reply_sender_id?: string | null;
  reply_kind?: string | null;
  reply_content?: string | null;
  reply_deleted_at?: string | null;
  /** Set once the sender unsent the message; its content is then empty. */
  deleted_at?: string | null;
}

export type CallOutcome = 'completed' | 'missed' | 'declined';
export type MessageKind = 'text' | 'call' | 'image' | 'voice' | 'gif';

/** Emoji members can react with (one per member per message). */
export const REACTION_EMOJI = ['❤️', '😂', '😮', '😢', '👍', '🔥'] as const;

export interface Reaction {
  emoji: string;
  userId: string;
}

function kindOf(kind: string | null | undefined): MessageKind {
  return (['call', 'image', 'voice', 'gif'].includes(kind ?? '') ? kind : 'text') as MessageKind;
}

/** API shape for every message (REST history, send responses and realtime events alike). */
export function toMessage(row: MessageRow, reactions: Reaction[] = []) {
  const deleted = Boolean(row.deleted_at);
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    content: deleted ? '' : row.content,
    status: row.status,
    createdAt: row.created_at,
    kind: kindOf(row.kind),
    deleted,
    reactions: deleted ? [] : reactions,
    // A short quote of the message being answered (its text, or what kind of message it was).
    replyTo:
      row.reply_to_id && row.reply_sender_id
        ? {
            id: row.reply_to_id,
            senderId: row.reply_sender_id,
            kind: kindOf(row.reply_kind),
            content: row.reply_deleted_at ? '' : kindOf(row.reply_kind) === 'text' ? String(row.reply_content ?? '').slice(0, 140) : '',
            deleted: Boolean(row.reply_deleted_at),
          }
        : null,
    ...(row.kind === 'call'
      ? { call: { mode: row.call_mode as 'voice' | 'video', outcome: row.call_outcome as CallOutcome, seconds: row.call_seconds ?? 0 } }
      : {}),
  };
}
