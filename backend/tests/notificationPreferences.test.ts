import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { resetTestDatabase } from './helpers';
import { getNotificationPreferences } from '../src/services/notificationPreferences';
const app = createApp();
beforeAll(resetTestDatabase);
describe('notification preferences', () => {
  it('requires authentication and saves independent choices per account', async () => {
    expect((await request(app).get('/api/v1/notifications/preferences')).status).toBe(401);
    const a = request.agent(app); const b = request.agent(app);
    const signup = (email: string) => ({ email, password: 'Password123!', displayName: 'Member', dateOfBirth: '1995-01-01' });
    const first = await a.post('/api/v1/auth/register').send(signup('prefs-a@example.com'));
    const second = await b.post('/api/v1/auth/register').send(signup('prefs-b@example.com'));
    expect(first.status).toBe(201); expect(second.status).toBe(201);
    expect((await a.get('/api/v1/notifications/preferences')).body.data).toEqual({ calls: true, messages: true });
    expect((await a.put('/api/v1/notifications/preferences').send({ calls: false, messages: true })).status).toBe(200);
    expect(await getNotificationPreferences(first.body.data.user.id)).toEqual({ calls: false, messages: true });
    expect((await b.get('/api/v1/notifications/preferences')).body.data).toEqual({ calls: true, messages: true });
    expect((await a.put('/api/v1/notifications/preferences').send({ calls: 'false', messages: true })).status).toBe(400);
  });
});
