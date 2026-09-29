"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MatchingService = exports.SUPER_LIKES_PER_DAY = void 0;
const errorHandler_1 = require("../middleware/errorHandler");
const chatSocket_1 = require("../sockets/chatSocket");
const profileMapper_1 = require("../mappers/profileMapper");
const messageMapper_1 = require("../mappers/messageMapper");
const interactionRepository_1 = require("../repositories/interactionRepository");
const matchRepository_1 = require("../repositories/matchRepository");
const messageRepository_1 = require("../repositories/messageRepository");
const profileRepository_1 = require("../repositories/profileRepository");
const interestRepository_1 = require("../repositories/interestRepository");
const userGuards_1 = require("./userGuards");
const notificationService_1 = require("./notificationService");
const userLocationRepository_1 = require("../repositories/userLocationRepository");
const distance_service_1 = require("./location/distance.service");
/** Super Likes each member can send per 24 hours. */
exports.SUPER_LIKES_PER_DAY = 5;
class MatchingService {
    static async recordLike(likerId, likeeId, superLike = false) {
        if (likerId === likeeId) {
            throw new errorHandler_1.AppError('Cannot like yourself', 400);
        }
        await (0, userGuards_1.assertInteractable)(likerId, likeeId);
        const newSuper = superLike && !(await interactionRepository_1.InteractionRepository.isSuperLike(likerId, likeeId));
        if (newSuper) {
            const dayAgo = new Date(Date.now() - 24 * 3600_000).toISOString();
            if ((await interactionRepository_1.InteractionRepository.countSuperLikesSince(likerId, dayAgo)) >= exports.SUPER_LIKES_PER_DAY) {
                throw new errorHandler_1.AppError(`You've used your ${exports.SUPER_LIKES_PER_DAY} Super Likes for today. Try again tomorrow.`, 429);
            }
        }
        // A repeated like changes nothing and notifies no one again (upgrading it to a Super Like does).
        const isNewLike = !(await interactionRepository_1.InteractionRepository.hasLiked(likerId, likeeId));
        await interactionRepository_1.InteractionRepository.like(likerId, likeeId, superLike);
        // Each side's like is committed before it checks for the other's, so of two simultaneous
        // likes at least one sees the reciprocal; MatchRepository.ensure makes both succeed without duplicates.
        if (!(await interactionRepository_1.InteractionRepository.hasLiked(likeeId, likerId))) {
            if (isNewLike || newSuper)
                await notificationService_1.NotificationService.likeReceived(likeeId, likerId, superLike);
            return { matched: false };
        }
        const conversationId = await matchRepository_1.MatchRepository.ensure(likerId, likeeId);
        if (isNewLike)
            await notificationService_1.NotificationService.matched(likerId, likeeId, conversationId);
        const profiles = await profileRepository_1.ProfileRepository.findByUserIds([likerId, likeeId]);
        const liker = (0, profileMapper_1.toPublicProfile)(likerId, profiles.get(likerId));
        (0, chatSocket_1.getSocketServer)()
            ?.to(`user:${likeeId}`)
            .emit('new_match', {
            conversationId,
            matchedUser: { id: liker.id, displayName: liker.displayName, age: liker.age, avatarUrl: liker.avatarUrl },
        });
        const { isVerified: _isVerified, ...matchedUser } = (0, profileMapper_1.toPublicProfile)(likeeId, profiles.get(likeeId));
        return { matched: true, conversationId, matchedUser };
    }
    /** Rewind: takes back a pass from the last hour, so the person shows up in Discover again. */
    static async undoPass(passerId, passeeId) {
        const hourAgo = new Date(Date.now() - 3600_000).toISOString();
        if (!(await interactionRepository_1.InteractionRepository.undoPass(passerId, passeeId, hourAgo))) {
            throw new errorHandler_1.AppError('Only your passes from the last hour can be undone.', 404);
        }
        return { success: true };
    }
    static async recordPass(passerId, passeeId) {
        if (passerId === passeeId) {
            throw new errorHandler_1.AppError('Cannot pass on yourself', 400);
        }
        await (0, userGuards_1.assertInteractable)(passerId, passeeId);
        await interactionRepository_1.InteractionRepository.pass(passerId, passeeId);
        return { success: true };
    }
    static async getLikedProfiles(currentUserId) {
        const liked = await interactionRepository_1.InteractionRepository.getLikedNotMatched(currentUserId);
        if (liked.length === 0)
            return [];
        const ids = liked.map((r) => r.likee_id);
        const [profiles, interests] = await Promise.all([
            profileRepository_1.ProfileRepository.findByUserIds(ids),
            interestRepository_1.InterestRepository.forUsers(ids),
        ]);
        return liked.map((r) => ({
            ...(0, profileMapper_1.toPublicProfile)(r.likee_id, profiles.get(r.likee_id)),
            interests: (interests.get(r.likee_id) ?? []).map((i) => i.name),
            likedAt: r.created_at,
            superLike: Boolean(r.is_super),
        }));
    }
    /** Who liked you and is waiting for your answer; like them back to match. */
    static async getLikesReceived(currentUserId) {
        const likers = await interactionRepository_1.InteractionRepository.getLikersPending(currentUserId);
        if (likers.length === 0)
            return [];
        const ids = likers.map((r) => r.liker_id);
        const [profiles, interests] = await Promise.all([profileRepository_1.ProfileRepository.findByUserIds(ids), interestRepository_1.InterestRepository.forUsers(ids)]);
        return likers.map((r) => ({
            ...(0, profileMapper_1.toPublicProfile)(r.liker_id, profiles.get(r.liker_id)),
            interests: (interests.get(r.liker_id) ?? []).map((i) => i.name),
            likedAt: r.created_at,
            superLike: Boolean(r.is_super),
        }));
    }
    static async getMatches(currentUserId) {
        const matches = await matchRepository_1.MatchRepository.listForUser(currentUserId);
        const otherIds = matches.map((m) => m.other_user_id);
        const [profiles, interests, lastMessages, coordinates] = await Promise.all([
            profileRepository_1.ProfileRepository.findByUserIds(otherIds),
            interestRepository_1.InterestRepository.forUsers(otherIds),
            messageRepository_1.MessageRepository.latestFor(matches.map((m) => m.conversation_id)),
            userLocationRepository_1.UserLocationRepository.coordinatesFor([currentUserId, ...otherIds]),
        ]);
        const origin = coordinates.get(currentUserId);
        // Bucketed like Discover's, never the computed figure.
        const distanceTo = (userId) => {
            const there = coordinates.get(userId);
            return origin && there ? (0, distance_service_1.distanceBucketKm)((0, distance_service_1.haversineKm)(origin, there)) : null;
        };
        return matches.map((m) => {
            const lastMessage = lastMessages.get(m.conversation_id);
            return {
                matchId: m.match_id,
                conversationId: m.conversation_id,
                createdAt: m.created_at,
                lastMessageAt: m.last_message_at,
                lastMessage: lastMessage ? (0, messageMapper_1.toMessage)(lastMessage) : null,
                user: {
                    ...(0, profileMapper_1.toPublicProfile)(m.other_user_id, profiles.get(m.other_user_id)),
                    interests: (interests.get(m.other_user_id) ?? []).map((i) => i.name),
                    distanceKm: distanceTo(m.other_user_id),
                },
            };
        });
    }
}
exports.MatchingService = MatchingService;
