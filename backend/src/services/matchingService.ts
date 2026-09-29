import { AppError } from '../middleware/errorHandler';
import { getSocketServer } from '../sockets/chatSocket';
import { toPublicProfile } from '../mappers/profileMapper';
import { toMessage } from '../mappers/messageMapper';
import { InteractionRepository } from '../repositories/interactionRepository';
import { MatchRepository } from '../repositories/matchRepository';
import { MessageRepository } from '../repositories/messageRepository';
import { ProfileRepository } from '../repositories/profileRepository';
import { InterestRepository } from '../repositories/interestRepository';
import { assertInteractable } from './userGuards';
import { NotificationService } from './notificationService';
import { UserLocationRepository } from '../repositories/userLocationRepository';
import { distanceBucketKm, haversineKm } from './location/distance.service';

/** Super Likes each member can send per 24 hours. */
export const SUPER_LIKES_PER_DAY = 5;

export class MatchingService {
  static async recordLike(likerId: string, likeeId: string, superLike = false) {
    if (likerId === likeeId) {
      throw new AppError('Cannot like yourself', 400);
    }
    await assertInteractable(likerId, likeeId);
    const newSuper = superLike && !(await InteractionRepository.isSuperLike(likerId, likeeId));
    if (newSuper) {
      const dayAgo = new Date(Date.now() - 24 * 3600_000).toISOString();
      if ((await InteractionRepository.countSuperLikesSince(likerId, dayAgo)) >= SUPER_LIKES_PER_DAY) {
        throw new AppError(`You've used your ${SUPER_LIKES_PER_DAY} Super Likes for today. Try again tomorrow.`, 429);
      }
    }
    // A repeated like changes nothing and notifies no one again (upgrading it to a Super Like does).
    const isNewLike = !(await InteractionRepository.hasLiked(likerId, likeeId));
    await InteractionRepository.like(likerId, likeeId, superLike);

    // Each side's like is committed before it checks for the other's, so of two simultaneous
    // likes at least one sees the reciprocal; MatchRepository.ensure makes both succeed without duplicates.
    if (!(await InteractionRepository.hasLiked(likeeId, likerId))) {
      if (isNewLike || newSuper) await NotificationService.likeReceived(likeeId, likerId, superLike);
      return { matched: false };
    }

    const conversationId = await MatchRepository.ensure(likerId, likeeId);
    if (isNewLike) await NotificationService.matched(likerId, likeeId, conversationId);
    const profiles = await ProfileRepository.findByUserIds([likerId, likeeId]);

    const liker = toPublicProfile(likerId, profiles.get(likerId));
    getSocketServer()
      ?.to(`user:${likeeId}`)
      .emit('new_match', {
        conversationId,
        matchedUser: { id: liker.id, displayName: liker.displayName, age: liker.age, avatarUrl: liker.avatarUrl },
      });

    const { isVerified: _isVerified, ...matchedUser } = toPublicProfile(likeeId, profiles.get(likeeId));
    return { matched: true, conversationId, matchedUser };
  }

  /** Rewind: takes back a pass from the last hour, so the person shows up in Discover again. */
  static async undoPass(passerId: string, passeeId: string) {
    const hourAgo = new Date(Date.now() - 3600_000).toISOString();
    if (!(await InteractionRepository.undoPass(passerId, passeeId, hourAgo))) {
      throw new AppError('Only your passes from the last hour can be undone.', 404);
    }
    return { success: true };
  }

  static async recordPass(passerId: string, passeeId: string) {
    if (passerId === passeeId) {
      throw new AppError('Cannot pass on yourself', 400);
    }
    await assertInteractable(passerId, passeeId);
    await InteractionRepository.pass(passerId, passeeId);
    return { success: true };
  }

  static async getLikedProfiles(currentUserId: string) {
    const liked = await InteractionRepository.getLikedNotMatched(currentUserId);
    if (liked.length === 0) return [];
    const ids = liked.map((r) => r.likee_id);
    const [profiles, interests] = await Promise.all([
      ProfileRepository.findByUserIds(ids),
      InterestRepository.forUsers(ids),
    ]);
    return liked.map((r) => ({
      ...toPublicProfile(r.likee_id, profiles.get(r.likee_id)),
      interests: (interests.get(r.likee_id) ?? []).map((i) => i.name),
      likedAt: r.created_at,
      superLike: Boolean(r.is_super),
    }));
  }

  /** Who liked you and is waiting for your answer; like them back to match. */
  static async getLikesReceived(currentUserId: string) {
    const likers = await InteractionRepository.getLikersPending(currentUserId);
    if (likers.length === 0) return [];
    const ids = likers.map((r) => r.liker_id);
    const [profiles, interests] = await Promise.all([ProfileRepository.findByUserIds(ids), InterestRepository.forUsers(ids)]);
    return likers.map((r) => ({
      ...toPublicProfile(r.liker_id, profiles.get(r.liker_id)),
      interests: (interests.get(r.liker_id) ?? []).map((i) => i.name),
      likedAt: r.created_at,
      superLike: Boolean(r.is_super),
    }));
  }

  static async getMatches(currentUserId: string) {
    const matches = await MatchRepository.listForUser(currentUserId);
    const otherIds = matches.map((m) => m.other_user_id);
    const [profiles, interests, lastMessages, coordinates] = await Promise.all([
      ProfileRepository.findByUserIds(otherIds),
      InterestRepository.forUsers(otherIds),
      MessageRepository.latestFor(matches.map((m) => m.conversation_id)),
      UserLocationRepository.coordinatesFor([currentUserId, ...otherIds]),
    ]);
    const origin = coordinates.get(currentUserId);
    // Bucketed like Discover's, never the computed figure.
    const distanceTo = (userId: string) => {
      const there = coordinates.get(userId);
      return origin && there ? distanceBucketKm(haversineKm(origin, there)) : null;
    };

    return matches.map((m) => {
      const lastMessage = lastMessages.get(m.conversation_id);
      return {
        matchId: m.match_id,
        conversationId: m.conversation_id,
        createdAt: m.created_at,
        lastMessageAt: m.last_message_at,
        lastMessage: lastMessage ? toMessage(lastMessage) : null,
        user: {
          ...toPublicProfile(m.other_user_id, profiles.get(m.other_user_id)),
          interests: (interests.get(m.other_user_id) ?? []).map((i) => i.name),
          distanceKm: distanceTo(m.other_user_id),
        },
      };
    });
  }
}
