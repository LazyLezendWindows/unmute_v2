import { AppError } from '../middleware/errorHandler';
import { getSocketServer } from '../sockets/chatSocket';
import { toPublicProfile } from '../mappers/profileMapper';
import { CallOutcome, toMessage } from '../mappers/messageMapper';
import { ConversationRepository } from '../repositories/conversationRepository';
import { MessageRepository } from '../repositories/messageRepository';
import { ProfileRepository } from '../repositories/profileRepository';
import { InterestRepository } from '../repositories/interestRepository';
import { NotificationService } from './notificationService';
import { PushService } from './pushService';

/** 5:12, or 1:02:09 for an hour or more. */
function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = String(seconds % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

export class ChatService {
  static async getConversations(userId: string) {
    const conversations = await ConversationRepository.listForUser(userId);
    const ids = conversations.map((c) => c.id);
    const [profiles, lastMessages, unread] = await Promise.all([
      ProfileRepository.findByUserIds(conversations.map((c) => c.other_user_id)),
      MessageRepository.latestFor(ids),
      MessageRepository.unreadCounts(ids, userId),
    ]);

    return conversations.map((conv) => {
      const lastMessage = lastMessages.get(conv.id);
      const { bio: _bio, ...otherUser } = toPublicProfile(conv.other_user_id, profiles.get(conv.other_user_id));
      return {
        id: conv.id,
        matchId: conv.match_id,
        lastMessageAt: conv.last_message_at,
        lastMessage: lastMessage ? toMessage(lastMessage) : null,
        unreadCount: unread.get(conv.id) ?? 0,
        otherUser,
      };
    });
  }

  /** True if `userId` belongs to the conversation and neither participant has blocked the other. */
  static async canAccessConversation(conversationId: string, userId: string): Promise<boolean> {
    const conv = await ConversationRepository.findForParticipant(conversationId, userId);
    return Boolean(conv && !conv.blocked);
  }

  /** Resolves a conversation the user may use, or fails without revealing whether it exists. */
  private static async requireAccessible(conversationId: string, userId: string, blockedMessage: string) {
    const conv = await ConversationRepository.findForParticipant(conversationId, userId);
    if (!conv) {
      throw new AppError('Conversation not found or unauthorized', 404);
    }
    if (conv.blocked) {
      throw new AppError(blockedMessage, 403);
    }
    return conv;
  }

  static async getMessages(conversationId: string, userId: string, limit = 50, offset = 0) {
    const conv = await this.requireAccessible(conversationId, userId, 'Access to this conversation is restricted');

    const [rows, profile, interests] = await Promise.all([
      MessageRepository.page(conversationId, limit, offset),
      ProfileRepository.findByUserId(conv.other_user_id),
      InterestRepository.forUser(conv.other_user_id),
    ]);

    await MessageRepository.markRead(conversationId, userId);
    await NotificationService.conversationRead(userId, conversationId);
    getSocketServer()?.to(`conversation:${conversationId}`).emit('messages_read', { conversationId, readerId: userId });

    return {
      conversationId,
      otherUser: {
        ...toPublicProfile(conv.other_user_id, profile),
        interests: interests.map((i) => i.name),
      },
      messages: rows.map(toMessage),
    };
  }

  /** Adds a call to the chat history, as the caller's message; a missed call also notifies the other person. */
  static async recordCall(
    conversationId: string,
    callerId: string,
    call: { mode: 'voice' | 'video'; outcome: CallOutcome; seconds: number }
  ) {
    const conv = await ConversationRepository.findForParticipant(conversationId, callerId);
    if (!conv) return null;
    const kind = call.mode === 'video' ? 'video call' : 'voice call';
    const content =
      call.outcome === 'completed'
        ? `${kind[0].toUpperCase()}${kind.slice(1)} · ${formatDuration(call.seconds)}`
        : call.outcome === 'declined'
          ? `Declined ${kind}`
          : `Missed ${kind}`;
    const message = toMessage(await MessageRepository.insert(conversationId, callerId, content, call));
    await ConversationRepository.touch(conversationId, message.createdAt);
    const io = getSocketServer();
    if (io) {
      io.to(`conversation:${conversationId}`).emit('new_message', message);
      io.to(`user:${conv.other_user_id}`).emit('message_notification', { conversationId, message });
      io.to(`user:${callerId}`).emit('message_notification', { conversationId, message });
    }
    if (call.outcome === 'missed') {
      await NotificationService.messageReceived(conv.other_user_id, callerId, conversationId, content);
    }
    return message;
  }

  static async sendMessage(conversationId: string, senderId: string, content: string) {
    const conv = await this.requireAccessible(conversationId, senderId, 'You cannot message this user');

    const message = toMessage(await MessageRepository.insert(conversationId, senderId, content));
    await ConversationRepository.touch(conversationId, message.createdAt);

    const io = getSocketServer();
    if (io) {
      io.to(`conversation:${conversationId}`).emit('new_message', message);
      io.to(`user:${conv.other_user_id}`).emit('message_notification', { conversationId, message });
    }
    await NotificationService.messageReceived(conv.other_user_id, senderId, conversationId, content);
    ProfileRepository.findByUserIds([senderId])
      .then((profiles) => PushService.message(conv.other_user_id, profiles.get(senderId)?.display_name || 'New message', conversationId, content.slice(0, 120)))
      .catch(() => undefined);

    return message;
  }
}
