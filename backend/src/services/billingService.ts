import crypto from 'crypto';
import QRCode from 'qrcode';
import { getDatabase } from '../config/database';
import { config } from '../config/env';
import { AppError } from '../middleware/errorHandler';
import { freeEndSql, PLANS, planEnd, SubscriptionService } from './subscriptionService';

interface Payment { id: string; order_id: string; amount: number; currency: string; status: string; amount_refunded?: number }
interface Order { id: string; user_id: string; plan: string; amount: number; fulfilled_at: unknown }

export const DEFAULT_UPI_ID = process.env.UPI_ID || 'unmutebandari007@slc';
export const DEFAULT_UPI_PAYEE_NAME = process.env.UPI_PAYEE_NAME || 'Unmute';

let cachedQrKey = '';
let cachedQrMap: Record<string, { upiUri: string; qrCodeDataUrl: string }> | null = null;

export async function getUpiQrCodes(
  upiId = process.env.UPI_ID || DEFAULT_UPI_ID,
  payeeName = process.env.UPI_PAYEE_NAME || DEFAULT_UPI_PAYEE_NAME
) {
  const key = `${upiId}|${payeeName}`;
  if (cachedQrMap && cachedQrKey === key) {
    return { upiId, upiPayeeName: payeeName, upiQrByPlan: cachedQrMap };
  }
  const map: Record<string, { upiUri: string; qrCodeDataUrl: string }> = {};
  for (const plan of PLANS) {
    const amountRupees = (plan.amount / 100).toFixed(2);
    const note = `Unmute ${plan.label} membership`;
    const upiUri = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(payeeName)}&am=${amountRupees}&cu=INR&tn=${encodeURIComponent(note)}`;
    const qrCodeDataUrl = await QRCode.toDataURL(upiUri, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 240,
      color: { dark: '#111111', light: '#ffffff' },
    });
    map[plan.id] = { upiUri, qrCodeDataUrl };
  }
  cachedQrKey = key;
  cachedQrMap = map;
  return { upiId, upiPayeeName: payeeName, upiQrByPlan: map };
}

export function verifySignature(body: string | Buffer, signature: string, secret: string): boolean {
  if (!secret || !/^[a-f0-9]{64}$/.test(signature)) return false;
  return crypto.timingSafeEqual(crypto.createHmac('sha256', secret).update(body).digest(), Buffer.from(signature, 'hex'));
}

export class BillingService {
  static available() { return Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET); }

  /**
   * 'razorpay' with keys; 'test' in local development without keys (plans activate with no money
   * taken, so the flow can be tried); otherwise 'off'. Test mode never runs in production or tests.
   */
  static mode(): 'razorpay' | 'test' | 'off' {
    if (this.available()) return 'razorpay';
    return config.env === 'development' ? 'test' : 'off';
  }

  /** Development-only purchase that goes through the same fulfilment as a real Razorpay payment. */
  static async testPurchase(userId: string, planId: string) {
    if (this.mode() !== 'test') throw new AppError('Test payments are only available in local development.', 403);
    const plan = PLANS.find(p => p.id === planId);
    if (!plan) throw new AppError('Choose a valid upgrade plan.', 400);
    const orderId = `order_test${crypto.randomBytes(8).toString('hex')}`;
    await getDatabase().run('INSERT INTO billing_orders (id, user_id, plan, amount) VALUES (?, ?, ?, ?)', [orderId, userId, plan.id, plan.amount]);
    await this.fulfill({ id: `pay_test${crypto.randomBytes(8).toString('hex')}`, order_id: orderId, amount: plan.amount, currency: 'INR', status: 'captured' });
    return SubscriptionService.status(userId);
  }

  /** Confirms a UPI QR payment to unmutebandari007@slc using the 12-digit UPI UTR / Reference ID. */
  static async confirmUpiPayment(userId: string, planId: string, utr?: string) {
    const plan = PLANS.find(p => p.id === planId);
    if (!plan) throw new AppError('Choose a valid upgrade plan.', 400);
    const cleanUtr = (utr || '').trim().replace(/\s+/g, '');
    if (config.env !== 'development' && !/^\d{12}$/.test(cleanUtr)) {
      throw new AppError('Enter a valid 12-digit UPI UTR / Transaction Reference ID from your payment app.', 400);
    }
    const refSuffix = cleanUtr || crypto.randomBytes(6).toString('hex');
    const paymentId = `pay_upi_${refSuffix}`;
    if (cleanUtr) {
      const existing = await getDatabase().get<{ id: string }>('SELECT id FROM billing_orders WHERE payment_id = ?', [paymentId]);
      if (existing) throw new AppError('This UPI transaction reference has already been used.', 409);
    }
    const orderId = `order_upi_${crypto.randomBytes(8).toString('hex')}`;
    await getDatabase().run('INSERT INTO billing_orders (id, user_id, plan, amount) VALUES (?, ?, ?, ?)', [orderId, userId, plan.id, plan.amount]);
    await this.fulfill({ id: paymentId, order_id: orderId, amount: plan.amount, currency: 'INR', status: 'captured' });
    return SubscriptionService.status(userId);
  }

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
      // A plan starts when the free week (or any time already paid for) ends.
      const sub = await tx.get<{ start: number; hasPlan: number }>(`SELECT TIMESTAMPDIFF(SECOND, '1970-01-01', GREATEST(UTC_TIMESTAMP(),
        ${freeEndSql()}, COALESCE(plan_expires_at, trial_started_at))) AS start,
        COALESCE(plan_expires_at > UTC_TIMESTAMP(), 0) AS hasPlan
        FROM subscriptions WHERE user_id = ? FOR UPDATE`, [order.user_id]);
      if (!sub) throw new AppError('Sign in again before upgrading.', 409);
      const end = planEnd(new Date(Number(sub.start) * 1000), plan);
      const sqlTime = (d: Date) => d.toISOString().slice(0, 19).replace('T', ' ');
      // Renewing keeps the current (or already queued) plan's start; otherwise the paid period
      // starts at `start`, e.g. when the free trial ends for a purchase made during it.
      await tx.run(
        `UPDATE subscriptions SET plan = ?, plan_started_at = IF(?, plan_started_at, ?), plan_expires_at = ? WHERE user_id = ?`,
        [plan.id, Number(sub.hasPlan) ? 1 : 0, sqlTime(new Date(Number(sub.start) * 1000)), sqlTime(end), order.user_id]
      );
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
