import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import request from 'supertest';
import { createApp } from '../src/app';
import { getDatabase } from '../src/config/database';
import { resetTestDatabase } from './helpers';

const app = createApp();
const ANY_ID = '00000000-0000-4000-8000-000000000000';
let seq = 0;

async function member(name: string) {
  const email = `${name.toLowerCase()}.${++seq}@example.com`;
  const agent = request.agent(app);
  const res = await agent.post('/api/v1/auth/register').send({ email, password: 'Password123!', displayName: name, dateOfBirth: '1996-02-02' });
  expect(res.status).toBe(201);
  return { agent, id: res.body.data.user.id as string, email };
}

const sub = (sql: string, userId: string) => getDatabase().run(`UPDATE subscriptions SET ${sql} WHERE user_id = ?`, [userId]);
const expireTrial = (id: string) => sub('trial_started_at = UTC_TIMESTAMP() - INTERVAL 8 DAY', id);
const status = async (agent: request.Agent) => (await agent.get('/api/v1/subscriptions')).body.data;

/** Every endpoint behind the subscription check, read from the route files (mounts from routes/index.ts). */
function gatedEndpoints(): { method: string; url: string }[] {
  const mounts: Record<string, string> = {
    profileRoutes: '/users', verificationRoutes: '/users/me/verification', premiumRoutes: '/users/me/premium',
    discoverRoutes: '/discover', interactionRoutes: '/interactions', matchRoutes: '/matches', chatRoutes: '/conversations',
    locationRoutes: '/locations', educationRoutes: '/education', notificationRoutes: '/notifications',
  };
  const out: { method: string; url: string }[] = [];
  for (const [file, mount] of Object.entries(mounts)) {
    const src = fs.readFileSync(path.join(__dirname, '../src/routes', `${file}.ts`), 'utf8');
    for (const m of src.matchAll(/router\.(get|post|put|patch|delete)\(\s*'([^']+)'/g)) {
      out.push({ method: m[1], url: `/api/v1${mount}${m[2] === '/' ? '' : m[2]}`.replace(/:[a-zA-Z]+/g, ANY_ID) });
    }
  }
  return out;
}

/** Still allowed with no access: account deletion, pause, referral, and the account email screen. */
const ALLOWED = [
  'delete /api/v1/users/me', 'put /api/v1/users/me/pause', 'get /api/v1/users/me/referral', 'post /api/v1/users/me/referral',
  'get /api/v1/users/me/verification', 'post /api/v1/users/me/verification/email/start', 'post /api/v1/users/me/verification/email/confirm',
];

describe('Subscription access', () => {
  beforeAll(async () => {
    await resetTestDatabase();
  });

  it('refuses every app endpoint once the free trial has ended', async () => {
    const m = await member('Lapsed');
    await expireTrial(m.id);
    expect(await status(m.agent)).toMatchObject({ active: false, state: 'expired' });

    const endpoints = gatedEndpoints();
    expect(endpoints.length).toBeGreaterThan(50);
    const leaks: string[] = [];
    for (const { method, url } of endpoints) {
      if (ALLOWED.includes(`${method} ${url}`)) continue;
      const res = await (m.agent as any)[method](url).send({});
      if (res.status !== 402) leaks.push(`${method.toUpperCase()} ${url} → ${res.status}`);
    }
    expect(leaks).toEqual([]);
  });

  it('lets trial members use the app, without Premium extras', async () => {
    const m = await member('Trialist');
    expect(await status(m.agent)).toMatchObject({ active: true, state: 'trial' });
    expect((await m.agent.get('/api/v1/discover')).status).toBe(200);
    expect((await m.agent.get('/api/v1/conversations')).status).toBe(200);
    // Premium-only features
    expect((await m.agent.get('/api/v1/discover').query({ verifiedOnly: 'true' })).status).toBe(403);
    expect((await m.agent.post('/api/v1/users/me/premium/boost')).status).toBe(403);
  });

  it('a plan bought during the trial starts when the trial ends, and access ends with the plan', async () => {
    const m = await member('Planner');
    await sub("plan = 'month', plan_started_at = UTC_TIMESTAMP() + INTERVAL 3 DAY, plan_expires_at = UTC_TIMESTAMP() + INTERVAL 33 DAY", m.id);
    let s = await status(m.agent);
    expect(s).toMatchObject({ active: true, state: 'trial' });
    expect(s.planStartsAt).toBeTruthy();

    // Trial over, plan running: full access plus Premium.
    await sub("trial_started_at = UTC_TIMESTAMP() - INTERVAL 10 DAY, plan_started_at = UTC_TIMESTAMP() - INTERVAL 3 DAY", m.id);
    s = await status(m.agent);
    expect(s).toMatchObject({ active: true, state: 'paid', plan: 'month' });
    expect((await m.agent.get('/api/v1/discover').query({ verifiedOnly: 'true' })).status).toBe(200);

    // Plan over: blocked again.
    await sub('plan_expires_at = UTC_TIMESTAMP() - INTERVAL 1 MINUTE', m.id);
    expect(await status(m.agent)).toMatchObject({ active: false, state: 'expired' });
    expect((await m.agent.get('/api/v1/discover')).status).toBe(402);
    expect((await m.agent.get('/api/v1/conversations')).status).toBe(402);
  });

  it('referral free time keeps an expired member in, and it runs out too', async () => {
    const m = await member('Referred');
    await expireTrial(m.id);
    await sub('free_until = UTC_TIMESTAMP() + INTERVAL 14 DAY', m.id);
    expect(await status(m.agent)).toMatchObject({ active: true });
    expect((await m.agent.get('/api/v1/discover')).status).toBe(200);
    await sub('free_until = UTC_TIMESTAMP() - INTERVAL 1 MINUTE', m.id);
    expect((await m.agent.get('/api/v1/discover')).status).toBe(402);
  });

  it('hides members without access from everyone else’s Discover', async () => {
    const viewer = await member('Viewer');
    const lapsed = await member('Hidden');
    const ids = async () => ((await viewer.agent.get('/api/v1/discover')).body.data as { id: string }[]).map((p) => p.id);
    expect(await ids()).toContain(lapsed.id);
    await expireTrial(lapsed.id);
    expect(await ids()).not.toContain(lapsed.id);
    await sub("plan = 'week', plan_started_at = UTC_TIMESTAMP(), plan_expires_at = UTC_TIMESTAMP() + INTERVAL 7 DAY", lapsed.id);
    expect(await ids()).toContain(lapsed.id);
  });

  it('never lets members grant themselves a plan outside local development', async () => {
    const m = await member('Sneaky');
    await expireTrial(m.id);
    expect((await m.agent.post('/api/v1/subscriptions/test-purchase').send({ planId: 'year' })).status).toBe(403);
    // No Razorpay keys in tests: real orders are unavailable rather than free.
    expect((await m.agent.post('/api/v1/subscriptions/orders').send({ planId: 'year' })).status).toBe(503);
    // A forged payment signature is refused.
    const forged = await m.agent.post('/api/v1/subscriptions/verify').send({
      razorpay_order_id: 'order_fake123', razorpay_payment_id: 'pay_fake123', razorpay_signature: 'a'.repeat(64),
    });
    expect([400, 404]).toContain(forged.status);
    expect((await request(app).post('/api/v1/subscriptions/webhook').set('Content-Type', 'application/json').send('{"event":"payment.captured"}')).status).toBe(400);
    expect(await status(m.agent)).toMatchObject({ active: false });
  });

  it('still lets an expired member delete their account', async () => {
    const m = await member('Leaver');
    await expireTrial(m.id);
    expect((await m.agent.get('/api/v1/users/me/referral')).status).toBe(200);
    expect((await m.agent.delete('/api/v1/users/me').send({ password: 'Password123!' })).status).toBe(200);
  });
});
