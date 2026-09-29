import { AppError } from '../middleware/errorHandler';
import { getSocketServer } from '../sockets/chatSocket';
import { toPublicProfile } from '../mappers/profileMapper';
import { NotificationRepository, NotificationRow } from '../repositories/notificationRepository';
import { ProfileRepository } from '../repositories/profileRepository';

const PREVIEW_LENGTH = 120;

type ActorProfiles = Awaited<ReturnType<typeof ProfileRepository.findByUserIds>>;

/**
 * The client shape. A like stays anonymous until it is returned (as dating apps do), so it never
 * carries the liker; matches and messages name the other person.
 */
function toNotification(row: NotificationRow, profiles: ActorProfiles) {
  // Ordinary likes stay anonymous here; a Super Like names its sender.
  const showActor = row.actor_id && (row.type !== 'like' || row.preview === 'super');
  const actor = showActor ? toPublicProfile(row.actor_id!, profiles.get(row.actor_id!)) : null;
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

function truncate(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > PREVIEW_LENGTH ? `${flat.slice(0, PREVIEW_LENGTH - 1)}…` : flat;
}

export class NotificationService {
  static async list(userId: string, limit: number, offset: number) {
    const [rows, unreadCount] = await Promise.all([
      NotificationRepository.listForUser(userId, limit, offset),
      NotificationRepository.unreadCount(userId),
    ]);
    const actorIds = [...new Set(rows.map((r) => r.actor_id).filter((id): id is string => Boolean(id)))];
    const profiles = await ProfileRepository.findByUserIds(actorIds);
    return { items: rows.map((row) => toNotification(row, profiles)), unreadCount };
  }

  static async unreadCount(userId: string) {
    return { unreadCount: await NotificationRepository.unreadCount(userId) };
  }

  static async markRead(userId: string, id: string) {
    await NotificationRepository.markRead(userId, id);
    return this.unreadCount(userId);
  }

  static async markAllRead(userId: string) {
    await NotificationRepository.markAllRead(userId);
    return { unreadCount: 0 };
  }

  static async remove(userId: string, id: string) {
    if (!(await NotificationRepository.remove(userId, id))) {
      throw new AppError('Notification not found', 404);
    }
    return this.unreadCount(userId);
  }

  // ---- Producers (called by matching and chat); failures never break the action itself ----

  /** Ordinary likes are shown anonymously; a Super Like (preview 'super') names who sent it. */
  static async likeReceived(likeeId: string, likerId: string, superLike = false) {
    await this.deliver(likeeId, () =>
      NotificationRepository.insert(likeeId, 'like', { actorId: likerId, ...(superLike ? { preview: 'super' } : {}) })
    );
  }

  /**
   * Both people get a match entry; the one whose like made the match already sees the match
   * screen, so theirs starts read. The earlier anonymous like is replaced by the match.
   */
  static async matched(likerId: string, likeeId: string, conversationId: string) {
    await NotificationRepository.removeLike(likerId, likeeId).catch(logFailure);
    await this.deliver(likeeId, () => NotificationRepository.insert(likeeId, 'match', { actorId: likerId, conversationId }));
    await this.deliver(likerId, () =>
      NotificationRepository.insert(likerId, 'match', { actorId: likeeId, conversationId, read: true })
    );
  }

  static async messageReceived(recipientId: string, senderId: string, conversationId: string, content: string) {
    await this.deliver(recipientId, () =>
      NotificationRepository.upsertMessage(recipientId, senderId, conversationId, truncate(content))
    );
  }

  static async conversationRead(userId: string, conversationId: string) {
    await NotificationRepository.markConversationRead(userId, conversationId).catch(logFailure);
  }

  /** Stores the notification, then pushes it with the fresh unread count to the user's open apps. */
  private static async deliver(userId: string, store: () => Promise<NotificationRow>) {
    try {
      const row = await store();
      const [profiles, unreadCount] = await Promise.all([
        ProfileRepository.findByUserIds(row.actor_id ? [row.actor_id] : []),
        NotificationRepository.unreadCount(userId),
      ]);
      getSocketServer()
        ?.to(`user:${userId}`)
        .emit('notification', { notification: toNotification(row, profiles), unreadCount });
    } catch (err) {
      logFailure(err);
    }
  }
}

function logFailure(err: unknown) {
  console.error('[Notifications] Delivery failed:', err);
}
