import crypto from 'crypto';
import { beforeAll, afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { getDatabase } from '../src/config/database';
import { resetTestDatabase } from './helpers';
import { BillingService } from '../src/services/billingService';
import { PLANS, planEnd, SubscriptionService } from '../src/services/subscriptionService';

const app = createApp();
const db = getDatabase();
const signup = (email: string) => ({ email, password: 'Password123!', displayName: 'Member', dateOfBirth: '1990-01-01' });
let userId: string;
let cookie: string;
beforeAll(async () => {
  await resetTestDatabase();
  const res = await request(app).post('/api/v1/auth/register').send(signup('billing@example.com'));
  expect(res.status).toBe(201);
  userId = res.body.data.user.id;
  cookie = (res.headers['set-cookie'] as unknown as string[]).map(c => c.split(';')[0]).join('; ');
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe('Trials and billing', () => {
  it('offers all requested prices and seven days from first login', async () => {
    expect(PLANS.map(p => p.amount)).toEqual([200, 1000, 3000, 5000, 7000, 12000, 20000]);
    const status = await SubscriptionService.status(userId);
    expect(status.state).toBe('trial');
    expect(Date.parse(status.expiresAt!) - Date.now()).toBeGreaterThan(7 * 86400000 - 60000);
    const before = status.expiresAt;
    await request(app).post('/api/v1/auth/login').set('Cookie', cookie).send({ email: 'billing@example.com', password: 'Password123!' });
    expect((await SubscriptionService.status(userId)).expiresAt).toBe(before);
  });

  it('blocks another signup on the same installation even after logout', async () => {
    await request(app).post('/api/v1/auth/logout').set('Cookie', cookie);
    const res = await request(app).post('/api/v1/auth/register').set('Cookie', cookie).send(signup('another@example.com'));
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already/);
    expect(await db.get('SELECT id FROM users WHERE email = ?', ['another@example.com'])).toBeNull();
    const login = await request(app).post('/api/v1/auth/login').set('Cookie', cookie).send({ email: 'billing@example.com', password: 'Password123!' });
    cookie = (login.headers['set-cookie'] as unknown as string[]).map(c => c.split(';')[0]).join('; ');
  });

  it('blocks a verified second phone number before creating an account', async () => {
    const fresh = request.agent(app);
    const original = await fresh.post('/api/v1/auth/register').send(signup('phone-owner@example.com'));
    expect(original.status).toBe(201);
    await fresh.post('/api/v1/auth/logout');
    const phone = '+919888777661';
    const sms = vi.spyOn(console, 'info');
    await fresh.post('/api/v1/auth/phone/start').send({ phone });
    const line = sms.mock.calls.map(c => String(c[0])).find(l => l.startsWith(`[SMS] to ${phone}:`))!;
    const code = line.match(/: (\d{6}) /)![1];
    const result = await fresh.post('/api/v1/auth/phone/verify').send({ phone, code, displayName: 'Second SIM', dateOfBirth: '1990-01-01' });
    expect(result.status).toBe(409);
    expect(await db.get("SELECT id FROM auth_accounts WHERE provider = 'phone' AND provider_account_id = ?", [phone])).toBeNull();
  });

  it('does not extend a trial when the same account uses a different installation', async () => {
    const before = (await SubscriptionService.status(userId)).expiresAt;
    expect((await request(app).post('/api/v1/auth/login').send({ email: 'billing@example.com', password: 'Password123!' })).status).toBe(200);
    expect((await SubscriptionService.status(userId)).expiresAt).toBe(before);
  });

  it('enforces expiry on the server but leaves billing and safety accessible', async () => {
    await db.run('UPDATE subscriptions SET trial_started_at = DATE_SUB(UTC_TIMESTAMP(), INTERVAL 8 DAY) WHERE user_id = ?', [userId]);
    for (const path of ['/discover', '/conversations', '/matches', '/users/me', '/notifications']) {
      expect((await request(app).get(`/api/v1${path}`).set('Cookie', cookie)).status).toBe(402);
    }
    expect((await request(app).get('/api/v1/subscriptions').set('Cookie', cookie)).status).toBe(200);
    expect((await request(app).get('/api/v1/auth/me').set('Cookie', cookie)).status).toBe(200);
    expect((await request(app).get('/api/v1/subscriptions')).status).toBe(401);
  });

  it('uses calendar months with month-end clamping', () => {
    expect(planEnd(new Date('2028-01-31T12:00:00Z'), PLANS[2]).toISOString()).toBe('2028-02-29T12:00:00.000Z');
    expect(planEnd(new Date('2028-02-29T12:00:00Z'), PLANS[6]).toISOString()).toBe('2029-02-28T12:00:00.000Z');
  });

  it('requires captured payment with the exact order amount and activates only once', async () => {
    await db.run('INSERT INTO billing_orders (id, user_id, plan, amount) VALUES (?, ?, ?, ?)', ['order_test', userId, 'week', 1000]);
    const payment = { id: 'pay_test', order_id: 'order_test', amount: 1000, currency: 'INR', status: 'captured' };
    await expect(BillingService.fulfill({ ...payment, status: 'authorized' })).rejects.toThrow(/not confirmed/);
    await expect(BillingService.fulfill({ ...payment, amount: 200 })).rejects.toThrow(/amount/);
    await Promise.all([BillingService.fulfill(payment), BillingService.fulfill(payment)]);
    const status = await SubscriptionService.status(userId);
    expect(status.state).toBe('paid');
    expect(Date.parse(status.expiresAt!) - Date.now()).toBeLessThanOrEqual(7 * 86400000);
    await BillingService.fulfill(payment);
    expect((await SubscriptionService.status(userId)).expiresAt).toBe(status.expiresAt);
  });

  it('preserves remaining time when renewing and rejects forged signatures and ownership', async () => {
    vi.stubEnv('RAZORPAY_KEY_SECRET', 'test-secret');
    const before = (await SubscriptionService.status(userId)).expiresAt!;
    await db.run('INSERT INTO billing_orders (id, user_id, plan, amount) VALUES (?, ?, ?, ?)', ['order_second', userId, 'day', 200]);
    await expect(BillingService.verify(userId, 'order_second', 'pay_second', '0'.repeat(64))).rejects.toThrow(/signature/);
    await expect(BillingService.verify('other-user', 'order_second', 'pay_second', '0'.repeat(64))).rejects.toThrow(/not found/);
    const payment = { id: 'pay_second', order_id: 'order_second', amount: 200, currency: 'INR', status: 'captured' };
    vi.spyOn(BillingService, 'request').mockResolvedValue(payment);
    const signature = crypto.createHmac('sha256', 'test-secret').update('order_second|pay_second').digest('hex');
    await BillingService.verify(userId, 'order_second', 'pay_second', signature);
    expect(Date.parse((await SubscriptionService.status(userId)).expiresAt!) - Date.parse(before)).toBe(86400000);
  });

  it('authenticates raw webhook bytes and safely acknowledges duplicate events', async () => {
    vi.stubEnv('RAZORPAY_WEBHOOK_SECRET', 'hook-secret');
    const body = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { id: 'pay_second', order_id: 'order_second', amount: 200, currency: 'INR', status: 'captured' } } } });
    expect((await request(app).post('/api/v1/subscriptions/webhook').set('Content-Type', 'application/json').send(body)).status).toBe(400);
    const signature = crypto.createHmac('sha256', 'hook-secret').update(body).digest('hex');
    const before = (await SubscriptionService.status(userId)).expiresAt;
    expect((await request(app).post('/api/v1/subscriptions/webhook').set('Content-Type', 'application/json').set('x-razorpay-signature', signature).send(body)).status).toBe(200);
    expect((await SubscriptionService.status(userId)).expiresAt).toBe(before);
  });
});
