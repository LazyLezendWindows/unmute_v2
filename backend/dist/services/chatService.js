"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatService = void 0;
const errorHandler_1 = require("../middleware/errorHandler");
const chatSocket_1 = require("../sockets/chatSocket");
const profileMapper_1 = require("../mappers/profileMapper");
const messageMapper_1 = require("../mappers/messageMapper");
const conversationRepository_1 = require("../repositories/conversationRepository");
const messageRepository_1 = require("../repositories/messageRepository");
const profileRepository_1 = require("../repositories/profileRepository");
const interestRepository_1 = require("../repositories/interestRepository");
const notificationService_1 = require("./notificationService");
const pushService_1 = require("./pushService");
const mediaService_1 = require("./mediaService");
/** 5:12, or 1:02:09 for an hour or more. */
function formatDuration(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = String(seconds % 60).padStart(2, '0');
    return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}
class ChatService {
    static async getConversations(userId) {
        const conversations = await conversationRepository_1.ConversationRepository.listForUser(userId);
        const ids = conversations.map((c) => c.id);
        const [profiles, lastMessages, unread] = await Promise.all([
            profileRepository_1.ProfileRepository.findByUserIds(conversations.map((c) => c.other_user_id)),
            messageRepository_1.MessageRepository.latestFor(ids),
            messageRepository_1.MessageRepository.unreadCounts(ids, userId),
        ]);
        return conversations.map((conv) => {
            const lastMessage = lastMessages.get(conv.id);
            const { bio: _bio, ...otherUser } = (0, profileMapper_1.toPublicProfile)(conv.other_user_id, profiles.get(conv.other_user_id));
            return {
                id: conv.id,
                matchId: conv.match_id,
                lastMessageAt: conv.last_message_at,
                lastMessage: lastMessage ? (0, messageMapper_1.toMessage)(lastMessage) : null,
                unreadCount: unread.get(conv.id) ?? 0,
                otherUser,
            };
        });
    }
    /** True if `userId` belongs to the conversation and neither participant has blocked the other. */
    static async canAccessConversation(conversationId, userId) {
        const conv = await conversationRepository_1.ConversationRepository.findForParticipant(conversationId, userId);
        return Boolean(conv && !conv.blocked);
    }
    /** Resolves a conversation the user may use, or fails without revealing whether it exists. */
    static async requireAccessible(conversationId, userId, blockedMessage) {
        const conv = await conversationRepository_1.ConversationRepository.findForParticipant(conversationId, userId);
        if (!conv) {
            throw new errorHandler_1.AppError('Conversation not found or unauthorized', 404);
        }
        if (conv.blocked) {
            throw new errorHandler_1.AppError(blockedMessage, 403);
        }
        return conv;
    }
    static async getMessages(conversationId, userId, limit = 50, offset = 0) {
        const conv = await this.requireAccessible(conversationId, userId, 'Access to this conversation is restricted');
        const [rows, profile, interests] = await Promise.all([
            messageRepository_1.MessageRepository.page(conversationId, limit, offset),
            profileRepository_1.ProfileRepository.findByUserId(conv.other_user_id),
            interestRepository_1.InterestRepository.forUser(conv.other_user_id),
        ]);
        await messageRepository_1.MessageRepository.markRead(conversationId, userId);
        await notificationService_1.NotificationService.conversationRead(userId, conversationId);
        (0, chatSocket_1.getSocketServer)()?.to(`conversation:${conversationId}`).emit('messages_read', { conversationId, readerId: userId });
        return {
            conversationId,
            otherUser: {
                ...(0, profileMapper_1.toPublicProfile)(conv.other_user_id, profile),
                interests: interests.map((i) => i.name),
            },
            messages: rows.map(messageMapper_1.toMessage),
        };
    }
    /** Adds a call to the chat history, as the caller's message; a missed call also notifies the other person. */
    static async recordCall(conversationId, callerId, call) {
        const conv = await conversationRepository_1.ConversationRepository.findForParticipant(conversationId, callerId);
        if (!conv)
            return null;
        const kind = call.mode === 'video' ? 'video call' : 'voice call';
        const content = call.outcome === 'completed'
            ? `${kind[0].toUpperCase()}${kind.slice(1)} · ${formatDuration(call.seconds)}`
            : call.outcome === 'declined'
                ? `Declined ${kind}`
                : `Missed ${kind}`;
        const message = (0, messageMapper_1.toMessage)(await messageRepository_1.MessageRepository.insert(conversationId, callerId, content, call));
        await conversationRepository_1.ConversationRepository.touch(conversationId, message.createdAt);
        const io = (0, chatSocket_1.getSocketServer)();
        if (io) {
            io.to(`conversation:${conversationId}`).emit('new_message', message);
            io.to(`user:${conv.other_user_id}`).emit('message_notification', { conversationId, message });
            io.to(`user:${callerId}`).emit('message_notification', { conversationId, message });
        }
        if (call.outcome === 'missed') {
            await notificationService_1.NotificationService.messageReceived(conv.other_user_id, callerId, conversationId, content);
        }
        return message;
    }
    static async sendMessage(conversationId, senderId, content, kind = 'text') {
        const conv = await this.requireAccessible(conversationId, senderId, 'You cannot message this user');
        if (kind !== 'text' && !mediaService_1.MediaService.isOwnUploadOfKind(content, senderId, kind)) {
            throw new errorHandler_1.AppError(kind === 'image' ? 'Upload the photo before sending it.' : 'Record the voice message before sending it.', 400);
        }
        const message = (0, messageMapper_1.toMessage)(await messageRepository_1.MessageRepository.insert(conversationId, senderId, content, undefined, kind));
        // Notifications show a label, not the file link.
        const preview = kind === 'image' ? '📷 Photo' : kind === 'voice' ? '🎤 Voice message' : content;
        await conversationRepository_1.ConversationRepository.touch(conversationId, message.createdAt);
        const io = (0, chatSocket_1.getSocketServer)();
        if (io) {
            io.to(`conversation:${conversationId}`).emit('new_message', message);
            io.to(`user:${conv.other_user_id}`).emit('message_notification', { conversationId, message });
        }
        await notificationService_1.NotificationService.messageReceived(conv.other_user_id, senderId, conversationId, preview);
        profileRepository_1.ProfileRepository.findByUserIds([senderId])
            .then((profiles) => pushService_1.PushService.message(conv.other_user_id, profiles.get(senderId)?.display_name || 'New message', conversationId, preview.slice(0, 120)))
            .catch(() => undefined);
        return message;
    }
}
exports.ChatService = ChatService;
