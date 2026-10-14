import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';
import { createApp } from '../src/app';
import { getDatabase } from '../src/config/database';
import { AdminAuthService } from '../src/services/adminAuthService';
import { resetTestDatabase } from './helpers';

const app = createApp();

async function registerMember(email: string, displayName: string) {
  const agent = request.agent(app);
  const res = await agent.post('/api/v1/auth/register').send({
    email,
    password: 'Password123!',
    displayName,
    dateOfBirth: '1998-05-15',
  });
  expect(res.status).toBe(201);
  return { agent, id: res.body.data.user.id as string };
}

async function adminAgent(email: string, role: 'super_admin' | 'admin' | 'moderator') {
  await AdminAuthService.createAdmin(email, `${role} user`, 'AdminPassword123!', role);
  const agent = request.agent(app);
  const res = await agent.post('/api/v1/admin/login').send({ email, password: 'AdminPassword123!' });
  expect(res.status).toBe(200);
  return agent;
}

describe('Superadmin Moderation & Chat Inspection', () => {
  let superAdmin: ReturnType<typeof request.agent>;
  let standardAdmin: ReturnType<typeof request.agent>;
  let moderator: ReturnType<typeof request.agent>;
  let userA: { agent: ReturnType<typeof request.agent>; id: string };
  let userB: { agent: ReturnType<typeof request.agent>; id: string };
  let conversationId: string;
  let reportId: string;

  beforeAll(async () => {
    process.env.AUTH_RATE_LIMIT = '500';
    await resetTestDatabase();

    // Create admins
    superAdmin = await adminAgent('supermod@example.com', 'super_admin');
    standardAdmin = await adminAgent('stdadmin@example.com', 'admin');
    moderator = await adminAgent('moderator1@example.com', 'moderator');

    // Create two members
    userA = await registerMember('alice@example.com', 'Alice');
    userB = await registerMember('bob@example.com', 'Bob');

    // Make both members premium so they can chat freely
    const db = getDatabase();
    await db.run(
      "UPDATE subscriptions SET plan = 'month', plan_started_at = UTC_TIMESTAMP(), plan_expires_at = UTC_TIMESTAMP() + INTERVAL 30 DAY WHERE user_id IN (?, ?)",
      [userA.id, userB.id]
    );

    // Create match and conversation between User A and User B
    const matchId = crypto.randomUUID();
    conversationId = crypto.randomUUID();
    await db.run(
      'INSERT INTO matches (id, user_a_id, user_b_id, created_at) VALUES (?, ?, ?, UTC_TIMESTAMP())',
      [matchId, userA.id, userB.id]
    );
    await db.run(
      'INSERT INTO conversations (id, match_id, user_a_id, user_b_id, created_at, last_message_at) VALUES (?, ?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())',
      [conversationId, matchId, userA.id, userB.id]
    );

    // Send messages in conversation
    await db.run(
      'INSERT INTO messages (id, conversation_id, sender_id, content, kind, status, created_at) VALUES (?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())',
      [crypto.randomUUID(), conversationId, userA.id, 'Hello Bob! How are you doing?', 'text', 'read']
    );
    await db.run(
      'INSERT INTO messages (id, conversation_id, sender_id, content, kind, status, created_at) VALUES (?, ?, ?, ?, ?, ?, UTC_TIMESTAMP() + INTERVAL 1 SECOND)',
      [crypto.randomUUID(), conversationId, userB.id, 'Hi Alice! Great to meet you.', 'text', 'read']
    );

    // User A reports User B
    reportId = crypto.randomUUID();
    await db.run(
      'INSERT INTO reports (id, reporter_id, reported_id, reason_category, details, status, created_at) VALUES (?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())',
      [reportId, userA.id, userB.id, 'Harassment', 'Unwanted messages in chat', 'pending']
    );
  });

  describe('Permission & Authorization Enforcement', () => {
    it('rejects unauthenticated requests to moderation and inspection endpoints', async () => {
      const anon = request(app);
      expect((await anon.get(`/api/v1/admin/conversations/${conversationId}`)).status).toBe(401);
      expect((await anon.get(`/api/v1/admin/users/${userB.id}/conversations`)).status).toBe(401);
      expect((await anon.post(`/api/v1/admin/users/${userB.id}/moderate`).send({ action: 'disable', reason: 'Abuse' })).status).toBe(401);
    });

    it('rejects normal members from accessing admin moderation or conversation inspection', async () => {
      expect((await userA.agent.get(`/api/v1/admin/conversations/${conversationId}`)).status).toBe(401);
      expect((await userA.agent.get(`/api/v1/admin/users/${userB.id}/conversations`)).status).toBe(401);
      expect((await userA.agent.post(`/api/v1/admin/users/${userB.id}/moderate`).send({ action: 'disable', reason: 'Abuse' })).status).toBe(401);
    });

    it('rejects non-Superadmin roles (standard admin, moderator) with 403 Forbidden', async () => {
      // Moderator
      expect((await moderator.get(`/api/v1/admin/conversations/${conversationId}`)).status).toBe(403);
      expect((await moderator.get(`/api/v1/admin/users/${userB.id}/conversations`)).status).toBe(403);
      expect((await moderator.post(`/api/v1/admin/users/${userB.id}/moderate`).send({ action: 'suspend', durationHours: 24, reason: 'Test' })).status).toBe(403);

      // Standard Admin (role: 'admin')
      expect((await standardAdmin.get(`/api/v1/admin/conversations/${conversationId}`)).status).toBe(403);
      expect((await standardAdmin.get(`/api/v1/admin/users/${userB.id}/conversations`)).status).toBe(403);
      expect((await standardAdmin.post(`/api/v1/admin/users/${userB.id}/moderate`).send({ action: 'suspend', durationHours: 24, reason: 'Test' })).status).toBe(403);
    });

    it('allows Superadmin to access chat inspection and user conversations', async () => {
      const convRes = await superAdmin.get(`/api/v1/admin/conversations/${conversationId}`);
      expect(convRes.status).toBe(200);
      expect(convRes.body.success).toBe(true);

      const userConvsRes = await superAdmin.get(`/api/v1/admin/users/${userB.id}/conversations`);
      expect(userConvsRes.status).toBe(200);
      expect(userConvsRes.body.success).toBe(true);
      expect(userConvsRes.body.data.length).toBeGreaterThan(0);
      expect(userConvsRes.body.data[0].id).toBe(conversationId);
    });
  });

  describe('Chat Inspection & Audit Logging', () => {
    it('returns chronological messages, participants, and associated reports', async () => {
      const res = await superAdmin.get(`/api/v1/admin/conversations/${conversationId}`).query({ reportId });
      expect(res.status).toBe(200);
      const data = res.body.data;

      expect(data.conversation.id).toBe(conversationId);
      expect(data.conversation.userA.id).toBe(userA.id);
      expect(data.conversation.userB.id).toBe(userB.id);
      expect(data.messages.length).toBe(2);
      expect(data.messages[0].senderId).toBe(userA.id);
      expect(data.messages[0].content).toBe('Hello Bob! How are you doing?');
      expect(data.messages[1].senderId).toBe(userB.id);
      expect(data.messages[1].content).toBe('Hi Alice! Great to meet you.');

      // Related reports are included
      expect(data.relatedReports.length).toBe(1);
      expect(data.relatedReports[0].id).toBe(reportId);
    });

    it('records an audit log entry on every conversation inspection', async () => {
      const auditRes = await superAdmin.get('/api/v1/admin/audit-logs').query({ action: 'chat_inspected' });
      expect(auditRes.status).toBe(200);
      const inspectedLogs = auditRes.body.data.logs.filter((l: any) => l.action === 'chat_inspected');
      expect(inspectedLogs.length).toBeGreaterThan(0);
      expect(inspectedLogs[0].target.id).toBe(conversationId);
      expect(inspectedLogs[0].actor.email).toBe('supermod@example.com');
    });

    it('links reports to conversations in listReports', async () => {
      const repRes = await superAdmin.get('/api/v1/admin/reports');
      expect(repRes.status).toBe(200);
      const rep = repRes.body.data.reports.find((r: any) => r.id === reportId);
      expect(rep).toBeDefined();
      expect(rep.conversationId).toBe(conversationId);
    });
  });

  describe('User Moderation: Temporary Suspension, Disabling, Ban & Reactivation', () => {
    it('allows Superadmin to temporarily suspend a user', async () => {
      const res = await superAdmin.post(`/api/v1/admin/users/${userB.id}/moderate`).send({
        action: 'suspend',
        durationHours: 24,
        reason: 'Violation of messaging standards',
        notes: 'Reported by Alice in conversation test-conv-123',
      });
      expect(res.status).toBe(200);
      expect(res.body.data.isSuspended).toBe(true);
      expect(res.body.data.suspendedUntil).toBeTruthy();

      // Suspended user's existing sessions are revoked
      const meRes = await userB.agent.get('/api/v1/users/me');
      expect(meRes.status).toBe(401);

      // Suspended user cannot log in
      const loginRes = await request(app).post('/api/v1/auth/login').send({
        email: 'bob@example.com',
        password: 'Password123!',
      });
      expect(loginRes.status).toBe(403);
      expect(loginRes.body.error).toContain('temporarily suspended');
      expect(loginRes.body.error).toContain('Violation of messaging standards');
    });

    it('automatically restores access once a temporary suspension has expired', async () => {
      const db = getDatabase();
      // Fast-forward suspension expiry into the past
      await db.run(
        'UPDATE users SET suspended_until = UTC_TIMESTAMP() - INTERVAL 1 MINUTE WHERE id = ?',
        [userB.id]
      );

      // User B can now log in normally and their account is auto-restored
      const loginRes = await userB.agent.post('/api/v1/auth/login').send({
        email: 'bob@example.com',
        password: 'Password123!',
      });
      expect(loginRes.status).toBe(200);
      expect(loginRes.body.data.user.id).toBe(userB.id);

      // Verification of active session
      const meRes = await userB.agent.get('/api/v1/auth/me');
      expect(meRes.status).toBe(200);
      expect(meRes.body.data.id).toBe(userB.id);
    });

    it('allows Superadmin to disable an account indefinitely', async () => {
      const res = await superAdmin.post(`/api/v1/admin/users/${userB.id}/moderate`).send({
        action: 'disable',
        reason: 'Repeated harassment behavior',
        notes: 'Disabled after investigation',
      });
      expect(res.status).toBe(200);
      expect(res.body.data.isActive).toBe(false);

      // Login is rejected with 401 and reason
      const loginRes = await request(app).post('/api/v1/auth/login').send({
        email: 'bob@example.com',
        password: 'Password123!',
      });
      expect(loginRes.status).toBe(401);
      expect(loginRes.body.error).toContain('disabled');
      expect(loginRes.body.error).toContain('Repeated harassment behavior');
    });

    it('allows Superadmin to reactivate a disabled account', async () => {
      const res = await superAdmin.post(`/api/v1/admin/users/${userB.id}/moderate`).send({
        action: 'reactivate',
        reason: 'Appeal approved by Superadmin',
      });
      expect(res.status).toBe(200);
      expect(res.body.data.isActive).toBe(true);
      expect(res.body.data.isSuspended).toBe(false);

      // Login succeeds again
      const loginRes = await userB.agent.post('/api/v1/auth/login').send({
        email: 'bob@example.com',
        password: 'Password123!',
      });
      expect(loginRes.status).toBe(200);
    });

    it('allows Superadmin to permanently ban an account and prevents registration', async () => {
      const res = await superAdmin.post(`/api/v1/admin/users/${userB.id}/moderate`).send({
        action: 'ban',
        reason: 'Severe violation of community standards',
      });
      expect(res.status).toBe(200);
      expect(res.body.data.isBanned).toBe(true);

      // Login is rejected
      const loginRes = await request(app).post('/api/v1/auth/login').send({
        email: 'bob@example.com',
        password: 'Password123!',
      });
      expect([401, 403]).toContain(loginRes.status);

      // Re-registration with banned email is rejected
      const regRes = await request(app).post('/api/v1/auth/register').send({
        email: 'bob@example.com',
        password: 'Password123!',
        displayName: 'Bob New',
        dateOfBirth: '1998-05-15',
      });
      expect(regRes.status).toBe(403);
    });

    it('supports searching users by user ID in listUsers', async () => {
      const res = await superAdmin.get('/api/v1/admin/users').query({ q: userA.id });
      expect(res.status).toBe(200);
      expect(res.body.data.users.length).toBe(1);
      expect(res.body.data.users[0].id).toBe(userA.id);
    });

    it('supports filtering users by suspended and banned in listUsers', async () => {
      const bannedRes = await superAdmin.get('/api/v1/admin/users').query({ filter: 'banned' });
      expect(bannedRes.status).toBe(200);
      expect(bannedRes.body.data.users.map((u: any) => u.id)).toContain(userB.id);
    });
  });
});
