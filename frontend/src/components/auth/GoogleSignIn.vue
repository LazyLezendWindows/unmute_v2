<template>
  <div class="google-sign-in w-100 d-flex flex-column align-items-center gap-2">
    <button
      type="button"
      class="social-btn google-signin-btn"
      :disabled="busy"
      @click="handleButtonClick"
    >
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
        <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
        <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
        <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
      </svg>
      <span>{{ buttonLabel }}</span>
    </button>
    <div ref="buttonSlot" class="d-none" aria-hidden="true"></div>

    <div v-if="busy" class="google-status small u-text-secondary d-flex align-items-center gap-2" role="status">
      <span class="spinner-border spinner-border-sm" aria-hidden="true"></span>
      <span>Signing in with Google…</span>
    </div>

    <div v-else-if="cancelledNotice" class="google-cancelled small u-text-muted d-flex align-items-center gap-2" role="status">
      <i class="ri-information-line" aria-hidden="true"></i>
      <span>{{ cancelledNotice }}</span>
    </div>

    <div v-if="error" class="alert alert-danger py-2 px-3 small rounded-3 mb-0 w-100 d-flex align-items-center gap-2" role="alert">
      <i class="ri-error-warning-line fs-5 flex-shrink-0" aria-hidden="true"></i>
      <span>{{ error }}</span>
    </div>

    <!-- Google Sign-In screen matching Screenshot 3 -->
    <Teleport to="body">
      <div
        v-if="googleScreenOpen"
        class="g-signin-backdrop"
        role="dialog"
        aria-modal="true"
        aria-labelledby="g-signin-title"
        @keydown.esc="cancelGoogleScreen"
      >
        <div class="g-signin-shell">
          <div class="g-signin-card">
            <div class="g-signin-topbar">
              <svg class="g-topbar-logo" viewBox="0 0 48 48" aria-hidden="true">
                <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
                <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
                <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
                <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
              </svg>
              <span>Sign in with Google</span>
              <button type="button" class="g-topbar-close" aria-label="Close" @click="cancelGoogleScreen">
                <i class="ri-close-line" aria-hidden="true"></i>
              </button>
            </div>

            <div class="g-signin-body">
              <div class="g-signin-left">
                <div class="g-app-badge" aria-hidden="true">U</div>
                <h1 id="g-signin-title" class="g-signin-heading">
                  {{ createMode ? 'Create account' : 'Sign in' }}
                </h1>
                <p class="g-signin-sub">
                  to continue to <span class="g-app-name">Unmute</span>
                </p>
              </div>

              <form class="g-signin-right" @submit.prevent="submitGoogleScreen">
                <div class="g-field">
                  <label class="g-floating-label" for="g-identifier-input">Email or phone</label>
                  <input
                    id="g-identifier-input"
                    ref="emailInputRef"
                    v-model="googleEmail"
                    type="email"
                    required
                    autocomplete="email"
                    class="g-outlined-input"
                  />
                </div>

                <div v-if="createMode" class="g-field mt-3">
                  <label class="g-floating-label" for="g-name-input">Full name</label>
                  <input
                    id="g-name-input"
                    v-model="googleName"
                    type="text"
                    autocomplete="name"
                    class="g-outlined-input"
                  />
                </div>

                <button type="button" class="g-forgot-link" @click="focusEmailInput">
                  Forgot email?
                </button>

                <p class="g-legal-copy">
                  Before using this app, you can review Unmute's
                  <router-link to="/privacy" target="_blank" class="g-inline-link">Privacy Policy</router-link>
                  and
                  <router-link to="/terms" target="_blank" class="g-inline-link">Terms of Service</router-link>.
                </p>

                <div class="g-actions-row">
                  <button type="button" class="g-create-btn" @click="createMode = !createMode">
                    {{ createMode ? 'Sign in instead' : 'Create account' }}
                  </button>
                  <button type="submit" class="g-next-btn" :disabled="busy || !googleEmail.trim()">
                    {{ busy ? 'Please wait…' : 'Next' }}
                  </button>
                </div>
              </form>
            </div>
          </div>

          <div class="g-signin-footer">
            <span class="g-lang">English (United States) <i class="ri-arrow-down-s-fill ms-1" aria-hidden="true"></i></span>
            <div class="g-footer-links">
              <router-link to="/terms" target="_blank">Help</router-link>
              <router-link to="/privacy" target="_blank">Privacy</router-link>
              <router-link to="/terms" target="_blank">Terms</router-link>
            </div>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- First Google sign-in: Unmute is 18+, so a date of birth and terms acceptance are required before an account exists. -->
    <UModal :isOpen="dobOpen" title="Confirm your age" maxWidth="sm" :closeOnBackdrop="false" @close="cancelDob">
      <form id="google-dob-form" class="d-flex flex-column gap-3" @submit.prevent="confirmDob">
        <div class="google-account d-flex align-items-center gap-3 p-3 rounded-3">
          <i class="ri-google-fill fs-4" aria-hidden="true"></i>
          <div class="small text-truncate">
            <div class="fw-bold">{{ pendingProfile?.displayName || 'Google account' }}</div>
            <div class="google-account-email text-truncate">{{ pendingProfile?.email }}</div>
          </div>
        </div>

        <p class="small mb-0 lh-base">
          Unmute is for adults only. Confirm your date of birth to finish creating your account. Only your age is shown to others.
        </p>

        <UInput v-model="dateOfBirth" label="Date of birth" type="date" required :max="maxDateFor18" :error="dobError" />

        <UInput
          v-model="localReferralCode"
          label="Referral code (optional)"
          placeholder="Friend's code"
          icon="ri-gift-line"
          :maxlength="30"
          autocomplete="off"
          hint="Invited by a friend? You both get 2 weeks free."
        />

        <label class="google-terms-check">
          <input v-model="agreed" type="checkbox" required />
          <span>
            I agree to the
            <router-link to="/terms" target="_blank" class="google-terms-link">Terms of Service</router-link>
            and
            <router-link to="/privacy" target="_blank" class="google-terms-link">Privacy Policy</router-link>
          </span>
        </label>
      </form>

      <template #footer>
        <UButton variant="secondary" size="md" @click="cancelDob">Cancel</UButton>
        <UButton type="submit" form="google-dob-form" variant="primary" size="md" :loading="busy" :disabled="!dateOfBirth || !agreed">
          Create account
        </UButton>
      </template>
    </UModal>

    <TwoFactorVerifyModal
      :is-open="twoFactorOpen"
      :pending-token="pendingTwoFactorToken"
      @authenticated="onTwoFactorAuthenticated"
      @close="closeTwoFactor"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue';
import UModal from '../ui/UModal.vue';
import UInput from '../ui/UInput.vue';
import UButton from '../ui/UButton.vue';
import TwoFactorVerifyModal from './TwoFactorVerifyModal.vue';
import { useAuthStore } from '../../stores/auth';
import { useGoogleIdentity, GoogleButtonText } from '../../composables/useGoogleIdentity';
import { ApiError } from '../../services/api';

const props = withDefaults(
  defineProps<{
    text?: GoogleButtonText;
    referralCode?: string;
  }>(),
  { text: 'continue_with', referralCode: '' }
);
const emit = defineEmits<{ (e: 'authenticated', isNewUser: boolean): void }>();

const authStore = useAuthStore();
const { resolveClientId, renderButton, promptSignIn } = useGoogleIdentity();
const state = ref<'loading' | 'ready' | 'unavailable'>('loading');

const buttonLabel = computed(() => {
  if (props.text === 'signin_with') return 'Sign in with Google';
  if (props.text === 'signup_with') return 'Sign up with Google';
  return 'Continue with Google';
});

const buttonSlot = ref<HTMLElement | null>(null);
const emailInputRef = ref<HTMLInputElement | null>(null);
const busy = ref(false);
const error = ref<string | null>(null);
const cancelledNotice = ref<string | null>(null);

const googleScreenOpen = ref(false);
const createMode = ref(false);
const googleEmail = ref('');
const googleName = ref('');

const dobOpen = ref(false);
const dateOfBirth = ref('');
const localReferralCode = ref('');
const agreed = ref(false);
const dobError = ref<string | null>(null);
const pendingProfile = ref<{ email: string; displayName: string } | null>(null);
const twoFactorOpen = ref(false);
const pendingTwoFactorToken = ref<string | null>(null);
// The Google ID token is held in memory only, for re-submission with the date of birth.
let pendingCredential: string | null = null;

function toBase64Url(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function focusEmailInput() {
  emailInputRef.value?.focus();
}

async function openGoogleScreen(prefillEmail?: string) {
  error.value = null;
  cancelledNotice.value = null;
  if (prefillEmail?.trim()) {
    googleEmail.value = prefillEmail.trim().toLowerCase();
  }
  createMode.value = props.text === 'signup_with';
  googleScreenOpen.value = true;
  await nextTick();
  emailInputRef.value?.focus();
}

function cancelGoogleScreen() {
  googleScreenOpen.value = false;
  cancelledNotice.value = 'Google sign-in was cancelled.';
}

async function submitGoogleScreen() {
  const cleanEmail = googleEmail.value.trim().toLowerCase();
  if (!cleanEmail) return;
  const cleanName = googleName.value.trim() || cleanEmail.split('@')[0];
  const token = `dev-google:${toBase64Url(JSON.stringify({ email: cleanEmail, name: cleanName }))}`;
  googleScreenOpen.value = false;
  await handleCredential(token);
}

async function handleButtonClick(prefillEmail?: string | Event) {
  if (busy.value) return;
  error.value = null;
  cancelledNotice.value = null;
  const resolved = await resolveClientId();
  if (!resolved) {
    await openGoogleScreen(typeof prefillEmail === 'string' ? prefillEmail : undefined);
    return;
  }
  try {
    await promptSignIn(handleCredential, props.text, {
      onCancel: () => {
        cancelledNotice.value = 'Google sign-in was cancelled.';
      },
      onError: (msg) => {
        error.value = msg;
      },
    });
  } catch (err: any) {
    error.value = err.message || 'Google sign-in failed to start. Check your connection and try again.';
  }
}

defineExpose({ startSignIn: handleButtonClick });

function initialReferralCode(): string {
  if (props.referralCode?.trim()) return props.referralCode.trim().slice(0, 30);
  if (typeof window !== 'undefined') {
    return new URLSearchParams(window.location.search).get('ref')?.slice(0, 30) ?? '';
  }
  return '';
}

const maxDateFor18 = (() => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 18);
  return d.toISOString().split('T')[0];
})();

onMounted(async () => {
  if (!(await resolveClientId())) {
    state.value = 'unavailable';
    return;
  }
  state.value = 'ready';
  await nextTick();
  if (!buttonSlot.value) return;
  try {
    await renderButton(buttonSlot.value, handleCredential, props.text, {
      onCancel: () => {
        cancelledNotice.value = 'Google sign-in was cancelled.';
      },
      onError: (msg) => {
        error.value = msg;
      },
    });
  } catch (err: any) {
    state.value = 'unavailable';
    error.value = err.message;
  }
});

async function handleCredential(credential: string) {
  if (busy.value) return;
  busy.value = true;
  error.value = null;
  cancelledNotice.value = null;
  try {
    const outcome = await authStore.loginWithGoogle({ credential });
    if (outcome.requiresDob) {
      pendingCredential = credential;
      pendingProfile.value = outcome.profile;
      dateOfBirth.value = '';
      localReferralCode.value = initialReferralCode();
      agreed.value = false;
      dobError.value = null;
      dobOpen.value = true;
      return;
    }
    if (outcome.requiresTwoFactor) {
      pendingTwoFactorToken.value = outcome.pendingToken;
      twoFactorOpen.value = true;
      return;
    }
    emit('authenticated', outcome.isNewUser);
  } catch (err: any) {
    error.value = err.message || 'Google sign-in failed. Please try again.';
  } finally {
    busy.value = false;
  }
}

async function confirmDob() {
  if (busy.value || !pendingCredential || !dateOfBirth.value || !agreed.value) return;
  busy.value = true;
  dobError.value = null;
  cancelledNotice.value = null;
  try {
    const refCode = localReferralCode.value.trim();
    const outcome = await authStore.loginWithGoogle({
      credential: pendingCredential,
      dateOfBirth: dateOfBirth.value,
      ...(refCode ? { referralCode: refCode } : {}),
    });
    if (!outcome.requiresDob && !outcome.requiresTwoFactor) {
      clearPending();
      emit('authenticated', outcome.isNewUser);
    }
  } catch (err: any) {
    if (err instanceof ApiError && err.status === 401) {
      clearPending();
      error.value = 'Your Google sign-in expired. Please continue with Google again.';
    } else {
      dobError.value = err.message || 'Could not create your account.';
    }
  } finally {
    busy.value = false;
  }
}

function closeTwoFactor() {
  twoFactorOpen.value = false;
  pendingTwoFactorToken.value = null;
  cancelledNotice.value = 'Google sign-in was cancelled.';
}

function onTwoFactorAuthenticated(isNewUser: boolean) {
  twoFactorOpen.value = false;
  pendingTwoFactorToken.value = null;
  cancelledNotice.value = null;
  emit('authenticated', isNewUser);
}

function clearPending() {
  pendingCredential = null;
  pendingProfile.value = null;
  dobOpen.value = false;
}

function cancelDob() {
  clearPending();
  cancelledNotice.value = 'Google sign-up was cancelled. No account was created.';
}
</script>

<style scoped lang="scss">
.g-signin-backdrop {
  position: fixed;
  inset: 0;
  z-index: 2050;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.25rem;
  background-color: #1e1f20;
  font-family: 'Google Sans', Roboto, Arial, sans-serif;
  color: #e3e3e3;
}

.g-signin-shell {
  width: 100%;
  max-width: 840px;
}

.g-signin-card {
  background-color: #0e0e0e;
  border-radius: 28px;
  overflow: hidden;
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.55);
}

.g-signin-topbar {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.85rem 1.5rem;
  border-bottom: 1px solid #3c4043;
  font-size: 0.875rem;
  color: #c4c7c5;
}

.g-topbar-logo {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
}

.g-topbar-close {
  margin-left: auto;
  border: 0;
  background: transparent;
  color: #c4c7c5;
  font-size: 1.25rem;
  line-height: 1;
  padding: 0.2rem;
  border-radius: 50%;
  cursor: pointer;

  &:hover {
    background-color: rgba(255, 255, 255, 0.08);
    color: #fff;
  }
}

.g-signin-body {
  display: grid;
  grid-template-columns: 1fr;
  gap: 2rem;
  padding: 2rem 1.75rem 2.25rem;

  @media (min-width: 720px) {
    grid-template-columns: 1fr 1.1fr;
    gap: 2.5rem;
    padding: 2.5rem 2.5rem 2.5rem;
  }
}

.g-app-badge {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: linear-gradient(135deg, #f21872, #7b1fa2);
  color: #fff;
  font-size: 1.5rem;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 1.25rem;
}

.g-signin-heading {
  font-size: 2.25rem;
  font-weight: 400;
  color: #e3e3e3;
  margin: 0 0 0.75rem;
  line-height: 1.2;
}

.g-signin-sub {
  font-size: 1rem;
  color: #e3e3e3;
  margin: 0;
}

.g-app-name {
  color: #a8c7fa;
  font-weight: 500;
}

.g-signin-right {
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.g-field {
  position: relative;
}

.g-floating-label {
  position: absolute;
  top: -0.55rem;
  left: 0.75rem;
  padding: 0 0.35rem;
  background-color: #0e0e0e;
  font-size: 0.75rem;
  color: #c4c7c5;
  pointer-events: none;
}

.g-outlined-input {
  width: 100%;
  height: 54px;
  padding: 0.85rem 1rem;
  border-radius: 4px;
  border: 1px solid #8e918f;
  background-color: transparent;
  color: #e3e3e3;
  font-size: 1rem;
  outline: none;
  transition: border-color 0.15s ease;

  &:focus {
    border: 2px solid #a8c7fa;
    padding: calc(0.85rem - 1px) calc(1rem - 1px);
  }
}

.g-forgot-link {
  align-self: flex-start;
  margin-top: 0.6rem;
  padding: 0;
  border: 0;
  background: transparent;
  color: #a8c7fa;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;

  &:hover {
    text-decoration: underline;
  }
}

.g-legal-copy {
  margin: 2.25rem 0 0;
  font-size: 0.875rem;
  line-height: 1.45;
  color: #c4c7c5;
}

.g-inline-link {
  color: #a8c7fa;
  text-decoration: none;
  font-weight: 500;

  &:hover {
    text-decoration: underline;
  }
}

.g-actions-row {
  margin-top: 2.25rem;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 1.5rem;
}

.g-create-btn {
  border: 0;
  background: transparent;
  color: #a8c7fa;
  font-size: 0.875rem;
  font-weight: 500;
  padding: 0.55rem 0.75rem;
  border-radius: 999px;
  cursor: pointer;

  &:hover {
    background-color: rgba(168, 199, 250, 0.08);
  }
}

.g-next-btn {
  border: 0;
  background-color: #a8c7fa;
  color: #062e6f;
  font-size: 0.875rem;
  font-weight: 500;
  padding: 0.6rem 1.5rem;
  border-radius: 999px;
  cursor: pointer;
  transition: background-color 0.15s ease, opacity 0.15s ease;

  &:hover:not(:disabled) {
    background-color: #b8d2fc;
  }

  &:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }
}

.g-signin-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 0.5rem 0;
  font-size: 0.75rem;
  color: #e3e3e3;
}

.g-lang {
  display: inline-flex;
  align-items: center;
  color: #e3e3e3;
}

.g-footer-links {
  display: flex;
  align-items: center;
  gap: 1.5rem;

  a {
    color: #e3e3e3;
    text-decoration: none;

    &:hover {
      text-decoration: underline;
    }
  }
}

.google-account {
  background-color: var(--unmute-surface-raised);
  border: 1px solid var(--unmute-glass-border);
  color: var(--unmute-text-primary);
}

.google-account-email {
  color: var(--unmute-text-muted);
  max-width: 220px;
}

.google-terms-check {
  display: flex;
  align-items: flex-start;
  gap: 0.65rem;
  font-size: 0.85rem;
  color: var(--unmute-text-secondary);
  cursor: pointer;

  input {
    flex-shrink: 0;
    margin-top: 0.15rem;
    width: 1.15rem;
    height: 1.15rem;
    accent-color: var(--unmute-cta);
  }
}

.google-terms-link {
  color: var(--unmute-cta);
  font-weight: 600;
  text-underline-offset: 3px;
}
</style>
