"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerCallSignals = registerCallSignals;
exports.resetCalls = resetCalls;
const conversationRepository_1 = require("../repositories/conversationRepository");
const chatService_1 = require("../services/chatService");
const pushService_1 = require("../services/pushService");
/**
 * Call signalling. The server never touches audio or video (that flows directly between the two
 * browsers over WebRTC); it only passes these small messages between the two people in a
 * conversation, and only while neither has blocked the other. It also keeps track of each call
 * so the chat history can say "Missed video call" or "Voice call · 3:12".
 */
const SIGNAL_TYPES = ['invite', 'accept', 'decline', 'busy', 'cancel', 'end', 'offer', 'answer', 'ice', 'reaction'];
/** SDP offers are a few KB; anything far larger is not a real signal. */
const MAX_PAYLOAD_CHARS = 20_000;
/** A call nobody answers is given up after this long, even if the caller's app vanished. */
const RING_LIMIT_MS = 60_000;
/** One call per conversation, while it rings or runs. */
const calls = new Map();
/** Writes the call into the chat history once, however it ended. */
function finish(conversationId, outcome) {
    const call = calls.get(conversationId);
    if (!call)
        return;
    calls.delete(conversationId);
    clearTimeout(call.ringTimer);
    const answered = call.answeredAt !== null;
    chatService_1.ChatService.recordCall(conversationId, call.callerId, {
        mode: call.mode,
        outcome: answered ? 'completed' : outcome === 'declined' ? 'declined' : 'missed',
        seconds: answered ? Math.round((Date.now() - call.answeredAt) / 1000) : 0,
    }).catch((err) => console.error('[Calls] Could not record call:', err));
    if (!answered)
        pushService_1.PushService.callEnded(call.calleeId, conversationId).catch(() => undefined);
}
function registerCallSignals(io, socket, userId) {
    // An app opened from a "ringing" notification (or a second tab) starts ringing too.
    for (const [conversationId, call] of calls) {
        if (call.calleeId === userId && call.answeredAt === null) {
            socket.emit('call:signal', { conversationId, from: call.callerId, type: 'invite', payload: { mode: call.mode } });
        }
    }
    socket.on('call:signal', async (message) => {
        if (!message || typeof message !== 'object')
            return;
        const { conversationId, type, payload } = message;
        if (typeof conversationId !== 'string' || conversationId.length > 64)
            return;
        if (!SIGNAL_TYPES.includes(type))
            return;
        if (payload !== undefined && JSON.stringify(payload).length > MAX_PAYLOAD_CHARS)
            return;
        try {
            const conv = await conversationRepository_1.ConversationRepository.findForParticipant(conversationId, userId);
            if (!conv || conv.blocked)
                return;
            track(conversationId, userId, conv.other_user_id, type, payload);
            socket.to(`user:${conv.other_user_id}`).emit('call:signal', { conversationId, from: userId, type, payload });
            // Your other open tabs stop ringing once one of them answers or declines.
            if (type === 'accept' || type === 'decline') {
                socket.to(`user:${userId}`).emit('call:signal', { conversationId, from: userId, type: 'handled' });
            }
        }
        catch (err) {
            console.error('[Socket] call:signal failed:', err);
        }
    });
    // An app that closes mid-call (or while ringing someone) can't say goodbye; once none of this
    // member's apps are left, their calls end and the other person is told.
    socket.on('disconnect', async () => {
        const stillOpen = (await io.in(`user:${userId}`).fetchSockets()).length > 0;
        if (stillOpen)
            return;
        for (const [conversationId, call] of calls) {
            if (call.callerId !== userId && call.calleeId !== userId)
                continue;
            const other = call.callerId === userId ? call.calleeId : call.callerId;
            io.to(`user:${other}`).emit('call:signal', { conversationId, from: userId, type: 'end' });
            finish(conversationId, 'ended');
        }
    });
}
function track(conversationId, from, to, type, payload) {
    const call = calls.get(conversationId);
    switch (type) {
        case 'invite': {
            if (call)
                finish(conversationId, 'ended');
            const mode = payload?.mode === 'voice' ? 'voice' : 'video';
            calls.set(conversationId, {
                callerId: from,
                calleeId: to,
                mode,
                answeredAt: null,
                ringTimer: setTimeout(() => finish(conversationId, 'ended'), RING_LIMIT_MS),
            });
            pushService_1.PushService.incomingCall(to, from, conversationId, mode).catch(() => undefined);
            break;
        }
        case 'accept':
            if (call && call.calleeId === from && call.answeredAt === null) {
                call.answeredAt = Date.now();
                clearTimeout(call.ringTimer);
            }
            break;
        case 'decline':
            if (call && call.calleeId === from)
                finish(conversationId, 'declined');
            break;
        case 'busy':
        case 'cancel':
        case 'end':
            if (call)
                finish(conversationId, 'ended');
            break;
    }
}
/** For tests: forget every call in progress. */
function resetCalls() {
    for (const call of calls.values())
        clearTimeout(call.ringTimer);
    calls.clear();
}
