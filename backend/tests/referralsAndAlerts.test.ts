import { describe, it, expect, beforeAll, vi, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { getDatabase } from '../src/config/database';
import { config } from '../src/config/env';
import { resetTestDatabase } from './helpers';

const app = createApp();
let seq = 0;

async function member(name: string, extra: Record<string, unknown> = {}) {
  const email = `${name.toLowerCase().replace(/\W/g, '')}.${++seq}@example.com`;
  const agent = request.agent(app);
  const res = await agent.post('/api/v1/auth/register').send({ email, password: 'Password123!', displayName: name, dateOfBirth: '1996-02-02', ...extra });
  return { agent, res, id: res.body.data?.user?.id as string, email };
}

/** Links a phone number with the SMS code printed by the console SMS sender. */
async function linkPhone(agent: request.Agent, phone: string) {
  const spy = vi.spyOn(console, 'info');
  await request(app).post('/api/v1/auth/phone/start').send({ phone });
  const line = spy.mock.calls.map((c) => String(c[0])).reverse().find((l) => l.startsWith(`[SMS] to ${phone}:`))!;
  spy.mockRestore();
  const res = await agent.post('/api/v1/auth/phone/link').send({ phone, code: line.match(/: (\d{6}) /)![1] });
  expect(res.status).toBe(200);
}

const accessEnd = async (agent: request.Agent) => Date.parse((await agent.get('/api/v1/subscriptions')).body.data.expiresAt);
const DAY = 24 * 3600 * 1000;

describe('Referrals', () => {
  beforeAll(async () => {
    await resetTestDatabase();
  });

  it('gives both people two weeks once the new account verifies its phone', async () => {
    const asha = await member('Asha Rao');
    const overview = (await asha.agent.get('/api/v1/users/me/referral')).body.data;
    expect(overview.code).toMatch(/^asharao\d{4}$/);
    expect(overview).toMatchObject({ friendsJoined: 0, daysEarned: 0, canEnterCode: true, rewardDays: 14 });

    // A wrong code stops sign-up before an account exists.
    const bad = await member('Typo', { referralCode: 'nobody0000' });
    expect(bad.res.status).toBe(400);
    expect(bad.res.body.error).toMatch(/doesn.t exist/);

    const ashaBefore = await accessEnd(asha.agent);
    const bharat = await member('Bharat', { referralCode: overview.code.toUpperCase() });
    expect(bharat.res.status).toBe(201);
    const bharatBefore = await accessEnd(bharat.agent);
    let mine = (await bharat.agent.get('/api/v1/users/me/referral')).body.data;
    expect(mine.referredBy).toMatchObject({ code: overview.code, name: 'Asha Rao', rewarded: false });
    expect(mine.canEnterCode).toBe(false);
    // No reward yet: the new account has no verified phone.
    expect(await accessEnd(asha.agent)).toBe(ashaBefore);

    await linkPhone(bharat.agent, '+919811100001');
    expect(await accessEnd(bharat.agent)).toBeGreaterThanOrEqual(bharatBefore + 14 * DAY - 5000);
    expect(await accessEnd(asha.agent)).toBeGreaterThanOrEqual(ashaBefore + 14 * DAY - 5000);
    mine = (await bharat.agent.get('/api/v1/users/me/referral')).body.data;
    expect(mine.referredBy.rewarded).toBe(true);
    const after = (await asha.agent.get('/api/v1/users/me/referral')).body.data;
    expect(after).toMatchObject({ friendsJoined: 1, friendsRewarded: 1, daysEarned: 14 });

    // Linking another number later doesn't reward twice.
    const twice = await accessEnd(asha.agent);
    await linkPhone(bharat.agent, '+919811100002');
    expect(await accessEnd(asha.agent)).toBe(twice);

    const notes = (await asha.agent.get('/api/v1/notifications')).body.data.items;
    expect(notes.some((n: any) => n.type === 'plan' && /Bharat joined with your code/.test(n.preview))).toBe(true);
  });

  it('lets a new member add a code in their first week, once, and never their own', async () => {
    const owner = await member('Owner');
    const code = (await owner.agent.get('/api/v1/users/me/referral')).body.data.code;
    const late = await member('Latecomer');
    expect((await late.agent.post('/api/v1/users/me/referral').send({ code: (await late.agent.get('/api/v1/users/me/referral')).body.data.code })).status).toBe(400);
    expect((await late.agent.post('/api/v1/users/me/referral').send({ code })).status).toBe(200);
    expect((await late.agent.post('/api/v1/users/me/referral').send({ code })).status).toBe(409);

    const old = await member('Old Timer');
    await getDatabase().run("UPDATE users SET created_at = DATE_FORMAT(UTC_TIMESTAMP() - INTERVAL 8 DAY, '%Y-%m-%dT%H:%i:%s') WHERE id = ?", [old.id]);
    expect((await old.agent.get('/api/v1/users/me/referral')).body.data.canEnterCode).toBe(false);
    expect((await old.agent.post('/api/v1/users/me/referral').send({ code })).status).toBe(400);
  });

  it('adds referral time after a running plan instead of losing it', async () => {
    const payer = await member('Payer');
    await getDatabase().run(
      "UPDATE subscriptions SET plan = 'month', plan_started_at = UTC_TIMESTAMP(), plan_expires_at = UTC_TIMESTAMP() + INTERVAL 30 DAY WHERE user_id = ?",
      [payer.id]
    );
    const before = await accessEnd(payer.agent);
    const friend = await member('Friend', { referralCode: (await payer.agent.get('/api/v1/users/me/referral')).body.data.code });
    await linkPhone(friend.agent, '+919811100003');
    expect(await accessEnd(payer.agent)).toBeGreaterThanOrEqual(before + 14 * DAY - 5000);
    expect((await payer.agent.get('/api/v1/subscriptions')).body.data.state).toBe('paid');
  });
});

describe('After the free time ends', () => {
  it('blocks every action except deleting, pausing and referrals', async () => {
    const m = await member('Expired');
    await getDatabase().run('UPDATE subscriptions SET trial_started_at = UTC_TIMESTAMP() - INTERVAL 8 DAY WHERE user_id = ?', [m.id]);
    expect((await m.agent.get('/api/v1/discover')).status).toBe(402);
    expect((await m.agent.get('/api/v1/users/me')).status).toBe(402);
    expect((await m.agent.get('/api/v1/conversations')).status).toBe(402);
    expect((await m.agent.post('/api/v1/interactions/like').send({ targetUserId: m.id })).status).toBe(402);
    expect((await m.agent.get('/api/v1/users/me/referral')).status).toBe(200);
    expect((await m.agent.put('/api/v1/users/me/pause').send({ paused: true })).status).toBe(200);
    expect((await m.agent.delete('/api/v1/users/me').send({ password: 'Password123!' })).status).toBe(200);
  });
});

describe('Email alerts', () => {
  afterEach(() => vi.restoreAllMocks());

  it('emails a member who is away about a new message, once per chat every few hours, unless turned off', async () => {
    const a = await member('Alerter');
    const b = await member('Away');
    await a.agent.post('/api/v1/interactions/like').send({ targetUserId: b.id });
    const conversationId = (await b.agent.post('/api/v1/interactions/like').send({ targetUserId: a.id })).body.data.conversationId;
    const spy = vi.spyOn(console, 'info');
    const emailsTo = (email: string) => spy.mock.calls.map((c) => String(c[0])).filter((l) => l.startsWith(`[Email] to ${email}:`));
    const settle = () => new Promise((r) => setTimeout(r, 300));

    await a.agent.post(`/api/v1/conversations/${conversationId}/messages`).send({ content: 'secret plans for Saturday' });
    await settle();
    const first = emailsTo(b.email);
    expect(first).toHaveLength(1);
    expect(first[0]).toMatch(/Alerter sent you a message/);
    expect(first[0]).not.toMatch(/secret plans/);
    expect(first[0]).toContain(`${config.appUrl}/chat/${conversationId}`);

    await a.agent.post(`/api/v1/conversations/${conversationId}/messages`).send({ content: 'again' });
    await settle();
    expect(emailsTo(b.email)).toHaveLength(1);

    expect((await b.agent.put('/api/v1/notifications/preferences').send({ calls: true, messages: true, emailAlerts: false })).body.data.emailAlerts).toBe(false);
    await getDatabase().run('DELETE FROM email_alert_log WHERE user_id = ?', [b.id]);
    await a.agent.post(`/api/v1/conversations/${conversationId}/messages`).send({ content: 'third' });
    await settle();
    expect(emailsTo(b.email)).toHaveLength(1);
  });
});

describe('GIFs and photo checks', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    config.giphyApiKey = '';
    config.moderation.sightengineUser = '';
    config.moderation.sightengineSecret = '';
  });

  it('only sends Giphy links as GIF messages', async () => {
    const a = await member('Gifa');
    const b = await member('Gifb');
    await a.agent.post('/api/v1/interactions/like').send({ targetUserId: b.id });
    const conversationId = (await b.agent.post('/api/v1/interactions/like').send({ targetUserId: a.id })).body.data.conversationId;
    const url = `/api/v1/conversations/${conversationId}/messages`;
    expect((await a.agent.post(url).send({ content: 'https://evil.example.com/x.gif', kind: 'gif' })).status).toBe(400);
    const ok = await a.agent.post(url).send({ content: 'https://media2.giphy.com/media/abc123/200.webp', kind: 'gif' });
    expect(ok.status).toBe(201);
    expect(ok.body.data.kind).toBe('gif');
    expect((await a.agent.get('/api/v1/conversations/gifs')).status).toBe(503);
  });

  it('refuses photos the moderation service flags, and accepts them if it is down', async () => {
    const a = await member('Photog');
    const png = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex');
    config.moderation.sightengineUser = 'u';
    config.moderation.sightengineSecret = 's';
    const real = globalThis.fetch;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any, init?: any) => {
      if (String(input).includes('sightengine')) {
        return new Response(JSON.stringify({ status: 'success', nudity: { sexual_activity: 0.9, sexual_display: 0.1, erotica: 0.2 } }));
      }
      return real(input, init);
    });
    const flagged = await a.agent.post('/api/v1/users/me/photos').set('Content-Type', 'image/png').send(png);
    expect(flagged.status).toBe(422);

    vi.restoreAllMocks();
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any, init?: any) => {
      if (String(input).includes('sightengine')) throw new Error('offline');
      return real(input, init);
    });
    expect((await a.agent.post('/api/v1/users/me/photos').set('Content-Type', 'image/png').send(png)).status).toBe(201);
  });
});
