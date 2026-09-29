"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InteractionController = void 0;
const matchingService_1 = require("../services/matchingService");
class InteractionController {
    static async getLiked(req, res, next) {
        try {
            const result = await matchingService_1.MatchingService.getLikedProfiles(req.user.userId);
            res.status(200).json({ success: true, data: result });
        }
        catch (err) {
            next(err);
        }
    }
    static async getLikesReceived(req, res, next) {
        try {
            res.status(200).json({ success: true, data: await matchingService_1.MatchingService.getLikesReceived(req.user.userId) });
        }
        catch (err) {
            next(err);
        }
    }
    static async like(req, res, next) {
        try {
            const { targetUserId } = req.body;
            const result = await matchingService_1.MatchingService.recordLike(req.user.userId, targetUserId, Boolean(req.body.superLike));
            res.status(200).json({
                success: true,
                data: result,
            });
        }
        catch (err) {
            next(err);
        }
    }
    static async undoPass(req, res, next) {
        try {
            res.status(200).json({ success: true, data: await matchingService_1.MatchingService.undoPass(req.user.userId, req.body.targetUserId) });
        }
        catch (err) {
            next(err);
        }
    }
    static async pass(req, res, next) {
        try {
            const { targetUserId } = req.body;
            const result = await matchingService_1.MatchingService.recordPass(req.user.userId, targetUserId);
            res.status(200).json({
                success: true,
                data: result,
            });
        }
        catch (err) {
            next(err);
        }
    }
}
exports.InteractionController = InteractionController;
