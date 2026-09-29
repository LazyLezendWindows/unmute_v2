"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.billingWebhook = billingWebhook;
const billingService_1 = require("../services/billingService");
const errorHandler_1 = require("../middleware/errorHandler");
async function billingWebhook(req, res, next) {
    try {
        if (!Buffer.isBuffer(req.body) || !(0, billingService_1.verifySignature)(req.body, req.get('x-razorpay-signature') || '', process.env.RAZORPAY_WEBHOOK_SECRET || '')) {
            throw new errorHandler_1.AppError('Invalid webhook signature.', 400);
        }
        let event;
        try {
            event = JSON.parse(req.body.toString('utf8'));
        }
        catch {
            throw new errorHandler_1.AppError('Invalid webhook payload.', 400);
        }
        if (event.event === 'payment.captured' || event.event === 'order.paid') {
            const payment = event.payload?.payment?.entity;
            if (!payment?.id || !payment?.order_id)
                throw new errorHandler_1.AppError('Missing payment.', 400);
            await billingService_1.BillingService.fulfill(payment);
        }
        res.json({ success: true });
    }
    catch (err) {
        next(err);
    }
}
