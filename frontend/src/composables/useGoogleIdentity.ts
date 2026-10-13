import { onMounted, ref } from 'vue';
import { api } from '../services/api';

/**
 * Google Identity Services (GIS) integration. GIS only yields a signed ID token ("credential");
 * the backend verifies it and decides who the user is.
 */

interface GoogleCredentialResponse {
  credential?: string;
}

export interface GooglePromptNotification {
  isNotDisplayed?: () => boolean;
  getNotDisplayedReason?: () => string;
  isSkippedMoment?: () => boolean;
  getSkippedReason?: () => string;
  isDismissedMoment?: () => boolean;
  getDismissedReason?: () => string;
}

interface GoogleAccountsId {
  initialize(config: {
    client_id: string;
    callback: (response: GoogleCredentialResponse) => void;
    auto_select?: boolean;
    cancel_on_tap_outside?: boolean;
    ux_mode?: 'popup' | 'redirect';
    itp_support?: boolean;
    context?: 'signin' | 'signup' | 'use';
  }): void;
  renderButton(parent: HTMLElement, options: Record<string, unknown>): void;
  prompt?: (momentListener?: (notification: GooglePromptNotification) => void) => void;
  disableAutoSelect(): void;
}

interface GoogleOAuth2TokenResponse {
  access_token?: string;
  error?: string;
  error_description?: string;
}

interface GoogleOAuth2Error {
  type?: 'popup_closed' | 'popup_failed_to_open' | 'unknown';
  message?: string;
}

interface GoogleAccountsOAuth2 {
  initTokenClient(config: {
    client_id: string;
    scope: string;
    prompt?: string;
    callback: (response: GoogleOAuth2TokenResponse) => void;
    error_callback?: (error: GoogleOAuth2Error) => void;
  }): {
    requestAccessToken(overrideConfig?: { prompt?: string }): void;
  };
}

declare global {
  interface Window {
    google?: {
      accounts: {
        id: GoogleAccountsId;
        oauth2?: GoogleAccountsOAuth2;
      };
    };
  }
}

const GIS_SCRIPT_SRC = 'https://accounts.google.com/gsi/client';

/**
 * The OAuth client ID: VITE_GOOGLE_CLIENT_ID when the build sets it, otherwise the backend's
 * GOOGLE_CLIENT_ID from /auth/config, so a deployment only has to configure it in one place.
 */
const clientId = ref<string>(import.meta.env.VITE_GOOGLE_CLIENT_ID || '');
const phoneSignIn = ref<boolean>(false);
let configLoader: Promise<{ googleClientId: string; phoneSignIn: boolean }> | null = null;

function resolveAuthConfig(): Promise<{ googleClientId: string; phoneClient: boolean; phoneSignIn: boolean }> {
  if (!configLoader) {
    configLoader = api
      .get('/auth/config')
      .then((res) => {
        const data = res.data?.data ?? {};
        if (!clientId.value && data.googleClientId) {
          clientId.value = String(data.googleClientId);
        }
        phoneSignIn.value = Boolean(data.phoneSignIn);
        return { googleClientId: clientId.value, phoneSignIn: phoneSignIn.value };
      })
      .catch(() => {
        configLoader = null; // try again next time a sign-in screen mounts
        return { googleClientId: clientId.value, phoneSignIn: false };
      });
  }
  return configLoader as Promise<{ googleClientId: string; phoneClient: boolean; phoneSignIn: boolean }>;
}

function resolveClientId(): Promise<string> {
  if (clientId.value) return Promise.resolve(clientId.value);
  return resolveAuthConfig().then((cfg) => cfg.googleClientId);
}

/** Resets cached auth config between unit tests. */
export function resetAuthConfigCacheForTests() {
  clientId.value = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
  phoneSignIn.value = false;
  configLoader = null;
  scriptLoader = null;
}

let scriptLoader: Promise<GoogleAccountsId> | null = null;

function loadGoogleIdentity(): Promise<GoogleAccountsId> {
  if (window.google?.accounts?.id) return Promise.resolve(window.google.accounts.id);
  if (!scriptLoader) {
    scriptLoader = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = GIS_SCRIPT_SRC;
      script.async = true;
      script.defer = true;
      script.onload = () =>
        window.google?.accounts?.id ? resolve(window.google.accounts.id) : reject(new Error('Google sign-in failed to load'));
      script.onerror = () => {
        scriptLoader = null;
        reject(new Error('Google sign-in failed to load. Check your connection.'));
      };
      document.head.appendChild(script);
    });
  }
  return scriptLoader;
}

export type GoogleButtonText = 'continue_with' | 'signup_with' | 'signin_with';

export function useGoogleIdentity() {
  /** Renders Google's official button into `el`; `onCredential` receives the raw ID token. */
  async function renderButton(
    el: HTMLElement,
    onCredential: (credential: string) => void,
    text: GoogleButtonText,
    handlers?: { onCancel?: () => void; onError?: (message: string) => void }
  ) {
    const gis = await loadGoogleIdentity();
    gis.initialize({
      client_id: clientId.value,
      callback: (response) => {
        if (response.credential) {
          onCredential(response.credential);
        } else {
          handlers?.onCancel?.();
        }
      },
      auto_select: false,
      cancel_on_tap_outside: true,
      ux_mode: 'popup',
      itp_support: true,
      context: text === 'signup_with' ? 'signup' : 'signin',
    });
    gis.renderButton(el, {
      type: 'standard',
      theme: 'outline',
      shape: 'pill',
      size: 'large',
      text,
      logo_alignment: 'left',
      // GIS accepts 200–400px.
      width: Math.max(200, Math.min(400, el.clientWidth || 360)),
    });
  }

  /**
   * Opens Google's official OAuth 2.0 Sign-In popup (`accounts.google.com/v3/signin/identifier`)
   * with `prompt: 'select_account'` so the user can sign into Google or choose another account.
   */
  async function promptSignIn(
    onCredential: (credential: string) => void,
    text: GoogleButtonText,
    handlers?: { onCancel?: () => void; onError?: (message: string) => void }
  ) {
    const resolved = await resolveClientId();
    if (!resolved) {
      handlers?.onError?.(
        'Google sign-in requires GOOGLE_CLIENT_ID in backend/.env (see Google Cloud Console setup steps).'
      );
      return;
    }
    const gis = await loadGoogleIdentity();
    const oauth2 = window.google?.accounts?.oauth2;
    if (oauth2?.initTokenClient) {
      const tokenClient = oauth2.initTokenClient({
        client_id: resolved,
        scope: 'openid email profile',
        prompt: 'select_account',
        callback: (response) => {
          if (response?.error) {
            if (response.error === 'access_denied') {
              handlers?.onCancel?.();
            } else {
              handlers?.onError?.(response.error_description || 'Google sign-in could not be completed.');
            }
            return;
          }
          if (response?.access_token) {
            onCredential(`oauth2:${response.access_token}`);
          } else {
            handlers?.onCancel?.();
          }
        },
        error_callback: (err) => {
          if (err?.type === 'popup_closed') {
            handlers?.onCancel?.();
          } else if (err?.type === 'popup_failed_to_open') {
            handlers?.onError?.('Google sign-in popup was blocked by your browser. Please allow popups and try again.');
          } else {
            handlers?.onCancel?.();
          }
        },
      });
      tokenClient.requestAccessToken({ prompt: 'select_account' });
      return;
    }

    gis.initialize({
      client_id: resolved,
      callback: (response) => {
        if (response.credential) {
          onCredential(response.credential);
        } else {
          handlers?.onCancel?.();
        }
      },
      auto_select: false,
      cancel_on_tap_outside: true,
      ux_mode: 'popup',
      itp_support: true,
      context: text === 'signup_with' ? 'signup' : 'signin',
    });
    if (typeof gis.prompt === 'function') {
      gis.prompt((notification) => {
        if (notification?.isNotDisplayed?.()) {
          handlers?.onError?.('Google sign-in popup was blocked or suppressed by your browser. Please allow popups and try again.');
          return;
        }
        if (notification?.isSkippedMoment?.()) {
          handlers?.onCancel?.();
          return;
        }
        if (notification?.isDismissedMoment?.() && notification.getDismissedReason?.() !== 'credential_returned') {
          handlers?.onCancel?.();
        }
      });
    }
  }

  /** Stops GIS from silently re-selecting the account after the user signs out. */
  function disableAutoSelect() {
    window.google?.accounts?.id?.disableAutoSelect();
  }

  return { clientId, resolveClientId, renderButton, promptSignIn, disableAutoSelect };
}

/**
 * Whether Google sign-in is set up on the server (GOOGLE_CLIENT_ID).
 */
export function useGoogleAvailable() {
  const available = ref(Boolean(clientId.value));
  onMounted(async () => {
    available.value = Boolean(await resolveClientId());
  });
  return available;
}

/**
 * Whether optional SMS phone sign-in is configured on the server (`phoneSignIn` from `/auth/config`).
 * When false, SMS/phone OTP options are hidden so sign-up and sign-in never require paid SMS delivery.
 */
export function usePhoneSignInAvailable() {
  const available = ref(phoneSignIn.value);
  onMounted(async () => {
    const cfg = await resolveAuthConfig();
    available.value = cfg.phoneSignIn;
  });
  return available;
}
