import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { containsPhoneNumber } from '../src/utils/contactFilter';
import { resetTestDatabase } from './helpers';

describe('Phone numbers in chat', () => {
  it.each([
    'my number is 9876543210',
    'call me on 98765 43210',
    '+91-98765-43210',
    '+91 (987) 654-3210',
    '9.8.7.6.5.4.3.2.1.0',
    '9 8 7 6 5 4 3 2 1 0',
    'nine eight seven six five four three two one zero',
    'nine eight seven 6543210',
    'double nine eight seven six five four three two',
    'ek do teen char paanch chhe saat aath nau',
    '9️⃣8️⃣7️⃣6️⃣5️⃣4️⃣3️⃣2️⃣1️⃣0️⃣',
    '９８７６５４３２１０',
    '९८७६५४३२१०',
    'whatsapp 98765abc43210',
    'landline 040 2345 6789',
  ])('blocks "%s"', (text) => {
    expect(containsPhoneNumber(text)).toBe(true);
  });

  it.each([
    "I'm 25 and from Hyderabad",
    'see you at 7:30 tomorrow',
    'it costs ₹1,50,000',
    'born on 12/08/1996',
    'I have 2 cats and 3 dogs',
    'one or two coffees?',
    'do you like 90s music?',
    'top 10 places, 5 stars, 100%',
    'no no no, that was in 2019',
    'Room 404, floor 3',
  ])('allows "%s"', (text) => {
    expect(containsPhoneNumber(text)).toBe(false);
  });

  describe('through the chat API', () => {
    const app = createApp();
    let a: request.Agent;
    let url = '';

    beforeAll(async () => {
      await resetTestDatabase();
      a = request.agent(app);
      const b = request.agent(app);
      const ra = await a.post('/api/v1/auth/register').send({ email: 'num.a@example.com', password: 'Password123!', displayName: 'Anil', dateOfBirth: '1995-01-01' });
      const rb = await b.post('/api/v1/auth/register').send({ email: 'num.b@example.com', password: 'Password123!', displayName: 'Bina', dateOfBirth: '1995-01-01' });
      await a.post('/api/v1/interactions/like').send({ targetUserId: rb.body.data.user.id });
      const match = await b.post('/api/v1/interactions/like').send({ targetUserId: ra.body.data.user.id });
      url = `/api/v1/conversations/${match.body.data.conversationId}/messages`;
    });

    it('refuses a phone number with a clear message, and allows normal numbers', async () => {
      const res = await a.post(url).send({ content: 'text me 98765 43210' });
      expect(res.status).toBe(422);
      expect(res.body.error).toMatch(/phone numbers can.t be shared/);
      expect((await a.post(url).send({ content: 'I am 27, free after 6pm' })).status).toBe(201);
    });

    it('refuses a number sent in pieces across messages', async () => {
      expect((await a.post(url).send({ content: '98765' })).status).toBe(201);
      expect((await a.post(url).send({ content: '43210' })).status).toBe(422);
      // A normal message in between breaks the chain.
      expect((await a.post(url).send({ content: 'anyway, how was your day?' })).status).toBe(201);
      expect((await a.post(url).send({ content: '42' })).status).toBe(201);
    });

    it('checks replies too', async () => {
      const first = (await a.post(url).send({ content: 'hello' })).body.data;
      expect((await a.post(url).send({ content: 'nine eight seven six five four three two one', replyToId: first.id })).status).toBe(422);
    });
  });
});
