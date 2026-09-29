"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MatchController = void 0;
const matchingService_1 = require("../services/matchingService");
class MatchController {
    static async getMatches(req, res, next) {
        try {
            const matches = await matchingService_1.MatchingService.getMatches(req.user.userId);
            res.status(200).json({
                success: true,
                data: matches,
            });
        }
        catch (err) {
            next(err);
        }
    }
}
exports.MatchController = MatchController;
