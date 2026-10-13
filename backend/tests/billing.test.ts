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
  it('offers all requested prices and one day from first login', async () => {
    expect(PLANS.map(p => p.amount)).toEqual([1000, 2500, 7000, 15000, 25000, 35000, 60000, 100000]);
    const status = await SubscriptionService.status(userId);
    expect(status.state).toBe('trial');
    expect(Date.parse(status.expiresAt!) - Date.now()).toBeGreaterThan(1 * 86400000 - 60000);
    expect(Date.parse(status.expiresAt!) - Date.now()).toBeLessThanOrEqual(1 * 86400000 + 60000);
    const before = status.expiresAt;
    await request(app).post('/api/v1/auth/login').set('Cookie', cookie).send({ email: 'billing@example.com', password: 'Password123!' });
    expect((await SubscriptionService.status(userId)).expiresAt).toBe(before);
  });

  it('lets another account sign up and sign in on the same device, each with its own trial', async () => {
    await request(app).post('/api/v1/auth/logout').set('Cookie', cookie);
    const other = await request(app).post('/api/v1/auth/register').set('Cookie', cookie).send(signup('another@example.com'));
    expect(other.status).toBe(201);
    expect((await SubscriptionService.status(other.body.data.user.id)).state).toBe('trial');
    // And the first account can still sign in on that same device.
    const login = await request(app).post('/api/v1/auth/login').set('Cookie', cookie).send({ email: 'billing@example.com', password: 'Password123!' });
    expect(login.status).toBe(200);
    cookie = (login.headers['set-cookie'] as unknown as string[]).map(c => c.split(';')[0]).join('; ');
  });

  it('creates an account for a new phone number on a device that already had another account', async () => {
    const fresh = request.agent(app);
    expect((await fresh.post('/api/v1/auth/register').send(signup('phone-owner@example.com'))).status).toBe(201);
    await fresh.post('/api/v1/auth/logout');
    const phone = '+919888777661';
    const sms = vi.spyOn(console, 'info');
    await fresh.post('/api/v1/auth/phone/start').send({ phone });
    const line = sms.mock.calls.map(c => String(c[0])).find(l => l.startsWith(`[SMS] to ${phone}:`))!;
    const code = line.match(/: (\d{6}) /)![1];
    const result = await fresh.post('/api/v1/auth/phone/verify').send({ phone, code, displayName: 'Second SIM', dateOfBirth: '1990-01-01' });
    expect(result.status).toBe(200);
    expect(result.body.data.isNewUser).toBe(true);
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

  it('only allows no-money test purchases in local development without Razorpay keys', async () => {
    const own = await request(app).post('/api/v1/auth/register').send(signup('testpay@example.com'));
    const cookie = (own.headers['set-cookie'] as unknown as string[]).map(c => c.split(';')[0]).join('; ');
    // Tests run as NODE_ENV=test: payments are off and test purchases are refused.
    expect(BillingService.mode()).toBe('off');
    expect((await request(app).post('/api/v1/subscriptions/test-purchase').set('Cookie', cookie).send({ planId: 'day' })).status).toBe(403);

    // Development without keys: the plan activates through the normal fulfilment.
    const { config } = await import('../src/config/env');
    const env = config.env;
    (config as { env: string }).env = 'development';
    try {
      expect(BillingService.mode()).toBe('test');
      const res = await request(app).post('/api/v1/subscriptions/test-purchase').set('Cookie', cookie).send({ planId: 'week' });
      expect(res.status).toBe(200);
      expect(res.body.data.plan).toBe('week');
      // With real keys, test purchases stop even in development.
      vi.stubEnv('RAZORPAY_KEY_ID', 'rzp_test_x');
      vi.stubEnv('RAZORPAY_KEY_SECRET', 'secret');
      expect(BillingService.mode()).toBe('razorpay');
      expect((await request(app).post('/api/v1/subscriptions/test-purchase').set('Cookie', cookie).send({ planId: 'day' })).status).toBe(403);
    } finally {
      (config as { env: string }).env = env;
    }
  });

  it('starts a plan bought during the trial when the trial ends, with Premium from then on', async () => {
    const own = await request(app).post('/api/v1/auth/register').send(signup('queued@example.com'));
    const id = own.body.data.user.id;
    await db.run("INSERT INTO billing_orders (id, user_id, plan, amount) VALUES ('order_queued1', ?, 'month', 15000)", [id]);
    await BillingService.fulfill({ id: 'pay_queued1', order_id: 'order_queued1', amount: 15000, currency: 'INR', status: 'captured' });
    const status = await SubscriptionService.status(id);
    expect(status.state).toBe('trial');
    expect(Date.parse(status.planStartsAt!)).toBeCloseTo(Date.parse(status.trialEndsAt!), -4);
    // Once the trial is over, the month is running and it counts as paid (Premium).
    await db.run('UPDATE subscriptions SET trial_started_at = trial_started_at - INTERVAL 8 DAY, plan_started_at = plan_started_at - INTERVAL 8 DAY, plan_expires_at = plan_expires_at - INTERVAL 8 DAY WHERE user_id = ?', [id]);
    expect((await SubscriptionService.status(id)).state).toBe('paid');
  });

  it('sends each trial and plan reminder once, and blocks everything once access ends', async () => {
    const { PlanReminderService } = await import('../src/services/planReminderService');
    const own = await request(app).post('/api/v1/auth/register').send(signup('reminder@example.com'));
    const id = own.body.data.user.id;
    const ownCookie = (own.headers['set-cookie'] as unknown as string[]).map(c => c.split(';')[0]).join('; ');
    const notes = async () => (await db.query<{ preview: string }>("SELECT preview FROM notifications WHERE user_id = ? AND type = 'plan' ORDER BY created_at", [id])).map(n => n.preview);

    // A plan ending in 2 days: "3 days" reminder, once.
    await db.run("UPDATE subscriptions SET trial_started_at = UTC_TIMESTAMP() - INTERVAL 30 DAY, plan = 'month', plan_started_at = UTC_TIMESTAMP() - INTERVAL 28 DAY, plan_expires_at = UTC_TIMESTAMP() + INTERVAL 2 DAY WHERE user_id = ?", [id]);
    await PlanReminderService.runOnce();
    await PlanReminderService.runOnce();
    expect(await notes()).toEqual(['Your plan ends in 3 days. Renew now to keep your matches and chats going.']);

    // It has ended: the "ended" reminder, and the app is locked on every request.
    await db.run('UPDATE subscriptions SET plan_expires_at = UTC_TIMESTAMP() - INTERVAL 1 HOUR WHERE user_id = ?', [id]);
    await PlanReminderService.runOnce();
    expect((await notes()).at(-1)).toBe('Your plan has ended. Renew to continue.');
    expect((await request(app).get('/api/v1/discover').set('Cookie', ownCookie)).status).toBe(402);
    expect((await request(app).post('/api/v1/interactions/like').set('Cookie', ownCookie).send({ targetUserId: userId })).status).toBe(402);
    // Billing stays open so they can renew.
    expect((await request(app).get('/api/v1/subscriptions').set('Cookie', ownCookie)).status).toBe(200);
  });

  it('uses calendar months with month-end clamping and handles hours', () => {
    expect(planEnd(new Date('2028-01-31T12:00:00Z'), PLANS.find(p => p.id === '1hour')!).toISOString()).toBe('2028-01-31T13:00:00.000Z');
    expect(planEnd(new Date('2028-01-31T12:00:00Z'), PLANS.find(p => p.id === 'month')!).toISOString()).toBe('2028-02-29T12:00:00.000Z');
    expect(planEnd(new Date('2028-02-29T12:00:00Z'), PLANS.find(p => p.id === 'year')!).toISOString()).toBe('2029-02-28T12:00:00.000Z');
  });

  it('requires captured payment with the exact order amount and activates only once', async () => {
    await db.run('INSERT INTO billing_orders (id, user_id, plan, amount) VALUES (?, ?, ?, ?)', ['order_test', userId, 'week', 7000]);
    const payment = { id: 'pay_test', order_id: 'order_test', amount: 7000, currency: 'INR', status: 'captured' };
    await expect(BillingService.fulfill({ ...payment, status: 'authorized' })).rejects.toThrow(/not confirmed/);
    await expect(BillingService.fulfill({ ...payment, amount: 2500 })).rejects.toThrow(/amount/);
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
    await db.run('INSERT INTO billing_orders (id, user_id, plan, amount) VALUES (?, ?, ?, ?)', ['order_second', userId, 'day', 2500]);
    await expect(BillingService.verify(userId, 'order_second', 'pay_second', '0'.repeat(64))).rejects.toThrow(/signature/);
    await expect(BillingService.verify('other-user', 'order_second', 'pay_second', '0'.repeat(64))).rejects.toThrow(/not found/);
    const payment = { id: 'pay_second', order_id: 'order_second', amount: 2500, currency: 'INR', status: 'captured' };
    vi.spyOn(BillingService, 'request').mockResolvedValue(payment);
    const signature = crypto.createHmac('sha256', 'test-secret').update('order_second|pay_second').digest('hex');
    await BillingService.verify(userId, 'order_second', 'pay_second', signature);
    expect(Date.parse((await SubscriptionService.status(userId)).expiresAt!) - Date.parse(before)).toBe(86400000);
  });

  it('authenticates raw webhook bytes and safely acknowledges duplicate events', async () => {
    vi.stubEnv('RAZORPAY_WEBHOOK_SECRET', 'hook-secret');
    const body = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { id: 'pay_second', order_id: 'order_second', amount: 2500, currency: 'INR', status: 'captured' } } } });
    expect((await request(app).post('/api/v1/subscriptions/webhook').set('Content-Type', 'application/json').send(body)).status).toBe(400);
    const signature = crypto.createHmac('sha256', 'hook-secret').update(body).digest('hex');
    const before = (await SubscriptionService.status(userId)).expiresAt;
    expect((await request(app).post('/api/v1/subscriptions/webhook').set('Content-Type', 'application/json').set('x-razorpay-signature', signature).send(body)).status).toBe(200);
    expect((await SubscriptionService.status(userId)).expiresAt).toBe(before);
  });
});
