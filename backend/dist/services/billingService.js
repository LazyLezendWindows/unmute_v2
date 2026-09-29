"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BillingService = void 0;
exports.verifySignature = verifySignature;
const crypto_1 = __importDefault(require("crypto"));
const database_1 = require("../config/database");
const env_1 = require("../config/env");
const errorHandler_1 = require("../middleware/errorHandler");
const subscriptionService_1 = require("./subscriptionService");
function verifySignature(body, signature, secret) {
    if (!secret || !/^[a-f0-9]{64}$/.test(signature))
        return false;
    return crypto_1.default.timingSafeEqual(crypto_1.default.createHmac('sha256', secret).update(body).digest(), Buffer.from(signature, 'hex'));
}
class BillingService {
    static available() { return Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET); }
    /**
     * 'razorpay' with keys; 'test' in local development without keys (plans activate with no money
     * taken, so the flow can be tried); otherwise 'off'. Test mode never runs in production or tests.
     */
    static mode() {
        if (this.available())
            return 'razorpay';
        return env_1.config.env === 'development' ? 'test' : 'off';
    }
    /** Development-only purchase that goes through the same fulfilment as a real Razorpay payment. */
    static async testPurchase(userId, planId) {
        if (this.mode() !== 'test')
            throw new errorHandler_1.AppError('Test payments are only available in local development.', 403);
        const plan = subscriptionService_1.PLANS.find(p => p.id === planId);
        if (!plan)
            throw new errorHandler_1.AppError('Choose a valid upgrade plan.', 400);
        const orderId = `order_test${crypto_1.default.randomBytes(8).toString('hex')}`;
        await (0, database_1.getDatabase)().run('INSERT INTO billing_orders (id, user_id, plan, amount) VALUES (?, ?, ?, ?)', [orderId, userId, plan.id, plan.amount]);
        await this.fulfill({ id: `pay_test${crypto_1.default.randomBytes(8).toString('hex')}`, order_id: orderId, amount: plan.amount, currency: 'INR', status: 'captured' });
        return subscriptionService_1.SubscriptionService.status(userId);
    }
    static async request(path, body) {
        if (!this.available())
            throw new errorHandler_1.AppError('Payments are not available yet. Please try again later.', 503);
        let response;
        try {
            response = await fetch(`https://api.razorpay.com/v1/${path}`, {
                method: body ? 'POST' : 'GET',
                headers: { Authorization: `Basic ${Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString('base64')}`, 'Content-Type': 'application/json' },
                ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15000),
            });
        }
        catch {
            throw new errorHandler_1.AppError('Payment service is unavailable. Please try again.', 503);
        }
        if (!response.ok)
            throw new errorHandler_1.AppError('Payment service could not complete the request. Please try again.', 502);
        return response.json();
    }
    static async createOrder(userId, planId) {
        const plan = subscriptionService_1.PLANS.find(p => p.id === planId);
        if (!plan)
            throw new errorHandler_1.AppError('Choose a valid upgrade plan.', 400);
        const order = await this.request('orders', { amount: plan.amount, currency: 'INR', receipt: crypto_1.default.randomUUID() });
        await (0, database_1.getDatabase)().run('INSERT INTO billing_orders (id, user_id, plan, amount) VALUES (?, ?, ?, ?)', [order.id, userId, plan.id, plan.amount]);
        return { orderId: order.id, keyId: process.env.RAZORPAY_KEY_ID, amount: plan.amount, currency: 'INR', label: plan.label };
    }
    static async verify(userId, orderId, paymentId, signature) {
        const order = await (0, database_1.getDatabase)().get('SELECT * FROM billing_orders WHERE id = ? AND user_id = ?', [orderId, userId]);
        if (!order)
            throw new errorHandler_1.AppError('Payment order not found.', 404);
        if (!verifySignature(`${order.id}|${paymentId}`, signature, process.env.RAZORPAY_KEY_SECRET || ''))
            throw new errorHandler_1.AppError('Invalid payment signature.', 400);
        await this.fulfill(await this.request(`payments/${encodeURIComponent(paymentId)}`));
        return subscriptionService_1.SubscriptionService.status(userId);
    }
    static async fulfill(payment) {
        if (payment.status !== 'captured' || payment.amount_refunded)
            throw new errorHandler_1.AppError('Payment is not confirmed yet. Please check again shortly.', 409);
        await (0, database_1.getDatabase)().transaction(async (tx) => {
            const order = await tx.get('SELECT * FROM billing_orders WHERE id = ? FOR UPDATE', [payment.order_id]);
            if (!order)
                throw new errorHandler_1.AppError('Payment order not found.', 404);
            if (payment.currency !== 'INR' || Number(payment.amount) !== order.amount)
                throw new errorHandler_1.AppError('Payment amount does not match the order.', 400);
            if (order.fulfilled_at)
                return;
            const plan = subscriptionService_1.PLANS.find(p => p.id === order.plan);
            const sub = await tx.get(`SELECT TIMESTAMPDIFF(SECOND, '1970-01-01', GREATEST(UTC_TIMESTAMP(),
        DATE_ADD(trial_started_at, INTERVAL 7 DAY), COALESCE(plan_expires_at, trial_started_at))) AS start
        FROM subscriptions WHERE user_id = ? FOR UPDATE`, [order.user_id]);
            if (!sub)
                throw new errorHandler_1.AppError('Sign in again before upgrading.', 409);
            const end = (0, subscriptionService_1.planEnd)(new Date(Number(sub.start) * 1000), plan);
            await tx.run('UPDATE subscriptions SET plan = ?, plan_started_at = UTC_TIMESTAMP(), plan_expires_at = ? WHERE user_id = ?', [plan.id, end.toISOString().slice(0, 19).replace('T', ' '), order.user_id]);
            await tx.run('UPDATE billing_orders SET payment_id = ?, fulfilled_at = UTC_TIMESTAMP() WHERE id = ?', [payment.id, order.id]);
        });
    }
    // Recovers successful payments when the browser was closed before its checkout callback.
    static async reconcile(userId) {
        const pending = await (0, database_1.getDatabase)().query('SELECT * FROM billing_orders WHERE user_id = ? AND fulfilled_at IS NULL ORDER BY created_at DESC LIMIT 10', [userId]);
        for (const order of pending) {
            const result = await this.request(`orders/${encodeURIComponent(order.id)}/payments`);
            for (const payment of result.items)
                if (payment.status === 'captured' && !payment.amount_refunded)
                    await this.fulfill(payment);
        }
        return subscriptionService_1.SubscriptionService.status(userId);
    }
}
exports.BillingService = BillingService;
