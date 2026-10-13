import { describe, it, expect, beforeAll, vi } from 'vitest';
import request from 'supertest';
import * as OTPAuth from 'otpauth';
import { OAuth2Client } from 'google-auth-library';
import { createApp } from '../src/app';
import { config } from '../src/config/env';
import { getDatabase } from '../src/config/database';
import { AppError } from '../src/middleware/errorHandler';
import { ReferralService } from '../src/services/referralService';
import { fakeGoogleCredential, resetTestDatabase } from './helpers';

vi.mock('../src/services/auth/googleIdentity', () => ({
  verifyGoogleCredential: vi.fn(async (credential: string) => {
    const [prefix, subject, email, flag] = credential.split(':');
    if (prefix !== 'google-test-credential' || !subject || !email) {
      throw new AppError('Google sign-in could not be verified. Please try again.', 401);
    }
    return {
      subject,
      email: email.toLowerCase(),
      emailVerified: flag !== 'unverified',
      name: 'Google Member',
      picture: 'https://example.com/avatar.jpg',
    };
  }),
}));

const app = createApp();
const COOKIE = 'unmute_session';

function sessionCookie(res: request.Response): string | undefined {
  const cookies = ([] as string[]).concat(res.headers['set-cookie'] || []);
  return cookies.find((c) => c.startsWith(`${COOKIE}=`));
}

function generateTotpCode(base32Secret: string, timestampMs = Date.now()): string {
  const totp = new OTPAuth.TOTP({
    issuer: 'Unmute',
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(base32Secret),
  });
  return totp.generate({ timestamp: timestampMs });
}

describe('Google ID Token Verification (verifyGoogleCredential unit tests)', () => {
  it('validates signature, issuer, audience, expiry, and email_verified using OAuth2Client', async () => {
    const actual = await vi.importActual<typeof import('../src/services/auth/googleIdentity')>(
      '../src/services/auth/googleIdentity'
    );
    const futureExp = Math.floor(Date.now() / 1000) + 3600;
    const pastExp = Math.floor(Date.now() / 1000) - 60;

    const spy = vi.spyOn(OAuth2Client.prototype, 'verifyIdToken');

    // 1. Valid Google ID token payload
    spy.mockResolvedValueOnce({
      getPayload: () => ({
        iss: 'https://accounts.google.com',
        aud: config.googleClientId,
        sub: 'google-sub-valid-123',
        email: 'Valid.User@Gmail.com',
        email_verified: true,
        name: 'Valid User',
        picture: 'https://lh3.googleusercontent.com/a/photo',
        iat: futureExp - 3600,
        exp: futureExp,
      }),
    } as any);

    const identity = await actual.verifyGoogleCredential('valid-signed-jwt');
    expect(identity).toEqual({
      subject: 'google-sub-valid-123',
      email: 'valid.user@gmail.com',
      emailVerified: true,
      name: 'Valid User',
      picture: 'https://lh3.googleusercontent.com/a/photo',
    });

    // 2. Expired token -> 401
    spy.mockResolvedValueOnce({
      getPayload: () => ({
        iss: 'https://accounts.google.com',
        aud: config.googleClientId,
        sub: 'google-sub-expired',
        email: 'expired@gmail.com',
        email_verified: true,
        iat: pastExp - 3600,
        exp: pastExp,
      }),
    } as any);
    await expect(actual.verifyGoogleCredential('expired-jwt')).rejects.toMatchObject({ statusCode: 401 });

    // 3. Incorrect audience -> 401
    spy.mockResolvedValueOnce({
      getPayload: () => ({
        iss: 'https://accounts.google.com',
        aud: 'wrong-client-id.apps.googleusercontent.com',
        sub: 'google-sub-wrong-aud',
        email: 'wrongaud@gmail.com',
        email_verified: true,
        iat: futureExp - 3600,
        exp: futureExp,
      }),
    } as any);
    await expect(actual.verifyGoogleCredential('wrong-aud-jwt')).rejects.toMatchObject({ statusCode: 401 });

    // 4. Invalid issuer -> 401
    spy.mockResolvedValueOnce({
      getPayload: () => ({
        iss: 'https://evil-issuer.example.com',
        aud: config.googleClientId,
        sub: 'google-sub-evil-iss',
        email: 'evil@gmail.com',
        email_verified: true,
        iat: futureExp - 3600,
        exp: futureExp,
      }),
    } as any);
    await expect(actual.verifyGoogleCredential('wrong-iss-jwt')).rejects.toMatchObject({ statusCode: 401 });

    // 5. Invalid signature / verifyIdToken throws -> 401
    spy.mockRejectedValueOnce(new Error('Invalid token signature'));
    await expect(actual.verifyGoogleCredential('forged-jwt')).rejects.toMatchObject({ statusCode: 401 });

    spy.mockRestore();
  });
});

describe('Google Sign-In, Account Linking, Referrals, and Optional TOTP 2FA', () => {
  beforeAll(async () => {
    process.env.AUTH_RATE_LIMIT = '500';
    process.env.TOTP_RATE_LIMIT = '500';
    await resetTestDatabase();
  });

  it('creates a new Google account with 18+ DOB, applies referral code, issues an internal session cookie (never the Google token), and never marks a phone number as verified', async () => {
    const referrerRes = await request(app).post('/api/v1/auth/register').send({
      email: 'referrer@example.com',
      password: 'Password123!',
      displayName: 'Referrer Friend',
      dateOfBirth: '1994-03-10',
    });
    expect(referrerRes.status).toBe(201);
    const referrerId = referrerRes.body.data.user.id as string;
    const refCode = await ReferralService.codeFor(referrerId);

    const googleToken = fakeGoogleCredential('google-sub-ref-1', 'newgoogle@example.com');

    // First step: Google token without DOB asks for DOB and does not create user or session
    const step1 = await request(app).post('/api/v1/auth/google').send({ credential: googleToken });
    expect(step1.status).toBe(200);
    expect(step1.body.data.requiresDob).toBe(true);
    expect(sessionCookie(step1)).toBeUndefined();

    // Rejects invalid referral code before creating the account
    const badRef = await request(app).post('/api/v1/auth/google').send({
      credential: googleToken,
      dateOfBirth: '1997-07-15',
      referralCode: 'nonexistent9999',
    });
    expect(badRef.status).toBe(400);
    expect(sessionCookie(badRef)).toBeUndefined();

    // Second step: Valid DOB + valid referralCode creates account, applies referral, and issues HttpOnly session cookie
    const step2 = await request(app).post('/api/v1/auth/google').send({
      credential: googleToken,
      dateOfBirth: '1997-07-15',
      referralCode: refCode,
    });
    expect(step2.status).toBe(200);
    expect(step2.body.data.requiresDob).toBe(false);
    expect(step2.body.data.isNewUser).toBe(true);
    expect(step2.body.data.user.email).toBe('newgoogle@example.com');
    // Phone must remain null (never silently marked as verified)
    expect(step2.body.data.user.phone).toBeNull();
    expect(step2.body.data.user.hasPassword).toBe(false);

    const cookie = sessionCookie(step2);
    expect(cookie).toBeDefined();
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    // Never uses the Google ID token as UnMute's own session token
    expect(cookie).not.toContain(googleToken);

    const referralRow = await getDatabase().get<{ referrer_id: string; rewarded_at: string | null }>(
      'SELECT referrer_id, rewarded_at FROM referrals WHERE referred_id = ?',
      [step2.body.data.user.id]
    );
    expect(referralRow?.referrer_id).toBe(referrerId);
    expect(referralRow?.rewarded_at).toBeNull();
  });

  it('links a verified Google account to an existing email/password account and prevents conflicting Google sub takeover', async () => {
    const reg = await request(app).post('/api/v1/auth/register').send({
      email: 'existing-member@example.com',
      password: 'Password123!',
      displayName: 'Existing Member',
      dateOfBirth: '1993-11-20',
    });
    expect(reg.status).toBe(201);
    const existingUserId = reg.body.data.user.id as string;

    // Unverified Google email must be rejected (403) and never linked
    const unverifiedRes = await request(app).post('/api/v1/auth/google').send({
      credential: fakeGoogleCredential('sub-attacker', 'existing-member@example.com', false),
    });
    expect(unverifiedRes.status).toBe(403);
    expect(sessionCookie(unverifiedRes)).toBeUndefined();

    // Verified Google email links cleanly to the existing account without creating a duplicate user
    const linkRes = await request(app).post('/api/v1/auth/google').send({
      credential: fakeGoogleCredential('sub-legit-owner', 'existing-member@example.com'),
    });
    expect(linkRes.status).toBe(200);
    expect(linkRes.body.data.isNewUser).toBe(false);
    expect(linkRes.body.data.user.id).toBe(existingUserId);
    expect(sessionCookie(linkRes)).toBeDefined();

    const userCount = await getDatabase().get<{ cnt: number }>(
      'SELECT COUNT(*) AS cnt FROM users WHERE email = ?',
      ['existing-member@example.com']
    );
    expect(Number(userCount?.cnt)).toBe(1);

    // Attempting to sign in with a DIFFERENT Google subject claiming the same email is rejected with 409
    const conflictRes = await request(app).post('/api/v1/auth/google').send({
      credential: fakeGoogleCredential('sub-different-google-account', 'existing-member@example.com'),
    });
    expect(conflictRes.status).toBe(409);
    expect(sessionCookie(conflictRes)).toBeUndefined();
  });

  it('allows a Google-only account to enable, verify at login, and disable TOTP 2FA without a password', async () => {
    const agent = request.agent(app);
    const createRes = await agent.post('/api/v1/auth/google').send({
      credential: fakeGoogleCredential('sub-google-2fa', 'google2fa@example.com'),
      dateOfBirth: '1995-05-05',
    });
    expect(createRes.status).toBe(200);
    const googleUserId = createRes.body.data.user.id as string;
    expect(createRes.body.data.user.hasPassword).toBe(false);

    // Initiate and enable 2FA on the Google-only account
    const setupRes = await agent.post('/api/v1/auth/2fa/setup');
    expect(setupRes.status).toBe(200);
    const manualKey = setupRes.body.data.manualEntryKey as string;

    const enableRes = await agent.post('/api/v1/auth/2fa/enable').send({
      code: generateTotpCode(manualKey),
    });
    expect(enableRes.status).toBe(200);
    expect(enableRes.body.data.enabled).toBe(true);

    // Sign in with Google in a fresh request: must require 2FA before issuing a session cookie
    const signInRes = await request(app).post('/api/v1/auth/google').send({
      credential: fakeGoogleCredential('sub-google-2fa', 'google2fa@example.com'),
    });
    expect(signInRes.status).toBe(200);
    expect(signInRes.body.data.requiresDob).toBe(false);
    expect(signInRes.body.data.requiresTwoFactor).toBe(true);
    expect(signInRes.body.data.pendingToken).toEqual(expect.any(String));
    expect(sessionCookie(signInRes)).toBeUndefined();

    // Advance step window in DB so we can verify immediately without waiting 30s
    await getDatabase().run('UPDATE user_totp SET last_used_step = ? WHERE user_id = ?', [
      Math.floor(Date.now() / 30000) - 2,
      googleUserId,
    ]);

    const verifyRes = await request(app).post('/api/v1/auth/2fa/verify').send({
      pendingToken: signInRes.body.data.pendingToken,
      code: generateTotpCode(manualKey),
    });
    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.data.user.id).toBe(googleUserId);
    expect(sessionCookie(verifyRes)).toBeDefined();

    // Google-only user can disable 2FA by reauthenticating with their authenticator code (no password needed)
    await getDatabase().run('UPDATE user_totp SET last_used_step = ? WHERE user_id = ?', [
      Math.floor(Date.now() / 30000) - 2,
      googleUserId,
    ]);
    const disableRes = await agent.post('/api/v1/auth/2fa/disable').send({
      code: generateTotpCode(manualKey),
    });
    expect(disableRes.status).toBe(200);
    expect(disableRes.body.data.enabled).toBe(false);
  });
});
