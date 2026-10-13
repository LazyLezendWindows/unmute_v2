import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { api, ApiError, onUnauthorized } from '../services/api';
import { connectSocket, disconnectSocket } from '../services/socket';
import { useGoogleIdentity } from '../composables/useGoogleIdentity';
import { useNotificationStore } from './notifications';
import { useCallStore } from './call';
import { usePremiumStore } from './premium';
import { useChatStore } from './chat';
import { useDiscoverStore } from './discover';
import { useSubscriptionStore } from './subscription';
import { unregisterPush } from '../services/push';
import { User, Profile, LocationPrecision, TwoFactorStatus, TwoFactorSetupData } from '../types';

/**
 * UNKNOWN: nothing checked yet. CHECKING_SESSION: asking the backend.
 * The backend's answer is the only thing that moves the app to AUTHENTICATED.
 */
export type AuthStatus = 'UNKNOWN' | 'CHECKING_SESSION' | 'AUTHENTICATED' | 'UNAUTHENTICATED';

export type PasswordLoginOutcome =
  | { requiresTwoFactor: false }
  | { requiresTwoFactor: true; pendingToken: string; expiresIn: number };

export type GoogleAuthOutcome =
  | { requiresDob: true; requiresTwoFactor?: false; profile: { email: string; displayName: string; avatarUrl: string } }
  | { requiresDob: false; requiresTwoFactor: true; pendingToken: string; expiresIn: number }
  | { requiresDob: false; requiresTwoFactor?: false; isNewUser: boolean };

export type PhoneAuthOutcome =
  | { requiresProfile: true; requiresTwoFactor?: false }
  | { requiresProfile: false; requiresTwoFactor: true; pendingToken: string; expiresIn: number }
  | { requiresProfile: false; requiresTwoFactor?: false; isNewUser: boolean };

export const useAuthStore = defineStore('auth', () => {
  const status = ref<AuthStatus>('UNKNOWN');
  const user = ref<User | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);

  const isAuthenticated = computed(() => status.value === 'AUTHENTICATED');
  const profile = computed<Profile | null>(() => user.value?.profile || null);

  let sessionCheck: Promise<void> | null = null;

  function setAuthenticated(nextUser: User) {
    user.value = nextUser;
    status.value = 'AUTHENTICATED';
    connectSocket();
  }

  function setUnauthenticated() {
    user.value = null;
    status.value = 'UNAUTHENTICATED';
    disconnectSocket();
    useNotificationStore().reset();
    // Signing out stops any call (camera and microphone included).
    useCallStore().reset();
    usePremiumStore().reset();
    useChatStore().reset();
    useDiscoverStore().reset();
    useSubscriptionStore().reset();
  }

  onUnauthorized(() => {
    if (status.value === 'AUTHENTICATED') setUnauthenticated();
  });

  /** Restores the session from the HttpOnly cookie once; concurrent callers share the same request. */
  function ensureSession(): Promise<void> {
    if (status.value === 'AUTHENTICATED' || status.value === 'UNAUTHENTICATED') {
      return Promise.resolve();
    }
    if (!sessionCheck) {
      status.value = 'CHECKING_SESSION';
      sessionCheck = api
        .get('/auth/session')
        .then((res) => {
          const { authenticated, user: sessionUser } = res.data.data;
          if (authenticated) setAuthenticated(sessionUser);
          else setUnauthenticated();
        })
        .catch(async (err) => {
          // Only the server saying "not signed in" signs the member out. A busy server (429, 5xx)
          // is retried briefly; unreachable means offline. Neither sends them to the sign-in screen.
          if (err instanceof ApiError && err.status === 401) {
            setUnauthenticated();
            return;
          }
          for (const wait of [800, 2000]) {
            await new Promise((resolve) => setTimeout(resolve, wait));
            try {
              const res = await api.get('/auth/session');
              const { authenticated, user: sessionUser } = res.data.data;
              if (authenticated) setAuthenticated(sessionUser);
              else setUnauthenticated();
              return;
            } catch (retryErr) {
              if (retryErr instanceof ApiError && retryErr.status === 401) {
                setUnauthenticated();
                return;
              }
            }
          }
          status.value = 'UNKNOWN';
        })
        .finally(() => {
          sessionCheck = null;
        });
    }
    return sessionCheck;
  }

  async function run<T>(action: () => Promise<T>): Promise<T> {
    loading.value = true;
    error.value = null;
    try {
      return await action();
    } catch (err: any) {
      error.value = err.message;
      throw err;
    } finally {
      loading.value = false;
    }
  }

  /**
   * Creates an email account. With a phone number but no code, nothing is created yet: the answer is
   * `requiresPhoneCode`, and the call is repeated with the SMS code to finish.
   */
  function register(data: {
    email: string;
    password: string;
    displayName: string;
    dateOfBirth: string;
    phone?: string;
    code?: string;
    referralCode?: string;
  }): Promise<{ requiresPhoneCode: boolean }> {
    return run(async () => {
      const res = await api.post('/auth/register', data);
      if (res.data.data.requiresPhoneCode) return { requiresPhoneCode: true };
      setAuthenticated(res.data.data.user);
      return { requiresPhoneCode: false };
    });
  }

  function login(credentials: { email: string; password: string }): Promise<PasswordLoginOutcome> {
    return run(async () => {
      const res = await api.post('/auth/login', credentials);
      const result = res.data.data;
      if (result.requiresTwoFactor) {
        return {
          requiresTwoFactor: true,
          pendingToken: result.pendingToken,
          expiresIn: result.expiresIn,
        };
      }
      setAuthenticated(result.user);
      return { requiresTwoFactor: false };
    });
  }

  /** Sends the Google ID token to the backend, which verifies it; include `dateOfBirth` to finish a new signup. */
  function loginWithGoogle(payload: { credential: string; dateOfBirth?: string }): Promise<GoogleAuthOutcome> {
    return run(async () => {
      const res = await api.post('/auth/google', payload);
      const result = res.data.data;
      if (result.requiresDob) {
        return { requiresDob: true, profile: result.profile };
      }
      if (result.requiresTwoFactor) {
        return {
          requiresDob: false,
          requiresTwoFactor: true,
          pendingToken: result.pendingToken,
          expiresIn: result.expiresIn,
        };
      }
      setAuthenticated(result.user);
      return { requiresDob: false, isNewUser: result.isNewUser };
    });
  }

  /** Texts a sign-in code to the number; resolves with how long until another can be sent. */
  async function requestPhoneCode(phone: string): Promise<{ resendAfter: number }> {
    const res = await api.post('/auth/phone/start', { phone });
    return res.data.data;
  }

  /** Checks the SMS code; a new number must include a name and date of birth to finish signing up. */
  function loginWithPhone(payload: { phone: string; code: string; displayName?: string; dateOfBirth?: string; referralCode?: string }): Promise<PhoneAuthOutcome> {
    return run(async () => {
      const res = await api.post('/auth/phone/verify', payload);
      const result = res.data.data;
      if (result.requiresProfile) return { requiresProfile: true };
      if (result.requiresTwoFactor) {
        return {
          requiresProfile: false,
          requiresTwoFactor: true,
          pendingToken: result.pendingToken,
          expiresIn: result.expiresIn,
        };
      }
      setAuthenticated(result.user);
      return { requiresProfile: false, isNewUser: result.isNewUser };
    });
  }

  /** Completes a pending 2FA sign-in with a 6-digit TOTP code or one-time recovery code. */
  function verifyTwoFactorLogin(payload: {
    pendingToken: string;
    code: string;
  }): Promise<{ isNewUser: boolean; usedRecoveryCode: boolean }> {
    return run(async () => {
      const res = await api.post('/auth/2fa/verify', payload);
      const result = res.data.data;
      setAuthenticated(result.user);
      return {
        isNewUser: Boolean(result.isNewUser),
        usedRecoveryCode: Boolean(result.usedRecoveryCode),
      };
    });
  }

  /** Fetches the current 2FA status and remaining recovery code count. */
  async function fetchTwoFactorStatus(): Promise<TwoFactorStatus> {
    const res = await api.get('/auth/2fa/status');
    return res.data.data;
  }

  /** Initiates TOTP 2FA setup (returns QR code Data URL and manual Base32 setup key). */
  async function startTwoFactorSetup(): Promise<TwoFactorSetupData> {
    const res = await api.post('/auth/2fa/setup');
    return res.data.data;
  }

  /** Verifies the first 6-digit authenticator code, enables 2FA, and returns one-time recovery codes. */
  async function enableTwoFactor(code: string): Promise<{ enabled: true; recoveryCodes: string[] }> {
    const res = await api.post('/auth/2fa/enable', { code });
    if (user.value) user.value.twoFactorEnabled = true;
    return res.data.data;
  }

  /** Disables 2FA after reauthenticating with password and/or authenticator code. */
  async function disableTwoFactor(payload: { password?: string; code?: string }): Promise<void> {
    await api.post('/auth/2fa/disable', payload);
    if (user.value) user.value.twoFactorEnabled = false;
  }

  /** Generates a new set of 8 one-time recovery codes after reauthentication. */
  async function regenerateRecoveryCodes(payload: {
    password?: string;
    code?: string;
  }): Promise<{ recoveryCodes: string[] }> {
    const res = await api.post('/auth/2fa/recovery-codes/regenerate', payload);
    return res.data.data;
  }

  /** Adds a confirmed phone number to the signed-in account. */
  function linkPhone(phone: string, code: string) {
    return run(async () => {
      const userId = user.value?.id;
      const res = await api.post('/auth/phone/link', { phone, code });
      if (user.value && user.value.id === userId) user.value = res.data.data.user;
    });
  }

  async function fetchMe() {
    const userId = user.value?.id;
    const res = await api.get('/auth/me');
    if (user.value && user.value.id === userId) user.value = res.data.data;
    return user.value;
  }

  /** Reloads the own profile (it carries live counts such as likes received). */
  async function refreshProfile() {
    const userId = user.value?.id;
    const res = await api.get('/users/me');
    if (user.value && user.value.id === userId) user.value.profile = res.data.data;
  }

  function updateProfile(data: Partial<Profile> & { interestIds?: string[] }) {
    return run(async () => {
      const userId = user.value?.id;
      const res = await api.patch('/users/me', data);
      if (user.value && user.value.id === userId) {
        user.value.profile = res.data.data;
      }
      return res.data.data;
    });
  }

  /** Location and education endpoints respond with the updated own profile. */
  async function applyProfile(request: Promise<{ data: { data: Profile } }>): Promise<Profile> {
    const userId = user.value?.id;
    const res = await request;
    if (user.value && user.value.id === userId) {
      user.value.profile = res.data.data;
    }
    return res.data.data;
  }

  function setLocation(
    payload:
      | { mode: 'place'; placeId: string; precision?: LocationPrecision }
      | { mode: 'pincode'; pincode: string; precision?: LocationPrecision }
      | { mode: 'device'; latitude: number; longitude: number; precision?: LocationPrecision }
  ) {
    return applyProfile(api.put('/users/me/location', payload));
  }

  function setLocationPrecision(precision: LocationPrecision) {
    return applyProfile(api.patch('/users/me/location', { precision }));
  }

  function clearLocation() {
    return applyProfile(api.delete('/users/me/location'));
  }

  function setEducation(payload: { institutionId: string; course: string; startYear: number | null; endYear: number | null }) {
    return applyProfile(api.put('/users/me/education', payload));
  }

  function clearEducation() {
    return applyProfile(api.delete('/users/me/education'));
  }

  /** Pause hides the profile from Discover; matches and chats carry on. */
  async function setPaused(paused: boolean) {
    await api.put('/users/me/pause', { paused });
    if (user.value) user.value.isPaused = paused;
  }

  /** Changes the password (or sets a first one); other devices are signed out by the server. */
  async function changePassword(currentPassword: string | undefined, newPassword: string) {
    await api.post('/auth/password/change', { ...(currentPassword ? { currentPassword } : {}), newPassword });
    if (user.value) user.value.hasPassword = true;
  }

  /** Permanently deletes the account; the server signs this browser out. */
  async function deleteAccount(confirmation: { password?: string; confirm?: string }) {
    await api.delete('/users/me', { data: confirmation });
    try { await unregisterPush(); } catch { /* the subscription went with the account */ }
    useGoogleIdentity().disableAutoSelect();
    setUnauthenticated();
  }

  async function logout() {
    try {
      await unregisterPush();
      await api.post('/auth/logout');
    } finally {
      useGoogleIdentity().disableAutoSelect();
      setUnauthenticated();
    }
  }

  return {
    status,
    user,
    profile,
    loading,
    error,
    isAuthenticated,
    ensureSession,
    register,
    login,
    loginWithGoogle,
    requestPhoneCode,
    loginWithPhone,
    verifyTwoFactorLogin,
    fetchTwoFactorStatus,
    startTwoFactorSetup,
    enableTwoFactor,
    disableTwoFactor,
    regenerateRecoveryCodes,
    linkPhone,
    fetchMe,
    refreshProfile,
    updateProfile,
    setLocation,
    setLocationPrecision,
    clearLocation,
    setEducation,
    clearEducation,
    logout,
    deleteAccount,
    setPaused,
    changePassword,
  };
});
