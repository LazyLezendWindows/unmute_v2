"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DiscoverController = void 0;
const discoverService_1 = require("../services/discoverService");
class DiscoverController {
    static async getFeed(req, res, next) {
        try {
            const feed = await discoverService_1.DiscoverService.getFeed(req.user.userId, req.query);
            res.status(200).json({
                success: true,
                data: feed,
            });
        }
        catch (err) {
            next(err);
        }
    }
}
exports.DiscoverController = DiscoverController;
