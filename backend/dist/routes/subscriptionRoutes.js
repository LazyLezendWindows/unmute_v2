"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const zod_1 = require("zod");
const auth_1 = require("../middleware/auth");
const validate_1 = require("../middleware/validate");
const billingService_1 = require("../services/billingService");
const subscriptionController_1 = require("../controllers/subscriptionController");
const router = (0, express_1.Router)();
router.use(auth_1.requireAuth);
router.get('/', subscriptionController_1.SubscriptionController.status);
router.use((0, express_rate_limit_1.default)({ windowMs: 60000, limit: 10, standardHeaders: true, legacyHeaders: false }));
router.post('/orders', (0, validate_1.validateBody)(zod_1.z.object({ planId: zod_1.z.string().max(20) })), async (req, res, next) => {
    try {
        res.json({ success: true, data: await billingService_1.BillingService.createOrder(req.user.userId, req.body.planId) });
    }
    catch (err) {
        next(err);
    }
});
router.post('/verify', (0, validate_1.validateBody)(zod_1.z.object({
    razorpay_order_id: zod_1.z.string().regex(/^order_[a-zA-Z0-9]+$/).max(64),
    razorpay_payment_id: zod_1.z.string().regex(/^pay_[a-zA-Z0-9]+$/).max(64),
    razorpay_signature: zod_1.z.string().regex(/^[a-f0-9]{64}$/),
})), async (req, res, next) => {
    try {
        res.json({ success: true, data: await billingService_1.BillingService.verify(req.user.userId, req.body.razorpay_order_id, req.body.razorpay_payment_id, req.body.razorpay_signature) });
    }
    catch (err) {
        next(err);
    }
});
router.post('/test-purchase', (0, validate_1.validateBody)(zod_1.z.object({ planId: zod_1.z.string().max(20) })), async (req, res, next) => {
    try {
        res.json({ success: true, data: await billingService_1.BillingService.testPurchase(req.user.userId, req.body.planId) });
    }
    catch (err) {
        next(err);
    }
});
router.post('/reconcile', async (req, res, next) => {
    try {
        res.json({ success: true, data: await billingService_1.BillingService.reconcile(req.user.userId) });
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
