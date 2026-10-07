<template>
  <button type="button" class="social-btn" @click="open">
    <i class="ri-phone-fill" aria-hidden="true"></i> Continue with Phone
  </button>

  <!-- Number → SMS code → (new numbers only) name and date of birth. Unmute is 18+, as with Google. -->
  <UModal :is-open="isOpen" :title="TITLES[step]" max-width="sm" :close-on-backdrop="false" @close="close">
    <form v-if="step === 'phone'" id="phone-form" class="d-flex flex-column gap-3" @submit.prevent="sendCode">
      <p class="small mb-0 u-text-secondary">We'll text you a 6-digit code to sign in. Standard SMS rates may apply.</p>
      <div class="phone-field" :class="{ 'has-error': error }">
        <i class="ri-phone-line" aria-hidden="true"></i>
        <span class="phone-prefix" aria-hidden="true">🇮🇳 +91</span>
        <input
          ref="phoneInput"
          v-model="phone"
          type="tel"
          inputmode="tel"
          autocomplete="tel-national"
          placeholder="Phone number"
          aria-label="Phone number"
          maxlength="16"
          :aria-invalid="error ? 'true' : undefined"
          aria-describedby="phone-hint"
        />
      </div>
      <p id="phone-hint" class="phone-hint mb-0">Outside India? Type your number with its country code, like +44…</p>
    </form>

    <form v-else-if="step === 'code'" id="phone-form" class="d-flex flex-column gap-3" @submit.prevent="verify()">
      <p class="small mb-0 u-text-secondary">
        Enter the code sent to <strong class="u-text-primary">{{ displayPhone }}</strong>.
        <button type="button" class="link-btn" @click="changeNumber">Change</button>
      </p>
      <input
        ref="codeInput"
        v-model="code"
        class="code-input"
        type="text"
        inputmode="numeric"
        autocomplete="one-time-code"
        maxlength="6"
        placeholder="••••••"
        aria-label="6-digit code"
        :aria-invalid="error ? 'true' : undefined"
        @input="onCodeInput"
      />
      <button type="button" class="link-btn align-self-center" :disabled="resendIn > 0 || busy" @click="sendCode">
        {{ resendIn > 0 ? `Resend code in ${resendIn}s` : 'Resend code' }}
      </button>
    </form>

    <form v-else id="phone-form" class="d-flex flex-column gap-3" @submit.prevent="verify(true)">
      <p class="small mb-0 u-text-secondary">
        Welcome to Unmute! Unmute is for adults only. Only your age is shown to others, never your date of birth.
      </p>
      <UInput v-model="displayName" label="Your name" required :minlength="2" :maxlength="50" autocomplete="given-name" />
      <UInput v-model="dateOfBirth" label="Date of birth" type="date" required :max="maxDateFor18" />
      <UInput v-model="referralCode" label="Referral code (optional)" placeholder="Friend's code" icon="ri-gift-line" :maxlength="30" autocomplete="off" hint="Invited by a friend? You both get 2 weeks free." />
    </form>

    <p v-if="error" class="small text-danger fw-medium mt-3 mb-0" role="alert">{{ error }}</p>

    <template #footer>
      <UButton variant="secondary" size="md" @click="close">Cancel</UButton>
      <UButton type="submit" form="phone-form" variant="primary" size="md" :loading="busy" :disabled="!canSubmit">
        {{ step === 'phone' ? 'Send code' : step === 'code' ? 'Verify' : 'Create account' }}
      </UButton>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref } from 'vue';
import UModal from '../ui/UModal.vue';
import UInput from '../ui/UInput.vue';
import UButton from '../ui/UButton.vue';
import { useAuthStore } from '../../stores/auth';

const emit = defineEmits<{ (e: 'authenticated', isNewUser: boolean): void }>();

type Step = 'phone' | 'code' | 'profile';
const TITLES: Record<Step, string> = {
  phone: 'Continue with Phone',
  code: 'Enter your code',
  profile: 'Create your account',
};

const authStore = useAuthStore();
const isOpen = ref(false);
const step = ref<Step>('phone');
const phone = ref('');
const code = ref('');
const displayName = ref('');
const dateOfBirth = ref('');
// From an invite link (/register?ref=…) when there is one.
const referralCode = ref(new URLSearchParams(window.location.search).get('ref')?.slice(0, 30) ?? '');
const busy = ref(false);
const error = ref<string | null>(null);
const resendIn = ref(0);
/** Shown on screen when the backend runs locally without an SMS provider. */
const phoneInput = ref<HTMLInputElement | null>(null);
const codeInput = ref<HTMLInputElement | null>(null);
let resendTimer: ReturnType<typeof setInterval> | undefined;

const maxDateFor18 = (() => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 18);
  return d.toISOString().split('T')[0];
})();

/** Indian numbers can be typed bare; anything starting with + is sent as given. */
const fullPhone = computed(() => {
  const typed = phone.value.replace(/[\s\-()]/g, '');
  return typed.startsWith('+') ? typed : `+91${typed.replace(/^0/, '')}`;
});

const displayPhone = computed(() => {
  const p = fullPhone.value;
  return p.startsWith('+91') && p.length === 13 ? `+91 ${p.slice(3, 8)} ${p.slice(8)}` : p;
});

const canSubmit = computed(() => {
  if (step.value === 'phone') return /^\+[1-9]\d{7,14}$/.test(fullPhone.value);
  if (step.value === 'code') return /^\d{6}$/.test(code.value);
  return displayName.value.trim().length >= 2 && Boolean(dateOfBirth.value);
});

async function focus(el: typeof phoneInput) {
  await nextTick();
  el.value?.focus();
}

function open() {
  step.value = 'phone';
  code.value = '';
  error.value = null;
  isOpen.value = true;
  focus(phoneInput);
}

function close() {
  isOpen.value = false;
  clearInterval(resendTimer);
}

function startResendTimer(seconds: number) {
  clearInterval(resendTimer);
  resendIn.value = seconds;
  resendTimer = setInterval(() => {
    resendIn.value = Math.max(0, resendIn.value - 1);
    if (!resendIn.value) clearInterval(resendTimer);
  }, 1000);
}

async function sendCode() {
  if (busy.value) return;
  busy.value = true;
  error.value = null;
  try {
    const { resendAfter } = await authStore.requestPhoneCode(fullPhone.value);
    step.value = 'code';
    code.value = '';
    startResendTimer(resendAfter);
    focus(codeInput);
  } catch (err: any) {
    error.value = err.message || "We couldn't send a code. Please try again.";
  } finally {
    busy.value = false;
  }
}

function changeNumber() {
  step.value = 'phone';
  error.value = null;
  focus(phoneInput);
}

/** Digits only; the sixth digit submits, as SMS autofill does. */
function onCodeInput() {
  code.value = code.value.replace(/\D/g, '').slice(0, 6);
  if (code.value.length === 6) verify();
}

async function verify(withProfile = false) {
  if (busy.value || !/^\d{6}$/.test(code.value)) return;
  busy.value = true;
  error.value = null;
  try {
    const outcome = await authStore.loginWithPhone({
      phone: fullPhone.value,
      code: code.value,
      ...(withProfile
        ? { displayName: displayName.value.trim(), dateOfBirth: dateOfBirth.value, ...(referralCode.value.trim() ? { referralCode: referralCode.value.trim() } : {}) }
        : {}),
    });
    if (outcome.requiresProfile) {
      step.value = 'profile';
      return;
    }
    close();
    emit('authenticated', outcome.isNewUser);
  } catch (err: any) {
    error.value = err.message || 'Sign-in failed. Please try again.';
    // An expired or used code can't be retried; the member needs a fresh one.
    if (/expired|already been used|Request a new one/i.test(error.value ?? '')) {
      step.value = 'code';
      code.value = '';
      resendIn.value = 0;
      clearInterval(resendTimer);
    }
  } finally {
    busy.value = false;
  }
}

onBeforeUnmount(() => clearInterval(resendTimer));
</script>

<style scoped lang="scss">
.phone-field {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  height: 3.25rem;
  padding: 0 1rem;
  border: 1px solid var(--unmute-input-border);
  border-radius: var(--unmute-radius-sm);
  background: var(--unmute-input-bg);
  color: var(--unmute-text-muted);

  &:focus-within {
    border-color: var(--unmute-primary);
    box-shadow: 0 0 0 4px var(--unmute-primary-surface);
  }

  &.has-error {
    border-color: var(--unmute-danger);
  }

  > i {
    font-size: 1.15rem;
  }

  input {
    flex: 1;
    min-width: 0;
    border: 0;
    outline: none;
    background: transparent;
    color: var(--unmute-text-primary);
    font-size: 1rem;

    &::placeholder {
      color: var(--unmute-text-dim);
    }
  }
}

.phone-prefix {
  padding-right: 0.7rem;
  border-right: 1px solid var(--unmute-input-border);
  color: var(--unmute-text-primary);
  font-weight: 600;
  white-space: nowrap;
}

.phone-hint {
  font-size: 0.75rem;
  color: var(--unmute-text-muted);
}

.code-input {
  height: 3.6rem;
  border: 1px solid var(--unmute-input-border);
  border-radius: var(--unmute-radius-sm);
  background: var(--unmute-input-bg);
  color: var(--unmute-text-heading);
  font-size: 1.6rem;
  font-weight: 700;
  letter-spacing: 0.6em;
  text-align: center;
  // Keeps the digits visually centred despite the trailing letter-spacing.
  text-indent: 0.6em;
  outline: none;

  &:focus {
    border-color: var(--unmute-primary);
    box-shadow: 0 0 0 4px var(--unmute-primary-surface);
  }
}

.link-btn {
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--unmute-accent-text);
  font-weight: 600;
  font-size: 0.875rem;
  text-decoration: underline;
  text-underline-offset: 3px;

  &:disabled {
    color: var(--unmute-text-muted);
    text-decoration: none;
  }
}
</style>
