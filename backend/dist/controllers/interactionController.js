"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InteractionController = void 0;
const matchingService_1 = require("../services/matchingService");
class InteractionController {
    static async like(req, res, next) {
        try {
            const { targetUserId } = req.body;
            const result = await matchingService_1.MatchingService.recordLike(req.user.userId, targetUserId);
            res.status(200).json({
                success: true,
                data: result,
            });
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
