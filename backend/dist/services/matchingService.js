"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MatchingService = void 0;
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
class MatchingService {
    static async recordLike(likerId, likeeId) {
        if (likerId === likeeId) {
            throw new errorHandler_1.AppError('Cannot like yourself', 400);
        }
        await (0, userGuards_1.assertInteractable)(likerId, likeeId);
        // A repeated like changes nothing and notifies no one again.
        const isNewLike = !(await interactionRepository_1.InteractionRepository.hasLiked(likerId, likeeId));
        await interactionRepository_1.InteractionRepository.like(likerId, likeeId);
        // Each side's like is committed before it checks for the other's, so of two simultaneous
        // likes at least one sees the reciprocal; MatchRepository.ensure makes both succeed without duplicates.
        if (!(await interactionRepository_1.InteractionRepository.hasLiked(likeeId, likerId))) {
            if (isNewLike)
                await notificationService_1.NotificationService.likeReceived(likeeId, likerId);
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
    static async recordPass(passerId, passeeId) {
        if (passerId === passeeId) {
            throw new errorHandler_1.AppError('Cannot pass on yourself', 400);
        }
        await (0, userGuards_1.assertInteractable)(passerId, passeeId);
        await interactionRepository_1.InteractionRepository.pass(passerId, passeeId);
        return { success: true };
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
