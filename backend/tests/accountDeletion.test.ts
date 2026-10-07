import { describe, it, expect, beforeAll, vi } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import request from 'supertest';
import { createApp } from '../src/app';
import { config } from '../src/config/env';
import { getDatabase } from '../src/config/database';
import { AppError } from '../src/middleware/errorHandler';
import { fakeGoogleCredential, resetTestDatabase } from './helpers';

vi.mock('../src/services/auth/googleIdentity', () => ({
  verifyGoogleCredential: vi.fn(async (credential: string) => {
    const [prefix, subject, email] = credential.split(':');
    if (prefix !== 'google-test-credential' || !subject || !email) throw new AppError('Google sign-in could not be verified.', 401);
    return { subject, email, emailVerified: true, name: 'Google Member', picture: '' };
  }),
}));

const app = createApp();
const PNG = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex');

async function registerAgent(email: string, displayName: string) {
  const agent = request.agent(app);
  const res = await agent.post('/api/v1/auth/register').send({ email, password: 'Password123!', displayName, dateOfBirth: '1995-05-05' });
  expect(res.status).toBe(201);
  return { agent, id: res.body.data.user.id as string };
}

describe('Account deletion', () => {
  beforeAll(async () => {
    await resetTestDatabase();
  });

  it('needs the password, then removes the account, its matches, chats and uploaded files', async () => {
    const a = await registerAgent('leaving@example.com', 'Leaving');
    const b = await registerAgent('staying@example.com', 'Staying');
    await a.agent.post('/api/v1/interactions/like').send({ targetUserId: b.id });
    await b.agent.post('/api/v1/interactions/like').send({ targetUserId: a.id });
    const conversationId = (await b.agent.get('/api/v1/conversations')).body.data[0].id;
    expect((await a.agent.post(`/api/v1/conversations/${conversationId}/messages`).send({ content: 'Bye!' })).status).toBe(201);
    const upload = await a.agent.post('/api/v1/users/me/photos').set('Content-Type', 'image/png').send(PNG);
    expect(upload.status).toBe(201);
    const file = path.join(config.uploadDir, path.basename(upload.body.data.url));
    await expect(fs.stat(file)).resolves.toBeTruthy();

    // A paid order and a report the leaving member made.
    await getDatabase().run("INSERT INTO billing_orders (id, user_id, plan, amount, payment_id, fulfilled_at) VALUES ('order_keep_1', ?, 'month', 3000, 'pay_keep_1', UTC_TIMESTAMP())", [a.id]);
    expect((await a.agent.post('/api/v1/safety/reports').send({ reportedUserId: b.id, category: 'Spam', details: 'Testing' })).status).toBeLessThan(300);

    expect((await a.agent.delete('/api/v1/users/me').send({})).status).toBe(403);
    expect((await a.agent.delete('/api/v1/users/me').send({ password: 'WrongPassword!' })).status).toBe(403);
    const ok = await a.agent.delete('/api/v1/users/me').send({ password: 'Password123!' });
    expect(ok.status).toBe(200);

    // Signed out, and the account is gone for good.
    expect((await a.agent.get('/api/v1/auth/me')).status).toBe(401);
    expect((await request(app).post('/api/v1/auth/login').send({ email: 'leaving@example.com', password: 'Password123!' })).status).toBe(401);
    expect(await getDatabase().get('SELECT id FROM users WHERE id = ?', [a.id])).toBeFalsy();
    await expect(fs.stat(file)).rejects.toThrow();

    // Payment and report records stay, no longer linked to the person.
    expect(await getDatabase().get("SELECT user_id, amount FROM billing_orders WHERE id = 'order_keep_1'")).toEqual({ user_id: null, amount: 3000 });
    expect(await getDatabase().get('SELECT reporter_id FROM reports WHERE reported_id = ?', [b.id])).toEqual({ reporter_id: null });

    // The other member no longer sees the match or the conversation.
    expect((await b.agent.get('/api/v1/conversations')).body.data).toEqual([]);
    expect((await b.agent.get('/api/v1/matches')).body.data).toEqual([]);

    // The email can be used for a new account.
    await registerAgent('leaving@example.com', 'Back Again');
  });

  it('asks accounts without a password to type DELETE', async () => {
    const agent = request.agent(app);
    const res = await agent.post('/api/v1/auth/google').send({ credential: fakeGoogleCredential('google-leaver', 'g-leaver@example.com'), dateOfBirth: '1994-01-01' });
    expect(res.status).toBeLessThan(300);
    expect((await agent.delete('/api/v1/users/me').send({ confirm: 'delete' })).status).toBe(400);
    expect((await agent.delete('/api/v1/users/me').send({ confirm: 'DELETE' })).status).toBe(200);
    expect((await agent.get('/api/v1/auth/me')).status).toBe(401);
  });
});
