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
import { User, Profile, LocationPrecision } from '../types';

/**
 * UNKNOWN: nothing checked yet. CHECKING_SESSION: asking the backend.
 * The backend's answer is the only thing that moves the app to AUTHENTICATED.
 */
export type AuthStatus = 'UNKNOWN' | 'CHECKING_SESSION' | 'AUTHENTICATED' | 'UNAUTHENTICATED';

export type GoogleAuthOutcome =
  | { requiresDob: true; profile: { email: string; displayName: string; avatarUrl: string } }
  | { requiresDob: false; isNewUser: boolean };

export type PhoneAuthOutcome = { requiresProfile: true } | { requiresProfile: false; isNewUser: boolean };

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

  function login(credentials: { email: string; password: string }) {
    return run(async () => {
      const res = await api.post('/auth/login', credentials);
      setAuthenticated(res.data.data.user);
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
      setAuthenticated(result.user);
      return { requiresProfile: false, isNewUser: result.isNewUser };
    });
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
