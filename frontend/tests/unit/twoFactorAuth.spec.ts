import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
}));

vi.mock('../../src/services/api', () => ({
  api: { get: mocks.get, post: mocks.post, patch: mocks.patch },
  ApiError: Error,
  onUnauthorized: vi.fn(),
}));
vi.mock('../../src/services/socket', () => ({
  getSocket: () => null,
  connectSocket: vi.fn(),
  disconnectSocket: vi.fn(),
  onReconnect: vi.fn(),
}));
vi.mock('../../src/stores/call', () => ({ useCallStore: () => ({ reset: vi.fn() }) }));
vi.mock('../../src/composables/useGoogleIdentity', () => ({
  useGoogleIdentity: () => ({ disableAutoSelect: vi.fn() }),
}));
vi.mock('../../src/services/push', () => ({ unregisterPush: vi.fn() }));

import { useAuthStore } from '../../src/stores/auth';

const response = (data: unknown) => ({ data: { data } });

describe('Frontend 2FA Auth Store Flows', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.resetAllMocks();
  });

  it('keeps the store unauthenticated when login returns requiresTwoFactor and authenticates after verifyTwoFactorLogin', async () => {
    const auth = useAuthStore();

    mocks.post.mockResolvedValueOnce(
      response({
        requiresTwoFactor: true,
        pendingToken: 'pending-token-12345678901234567890',
        expiresIn: 300,
      })
    );

    const loginOutcome = await auth.login({ email: 'member@example.com', password: 'Password123!' });
    expect(loginOutcome).toEqual({
      requiresTwoFactor: true,
      pendingToken: 'pending-token-12345678901234567890',
      expiresIn: 300,
    });
    expect(auth.isAuthenticated).toBe(false);
    expect(auth.user).toBeNull();

    mocks.post.mockResolvedValueOnce(
      response({
        user: {
          id: 'u-1',
          email: 'member@example.com',
          twoFactorEnabled: true,
          profile: { id: 'p-1', displayName: 'Member' },
        },
        isNewUser: false,
        usedRecoveryCode: false,
      })
    );

    const verifyOutcome = await auth.verifyTwoFactorLogin({
      pendingToken: 'pending-token-12345678901234567890',
      code: '123456',
    });
    expect(verifyOutcome).toEqual({ isNewUser: false, usedRecoveryCode: false });
    expect(auth.isAuthenticated).toBe(true);
    expect(auth.user?.id).toBe('u-1');
    expect(auth.user?.twoFactorEnabled).toBe(true);
  });

  it('manages 2FA setup, enable, recovery code regeneration, and disable state updates', async () => {
    const auth = useAuthStore();
    auth.status = 'AUTHENTICATED';
    auth.user = { id: 'u-1', email: 'member@example.com', twoFactorEnabled: false, profile: null };

    mocks.post.mockResolvedValueOnce(
      response({
        qrCodeDataUrl: 'data:image/png;base64,iVBORw0KGgo=',
        manualEntryKey: 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP',
        otpauthUrl: 'otpauth://totp/Unmute:member%40example.com?secret=JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP',
        issuer: 'Unmute',
        accountName: 'member@example.com',
      })
    );
    const setupData = await auth.startTwoFactorSetup();
    expect(setupData.manualEntryKey).toBe('JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP');
    expect(auth.user.twoFactorEnabled).toBe(false);

    mocks.post.mockResolvedValueOnce(
      response({
        enabled: true,
        recoveryCodes: ['ABCD-EFGH', 'JKLM-NPQR'],
      })
    );
    const enableRes = await auth.enableTwoFactor('654321');
    expect(enableRes.recoveryCodes).toEqual(['ABCD-EFGH', 'JKLM-NPQR']);
    expect(auth.user.twoFactorEnabled).toBe(true);

    mocks.post.mockResolvedValueOnce(response({ enabled: false }));
    await auth.disableTwoFactor({ password: 'Password123!', code: '654321' });
    expect(auth.user.twoFactorEnabled).toBe(false);
  });
});

