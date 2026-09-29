"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SubscriptionController = void 0;
const subscriptionService_1 = require("../services/subscriptionService");
const billingService_1 = require("../services/billingService");
class SubscriptionController {
    static async status(req, res, next) {
        try {
            res.json({ success: true, data: { ...await subscriptionService_1.SubscriptionService.status(req.user.userId), plans: subscriptionService_1.PLANS, paymentsAvailable: billingService_1.BillingService.available() } });
        }
        catch (err) {
            next(err);
        }
    }
}
exports.SubscriptionController = SubscriptionController;
