"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SafetyService = void 0;
const errorHandler_1 = require("../middleware/errorHandler");
const age_1 = require("../utils/age");
const chatSocket_1 = require("../sockets/chatSocket");
const safetyRepository_1 = require("../repositories/safetyRepository");
const conversationRepository_1 = require("../repositories/conversationRepository");
const userGuards_1 = require("./userGuards");
/**
 * A block ends realtime delivery immediately: both users' live sockets leave every conversation
 * room they share, so nothing already subscribed keeps flowing (REST sends are refused separately).
 */
async function evictFromSharedConversations(userX, userY) {
    const io = (0, chatSocket_1.getSocketServer)();
    if (!io)
        return;
    for (const id of await conversationRepository_1.ConversationRepository.idsBetween(userX, userY)) {
        io.in([`user:${userX}`, `user:${userY}`]).socketsLeave(`conversation:${id}`);
    }
}
class SafetyService {
    static async blockUser(blockerId, blockedId, reason = '') {
        if (blockerId === blockedId) {
            throw new errorHandler_1.AppError('Cannot block yourself', 400);
        }
        await (0, userGuards_1.assertUserExists)(blockedId);
        await safetyRepository_1.SafetyRepository.block(blockerId, blockedId, reason);
        await evictFromSharedConversations(blockerId, blockedId);
        return { success: true, message: 'User has been blocked' };
    }
    static async unblockUser(blockerId, blockedId) {
        await safetyRepository_1.SafetyRepository.unblock(blockerId, blockedId);
        return { success: true, message: 'User unblocked' };
    }
    static async getBlockedUsers(blockerId) {
        const blocks = await safetyRepository_1.SafetyRepository.listBlockedBy(blockerId);
        return blocks.map((b) => ({
            id: b.id,
            blockedId: b.blocked_id,
            reason: b.reason,
            createdAt: b.created_at,
            displayName: b.display_name,
            age: (0, age_1.calculateAge)(b.date_of_birth),
            avatarUrl: b.avatar_url,
        }));
    }
    static async reportUser(reporterId, reportedId, category, details = '') {
        if (reporterId === reportedId) {
            throw new errorHandler_1.AppError('Cannot report yourself', 400);
        }
        await (0, userGuards_1.assertUserExists)(reportedId);
        const reportId = await safetyRepository_1.SafetyRepository.insertReport({ reporterId, reportedId, category, details });
        console.info(`[Safety] Report ${reportId} filed (${category})`);
        return { success: true, message: 'Report submitted. Our safety team will review this.' };
    }
}
exports.SafetyService = SafetyService;
