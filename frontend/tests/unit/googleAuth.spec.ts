import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';

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
vi.mock('../../src/services/push', () => ({ unregisterPush: vi.fn() }));

import { useAuthStore } from '../../src/stores/auth';
import { resetAuthConfigCacheForTests } from '../../src/composables/useGoogleIdentity';
import LoginPage from '../../src/pages/LoginPage.vue';
import RegisterPage from '../../src/pages/RegisterPage.vue';

const response = (data: unknown) => ({ data: { data } });

async function makeRouter(initialPath: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/login', component: LoginPage },
      { path: '/register', component: RegisterPage },
      { path: '/welcome', component: { template: '<div>Welcome</div>' } },
      { path: '/discover', component: { template: '<div>Discover</div>' } },
      { path: '/terms', component: { template: '<div>Terms</div>' } },
      { path: '/privacy', component: { template: '<div>Privacy</div>' } },
      { path: '/:pathMatch(.*)*', component: { template: '<div />' } },
    ],
  });
  await router.push(initialPath);
  await router.isReady();
  return router;
}

describe('Google Sign-In & No-Mandatory-SMS Auth Flows', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.resetAllMocks();
    resetAuthConfigCacheForTests();
  });

  it('handles Google sign-up (requiresDob -> DOB + referralCode) and Google 2FA challenge in the auth store', async () => {
    const auth = useAuthStore();

    // 1. First Google call for a new user returns requiresDob
    mocks.post.mockResolvedValueOnce(
      response({
        requiresDob: true,
        profile: { email: 'new@gmail.com', displayName: 'New Member', avatarUrl: '' },
      })
    );
    const first = await auth.loginWithGoogle({ credential: 'google-id-token-1' });
    expect(first).toEqual({
      requiresDob: true,
      profile: { email: 'new@gmail.com', displayName: 'New Member', avatarUrl: '' },
    });
    expect(auth.isAuthenticated).toBe(false);

    // 2. Second Google call with dateOfBirth + referralCode creates the account and authenticates
    mocks.post.mockResolvedValueOnce(
      response({
        requiresDob: false,
        isNewUser: true,
        user: {
          id: 'u-google-1',
          email: 'new@gmail.com',
          phone: null,
          hasPassword: false,
          twoFactorEnabled: false,
          profile: { id: 'p-1', displayName: 'New Member' },
        },
      })
    );
    const second = await auth.loginWithGoogle({
      credential: 'google-id-token-1',
      dateOfBirth: '1997-04-10',
      referralCode: 'asha4821',
    });
    expect(mocks.post).toHaveBeenLastCalledWith('/auth/google', {
      credential: 'google-id-token-1',
      dateOfBirth: '1997-04-10',
      referralCode: 'asha4821',
    });
    expect(second).toEqual({ requiresDob: false, isNewUser: true });
    expect(auth.isAuthenticated).toBe(true);
    expect(auth.user?.phone).toBeNull();

    // 3. Returning Google user with 2FA enabled receives requiresTwoFactor
    auth.status = 'UNAUTHENTICATED';
    auth.user = null;
    mocks.post.mockResolvedValueOnce(
      response({
        requiresDob: false,
        requiresTwoFactor: true,
        pendingToken: 'pending-google-2fa-token-123456',
        expiresIn: 300,
      })
    );
    const challenge = await auth.loginWithGoogle({ credential: 'google-id-token-2fa' });
    expect(challenge).toEqual({
      requiresDob: false,
      requiresTwoFactor: true,
      pendingToken: 'pending-google-2fa-token-123456',
      expiresIn: 300,
    });
    expect(auth.isAuthenticated).toBe(false);
  });

  it('renders email/password form, OR divider, and Sign in with Google button on Login and Continue with Google on Register', async () => {
    mocks.get.mockResolvedValue(
      response({
        googleClientId: null,
        phoneSignIn: false,
        gifs: false,
      })
    );

    const loginRouter = await makeRouter('/login');
    const loginWrapper = mount(LoginPage, {
      global: {
        plugins: [loginRouter],
      },
    });
    await flushPromises();

    expect(loginWrapper.find('input[type="email"]').exists()).toBe(true);
    expect(loginWrapper.find('input[type="password"]').exists()).toBe(true);
    expect(loginWrapper.find('.auth-divider').text()).toBe('OR');
    expect(loginWrapper.text()).toContain('Sign in with Google');
    expect(loginWrapper.text()).not.toContain('Continue with Phone');
    loginWrapper.unmount();

    resetAuthConfigCacheForTests();
    mocks.get.mockResolvedValue(
      response({
        googleClientId: null,
        phoneSignIn: false,
        gifs: false,
      })
    );

    const registerRouter = await makeRouter('/register?ref=friend123');
    const registerWrapper = mount(RegisterPage, {
      global: {
        plugins: [registerRouter],
      },
    });
    await flushPromises();

    expect(registerWrapper.text()).toContain('Continue with Google');
    // Optional SMS phone field is hidden when phoneSignIn is disabled
    expect(registerWrapper.find('.phone-field').exists()).toBe(false);
    // Email, password, DOB, referral code, and terms acceptance are preserved
    expect(registerWrapper.find('input[type="email"]').exists()).toBe(true);
    expect(registerWrapper.find('input[type="date"]').exists()).toBe(true);
    expect(registerWrapper.find('.referral-field').exists()).toBe(true);
    expect(registerWrapper.find('.terms-check input[type="checkbox"]').exists()).toBe(true);

    // Submitting regular email/password registration redirects to /login without leaving the user logged in
    mocks.post
      .mockResolvedValueOnce(
        response({
          user: {
            id: 'u-email-1',
            email: 'newuser@example.com',
            phone: null,
            hasPassword: true,
            twoFactorEnabled: false,
            profile: { id: 'p-email-1', displayName: 'New User' },
          },
        })
      )
      .mockResolvedValueOnce(response({})); // POST /auth/logout

    const inputs = registerWrapper.findAll('input');
    await inputs[0].setValue('New User');
    await inputs[1].setValue('newuser@example.com');
    await inputs[2].setValue('1996-05-12');
    await inputs[3].setValue('Password123!');
    await inputs[4].setValue('Password123!');
    await registerWrapper.get('.terms-check input[type="checkbox"]').setValue(true);
    await registerWrapper.get('form').trigger('submit.prevent');
    await flushPromises();

    const auth = useAuthStore();
    expect(auth.isAuthenticated).toBe(false);
    expect(registerRouter.currentRoute.value.path).toBe('/login');
    registerWrapper.unmount();
  });

  it('initializes Google Identity Services with auto_select: false and handles popup cancellation and popup blocking', async () => {
    let initializedConfig: any = null;
    const initializeMock = vi.fn((cfg) => {
      initializedConfig = cfg;
    });
    const renderButtonMock = vi.fn();
    const promptMock = vi.fn((listener?: (n: any) => void) => {
      listener?.({
        isNotDisplayed: () => true,
        getNotDisplayedReason: () => 'browser_not_supported',
      });
    });

    (window as any).google = {
      accounts: {
        id: {
          initialize: initializeMock,
          renderButton: renderButtonMock,
          prompt: promptMock,
          disableAutoSelect: vi.fn(),
        },
      },
    };

    mocks.get.mockResolvedValue(
      response({
        googleClientId: 'test-gis-client.apps.googleusercontent.com',
        phoneSignIn: false,
        gifs: false,
      })
    );

    const loginRouter = await makeRouter('/login');
    const loginWrapper = mount(LoginPage, {
      global: {
        plugins: [loginRouter],
      },
    });
    await flushPromises();

    expect(initializeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        client_id: 'test-gis-client.apps.googleusercontent.com',
        auto_select: false,
        ux_mode: 'popup',
      })
    );
    expect(renderButtonMock).toHaveBeenCalled();

    // Simulate user cancelling the Google popup (callback invoked without a credential)
    initializedConfig.callback({});
    await flushPromises();
    expect(loginWrapper.text()).toContain('Google sign-in was cancelled.');

    loginWrapper.unmount();
    delete (window as any).google;
  });
});
