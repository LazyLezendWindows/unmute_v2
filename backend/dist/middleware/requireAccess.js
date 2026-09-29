"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAccess = requireAccess;
const subscriptionService_1 = require("../services/subscriptionService");
async function requireAccess(req, _res, next) {
    try {
        await subscriptionService_1.SubscriptionService.requireAccess(req.user.userId);
        next();
    }
    catch (err) {
        next(err);
    }
}
