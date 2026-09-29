import { Server, Socket } from 'socket.io';
import { ConversationRepository } from '../repositories/conversationRepository';
import { ChatService } from '../services/chatService';
import { PushService } from '../services/pushService';

/**
 * Call signalling. The server never touches audio or video (that flows directly between the two
 * browsers over WebRTC); it only passes these small messages between the two people in a
 * conversation, and only while neither has blocked the other. It also keeps track of each call
 * so the chat history can say "Missed video call" or "Voice call · 3:12".
 */
const SIGNAL_TYPES = ['invite', 'accept', 'decline', 'busy', 'cancel', 'end', 'offer', 'answer', 'ice', 'reaction'] as const;
type SignalType = (typeof SIGNAL_TYPES)[number];

/** SDP offers are a few KB; anything far larger is not a real signal. */
const MAX_PAYLOAD_CHARS = 20_000;
/** A call nobody answers is given up after this long, even if the caller's app vanished. */
const RING_LIMIT_MS = 60_000;

interface ActiveCall {
  callerId: string;
  calleeId: string;
  mode: 'voice' | 'video';
  answeredAt: number | null;
  ringTimer: ReturnType<typeof setTimeout>;
}

/** One call per conversation, while it rings or runs. */
const calls = new Map<string, ActiveCall>();

/** Writes the call into the chat history once, however it ended. */
function finish(conversationId: string, outcome: 'ended' | 'declined') {
  const call = calls.get(conversationId);
  if (!call) return;
  calls.delete(conversationId);
  clearTimeout(call.ringTimer);
  const answered = call.answeredAt !== null;
  ChatService.recordCall(conversationId, call.callerId, {
    mode: call.mode,
    outcome: answered ? 'completed' : outcome === 'declined' ? 'declined' : 'missed',
    seconds: answered ? Math.round((Date.now() - call.answeredAt!) / 1000) : 0,
  }).catch((err) => console.error('[Calls] Could not record call:', err));
  if (!answered) PushService.callEnded(call.calleeId, conversationId).catch(() => undefined);
}

export function registerCallSignals(io: Server, socket: Socket, userId: string): void {
  // An app opened from a "ringing" notification (or a second tab) starts ringing too.
  for (const [conversationId, call] of calls) {
    if (call.calleeId === userId && call.answeredAt === null) {
      socket.emit('call:signal', { conversationId, from: call.callerId, type: 'invite', payload: { mode: call.mode } });
    }
  }

  socket.on('call:signal', async (message: unknown) => {
    if (!message || typeof message !== 'object') return;
    const { conversationId, type, payload } = message as { conversationId?: unknown; type?: unknown; payload?: unknown };
    if (typeof conversationId !== 'string' || conversationId.length > 64) return;
    if (!SIGNAL_TYPES.includes(type as SignalType)) return;
    if (payload !== undefined && JSON.stringify(payload).length > MAX_PAYLOAD_CHARS) return;

    try {
      const conv = await ConversationRepository.findForParticipant(conversationId, userId);
      if (!conv || conv.blocked) return;
      track(conversationId, userId, conv.other_user_id, type as SignalType, payload);
      socket.to(`user:${conv.other_user_id}`).emit('call:signal', { conversationId, from: userId, type, payload });
      // Your other open tabs stop ringing once one of them answers or declines.
      if (type === 'accept' || type === 'decline') {
        socket.to(`user:${userId}`).emit('call:signal', { conversationId, from: userId, type: 'handled' });
      }
    } catch (err) {
      console.error('[Socket] call:signal failed:', err);
    }
  });

  // An app that closes mid-call (or while ringing someone) can't say goodbye; once none of this
  // member's apps are left, their calls end and the other person is told.
  socket.on('disconnect', async () => {
    const stillOpen = (await io.in(`user:${userId}`).fetchSockets()).length > 0;
    if (stillOpen) return;
    for (const [conversationId, call] of calls) {
      if (call.callerId !== userId && call.calleeId !== userId) continue;
      const other = call.callerId === userId ? call.calleeId : call.callerId;
      io.to(`user:${other}`).emit('call:signal', { conversationId, from: userId, type: 'end' });
      finish(conversationId, 'ended');
    }
  });
}

function track(conversationId: string, from: string, to: string, type: SignalType, payload: unknown) {
  const call = calls.get(conversationId);
  switch (type) {
    case 'invite': {
      if (call) finish(conversationId, 'ended');
      const mode = (payload as { mode?: string } | undefined)?.mode === 'voice' ? 'voice' : 'video';
      calls.set(conversationId, {
        callerId: from,
        calleeId: to,
        mode,
        answeredAt: null,
        ringTimer: setTimeout(() => finish(conversationId, 'ended'), RING_LIMIT_MS),
      });
      PushService.incomingCall(to, from, conversationId, mode).catch(() => undefined);
      break;
    }
    case 'accept':
      if (call && call.calleeId === from && call.answeredAt === null) {
        call.answeredAt = Date.now();
        clearTimeout(call.ringTimer);
      }
      break;
    case 'decline':
      if (call && call.calleeId === from) finish(conversationId, 'declined');
      break;
    case 'busy':
    case 'cancel':
    case 'end':
      if (call) finish(conversationId, 'ended');
      break;
  }
}

/** For tests: forget every call in progress. */
export function resetCalls() {
  for (const call of calls.values()) clearTimeout(call.ringTimer);
  calls.clear();
}
