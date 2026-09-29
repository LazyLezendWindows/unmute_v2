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
}

export type CallOutcome = 'completed' | 'missed' | 'declined';

/** API shape for every message (REST history, send responses and realtime events alike). */
export function toMessage(row: MessageRow) {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    content: row.content,
    status: row.status,
    createdAt: row.created_at,
    kind: row.kind === 'call' ? ('call' as const) : ('text' as const),
    ...(row.kind === 'call'
      ? { call: { mode: row.call_mode as 'voice' | 'video', outcome: row.call_outcome as CallOutcome, seconds: row.call_seconds ?? 0 } }
      : {}),
  };
}
