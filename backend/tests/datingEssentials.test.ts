import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { resetTestDatabase } from './helpers';

const app = createApp();
let seq = 0;

async function member(name: string, extra: Record<string, unknown> = {}) {
  const email = `${name.toLowerCase().replace(/\W/g, '')}.${++seq}@example.com`;
  const agent = request.agent(app);
  const res = await agent.post('/api/v1/auth/register').send({ email, password: 'Password123!', displayName: name, dateOfBirth: '1996-02-02', ...extra });
  expect(res.status).toBe(201);
  return { agent, id: res.body.data.user.id as string, email };
}

async function matched() {
  const a = await member('Asha');
  const b = await member('Bharat');
  await a.agent.post('/api/v1/interactions/like').send({ targetUserId: b.id });
  await b.agent.post('/api/v1/interactions/like').send({ targetUserId: a.id });
  const match = (await a.agent.get('/api/v1/matches')).body.data[0];
  return { a, b, matchId: match.matchId as string, conversationId: match.conversationId as string };
}

async function adminAgent() {
  const { AdminAuthService } = await import('../src/services/adminAuthService');
  const email = `mod.${++seq}@example.com`;
  await AdminAuthService.createAdmin(email, 'Moderator', 'AdminPassword123!');
  const agent = request.agent(app);
  expect((await agent.post('/api/v1/admin/login').send({ email, password: 'AdminPassword123!' })).status).toBe(200);
  return agent;
}

const discoverIds = async (agent: request.Agent, query: Record<string, string> = {}) =>
  ((await agent.get('/api/v1/discover').query(query)).body.data as { id: string }[]).map((p) => p.id);

describe('Dating essentials', () => {
  beforeAll(async () => {
    await resetTestDatabase();
  });

  describe('Profile prompts and background', () => {
    it('saves prompts and background details, shows them to others, and filters by them', async () => {
      const a = await member('Prompter');
      const viewer = await member('Viewer');
      const res = await a.agent.patch('/api/v1/users/me').send({
        prompts: [{ q: 'perfect_sunday', a: 'Filter coffee and a long walk' }, { q: 'green_flag', a: 'Kind to waiters' }],
        religion: 'hindu',
        motherTongue: 'tamil',
        languages: ['english', 'hindi', 'english'],
        diet: 'vegetarian',
        maritalStatus: 'never_married',
        familyPlans: 'want_children',
      });
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ religion: 'hindu', motherTongue: 'tamil', languages: ['english', 'hindi'], diet: 'vegetarian' });
      expect(res.body.data.prompts).toHaveLength(2);

      const seen = (await viewer.agent.get('/api/v1/discover')).body.data.find((p: any) => p.id === a.id);
      expect(seen).toMatchObject({ religion: 'hindu', motherTongue: 'tamil', maritalStatus: 'never_married', familyPlans: 'want_children' });
      expect(seen.prompts[0]).toEqual({ q: 'perfect_sunday', a: 'Filter coffee and a long walk' });

      expect(await discoverIds(viewer.agent, { religion: 'hindu' })).toContain(a.id);
      expect(await discoverIds(viewer.agent, { religion: 'muslim' })).not.toContain(a.id);
      expect(await discoverIds(viewer.agent, { language: 'tamil' })).toContain(a.id);
      expect(await discoverIds(viewer.agent, { language: 'hindi' })).toContain(a.id);
      expect(await discoverIds(viewer.agent, { language: 'bengali' })).not.toContain(a.id);
      expect(await discoverIds(viewer.agent, { diet: 'vegan' })).not.toContain(a.id);
    });

    it('rejects unknown prompts, repeated prompts and more than three', async () => {
      const a = await member('Strict');
      expect((await a.agent.patch('/api/v1/users/me').send({ prompts: [{ q: 'made_up', a: 'x' }] })).status).toBe(400);
      expect((await a.agent.patch('/api/v1/users/me').send({ prompts: [{ q: 'green_flag', a: 'a' }, { q: 'green_flag', a: 'b' }] })).status).toBe(400);
      const four = ['perfect_sunday', 'green_flag', 'simple_pleasures', 'typical_weekend'].map((q) => ({ q, a: 'yes' }));
      expect((await a.agent.patch('/api/v1/users/me').send({ prompts: four })).status).toBe(400);
      expect((await a.agent.patch('/api/v1/users/me').send({ religion: 'unknown' })).status).toBe(400);
    });
  });

  describe('Pause profile', () => {
    it('hides a paused member from Discover until they unpause', async () => {
      const a = await member('Pauser');
      const viewer = await member('Looker');
      expect(await discoverIds(viewer.agent)).toContain(a.id);
      expect((await a.agent.put('/api/v1/users/me/pause').send({ paused: true })).body.data).toEqual({ paused: true });
      expect((await a.agent.get('/api/v1/auth/me')).body.data.isPaused).toBe(true);
      expect(await discoverIds(viewer.agent)).not.toContain(a.id);
      await a.agent.put('/api/v1/users/me/pause').send({ paused: false });
      expect(await discoverIds(viewer.agent)).toContain(a.id);
    });
  });

  describe('Change password', () => {
    it('needs the current password, then signs other devices out', async () => {
      const a = await member('Changer');
      const otherDevice = request.agent(app);
      await otherDevice.post('/api/v1/auth/login').send({ email: a.email, password: 'Password123!' });
      expect((await otherDevice.get('/api/v1/auth/me')).status).toBe(200);

      expect((await a.agent.post('/api/v1/auth/password/change').send({ currentPassword: 'Wrong!!!!', newPassword: 'NewPassword123!' })).status).toBe(403);
      expect((await a.agent.post('/api/v1/auth/password/change').send({ currentPassword: 'Password123!', newPassword: 'short' })).status).toBe(400);
      expect((await a.agent.post('/api/v1/auth/password/change').send({ currentPassword: 'Password123!', newPassword: 'NewPassword123!' })).status).toBe(200);

      expect((await a.agent.get('/api/v1/auth/me')).status).toBe(200);
      expect((await otherDevice.get('/api/v1/auth/me')).status).toBe(401);
      expect((await request(app).post('/api/v1/auth/login').send({ email: a.email, password: 'Password123!' })).status).toBe(401);
      expect((await request(app).post('/api/v1/auth/login').send({ email: a.email, password: 'NewPassword123!' })).status).toBe(200);
    });
  });

  describe('Unmatch', () => {
    it('ends the match and chat for both, and neither shows up in Discover again', async () => {
      const { a, b, matchId, conversationId } = await matched();
      await a.agent.post(`/api/v1/conversations/${conversationId}/messages`).send({ content: 'Hi' });
      const outsider = await member('Outsider');
      expect((await outsider.agent.delete(`/api/v1/matches/${matchId}`)).status).toBe(404);

      expect((await b.agent.delete(`/api/v1/matches/${matchId}`)).status).toBe(200);
      expect((await a.agent.get('/api/v1/matches')).body.data).toEqual([]);
      expect((await a.agent.get('/api/v1/conversations')).body.data).toEqual([]);
      expect((await a.agent.get(`/api/v1/conversations/${conversationId}/messages`)).status).toBe(404);
      expect(await discoverIds(a.agent)).not.toContain(b.id);
      expect(await discoverIds(b.agent)).not.toContain(a.id);
      expect((await a.agent.delete(`/api/v1/matches/${matchId}`)).status).toBe(404);
    });
  });

  describe('Replies, reactions and unsend', () => {
    it('quotes the message being answered, keeps one reaction per person, and unsends for both', async () => {
      const { a, b, conversationId } = await matched();
      const url = `/api/v1/conversations/${conversationId}/messages`;
      const first = (await a.agent.post(url).send({ content: 'Coffee on Saturday?' })).body.data;
      expect(first).toMatchObject({ replyTo: null, reactions: [], deleted: false });

      const reply = await b.agent.post(url).send({ content: 'Yes!', replyToId: first.id });
      expect(reply.status).toBe(201);
      expect(reply.body.data.replyTo).toMatchObject({ id: first.id, senderId: a.id, content: 'Coffee on Saturday?' });

      const other = await matched();
      const foreign = (await other.a.agent.post(`/api/v1/conversations/${other.conversationId}/messages`).send({ content: 'Elsewhere' })).body.data;
      expect((await b.agent.post(url).send({ content: 'x', replyToId: foreign.id })).status).toBe(400);

      expect((await b.agent.put(`${url}/${first.id}/reaction`).send({ emoji: '❤️' })).body.data.reactions).toEqual([{ emoji: '❤️', userId: b.id }]);
      expect((await b.agent.put(`${url}/${first.id}/reaction`).send({ emoji: '😂' })).body.data.reactions).toEqual([{ emoji: '😂', userId: b.id }]);
      expect((await b.agent.put(`${url}/${first.id}/reaction`).send({ emoji: '🍕' })).status).toBe(400);
      expect((await other.a.agent.put(`${url}/${first.id}/reaction`).send({ emoji: '❤️' })).status).toBe(404);

      let history = (await a.agent.get(url)).body.data.messages;
      expect(history[0].reactions).toEqual([{ emoji: '😂', userId: b.id }]);

      expect((await b.agent.delete(`${url}/${first.id}`)).status).toBe(404);
      expect((await a.agent.delete(`${url}/${first.id}`)).status).toBe(200);
      history = (await b.agent.get(url)).body.data.messages;
      expect(history[0]).toMatchObject({ id: first.id, deleted: true, content: '', reactions: [] });
      expect(history[1].replyTo).toMatchObject({ id: first.id, deleted: true, content: '' });
      expect((await b.agent.put(`${url}/${first.id}/reaction`).send({ emoji: '❤️' })).status).toBe(404);
    });
  });

  describe('Reports queue and bans', () => {
    it('lists reports for moderators, and a ban stops the same email and phone signing up again', async () => {
      const admin = await adminAgent();
      const reporter = await member('Reporter');
      const bad = await member('Troublemaker');
      expect((await reporter.agent.post('/api/v1/safety/reports').send({ reportedUserId: bad.id, category: 'Harassment', details: 'Rude' })).status).toBeLessThan(300);

      const queue = (await admin.get('/api/v1/admin/reports')).body.data;
      const report = queue.reports.find((r: any) => r.reported.id === bad.id);
      expect(report).toMatchObject({ category: 'Harassment', status: 'pending', reporter: { id: reporter.id, name: 'Reporter' }, reported: { name: 'Troublemaker', totalReports: 1 } });
      expect((await request(app).get('/api/v1/admin/reports')).status).toBe(401);

      const banned = await admin.post(`/api/v1/admin/users/${bad.id}/ban`).send({ reason: 'Harassment' });
      expect(banned.status).toBe(200);
      expect(banned.body.data).toMatchObject({ isActive: false, isBanned: true });
      expect((await bad.agent.get('/api/v1/auth/me')).status).toBe(401);

      await admin.post(`/api/v1/admin/reports/${report.id}/resolve`);
      expect((await admin.get('/api/v1/admin/reports').query({ status: 'resolved' })).body.data.reports.map((r: any) => r.id)).toContain(report.id);

      // Delete the old account, then try again with the same email.
      const { getDatabase } = await import('../src/config/database');
      await getDatabase().run('DELETE FROM users WHERE id = ?', [bad.id]);
      const again = await request(app).post('/api/v1/auth/register').send({ email: bad.email.toUpperCase(), password: 'Password123!', displayName: 'New Me', dateOfBirth: '1996-02-02' });
      expect(again.status).toBe(403);

    });

    it('lifting a ban re-enables the account', async () => {
      const admin = await adminAgent();
      const m = await member('Forgiven');
      await admin.post(`/api/v1/admin/users/${m.id}/ban`).send({});
      const lifted = await admin.delete(`/api/v1/admin/users/${m.id}/ban`);
      expect(lifted.body.data).toMatchObject({ isActive: true, isBanned: false });
      expect((await request(app).post('/api/v1/auth/login').send({ email: m.email, password: 'Password123!' })).status).toBe(200);
    });
  });
});
