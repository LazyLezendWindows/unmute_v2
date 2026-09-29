"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationService = void 0;
const errorHandler_1 = require("../middleware/errorHandler");
const chatSocket_1 = require("../sockets/chatSocket");
const profileMapper_1 = require("../mappers/profileMapper");
const notificationRepository_1 = require("../repositories/notificationRepository");
const profileRepository_1 = require("../repositories/profileRepository");
const PREVIEW_LENGTH = 120;
/**
 * The client shape. A like stays anonymous until it is returned (as dating apps do), so it never
 * carries the liker; matches and messages name the other person.
 */
function toNotification(row, profiles) {
    // Ordinary likes stay anonymous here; a Super Like names its sender.
    const showActor = row.actor_id && (row.type !== 'like' || row.preview === 'super');
    const actor = showActor ? (0, profileMapper_1.toPublicProfile)(row.actor_id, profiles.get(row.actor_id)) : null;
    return {
        id: row.id,
        type: row.type,
        createdAt: row.created_at,
        read: Boolean(row.read_at),
        count: row.item_count,
        preview: row.preview,
        conversationId: row.conversation_id,
        actor: actor
            ? {
                id: actor.id,
                displayName: actor.displayName,
                age: actor.age,
                avatarUrl: actor.avatarUrl,
                isVerified: actor.isVerified,
                isOnline: actor.isOnline,
            }
            : null,
    };
}
function truncate(text) {
    const flat = text.replace(/\s+/g, ' ').trim();
    return flat.length > PREVIEW_LENGTH ? `${flat.slice(0, PREVIEW_LENGTH - 1)}…` : flat;
}
class NotificationService {
    static async list(userId, limit, offset) {
        const [rows, unreadCount] = await Promise.all([
            notificationRepository_1.NotificationRepository.listForUser(userId, limit, offset),
            notificationRepository_1.NotificationRepository.unreadCount(userId),
        ]);
        const actorIds = [...new Set(rows.map((r) => r.actor_id).filter((id) => Boolean(id)))];
        const profiles = await profileRepository_1.ProfileRepository.findByUserIds(actorIds);
        return { items: rows.map((row) => toNotification(row, profiles)), unreadCount };
    }
    static async unreadCount(userId) {
        return { unreadCount: await notificationRepository_1.NotificationRepository.unreadCount(userId) };
    }
    static async markRead(userId, id) {
        await notificationRepository_1.NotificationRepository.markRead(userId, id);
        return this.unreadCount(userId);
    }
    static async markAllRead(userId) {
        await notificationRepository_1.NotificationRepository.markAllRead(userId);
        return { unreadCount: 0 };
    }
    static async remove(userId, id) {
        if (!(await notificationRepository_1.NotificationRepository.remove(userId, id))) {
            throw new errorHandler_1.AppError('Notification not found', 404);
        }
        return this.unreadCount(userId);
    }
    // ---- Producers (called by matching and chat); failures never break the action itself ----
    /** Ordinary likes are shown anonymously; a Super Like (preview 'super') names who sent it. */
    static async likeReceived(likeeId, likerId, superLike = false) {
        await this.deliver(likeeId, () => notificationRepository_1.NotificationRepository.insert(likeeId, 'like', { actorId: likerId, ...(superLike ? { preview: 'super' } : {}) }));
    }
    /**
     * Both people get a match entry; the one whose like made the match already sees the match
     * screen, so theirs starts read. The earlier anonymous like is replaced by the match.
     */
    static async matched(likerId, likeeId, conversationId) {
        await notificationRepository_1.NotificationRepository.removeLike(likerId, likeeId).catch(logFailure);
        await this.deliver(likeeId, () => notificationRepository_1.NotificationRepository.insert(likeeId, 'match', { actorId: likerId, conversationId }));
        await this.deliver(likerId, () => notificationRepository_1.NotificationRepository.insert(likerId, 'match', { actorId: likeeId, conversationId, read: true }));
    }
    static async messageReceived(recipientId, senderId, conversationId, content) {
        await this.deliver(recipientId, () => notificationRepository_1.NotificationRepository.upsertMessage(recipientId, senderId, conversationId, truncate(content)));
    }
    static async conversationRead(userId, conversationId) {
        await notificationRepository_1.NotificationRepository.markConversationRead(userId, conversationId).catch(logFailure);
    }
    /** Stores the notification, then pushes it with the fresh unread count to the user's open apps. */
    static async deliver(userId, store) {
        try {
            const row = await store();
            const [profiles, unreadCount] = await Promise.all([
                profileRepository_1.ProfileRepository.findByUserIds(row.actor_id ? [row.actor_id] : []),
                notificationRepository_1.NotificationRepository.unreadCount(userId),
            ]);
            (0, chatSocket_1.getSocketServer)()
                ?.to(`user:${userId}`)
                .emit('notification', { notification: toNotification(row, profiles), unreadCount });
        }
        catch (err) {
            logFailure(err);
        }
    }
}
exports.NotificationService = NotificationService;
function logFailure(err) {
    console.error('[Notifications] Delivery failed:', err);
}
