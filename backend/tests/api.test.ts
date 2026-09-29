import { describe, it, expect, beforeAll, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { getDatabase } from '../src/config/database';
import { AppError } from '../src/middleware/errorHandler';
import { fakeGoogleCredential, resetTestDatabase } from './helpers';

// Google's signature verification needs Google-issued tokens, so only the verifier is replaced.
vi.mock('../src/services/auth/googleIdentity', () => ({
  verifyGoogleCredential: vi.fn(async (credential: string) => {
    const [prefix, subject, email, flag] = credential.split(':');
    if (prefix !== 'google-test-credential' || !subject || !email) {
      throw new AppError('Google sign-in could not be verified. Please try again.', 401);
    }
    return { subject, email, emailVerified: flag !== 'unverified', name: 'Google Member', picture: '' };
  }),
}));

const app = createApp();
const COOKIE = 'unmute_session';
const MISSING_ID = '00000000-0000-4000-8000-000000000000';

function sessionCookie(res: request.Response): string | undefined {
  const cookies = ([] as string[]).concat(res.headers['set-cookie'] || []);
  return cookies.find((c) => c.startsWith(`${COOKIE}=`));
}

async function registerAgent(email: string, displayName: string, dateOfBirth = '1997-03-10') {
  const agent = request.agent(app);
  const res = await agent.post('/api/v1/auth/register').send({ email, password: 'Password123!', displayName, dateOfBirth });
  expect(res.status).toBe(201);
  return { agent, id: res.body.data.user.id as string };
}

/** Gives a test member an active paid plan (Premium). */
async function makePremium(userId: string, days = 30) {
  await getDatabase().run(
    `UPDATE subscriptions SET plan = 'month', plan_started_at = UTC_TIMESTAMP(), plan_expires_at = UTC_TIMESTAMP() + INTERVAL ? DAY WHERE user_id = ?`,
    [days, userId]
  );
}

describe('Unmute API', () => {
  beforeAll(async () => {
    await resetTestDatabase();
  });

  describe('Email registration, login and sessions', () => {
    it('rejects registration under 18', async () => {
      const res = await request(app).post('/api/v1/auth/register').send({
        email: 'underage@example.com',
        password: 'Password123!',
        displayName: 'Underage User',
        dateOfBirth: '2012-05-15',
      });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/18 years of age/);
    });

    it('registers an 18+ user with an HttpOnly session cookie and no token in the body', async () => {
      const res = await request(app).post('/api/v1/auth/register').send({
        email: 'Alice@Example.com',
        password: 'Password123!',
        displayName: 'Alice',
        dateOfBirth: '1998-06-20',
      });
      expect(res.status).toBe(201);
      expect(res.body.data.token).toBeUndefined();
      expect(res.body.data.user.email).toBe('alice@example.com');
      expect(res.body.data.user.profile.age).toBeGreaterThanOrEqual(18);

      const cookie = sessionCookie(res);
      expect(cookie).toBeDefined();
      expect(cookie).toMatch(/HttpOnly/i);
      expect(cookie).toMatch(/SameSite=Lax/i);
    });

    it('stores the password hash only in auth_accounts', async () => {
      const row = await getDatabase().get(
        `SELECT a.password_hash FROM auth_accounts a JOIN users u ON u.id = a.user_id
         WHERE u.email = ? AND a.provider = 'password'`,
        ['alice@example.com']
      );
      expect(row.password_hash).toMatch(/^\$2[aby]\$12\$/);
    });

    it('rejects duplicate email registration', async () => {
      const res = await request(app).post('/api/v1/auth/register').send({
        email: 'alice@example.com',
        password: 'AnotherPassword!',
        displayName: 'Alice Clone',
        dateOfBirth: '1995-01-01',
      });
      expect(res.status).toBe(409);
    });

    it('rejects invalid login credentials without setting a cookie', async () => {
      const res = await request(app).post('/api/v1/auth/login').send({ email: 'alice@example.com', password: 'WrongPassword!' });
      expect(res.status).toBe(401);
      expect(sessionCookie(res)).toBeUndefined();
    });

    it('restores the session, then revokes it server-side on logout', async () => {
      const agent = request.agent(app);
      const login = await agent.post('/api/v1/auth/login').send({ email: 'alice@example.com', password: 'Password123!' });
      expect(login.status).toBe(200);
      const rawCookie = sessionCookie(login)!.split(';')[0];

      const session = await agent.get('/api/v1/auth/session');
      expect(session.body.data.authenticated).toBe(true);
      expect(session.body.data.user.email).toBe('alice@example.com');

      expect((await agent.post('/api/v1/auth/logout')).status).toBe(200);

      // Replaying the old cookie must fail: the session is revoked in the database, not just client-side.
      const replay = await request(app).get('/api/v1/auth/me').set('Cookie', rawCookie);
      expect(replay.status).toBe(401);
      const replaySession = await request(app).get('/api/v1/auth/session').set('Cookie', rawCookie);
      expect(replaySession.body.data.authenticated).toBe(false);
    });

    it('reports anonymous visitors as unauthenticated and protects endpoints', async () => {
      const session = await request(app).get('/api/v1/auth/session');
      expect(session.status).toBe(200);
      expect(session.body.data).toEqual({ authenticated: false, user: null });

      expect((await request(app).get('/api/v1/users/me')).status).toBe(401);
      expect((await request(app).get('/api/v1/users/me').set('Cookie', `${COOKIE}=forged-token`)).status).toBe(401);
      expect((await request(app).get('/api/v1/users/me').set('Authorization', 'Bearer anything')).status).toBe(401);
    });

    it('rejects state-changing requests from untrusted origins', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .set('Origin', 'https://evil.example')
        .send({ email: 'alice@example.com', password: 'Password123!' });
      expect(res.status).toBe(403);
      expect(sessionCookie(res)).toBeUndefined();
    });
  });

  describe('Google sign-in', () => {
    it('publishes the Google client ID and whether phone sign-in is on (and nothing else)', async () => {
      const res = await request(app).get('/api/v1/auth/config');
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({ googleClientId: 'test-client-id.apps.googleusercontent.com', phoneSignIn: true });
    });

    it('rejects client-asserted identity without a verified credential', async () => {
      const res = await request(app).post('/api/v1/auth/google').send({ email: 'alice@example.com', googleId: 'attacker' });
      expect(res.status).toBe(400);
      expect(sessionCookie(res)).toBeUndefined();
    });

    it('rejects extra identity fields even alongside a credential', async () => {
      const res = await request(app)
        .post('/api/v1/auth/google')
        .send({ credential: fakeGoogleCredential('sub-x', 'x@gmail.com'), email: 'alice@example.com' });
      expect(res.status).toBe(400);
    });

    it('rejects credentials that fail verification', async () => {
      const res = await request(app).post('/api/v1/auth/google').send({ credential: 'not-a-valid-google-id-token' });
      expect(res.status).toBe(401);
      expect(sessionCookie(res)).toBeUndefined();
    });

    it('asks a new Google user for a date of birth before creating anything', async () => {
      const res = await request(app).post('/api/v1/auth/google').send({ credential: fakeGoogleCredential('sub-new', 'new@gmail.com') });
      expect(res.status).toBe(200);
      expect(res.body.data.requiresDob).toBe(true);
      expect(res.body.data.profile.email).toBe('new@gmail.com');
      expect(sessionCookie(res)).toBeUndefined();

      const user = await getDatabase().get('SELECT id FROM users WHERE email = ?', ['new@gmail.com']);
      expect(user).toBeNull();
    });

    it('rejects an under-18 date of birth', async () => {
      const res = await request(app)
        .post('/api/v1/auth/google')
        .send({ credential: fakeGoogleCredential('sub-new', 'new@gmail.com'), dateOfBirth: '2012-05-15' });
      expect(res.status).toBe(400);
    });

    it('creates the account and a session once an 18+ date of birth is supplied', async () => {
      const res = await request(app)
        .post('/api/v1/auth/google')
        .send({ credential: fakeGoogleCredential('sub-new', 'new@gmail.com'), dateOfBirth: '1996-04-12' });
      expect(res.status).toBe(200);
      expect(res.body.data.isNewUser).toBe(true);
      expect(res.body.data.user.email).toBe('new@gmail.com');
      // Signing in with Google is not identity verification.
      expect(res.body.data.user.profile.isVerified).toBe(false);
      expect(sessionCookie(res)).toBeDefined();

      const link = await getDatabase().get(
        "SELECT user_id FROM auth_accounts WHERE provider = 'google' AND provider_account_id = ?",
        ['sub-new']
      );
      expect(link.user_id).toBe(res.body.data.user.id);
    });

    it('signs a returning Google user in by subject without asking for a date of birth again', async () => {
      const res = await request(app).post('/api/v1/auth/google').send({ credential: fakeGoogleCredential('sub-new', 'new@gmail.com') });
      expect(res.status).toBe(200);
      expect(res.body.data.requiresDob).toBe(false);
      expect(res.body.data.isNewUser).toBe(false);
      expect(sessionCookie(res)).toBeDefined();
    });

    it('links a verified Google email to the existing account with that email', async () => {
      const alice = await getDatabase().get('SELECT id FROM users WHERE email = ?', ['alice@example.com']);
      const res = await request(app).post('/api/v1/auth/google').send({ credential: fakeGoogleCredential('sub-alice', 'alice@example.com') });
      expect(res.status).toBe(200);
      expect(res.body.data.isNewUser).toBe(false);
      expect(res.body.data.user.id).toBe(alice.id);
    });

    it('refuses email-based linking or signup when Google has not verified the email', async () => {
      const res = await request(app)
        .post('/api/v1/auth/google')
        .send({ credential: fakeGoogleCredential('sub-unverified', 'alice@example.com', false), dateOfBirth: '1990-01-01' });
      expect(res.status).toBe(403);
      expect(sessionCookie(res)).toBeUndefined();
    });
  });

  describe('Phone sign-in', () => {
    const PHONE = '+919876543210';
    let codeSpy: ReturnType<typeof vi.spyOn>;

    /** The code from the last SMS the (console) sender printed for `phone`. */
    function lastCode(phone: string): string {
      const line = codeSpy.mock.calls.map((c) => String(c[0])).reverse().find((l) => l.startsWith(`[SMS] to ${phone}:`));
      return line!.match(/: (\d{6}) /)![1];
    }

    /** Lets a new code be sent straight away in tests (the real resend wait is 30 seconds). */
    async function skipResendWait(phone: string) {
      await getDatabase().run('UPDATE phone_codes SET created_at = created_at - INTERVAL 1 MINUTE WHERE phone = ?', [phone]);
    }

    beforeAll(() => {
      codeSpy = vi.spyOn(console, 'info');
    });

    it('rejects a number that is not a mobile number', async () => {
      const res = await request(app).post('/api/v1/auth/phone/start').send({ phone: '12345' });
      expect(res.status).toBe(400);
    });

    it('texts a code to a bare Indian number as +91 and stores only its hash', async () => {
      const res = await request(app).post('/api/v1/auth/phone/start').send({ phone: '98765 43210' });
      expect(res.status).toBe(200);
      expect(res.body.data.resendAfter).toBe(30);
      // Codes are only ever shown on screen in local development, never in tests or production.
      expect(res.body.data.devCode).toBeUndefined();
      const code = lastCode(PHONE);
      const row = await getDatabase().get('SELECT code_hash FROM phone_codes WHERE phone = ?', [PHONE]);
      expect(row.code_hash).not.toContain(code);
    });

    it('makes the member wait before another code is sent', async () => {
      const res = await request(app).post('/api/v1/auth/phone/start').send({ phone: PHONE });
      expect(res.status).toBe(429);
    });

    it('rejects a wrong code without signing in', async () => {
      const wrong = lastCode(PHONE) === '000000' ? '111111' : '000000';
      const res = await request(app).post('/api/v1/auth/phone/verify').send({ phone: PHONE, code: wrong });
      expect(res.status).toBe(400);
      expect(sessionCookie(res)).toBeUndefined();
    });

    it('asks a new number for a name and date of birth before creating anything', async () => {
      const res = await request(app).post('/api/v1/auth/phone/verify').send({ phone: PHONE, code: lastCode(PHONE) });
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({ requiresProfile: true });
      expect(sessionCookie(res)).toBeUndefined();
      const link = await getDatabase().get("SELECT user_id FROM auth_accounts WHERE provider = 'phone' AND provider_account_id = ?", [PHONE]);
      expect(link).toBeNull();
    });

    it('rejects an under-18 date of birth', async () => {
      const res = await request(app)
        .post('/api/v1/auth/phone/verify')
        .send({ phone: PHONE, code: lastCode(PHONE), displayName: 'Young', dateOfBirth: '2012-05-15' });
      expect(res.status).toBe(400);
    });

    it('creates an account without an email, and a session, once the profile is supplied', async () => {
      const res = await request(app)
        .post('/api/v1/auth/phone/verify')
        .send({ phone: PHONE, code: lastCode(PHONE), displayName: 'Priya', dateOfBirth: '1999-02-02' });
      expect(res.status).toBe(200);
      expect(res.body.data.isNewUser).toBe(true);
      expect(res.body.data.user.email).toBeNull();
      expect(res.body.data.user.phone).toBe(PHONE);
      expect(res.body.data.user.profile.displayName).toBe('Priya');
      expect(sessionCookie(res)).toBeDefined();
    });

    it('never accepts the same code twice', async () => {
      const res = await request(app).post('/api/v1/auth/phone/verify').send({ phone: PHONE, code: lastCode(PHONE) });
      expect(res.status).toBe(400);
      expect(sessionCookie(res)).toBeUndefined();
    });

    it('signs a returning number in to the same account', async () => {
      await skipResendWait(PHONE);
      expect((await request(app).post('/api/v1/auth/phone/start').send({ phone: PHONE })).status).toBe(200);
      const res = await request(app).post('/api/v1/auth/phone/verify').send({ phone: PHONE, code: lastCode(PHONE) });
      expect(res.status).toBe(200);
      expect(res.body.data.isNewUser).toBe(false);
      expect(res.body.data.user.phone).toBe(PHONE);
      expect(sessionCookie(res)).toBeDefined();
    });

    it('registers with email and a phone number only once the SMS code is given', async () => {
      const phone = '+919800011122';
      const details = { email: 'withphone@example.com', password: 'Password123!', displayName: 'Kavya', dateOfBirth: '1998-08-08', phone: '98000 11122' };

      const first = await request(app).post('/api/v1/auth/register').send(details);
      expect(first.status).toBe(200);
      expect(first.body.data).toEqual({ requiresPhoneCode: true });
      expect(sessionCookie(first)).toBeUndefined();
      expect(await getDatabase().get('SELECT id FROM users WHERE email = ?', ['withphone@example.com'])).toBeNull();

      expect((await request(app).post('/api/v1/auth/phone/start').send({ phone })).status).toBe(200);
      const wrong = lastCode(phone) === '000000' ? '111111' : '000000';
      expect((await request(app).post('/api/v1/auth/register').send({ ...details, code: wrong })).status).toBe(400);

      const res = await request(app).post('/api/v1/auth/register').send({ ...details, code: lastCode(phone) });
      expect(res.status).toBe(201);
      expect(res.body.data.user.email).toBe('withphone@example.com');
      expect(res.body.data.user.phone).toBe(phone);
    });

    it('refuses to register a phone number that already has an account', async () => {
      const res = await request(app).post('/api/v1/auth/register').send({
        email: 'taken@example.com', password: 'Password123!', displayName: 'Taken', dateOfBirth: '1998-08-08', phone: PHONE,
      });
      expect(res.status).toBe(409);
      expect(res.body.error).toMatch(/already registered/);
    });

    it('adds a confirmed number to a signed-in account, and refuses one owned by someone else', async () => {
      const { agent } = await registerAgent('linker@example.com', 'Linker');
      const phone = '+919811122233';
      expect((await request(app).post('/api/v1/auth/phone/start').send({ phone })).status).toBe(200);
      const res = await agent.post('/api/v1/auth/phone/link').send({ phone, code: lastCode(phone) });
      expect(res.status).toBe(200);
      expect(res.body.data.user.phone).toBe(phone);

      await skipResendWait(PHONE);
      expect((await request(app).post('/api/v1/auth/phone/start').send({ phone: PHONE })).status).toBe(200);
      const taken = await agent.post('/api/v1/auth/phone/link').send({ phone: PHONE, code: lastCode(PHONE) });
      expect(taken.status).toBe(409);
    });

    it('stops accepting a code after five wrong guesses', async () => {
      const phone = '+919812345678';
      expect((await request(app).post('/api/v1/auth/phone/start').send({ phone })).status).toBe(200);
      const code = lastCode(phone);
      const wrong = code === '000000' ? '111111' : '000000';
      for (let i = 0; i < 5; i++) {
        await request(app).post('/api/v1/auth/phone/verify').send({ phone, code: wrong });
      }
      const res = await request(app).post('/api/v1/auth/phone/verify').send({ phone, code, displayName: 'Guess', dateOfBirth: '1990-01-01' });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/expired/);
    });
  });

  describe('Profile & interests', () => {
    let alice: request.Agent;

    beforeAll(async () => {
      alice = request.agent(app);
      await alice.post('/api/v1/auth/login').send({ email: 'alice@example.com', password: 'Password123!' });
    });

    it('gets the authenticated user profile', async () => {
      const res = await alice.get('/api/v1/users/me');
      expect(res.status).toBe(200);
      expect(res.body.data.displayName).toBe('Alice');
    });

    it('updates the profile and syncs interests', async () => {
      const interestsRes = await alice.get('/api/v1/users/interests');
      const interestIds = interestsRes.body.data.slice(0, 3).map((i: any) => i.id);

      const res = await alice.patch('/api/v1/users/me').send({
        bio: 'Connecting through books and philosophy.',
        approximateLocation: 'Hyderabad',
        interactionPreferences: ['Deep conversations', 'Book/Movie discussions'],
        interestIds,
      });
      expect(res.status).toBe(200);
      expect(res.body.data.bio).toBe('Connecting through books and philosophy.');
      expect(res.body.data.interests.length).toBe(3);
    });

    it('de-duplicates repeated interest ids', async () => {
      const interestsRes = await alice.get('/api/v1/users/interests');
      const id = interestsRes.body.data[0].id;
      const res = await alice.patch('/api/v1/users/me').send({ interestIds: [id, id] });
      expect(res.status).toBe(200);
      expect(res.body.data.interests.map((i: any) => i.id)).toEqual([id]);
    });

    it('rejects unknown interests without applying any part of the update', async () => {
      const res = await alice.patch('/api/v1/users/me').send({ bio: 'Should not be saved', interestIds: ['no-such-interest'] });
      expect(res.status).toBe(400);
      const profile = await alice.get('/api/v1/users/me');
      expect(profile.body.data.bio).toBe('Connecting through books and philosophy.');
      expect(profile.body.data.interests.length).toBe(1);
    });
  });

  describe('Profile details', () => {
    let member: { agent: request.Agent; id: string };
    let viewer: { agent: request.Agent; id: string };

    beforeAll(async () => {
      member = await registerAgent('details@example.com', 'Details');
      viewer = await registerAgent('details-viewer@example.com', 'Viewer');
    });

    it('saves work, height, lifestyle and photos, and shows them to others without gender', async () => {
      const res = await member.agent.patch('/api/v1/users/me').send({
        gender: 'woman',
        profession: 'Product Designer',
        heightCm: 165,
        lifestyle: { drinking: 'socially', smoking: 'never', workout: 'often' },
        photos: ['https://example.com/1.jpg', 'https://example.com/2.jpg'],
      });
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        gender: 'woman',
        profession: 'Product Designer',
        heightCm: 165,
        lifestyle: { drinking: 'socially', smoking: 'never', workout: 'often' },
        photos: ['https://example.com/1.jpg', 'https://example.com/2.jpg'],
      });

      const feed = await viewer.agent.get('/api/v1/discover');
      const card = feed.body.data.find((u: any) => u.id === member.id);
      expect(card).toMatchObject({ profession: 'Product Designer', heightCm: 165, isOnline: false });
      expect(card.photos).toHaveLength(2);
      expect(card).not.toHaveProperty('gender');
    });

    it('rejects out-of-range details and non-https photos', async () => {
      for (const body of [
        { heightCm: 300 },
        { gender: 'robot' },
        { lifestyle: { smoking: 'daily' } },
        { photos: ['http://example.com/a.jpg'] },
        { photos: Array.from({ length: 7 }, (_, i) => `https://example.com/${i}.jpg`) },
      ]) {
        expect((await member.agent.patch('/api/v1/users/me').send(body)).status).toBe(400);
      }
    });
  });

  describe('Photo uploads', () => {
    let owner: { agent: request.Agent; id: string };
    let other: { agent: request.Agent; id: string };
    const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4c00000000049454e44ae426082', 'hex');

    beforeAll(async () => {
      owner = await registerAgent('uploader@example.com', 'Uploader');
      other = await registerAgent('uploader-other@example.com', 'Other');
    });

    const upload = (agent: request.Agent, body: Buffer, type = 'image/png') =>
      agent.post('/api/v1/users/me/photos').set('Content-Type', type).send(body);

    it('stores an image, serves it back, and lets the owner use it on their profile', async () => {
      const res = await upload(owner.agent, PNG);
      expect(res.status).toBe(201);
      const url: string = res.body.data.url;
      expect(url).toMatch(new RegExp(`^/api/v1/media/${owner.id}-[0-9a-f-]+\\.png$`));

      const served = await request(app).get(url);
      expect(served.status).toBe(200);
      expect(served.headers['content-type']).toContain('image/png');

      const saved = await owner.agent.patch('/api/v1/users/me').send({ avatarUrl: url, photos: [url] });
      expect(saved.status).toBe(200);
      expect(saved.body.data.avatarUrl).toBe(url);
    });

    it('rejects files that are not images, whatever their declared type', async () => {
      expect((await upload(owner.agent, Buffer.from('<script>alert(1)</script>'), 'image/png')).status).toBe(415);
      expect((await upload(owner.agent, PNG, 'text/plain')).status).toBe(400);
    });

    it('rejects photos over 5 MB', async () => {
      const big = Buffer.concat([PNG, Buffer.alloc(5 * 1024 * 1024)]);
      const res = await upload(owner.agent, big);
      expect(res.status).toBe(413);
      expect(res.body.error).toBe('Photos must be 5 MB or smaller.');
    });

    it("refuses to put someone else's upload on your profile", async () => {
      const url = (await upload(owner.agent, PNG)).body.data.url;
      expect((await other.agent.patch('/api/v1/users/me').send({ photos: [url] })).status).toBe(403);
    });

    it('requires sign-in and answers 404 for unknown files', async () => {
      expect((await request(app).post('/api/v1/users/me/photos').set('Content-Type', 'image/png').send(PNG)).status).toBe(401);
      expect((await request(app).get(`/api/v1/media/${MISSING_ID}-${MISSING_ID}.png`)).status).toBe(404);
    });
  });

  describe('Discovery filters', () => {
    let viewer: { agent: request.Agent; id: string };
    let woman: { agent: request.Agent; id: string };
    let man: { agent: request.Agent; id: string };
    let interestId: string;

    beforeAll(async () => {
      viewer = await registerAgent('filter-viewer@example.com', 'Filter Viewer');
      woman = await registerAgent('filter-woman@example.com', 'Filter Woman');
      man = await registerAgent('filter-man@example.com', 'Filter Man');
      interestId = (await viewer.agent.get('/api/v1/users/interests')).body.data[0].id;
      await woman.agent.patch('/api/v1/users/me').send({ gender: 'woman', interestIds: [interestId], interactionPreferences: ['Long Term'] });
      await man.agent.patch('/api/v1/users/me').send({ gender: 'man', interactionPreferences: ['Casual Dating'] });
    });

    const idsFor = async (query: string) =>
      (await viewer.agent.get(`/api/v1/discover?${query}`)).body.data.map((u: any) => u.id);

    it('narrows by "Show me"', async () => {
      const women = await idsFor('showMe=women');
      expect(women).toContain(woman.id);
      expect(women).not.toContain(man.id);
    });

    it('narrows by shared interests', async () => {
      const ids = await idsFor(`interestIds=${interestId}`);
      expect(ids).toContain(woman.id);
      expect(ids).not.toContain(man.id);
    });

    it('narrows by what people are looking for', async () => {
      const relationship = await idsFor('lookingFor=Relationship');
      expect(relationship).toContain(woman.id);
      expect(relationship).not.toContain(man.id);
      expect(await idsFor('lookingFor=Casual')).toContain(man.id);
    });

    it('narrows by education level and profession field', async () => {
      // Advanced filters are Premium.
      expect((await viewer.agent.get('/api/v1/discover?educationLevel=masters')).status).toBe(403);
      await makePremium(viewer.id);
      await woman.agent.patch('/api/v1/users/me').send({ educationLevel: 'masters', professionField: 'healthcare' });
      await man.agent.patch('/api/v1/users/me').send({ educationLevel: 'bachelors', professionField: 'it_software' });
      const masters = await idsFor('educationLevel=masters');
      expect(masters).toContain(woman.id);
      expect(masters).not.toContain(man.id);
      const it = await idsFor('professionField=it_software');
      expect(it).toContain(man.id);
      expect(it).not.toContain(woman.id);
      expect((await viewer.agent.get('/api/v1/discover?educationLevel=college')).status).toBe(400);
    });

    it('searches by name, work, bio and interests, with every word required', async () => {
      await woman.agent.patch('/api/v1/users/me').send({ profession: 'Pediatric Nurse', bio: 'Loves 100% dark chocolate' });
      await man.agent.patch('/api/v1/users/me').send({ profession: 'Backend Engineer', bio: 'Trail runner' });
      const interestName = (await viewer.agent.get('/api/v1/users/interests')).body.data[0].name as string;

      expect(await idsFor('q=nurse')).toEqual([woman.id]);
      expect(await idsFor('q=ENGINEER')).toEqual([man.id]);
      expect(await idsFor(`q=${encodeURIComponent(interestName)}`)).toContain(woman.id);
      expect(await idsFor('q=filter%20runner')).toEqual([man.id]);
      expect(await idsFor('q=nurse%20runner')).toEqual([]);
      // LIKE wildcards are matched literally.
      expect(await idsFor('q=100%25')).toEqual([woman.id]);
      expect(await idsFor('q=_')).toEqual([]);
      expect(await idsFor('q=%20%20')).toEqual(expect.arrayContaining([woman.id, man.id]));
      expect((await viewer.agent.get(`/api/v1/discover?q=${'a'.repeat(61)}`)).status).toBe(400);
    });

    it('counts the likes a member has received', async () => {
      await woman.agent.post('/api/v1/interactions/like').send({ targetUserId: viewer.id });
      await man.agent.post('/api/v1/interactions/like').send({ targetUserId: viewer.id });
      expect((await viewer.agent.get('/api/v1/users/me')).body.data.likesReceived).toBe(2);
    });

    it('rejects unknown filter values', async () => {
      expect((await viewer.agent.get('/api/v1/discover?showMe=robots')).status).toBe(400);
      expect((await viewer.agent.get('/api/v1/discover?lookingFor=Anything')).status).toBe(400);
    });
  });

  describe('Likes lists', () => {
    it('lists who you liked and who liked you until it becomes a match', async () => {
      const me = await registerAgent('likes-me@example.com', 'Me');
      const fan = await registerAgent('likes-fan@example.com', 'Fan');
      const crush = await registerAgent('likes-crush@example.com', 'Crush');
      await fan.agent.post('/api/v1/interactions/like').send({ targetUserId: me.id });
      await me.agent.post('/api/v1/interactions/like').send({ targetUserId: crush.id });

      const ids = async (path: string) => (await me.agent.get(`/api/v1/interactions/${path}`)).body.data.map((p: any) => p.id);
      expect(await ids('likes-received')).toEqual([fan.id]);
      expect(await ids('liked')).toEqual([crush.id]);

      // Liking back makes a match, so both lists empty out.
      await me.agent.post('/api/v1/interactions/like').send({ targetUserId: fan.id });
      await crush.agent.post('/api/v1/interactions/like').send({ targetUserId: me.id });
      expect(await ids('likes-received')).toEqual([]);
      expect(await ids('liked')).toEqual([]);
    });
  });

  describe('Super Likes, Rewind and password reset', () => {
    it('shows who sent a Super Like, puts it first, and limits them per day', async () => {
      const me = await registerAgent('super-me@example.com', 'Me');
      const fan = await registerAgent('super-fan@example.com', 'Fan');
      const plain = await registerAgent('super-plain@example.com', 'Plain');
      await plain.agent.post('/api/v1/interactions/like').send({ targetUserId: me.id });
      await fan.agent.post('/api/v1/interactions/like').send({ targetUserId: me.id, superLike: true });

      const received = (await me.agent.get('/api/v1/interactions/likes-received')).body.data;
      expect(received.map((p: any) => [p.id, p.superLike])).toEqual([[fan.id, true], [plain.id, false]]);

      const notes = (await me.agent.get('/api/v1/notifications')).body.data.items.filter((n: any) => n.type === 'like');
      expect(notes.find((n: any) => n.preview === 'super').actor.id).toBe(fan.id);
      expect(notes.find((n: any) => n.preview !== 'super').actor).toBeNull();

      const targets = await Promise.all([1, 2, 3, 4, 5].map((n) => registerAgent(`super-t${n}@example.com`, `T${n}`)));
      for (const t of targets.slice(0, 4)) {
        expect((await fan.agent.post('/api/v1/interactions/like').send({ targetUserId: t.id, superLike: true })).status).toBe(200);
      }
      const sixth = await fan.agent.post('/api/v1/interactions/like').send({ targetUserId: targets[4].id, superLike: true });
      expect(sixth.status).toBe(429);
    }, 20_000); // Signs up eight accounts; password hashing is deliberately slow.

    it('rewinds a recent pass so the person shows up again', async () => {
      const me = await registerAgent('rewind-me@example.com', 'Me');
      const other = await registerAgent('rewind-other@example.com', 'Other');
      const feedIds = async () => (await me.agent.get('/api/v1/discover?limit=50')).body.data.map((p: any) => p.id);
      await me.agent.post('/api/v1/interactions/pass').send({ targetUserId: other.id });
      expect(await feedIds()).not.toContain(other.id);
      expect((await me.agent.delete('/api/v1/interactions/pass').send({ targetUserId: other.id })).status).toBe(200);
      expect(await feedIds()).toContain(other.id);
      expect((await me.agent.delete('/api/v1/interactions/pass').send({ targetUserId: other.id })).status).toBe(404);
    });

    it('resets a password with an SMS code to the account\'s phone, signing out old sessions', async () => {
      const email = 'reset-me@example.com';
      const phone = '+919822200011';
      const { agent } = await registerAgent(email, 'Resetter');
      const infoSpy = vi.spyOn(console, 'info');
      const code = () => infoSpy.mock.calls.map((c) => String(c[0])).reverse().find((l) => l.startsWith(`[SMS] to ${phone}:`))!.match(/: (\d{6}) /)![1];
      await request(app).post('/api/v1/auth/phone/start').send({ phone });
      expect((await agent.post('/api/v1/auth/phone/link').send({ phone, code: code() })).status).toBe(200);
      await getDatabase().run('UPDATE phone_codes SET created_at = created_at - INTERVAL 1 MINUTE WHERE phone = ?', [phone]);

      // Unknown emails get the same answer, so nobody can test which emails are registered.
      expect((await request(app).post('/api/v1/auth/password/forgot').send({ email: 'nobody@example.com' })).body).toEqual({ success: true, data: {} });
      expect((await request(app).post('/api/v1/auth/password/forgot').send({ email })).status).toBe(200);

      const reset = await request(app).post('/api/v1/auth/password/reset').send({ email, code: code(), password: 'NewPassword456!' });
      expect(reset.status).toBe(200);
      expect((await agent.get('/api/v1/auth/me')).status).toBe(401);
      expect((await request(app).post('/api/v1/auth/login').send({ email, password: 'NewPassword456!' })).status).toBe(200);
      expect((await request(app).post('/api/v1/auth/login').send({ email, password: 'Password123!' })).status).toBe(401);
    });
  });

  describe('Photo and voice messages', () => {
    it('sends your own uploaded photo or recording, never someone else\'s file', async () => {
      const a = await registerAgent('media-a@example.com', 'MediaA');
      const b = await registerAgent('media-b@example.com', 'MediaB');
      await a.agent.post('/api/v1/interactions/like').send({ targetUserId: b.id });
      const conversationId = (await b.agent.post('/api/v1/interactions/like').send({ targetUserId: a.id })).body.data.conversationId;

      const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
      const photo = (await a.agent.post('/api/v1/users/me/photos').set('Content-Type', 'image/png').send(png)).body.data.url;
      const webm = Buffer.concat([Buffer.from('1a45dfa3', 'hex'), Buffer.alloc(32)]);
      const voice = await a.agent.post('/api/v1/users/me/voice').set('Content-Type', 'audio/webm').send(webm);
      expect(voice.status).toBe(201);

      const sent = await a.agent.post(`/api/v1/conversations/${conversationId}/messages`).send({ content: photo, kind: 'image' });
      expect(sent.status).toBe(201);
      expect(sent.body.data.kind).toBe('image');
      expect((await a.agent.post(`/api/v1/conversations/${conversationId}/messages`).send({ content: voice.body.data.url, kind: 'voice' })).status).toBe(201);

      // B can't pass A's upload off as their own, and a photo can't be sent as a voice message.
      expect((await b.agent.post(`/api/v1/conversations/${conversationId}/messages`).send({ content: photo, kind: 'image' })).status).toBe(400);
      expect((await a.agent.post(`/api/v1/conversations/${conversationId}/messages`).send({ content: photo, kind: 'voice' })).status).toBe(400);
      expect((await a.agent.post('/api/v1/users/me/voice').set('Content-Type', 'audio/webm').send(png)).status).toBe(415);

      const notes = (await b.agent.get('/api/v1/notifications')).body.data.items;
      expect(notes.find((n: any) => n.type === 'message').preview).toBe('🎤 Voice message');
    });
  });

  describe('Email, selfie and ID verification', () => {
    const emailCode = (spy: ReturnType<typeof vi.spyOn>, to: string) =>
      spy.mock.calls.map((c) => String(c[0])).reverse().find((l) => l.startsWith(`[Email] to ${to}:`))!.match(/code is (\d{6})/)![1];

    it('verifies an email with a code, and refuses an address owned by someone else', async () => {
      const spy = vi.spyOn(console, 'info');
      const { agent } = await registerAgent('verify-mail@example.com', 'Mailer');
      expect((await agent.post('/api/v1/users/me/verification/email/start').send({})).status).toBe(200);
      const wrong = await agent.post('/api/v1/users/me/verification/email/confirm').send({ email: 'verify-mail@example.com', code: '000000' });
      expect(wrong.status).toBe(400);
      const ok = await agent.post('/api/v1/users/me/verification/email/confirm').send({ email: 'verify-mail@example.com', code: emailCode(spy, 'verify-mail@example.com') });
      expect(ok.status).toBe(200);
      expect(ok.body.data.email).toEqual({ address: 'verify-mail@example.com', verified: true });
      expect((await agent.post('/api/v1/users/me/verification/email/start').send({ email: 'alice@example.com' })).status).toBe(409);
    });

    it('sends selfies and IDs to moderators privately, and approval verifies the profile', async () => {
      const member = await registerAgent('verify-selfie@example.com', 'Selfie');
      const mod = await registerAgent('moderator@example.com', 'Mod');
      const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');

      const { requestId, gesture } = (await member.agent.post('/api/v1/users/me/verification/selfie/start')).body.data;
      expect(gesture).toBeTruthy();
      const sent = await member.agent.post(`/api/v1/users/me/verification/selfie/${requestId}`).set('Content-Type', 'image/png').send(png);
      expect(sent.status).toBe(201);
      expect(sent.body.data.selfie.status).toBe('pending');
      expect((await member.agent.post('/api/v1/users/me/verification/id').set('Content-Type', 'image/png').send(png)).status).toBe(201);

      // Only moderators see the queue and the private images; to others it doesn't exist.
      expect((await member.agent.get('/api/v1/admin/verifications')).status).toBe(404);
      const queue = (await mod.agent.get('/api/v1/admin/verifications')).body.data.filter((r: any) => r.user.id === member.id);
      expect(queue.map((r: any) => r.kind).sort()).toEqual(['id', 'selfie']);
      const selfie = queue.find((r: any) => r.kind === 'selfie');
      expect(selfie.gesture).toBe(gesture);
      expect((await mod.agent.get(`/api/v1/admin/verifications/${selfie.id}/image`)).status).toBe(200);
      expect((await member.agent.get(`/api/v1/admin/verifications/${selfie.id}/image`)).status).toBe(404);

      await mod.agent.post(`/api/v1/admin/verifications/${selfie.id}/decision`).send({ approve: true });
      const idReq = queue.find((r: any) => r.kind === 'id');
      await mod.agent.post(`/api/v1/admin/verifications/${idReq.id}/decision`).send({ approve: false, reason: 'The photo was blurry.' });

      const status = (await member.agent.get('/api/v1/users/me/verification')).body.data;
      expect(status.selfie).toEqual({ status: 'verified', reason: null });
      expect(status.id).toEqual({ status: 'rejected', reason: 'The photo was blurry.' });
      expect((await member.agent.get('/api/v1/users/me')).body.data.isVerified).toBe(true);
      // The image is deleted once reviewed.
      expect((await mod.agent.get(`/api/v1/admin/verifications/${selfie.id}/image`)).status).toBe(404);
    });
  });

  describe('Premium extras', () => {
    it('shows a Premium badge, allows 25 Super Likes, and lists Premium likes first', async () => {
      const me = await registerAgent('prem-me@example.com', 'Me');
      const freeFan = await registerAgent('prem-free@example.com', 'Free');
      const paidFan = await registerAgent('prem-paid@example.com', 'Paid');
      await makePremium(paidFan.id);
      await freeFan.agent.post('/api/v1/interactions/like').send({ targetUserId: me.id });
      await paidFan.agent.post('/api/v1/interactions/like').send({ targetUserId: me.id });

      const received = (await me.agent.get('/api/v1/interactions/likes-received')).body.data;
      expect(received.map((p: any) => [p.id, p.isPremium])).toEqual([[paidFan.id, true], [freeFan.id, false]]);

      const overview = (await paidFan.agent.get('/api/v1/users/me/premium')).body.data;
      expect(overview.isPremium).toBe(true);
      expect(overview.superLikes.limit).toBe(25);
      expect((await freeFan.agent.get('/api/v1/users/me/premium')).body.data.superLikes.limit).toBe(5);
    });

    it('boosts a Premium profile to the top of Discover, once a week', async () => {
      const viewer = await registerAgent('boost-viewer@example.com', 'Viewer');
      const booster = await registerAgent('boost-me@example.com', 'Booster');
      const free = await registerAgent('boost-free@example.com', 'Free');

      expect((await free.agent.post('/api/v1/users/me/premium/boost')).status).toBe(403);
      await makePremium(booster.id);
      const boosted = await booster.agent.post('/api/v1/users/me/premium/boost');
      expect(boosted.status).toBe(200);
      expect(boosted.body.data.boost.activeUntil).toBeTruthy();
      expect((await viewer.agent.get('/api/v1/discover')).body.data[0].id).toBe(booster.id);
      expect((await booster.agent.post('/api/v1/users/me/premium/boost')).status).toBe(429);
      // End it, so later tests see Discover's normal order.
      await getDatabase().run('UPDATE boosts SET ends_at = UTC_TIMESTAMP() WHERE user_id = ?', [booster.id]);
    });

    it('searches around the travel city in Travel mode, and shows where they are travelling', async () => {
      const traveller = await registerAgent('travel-me@example.com', 'Traveller');
      const place = (await traveller.agent.get('/api/v1/locations/search?q=Pune')).body.data[0];
      expect((await traveller.agent.put('/api/v1/users/me/premium/travel').send({ placeId: place.id })).status).toBe(403);
      await makePremium(traveller.id);
      const set = await traveller.agent.put('/api/v1/users/me/premium/travel').send({ placeId: place.id });
      expect(set.status).toBe(200);
      expect(set.body.data.travel.label).toMatch(/Pune/);
      expect((await traveller.agent.get('/api/v1/users/me')).body.data.travellingTo).toMatch(/Pune/);
      // Distance filters now work from Pune even without a home area set.
      expect((await traveller.agent.get('/api/v1/discover?radiusKm=50')).status).toBe(200);
      await traveller.agent.delete('/api/v1/users/me/premium/travel');
      expect((await traveller.agent.get('/api/v1/users/me')).body.data.travellingTo).toBeNull();
    });
  });

  describe('Verified and lifestyle filters', () => {
    it('narrows discovery to verified members and to lifestyle answers', async () => {
      const viewer = await registerAgent('lifeviewer@example.com', 'Viewer');
      await makePremium(viewer.id);
      const smoker = await registerAgent('smoker@example.com', 'Smoker');
      const verified = await registerAgent('verifiedone@example.com', 'Verified');
      await smoker.agent.patch('/api/v1/users/me').send({ lifestyle: { smoking: 'regularly' } });
      await getDatabase().run('UPDATE profiles SET is_verified = 1 WHERE user_id = ?', [verified.id]);

      const ids = async (query: string) =>
        (await viewer.agent.get(`/api/v1/discover?${query}`)).body.data.map((p: { id: string }) => p.id);

      const onlyVerified = await ids('verifiedOnly=true');
      expect(onlyVerified).toContain(verified.id);
      expect(onlyVerified).not.toContain(smoker.id);

      const smokers = await ids('smoking=regularly');
      expect(smokers).toContain(smoker.id);
      expect(smokers).not.toContain(verified.id);

      expect((await viewer.agent.get('/api/v1/discover?smoking=always')).status).toBe(400);
    });
  });

  describe('Discovery, matching & chat', () => {
    let a: { agent: request.Agent; id: string };
    let b: { agent: request.Agent; id: string };

    beforeAll(async () => {
      a = await registerAgent('usera@example.com', 'User A');
      b = await registerAgent('userb@example.com', 'User B', '1999-08-25');
    });

    it('finds User B in User A discovery feed', async () => {
      const res = await a.agent.get('/api/v1/discover');
      expect(res.status).toBe(200);
      expect(res.body.data.find((u: any) => u.id === b.id)?.displayName).toBe('User B');
    });

    it('creates a match and conversation only on a mutual like, then allows chat', async () => {
      const first = await a.agent.post('/api/v1/interactions/like').send({ targetUserId: b.id });
      expect(first.body.data.matched).toBe(false);

      const second = await b.agent.post('/api/v1/interactions/like').send({ targetUserId: a.id });
      expect(second.body.data.matched).toBe(true);
      const conversationId = second.body.data.conversationId;

      const matches = await a.agent.get('/api/v1/matches');
      expect(matches.body.data.some((m: any) => m.conversationId === conversationId)).toBe(true);

      const sent = await a.agent.post(`/api/v1/conversations/${conversationId}/messages`).send({ content: 'Hello User B!' });
      expect(sent.status).toBe(201);
      expect(sent.body.data.senderId).toBe(a.id);

      const read = await b.agent.get(`/api/v1/conversations/${conversationId}/messages`);
      expect(read.body.data.messages.map((m: any) => m.content)).toEqual(['Hello User B!']);
      // History uses the same camelCase message shape as send responses and realtime events.
      expect(read.body.data.messages[0]).toEqual({
        id: sent.body.data.id,
        conversationId,
        senderId: a.id,
        content: 'Hello User B!',
        status: 'sent',
        createdAt: sent.body.data.createdAt,
        kind: 'text',
      });

      const conversations = await b.agent.get('/api/v1/conversations');
      const conversation = conversations.body.data.find((c: any) => c.id === conversationId);
      expect(conversation.lastMessage.senderId).toBe(a.id);
      expect(conversation.otherUser).toMatchObject({ id: a.id, displayName: 'User A' });
    });

    it('treats a repeated like as a no-op', async () => {
      const res = await a.agent.post('/api/v1/interactions/like').send({ targetUserId: b.id });
      expect(res.status).toBe(200);
      expect(res.body.data.matched).toBe(true);
      const likes = await getDatabase().get('SELECT COUNT(*) AS n FROM likes WHERE liker_id = ? AND likee_id = ?', [a.id, b.id]);
      expect(Number(likes.n)).toBe(1);
    });

    it('creates exactly one match and conversation when two users like each other simultaneously', async () => {
      const c = await registerAgent('userc@example.com', 'User C');
      const d = await registerAgent('userd@example.com', 'User D');

      for (let round = 0; round < 5; round++) {
        await getDatabase().run('DELETE FROM likes WHERE liker_id IN (?, ?)', [c.id, d.id]);
        await getDatabase().run('DELETE FROM matches WHERE user_a_id IN (?, ?)', [c.id, d.id]);

        const [fromC, fromD] = await Promise.all([
          c.agent.post('/api/v1/interactions/like').send({ targetUserId: d.id }),
          d.agent.post('/api/v1/interactions/like').send({ targetUserId: c.id }),
        ]);
        expect([fromC.status, fromD.status]).toEqual([200, 200]);
        expect(fromC.body.data.matched || fromD.body.data.matched).toBe(true);

        const counts = await getDatabase().get(
          `SELECT (SELECT COUNT(*) FROM matches WHERE user_a_id IN (?, ?) AND user_b_id IN (?, ?)) AS matches,
                  (SELECT COUNT(*) FROM conversations WHERE user_a_id IN (?, ?) AND user_b_id IN (?, ?)) AS conversations`,
          [c.id, d.id, c.id, d.id, c.id, d.id, c.id, d.id]
        );
        expect([Number(counts.matches), Number(counts.conversations)]).toEqual([1, 1]);
      }
    });

    it('returns 404 when liking or passing on a user that does not exist, 400 for malformed ids', async () => {
      expect((await a.agent.post('/api/v1/interactions/like').send({ targetUserId: MISSING_ID })).status).toBe(404);
      expect((await a.agent.post('/api/v1/interactions/pass').send({ targetUserId: MISSING_ID })).status).toBe(404);
      expect((await a.agent.post('/api/v1/interactions/like').send({ targetUserId: "1' OR '1'='1" })).status).toBe(400);
    });

    it('returns the most recent page of message history, oldest first', async () => {
      const convs = await a.agent.get('/api/v1/conversations');
      const conversationId = convs.body.data.find((c: any) => c.otherUser.id === b.id).id;
      for (const content of ['second', 'third', 'fourth']) {
        await a.agent.post(`/api/v1/conversations/${conversationId}/messages`).send({ content });
      }
      const page = await b.agent.get(`/api/v1/conversations/${conversationId}/messages?limit=2`);
      expect(page.body.data.messages.map((m: any) => m.content)).toEqual(['third', 'fourth']);
      const older = await b.agent.get(`/api/v1/conversations/${conversationId}/messages?limit=2&offset=2`);
      expect(older.body.data.messages.map((m: any) => m.content)).toEqual(['Hello User B!', 'second']);
    });

    it('never exposes a conversation to a non-participant (IDOR)', async () => {
      const outsider = await registerAgent('outsider@example.com', 'Outsider');
      const convs = await a.agent.get('/api/v1/conversations');
      const conversationId = convs.body.data[0].id;

      expect((await outsider.agent.get(`/api/v1/conversations/${conversationId}/messages`)).status).toBe(404);
      const send = await outsider.agent.post(`/api/v1/conversations/${conversationId}/messages`).send({ content: 'hi' });
      expect(send.status).toBe(404);
      expect((await outsider.agent.get('/api/v1/conversations')).body.data).toEqual([]);
    });
  });

  describe('Notifications', () => {
    it('keeps likes anonymous, turns them into a match, and folds messages per conversation', async () => {
      const a = await registerAgent('notify-a@example.com', 'Asha');
      const b = await registerAgent('notify-b@example.com', 'Bala');
      const feed = async (agent: typeof a.agent) => (await agent.get('/api/v1/notifications')).body.data;

      await a.agent.post('/api/v1/interactions/like').send({ targetUserId: b.id });
      // Repeating a like does not notify again.
      await a.agent.post('/api/v1/interactions/like').send({ targetUserId: b.id });
      let bFeed = await feed(b.agent);
      expect(bFeed.unreadCount).toBe(1);
      expect(bFeed.items).toHaveLength(1);
      expect(bFeed.items[0]).toMatchObject({ type: 'like', read: false, actor: null });

      const match = await b.agent.post('/api/v1/interactions/like').send({ targetUserId: a.id });
      const conversationId = match.body.data.conversationId;
      bFeed = await feed(b.agent);
      // The anonymous like is replaced; the one who completed the match has already seen it.
      expect(bFeed.items.map((n: any) => n.type)).toEqual(['match']);
      expect(bFeed.items[0]).toMatchObject({ read: true, conversationId, actor: { id: a.id, displayName: 'Asha' } });
      let aFeed = await feed(a.agent);
      expect(aFeed.unreadCount).toBe(1);
      expect(aFeed.items[0]).toMatchObject({ type: 'match', read: false, actor: { id: b.id } });

      await b.agent.post(`/api/v1/conversations/${conversationId}/messages`).send({ content: 'Hi there' });
      await b.agent.post(`/api/v1/conversations/${conversationId}/messages`).send({ content: 'Coffee this week?' });
      aFeed = await feed(a.agent);
      const message = aFeed.items.find((n: any) => n.type === 'message');
      expect(message).toMatchObject({ count: 2, preview: 'Coffee this week?', read: false, actor: { id: b.id } });
      expect(aFeed.unreadCount).toBe(2);

      // Reading the conversation reads its message notification.
      await a.agent.get(`/api/v1/conversations/${conversationId}/messages`);
      expect((await a.agent.get('/api/v1/notifications/unread-count')).body.data.unreadCount).toBe(1);

      const readAll = await a.agent.post('/api/v1/notifications/read-all');
      expect(readAll.body.data.unreadCount).toBe(0);

      // Only the owner can delete a notification.
      expect((await b.agent.delete(`/api/v1/notifications/${message.id}`)).status).toBe(404);
      expect((await a.agent.delete(`/api/v1/notifications/${message.id}`)).status).toBe(200);
      expect((await feed(a.agent)).items.some((n: any) => n.id === message.id)).toBe(false);

      // A block hides everything from that person.
      await a.agent.post('/api/v1/safety/block').send({ targetUserId: b.id });
      expect((await feed(a.agent)).items).toHaveLength(0);
    });
  });

  describe('Safety: blocking & reporting', () => {
    let blocker: { agent: request.Agent; id: string };
    let target: { agent: request.Agent; id: string };

    beforeAll(async () => {
      blocker = await registerAgent('blocker@example.com', 'Blocker User', '1995-10-10');
      target = await registerAgent('target@example.com', 'Target User', '1996-05-15');
    });

    it('submits a safety report', async () => {
      const res = await blocker.agent
        .post('/api/v1/safety/reports')
        .send({ reportedUserId: target.id, category: 'Spam', details: 'Sending unwanted repetitive links' });
      expect(res.status).toBe(201);
    });

    it('blocks the target and excludes them from discovery and likes', async () => {
      const blockRes = await blocker.agent.post('/api/v1/safety/block').send({ targetUserId: target.id, reason: 'Spamming' });
      expect(blockRes.status).toBe(200);
      const again = await blocker.agent.post('/api/v1/safety/block').send({ targetUserId: target.id });
      expect(again.status).toBe(200);

      const feed = await blocker.agent.get('/api/v1/discover');
      expect(feed.body.data.some((u: any) => u.id === target.id)).toBe(false);

      const like = await target.agent.post('/api/v1/interactions/like').send({ targetUserId: blocker.id });
      expect(like.status).toBe(403);
    });
  });
  describe('Query efficiency & ranking', () => {
    /** Counts database round-trips made while serving one request. */
    async function countQueries(run: () => Promise<unknown>): Promise<number> {
      const db = getDatabase();
      const spies = [vi.spyOn(db, 'query'), vi.spyOn(db, 'get'), vi.spyOn(db, 'run')];
      try {
        await run();
        return spies.reduce((total, spy) => total + spy.mock.calls.length, 0);
      } finally {
        spies.forEach((spy) => spy.mockRestore());
      }
    }

    async function matchWith(hub: { agent: request.Agent; id: string }, email: string) {
      const other = await registerAgent(email, email.split('@')[0]);
      await hub.agent.post('/api/v1/interactions/like').send({ targetUserId: other.id });
      await other.agent.post('/api/v1/interactions/like').send({ targetUserId: hub.id });
      const conv = await hub.agent.get('/api/v1/conversations');
      const id = conv.body.data.find((c: any) => c.otherUser.id === other.id).id;
      await other.agent.post(`/api/v1/conversations/${id}/messages`).send({ content: `hi from ${email}` });
    }

    it('serves conversations, matches and discovery with a constant number of queries', async () => {
      const hub = await registerAgent('hub@example.com', 'Hub');
      await matchWith(hub, 'spoke1@example.com');
      const paths = ['/api/v1/conversations', '/api/v1/matches', '/api/v1/discover'];
      const withOne = [];
      for (const p of paths) withOne.push(await countQueries(() => hub.agent.get(p)));

      for (const n of [2, 3, 4]) await matchWith(hub, `spoke${n}@example.com`);
      const withFour = [];
      for (const p of paths) withFour.push(await countQueries(() => hub.agent.get(p)));

      expect(withFour).toEqual(withOne);
      const convs = await hub.agent.get('/api/v1/conversations');
      expect(convs.body.data).toHaveLength(4);
      expect(convs.body.data.every((c: any) => c.unreadCount === 1 && c.lastMessage.content.startsWith('hi from'))).toBe(true);
    });

    it('ranks discovery by shared interests across the whole pool, not just within a page', async () => {
      const viewer = await registerAgent('ranker@example.com', 'Ranker');
      const allInterests = (await viewer.agent.get('/api/v1/users/interests')).body.data;
      const chosen = allInterests.slice(5, 8).map((i: any) => i.id);
      const kindred = await registerAgent('kindred@example.com', 'Kindred');
      await viewer.agent.patch('/api/v1/users/me').send({ interestIds: chosen });
      await kindred.agent.patch('/api/v1/users/me').send({ interestIds: chosen });
      // A newer profile with nothing in common must not outrank the best match.
      const recent = await registerAgent('recent@example.com', 'Recent');
      await recent.agent.patch('/api/v1/users/me').send({ bio: 'Just updated' });

      const firstPage = await viewer.agent.get('/api/v1/discover?limit=1');
      expect(firstPage.body.data[0].id).toBe(kindred.id);
      expect(firstPage.body.data[0].commonInterestsCount).toBe(3);
    });
  });

  describe('Input validation & error handling', () => {
    let user: { agent: request.Agent; id: string };

    beforeAll(async () => {
      user = await registerAgent('validation@example.com', 'Validation User');
    });

    it('validates pagination parameters', async () => {
      expect((await user.agent.get('/api/v1/discover?limit=abc')).status).toBe(400);
      expect((await user.agent.get('/api/v1/discover?limit=100000')).status).toBe(400);
      expect((await user.agent.get('/api/v1/discover?offset=-1')).status).toBe(400);
      const page = await user.agent.get('/api/v1/discover?limit=1');
      expect(page.status).toBe(200);
      expect(page.body.data.length).toBeLessThanOrEqual(1);
    });

    it('validates route ids', async () => {
      const res = await user.agent.get('/api/v1/conversations/not-a-uuid/messages');
      expect(res.status).toBe(400);
      expect((await user.agent.get(`/api/v1/conversations/${MISSING_ID}/messages`)).status).toBe(404);
    });

    it('returns 404 when blocking or reporting a user that does not exist', async () => {
      expect((await user.agent.post('/api/v1/safety/block').send({ targetUserId: MISSING_ID })).status).toBe(404);
      const report = await user.agent.post('/api/v1/safety/reports').send({ reportedUserId: MISSING_ID, category: 'Spam' });
      expect(report.status).toBe(404);
    });

    it('rejects avatar URLs that are not https', async () => {
      for (const avatarUrl of ['javascript:alert(1)', 'http://example.com/a.png', 'data:image/png;base64,AAAA']) {
        expect((await user.agent.patch('/api/v1/users/me').send({ avatarUrl })).status).toBe(400);
      }
      expect((await user.agent.patch('/api/v1/users/me').send({ avatarUrl: 'https://example.com/a.png' })).status).toBe(200);
    });

    it('answers malformed JSON with a 400 that leaks no internals', async () => {
      const res = await user.agent.post('/api/v1/interactions/like').set('Content-Type', 'application/json').send('{"targetUserId":');
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ success: false, error: 'Malformed JSON request body' });
    });
  });
});
