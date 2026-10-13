import { describe, it, expect, beforeAll, vi } from 'vitest';
import request from 'supertest';
import * as OTPAuth from 'otpauth';
import { createApp } from '../src/app';
import { getDatabase } from '../src/config/database';
import { AppError } from '../src/middleware/errorHandler';
import { decryptTotpSecret } from '../src/services/auth/totpCrypto';
import { fakeGoogleCredential, resetTestDatabase } from './helpers';

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

/** Moves `last_used_step` to 2 steps before the current wall-clock step so a fresh code can be verified without sleeping 30s. */
async function allowNextWindowVerification(userId: string) {
  const currentStep = Math.floor(Date.now() / 30000);
  await getDatabase().run(
    'UPDATE user_totp SET last_used_step = ?, failed_attempts = 0, locked_until = NULL WHERE user_id = ?',
    [currentStep - 2, userId]
  );
}

describe('TOTP Two-Factor Authentication (2FA)', () => {
  let agent: ReturnType<typeof request.agent>;
  let userId: string;
  let manualKey: string;
  let recoveryCodes: string[];

  beforeAll(async () => {
    process.env.AUTH_RATE_LIMIT = '500';
    process.env.TOTP_RATE_LIMIT = '500';
    await resetTestDatabase();

    agent = request.agent(app);
    const res = await agent.post('/api/v1/auth/register').send({
      email: 'totp-user@example.com',
      password: 'Password123!',
      displayName: 'TOTP Member',
      dateOfBirth: '1996-04-12',
    });
    expect(res.status).toBe(201);
    userId = res.body.data.user.id;
    expect(res.body.data.user.twoFactorEnabled).toBe(false);
  });

  it('requires authentication for 2FA setup, status, enable, and disable endpoints', async () => {
    const anon = request(app);
    expect((await anon.get('/api/v1/auth/2fa/status')).status).toBe(401);
    expect((await anon.post('/api/v1/auth/2fa/setup')).status).toBe(401);
    expect((await anon.post('/api/v1/auth/2fa/enable').send({ code: '123456' })).status).toBe(401);
    expect((await anon.post('/api/v1/auth/2fa/disable').send({ password: 'Password123!' })).status).toBe(401);
  });

  it('initiates setup with a QR code and manual key while keeping 2FA pending and encrypted at rest', async () => {
    const setupRes = await agent.post('/api/v1/auth/2fa/setup');
    expect(setupRes.status).toBe(200);
    expect(setupRes.body.data.qrCodeDataUrl).toMatch(/^data:image\/png;base64,/);
    expect(setupRes.body.data.manualEntryKey).toMatch(/^[A-Z2-7]{32}$/);
    expect(setupRes.body.data.otpauthUrl).toContain('otpauth://totp/');
    expect(setupRes.body.data.issuer).toBe('Unmute');
    manualKey = setupRes.body.data.manualEntryKey;

    // Still pending until first code is verified
    const statusRes = await agent.get('/api/v1/auth/2fa/status');
    expect(statusRes.status).toBe(200);
    expect(statusRes.body.data.enabled).toBe(false);

    // Encrypted at rest in MariaDB: never plaintext, bound to userId via AES-GCM AAD
    const dbRow = await getDatabase().get<{ secret_encrypted: string; enabled: number }>(
      'SELECT secret_encrypted, enabled FROM user_totp WHERE user_id = ?',
      [userId]
    );
    expect(dbRow).toBeTruthy();
    expect(dbRow!.enabled).toBe(0);
    expect(dbRow!.secret_encrypted).toMatch(/^v1:/);
    expect(dbRow!.secret_encrypted).not.toContain(manualKey);
    expect(decryptTotpSecret(dbRow!.secret_encrypted, userId)).toBe(manualKey);
    expect(() => decryptTotpSecret(dbRow!.secret_encrypted, 'different-user-id')).toThrow();
  });

  it('rejects invalid verification codes during setup and keeps 2FA disabled', async () => {
    const validNow = generateTotpCode(manualKey);
    const invalidCode = validNow === '000000' ? '999999' : '000000';

    const res = await agent.post('/api/v1/auth/2fa/enable').send({ code: invalidCode });
    expect(res.status).toBe(400);

    const statusRes = await agent.get('/api/v1/auth/2fa/status');
    expect(statusRes.body.data.enabled).toBe(false);
  });

  it('enables 2FA upon verifying a valid TOTP code and returns hashed-at-rest one-time recovery codes', async () => {
    const validCode = generateTotpCode(manualKey);
    const enableRes = await agent.post('/api/v1/auth/2fa/enable').send({ code: validCode });
    expect(enableRes.status).toBe(200);
    expect(enableRes.body.data.enabled).toBe(true);
    expect(Array.isArray(enableRes.body.data.recoveryCodes)).toBe(true);
    expect(enableRes.body.data.recoveryCodes).toHaveLength(8);
    recoveryCodes = enableRes.body.data.recoveryCodes;

    for (const rc of recoveryCodes) {
      expect(rc).toMatch(/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}$/);
    }

    // Recovery codes are stored only as SHA-256 hashes in MariaDB
    const storedCodes = await getDatabase().query<{ code_hash: string }>(
      'SELECT code_hash FROM user_totp_recovery_codes WHERE user_id = ?',
      [userId]
    );
    expect(storedCodes).toHaveLength(8);
    for (const row of storedCodes) {
      expect(row.code_hash).toMatch(/^[0-9a-f]{64}$/);
      for (const plain of recoveryCodes) {
        expect(row.code_hash).not.toContain(plain.replace('-', ''));
      }
    }

    // Ordinary APIs never leak secrets or recovery codes
    const meRes = await agent.get('/api/v1/auth/me');
    expect(meRes.status).toBe(200);
    expect(meRes.body.data.twoFactorEnabled).toBe(true);
    expect(JSON.stringify(meRes.body)).not.toContain(manualKey);

    const statusRes = await agent.get('/api/v1/auth/2fa/status');
    expect(statusRes.body.data).toEqual({
      enabled: true,
      enabledAt: expect.any(String),
      recoveryCodesRemaining: 8,
    });
    expect(JSON.stringify(statusRes.body)).not.toContain(manualKey);
  });

  it('withholds the session cookie on login when 2FA is enabled and prevents pendingToken from acting as a session', async () => {
    const anon = request(app);
    const loginRes = await anon.post('/api/v1/auth/login').send({
      email: 'totp-user@example.com',
      password: 'Password123!',
    });
    expect(loginRes.status).toBe(200);
    expect(loginRes.body.data.requiresTwoFactor).toBe(true);
    expect(loginRes.body.data.pendingToken).toEqual(expect.any(String));
    expect(loginRes.body.data.user).toBeUndefined();
    expect(sessionCookie(loginRes)).toBeUndefined();

    // Attempting to use pendingToken as an unmute_session cookie must fail with 401
    const fakeSessionRes = await anon
      .get('/api/v1/auth/me')
      .set('Cookie', `${COOKIE}=${loginRes.body.data.pendingToken}`);
    expect(fakeSessionRes.status).toBe(401);
  });

  it('prevents TOTP replay within the same 30-second time step and grants a session on the next valid code', async () => {
    const loginRes = await request(app).post('/api/v1/auth/login').send({
      email: 'totp-user@example.com',
      password: 'Password123!',
    });
    const pendingToken = loginRes.body.data.pendingToken as string;

    // Pin last_used_step to the current 30s step so wall-clock rollover between tests cannot make the code look new
    const nowMs = Date.now();
    const currentStep = Math.floor(nowMs / 30000);
    await getDatabase().run('UPDATE user_totp SET last_used_step = ? WHERE user_id = ?', [currentStep, userId]);

    // Replaying the exact same time-step code must be rejected
    const replayedCode = generateTotpCode(manualKey, nowMs);
    const replayRes = await request(app).post('/api/v1/auth/2fa/verify').send({
      pendingToken,
      code: replayedCode,
    });
    expect(replayRes.status).toBe(401);
    expect(sessionCookie(replayRes)).toBeUndefined();

    // Advance the stored step back so the current window is fresh
    await allowNextWindowVerification(userId);

    const verifyAgent = request.agent(app);
    const verifyRes = await verifyAgent.post('/api/v1/auth/2fa/verify').send({
      pendingToken,
      code: generateTotpCode(manualKey),
    });
    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.data.user.id).toBe(userId);
    expect(verifyRes.body.data.usedRecoveryCode).toBe(false);
    expect(sessionCookie(verifyRes)).toBeDefined();

    // Authenticated session works now
    const meRes = await verifyAgent.get('/api/v1/auth/me');
    expect(meRes.status).toBe(200);
    expect(meRes.body.data.id).toBe(userId);

    // Reusing a consumed pendingToken is rejected
    await allowNextWindowVerification(userId);
    const reusePendingRes = await request(app).post('/api/v1/auth/2fa/verify').send({
      pendingToken,
      code: generateTotpCode(manualKey),
    });
    expect(reusePendingRes.status).toBe(401);
  });

  it('rejects expired pending authentication tokens', async () => {
    const loginRes = await request(app).post('/api/v1/auth/login').send({
      email: 'totp-user@example.com',
      password: 'Password123!',
    });
    const pendingToken = loginRes.body.data.pendingToken as string;

    await getDatabase().run(
      'UPDATE totp_pending_logins SET expires_at = DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 MINUTE) WHERE user_id = ?',
      [userId]
    );
    await allowNextWindowVerification(userId);

    const res = await request(app).post('/api/v1/auth/2fa/verify').send({
      pendingToken,
      code: generateTotpCode(manualKey),
    });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/expired/i);
    expect(sessionCookie(res)).toBeUndefined();
  });

  it('protects against brute-force attempts by locking after repeated wrong codes', async () => {
    const loginRes = await request(app).post('/api/v1/auth/login').send({
      email: 'totp-user@example.com',
      password: 'Password123!',
    });
    const pendingToken = loginRes.body.data.pendingToken as string;
    const wrongCode = generateTotpCode(manualKey) === '000000' ? '111111' : '000000';

    for (let i = 0; i < 4; i++) {
      const r = await request(app).post('/api/v1/auth/2fa/verify').send({ pendingToken, code: wrongCode });
      expect(r.status).toBe(401);
    }
    // 5th failed attempt triggers lockout (429)
    const fifth = await request(app).post('/api/v1/auth/2fa/verify').send({ pendingToken, code: wrongCode });
    expect(fifth.status).toBe(429);

    // Even a valid code is now rejected while locked
    const lockedRes = await request(app).post('/api/v1/auth/2fa/verify').send({
      pendingToken,
      code: generateTotpCode(manualKey),
    });
    expect(lockedRes.status).toBe(429);

    // Clear lockout for subsequent tests
    await allowNextWindowVerification(userId);
  });

  it('allows signing in once with a recovery code and invalidates it after use', async () => {
    const loginRes = await request(app).post('/api/v1/auth/login').send({
      email: 'totp-user@example.com',
      password: 'Password123!',
    });
    const pendingToken = loginRes.body.data.pendingToken as string;
    const firstRecoveryCode = recoveryCodes[0];

    const verifyRes = await request(app).post('/api/v1/auth/2fa/verify').send({
      pendingToken,
      code: firstRecoveryCode.toLowerCase(),
    });
    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.data.usedRecoveryCode).toBe(true);
    expect(sessionCookie(verifyRes)).toBeDefined();

    // Remaining recovery code count is now 7
    const statusRes = await agent.get('/api/v1/auth/2fa/status');
    expect(statusRes.body.data.recoveryCodesRemaining).toBe(7);

    // Reusing the same recovery code on a new login fails
    const loginRes2 = await request(app).post('/api/v1/auth/login').send({
      email: 'totp-user@example.com',
      password: 'Password123!',
    });
    const reuseRecoveryRes = await request(app).post('/api/v1/auth/2fa/verify').send({
      pendingToken: loginRes2.body.data.pendingToken,
      code: firstRecoveryCode,
    });
    expect(reuseRecoveryRes.status).toBe(401);
  });

  it('enforces 2FA on Google sign-in for 2FA-enabled users while preserving normal Google sign-in for others', async () => {
    // 1. User with 2FA enabled signing in via Google gets requiresTwoFactor
    const google2faRes = await request(app).post('/api/v1/auth/google').send({
      credential: fakeGoogleCredential('google-sub-totp-1', 'totp-user@example.com'),
    });
    expect(google2faRes.status).toBe(200);
    expect(google2faRes.body.data.requiresTwoFactor).toBe(true);
    expect(google2faRes.body.data.pendingToken).toEqual(expect.any(String));
    expect(sessionCookie(google2faRes)).toBeUndefined();

    // 2. Another user without 2FA signs in with Google normally
    const normalGoogleRes = await request(app).post('/api/v1/auth/google').send({
      credential: fakeGoogleCredential('google-sub-normal-2', 'normal-google@example.com'),
      dateOfBirth: '1995-08-20',
    });
    expect(normalGoogleRes.status).toBe(200);
    expect(normalGoogleRes.body.data.requiresTwoFactor).toBeUndefined();
    expect(normalGoogleRes.body.data.user.email).toBe('normal-google@example.com');
    expect(sessionCookie(normalGoogleRes)).toBeDefined();
  });

  it('requires reauthentication to disable 2FA and restores standard single-step login once disabled', async () => {
    // Rejects wrong password
    const badDisable = await agent.post('/api/v1/auth/2fa/disable').send({
      password: 'WrongPassword!',
    });
    expect(badDisable.status).toBe(401);

    // Clear any failed attempt counter and disable with valid password + valid TOTP code
    await allowNextWindowVerification(userId);
    const disableRes = await agent.post('/api/v1/auth/2fa/disable').send({
      password: 'Password123!',
      code: generateTotpCode(manualKey),
    });
    expect(disableRes.status).toBe(200);
    expect(disableRes.body.data.enabled).toBe(false);

    // Secret and recovery codes are removed from DB
    const totpRow = await getDatabase().get('SELECT * FROM user_totp WHERE user_id = ?', [userId]);
    expect(totpRow).toBeNull();
    const recRows = await getDatabase().query('SELECT * FROM user_totp_recovery_codes WHERE user_id = ?', [userId]);
    expect(recRows).toHaveLength(0);

    // Subsequent login immediately grants a session cookie without 2FA challenge
    const loginRes = await request(app).post('/api/v1/auth/login').send({
      email: 'totp-user@example.com',
      password: 'Password123!',
    });
    expect(loginRes.status).toBe(200);
    expect(loginRes.body.data.requiresTwoFactor).toBeUndefined();
    expect(loginRes.body.data.user.id).toBe(userId);
    expect(sessionCookie(loginRes)).toBeDefined();
  });
});

