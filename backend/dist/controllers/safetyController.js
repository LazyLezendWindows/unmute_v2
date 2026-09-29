"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SafetyController = void 0;
const safetyService_1 = require("../services/safetyService");
class SafetyController {
    static async blockUser(req, res, next) {
        try {
            const { targetUserId, reason } = req.body;
            const result = await safetyService_1.SafetyService.blockUser(req.user.userId, targetUserId, reason);
            res.status(200).json({
                success: true,
                data: result,
            });
        }
        catch (err) {
            next(err);
        }
    }
    static async unblockUser(req, res, next) {
        try {
            const { targetUserId } = req.body;
            const result = await safetyService_1.SafetyService.unblockUser(req.user.userId, targetUserId);
            res.status(200).json({
                success: true,
                data: result,
            });
        }
        catch (err) {
            next(err);
        }
    }
    static async getBlockedUsers(req, res, next) {
        try {
            const result = await safetyService_1.SafetyService.getBlockedUsers(req.user.userId);
            res.status(200).json({
                success: true,
                data: result,
            });
        }
        catch (err) {
            next(err);
        }
    }
    static async reportUser(req, res, next) {
        try {
            const { reportedUserId, category, details } = req.body;
            const result = await safetyService_1.SafetyService.reportUser(req.user.userId, reportedUserId, category, details);
            res.status(201).json({
                success: true,
                data: result,
            });
        }
        catch (err) {
            next(err);
        }
    }
}
exports.SafetyController = SafetyController;
