import crypto from 'crypto';
import { getDatabase } from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { PLANS, planEnd, SubscriptionService } from './subscriptionService';

interface Payment { id: string; order_id: string; amount: number; currency: string; status: string; amount_refunded?: number }
interface Order { id: string; user_id: string; plan: string; amount: number; fulfilled_at: unknown }

export function verifySignature(body: string | Buffer, signature: string, secret: string): boolean {
  if (!secret || !/^[a-f0-9]{64}$/.test(signature)) return false;
  return crypto.timingSafeEqual(crypto.createHmac('sha256', secret).update(body).digest(), Buffer.from(signature, 'hex'));
}

export class BillingService {
  static available() { return Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET); }

  static async request<T>(path: string, body?: object): Promise<T> {
    if (!this.available()) throw new AppError('Payments are not available yet. Please try again later.', 503);
    let response: globalThis.Response;
    try {
      response = await fetch(`https://api.razorpay.com/v1/${path}`, {
        method: body ? 'POST' : 'GET',
        headers: { Authorization: `Basic ${Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString('base64')}`, 'Content-Type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15000),
      });
    } catch { throw new AppError('Payment service is unavailable. Please try again.', 503); }
    if (!response.ok) throw new AppError('Payment service could not complete the request. Please try again.', 502);
    return response.json() as Promise<T>;
  }

  static async createOrder(userId: string, planId: string) {
    const plan = PLANS.find(p => p.id === planId);
    if (!plan) throw new AppError('Choose a valid upgrade plan.', 400);
    const order = await this.request<{ id: string }>('orders', { amount: plan.amount, currency: 'INR', receipt: crypto.randomUUID() });
    await getDatabase().run('INSERT INTO billing_orders (id, user_id, plan, amount) VALUES (?, ?, ?, ?)', [order.id, userId, plan.id, plan.amount]);
    return { orderId: order.id, keyId: process.env.RAZORPAY_KEY_ID, amount: plan.amount, currency: 'INR', label: plan.label };
  }

  static async verify(userId: string, orderId: string, paymentId: string, signature: string) {
    const order = await getDatabase().get<Order>('SELECT * FROM billing_orders WHERE id = ? AND user_id = ?', [orderId, userId]);
    if (!order) throw new AppError('Payment order not found.', 404);
    if (!verifySignature(`${order.id}|${paymentId}`, signature, process.env.RAZORPAY_KEY_SECRET || '')) throw new AppError('Invalid payment signature.', 400);
    await this.fulfill(await this.request<Payment>(`payments/${encodeURIComponent(paymentId)}`));
    return SubscriptionService.status(userId);
  }

  static async fulfill(payment: Payment) {
    if (payment.status !== 'captured' || payment.amount_refunded) throw new AppError('Payment is not confirmed yet. Please check again shortly.', 409);
    await getDatabase().transaction(async tx => {
      const order = await tx.get<Order>('SELECT * FROM billing_orders WHERE id = ? FOR UPDATE', [payment.order_id]);
      if (!order) throw new AppError('Payment order not found.', 404);
      if (payment.currency !== 'INR' || Number(payment.amount) !== order.amount) throw new AppError('Payment amount does not match the order.', 400);
      if (order.fulfilled_at) return;
      const plan = PLANS.find(p => p.id === order.plan)!;
      const sub = await tx.get<{ start: number }>(`SELECT TIMESTAMPDIFF(SECOND, '1970-01-01', GREATEST(UTC_TIMESTAMP(),
        DATE_ADD(trial_started_at, INTERVAL 7 DAY), COALESCE(plan_expires_at, trial_started_at))) AS start
        FROM subscriptions WHERE user_id = ? FOR UPDATE`, [order.user_id]);
      if (!sub) throw new AppError('Sign in again before upgrading.', 409);
      const end = planEnd(new Date(Number(sub.start) * 1000), plan);
      await tx.run('UPDATE subscriptions SET plan = ?, plan_started_at = UTC_TIMESTAMP(), plan_expires_at = ? WHERE user_id = ?',
        [plan.id, end.toISOString().slice(0, 19).replace('T', ' '), order.user_id]);
      await tx.run('UPDATE billing_orders SET payment_id = ?, fulfilled_at = UTC_TIMESTAMP() WHERE id = ?', [payment.id, order.id]);
    });
  }

  // Recovers successful payments when the browser was closed before its checkout callback.
  static async reconcile(userId: string) {
    const pending = await getDatabase().query<Order>('SELECT * FROM billing_orders WHERE user_id = ? AND fulfilled_at IS NULL ORDER BY created_at DESC LIMIT 10', [userId]);
    for (const order of pending) {
      const result = await this.request<{ items: Payment[] }>(`orders/${encodeURIComponent(order.id)}/payments`);
      for (const payment of result.items) if (payment.status === 'captured' && !payment.amount_refunded) await this.fulfill(payment);
    }
    return SubscriptionService.status(userId);
  }
}
