<template>
  <UModal
    :is-open="isOpen"
    :title="useRecovery ? 'Use a recovery code' : 'Two-factor authentication'"
    max-width="sm"
    :close-on-backdrop="false"
    @close="$emit('close')"
  >
    <form id="two-factor-verify-form" class="d-flex flex-column gap-3" @submit.prevent="submit">
      <div class="totp-hero d-flex align-items-center gap-3 p-3 rounded-4">
        <span class="totp-hero-icon" aria-hidden="true">
          <i :class="useRecovery ? 'ri-key-2-line' : 'ri-shield-keyhole-line'"></i>
        </span>
        <p class="small mb-0 u-text-secondary">
          <template v-if="!useRecovery">
            Enter the 6-digit code from your authenticator app (Google Authenticator, Microsoft Authenticator, or similar).
          </template>
          <template v-else>
            Enter one of your 8-character backup recovery codes (for example, <strong>ABCD-EFGH</strong>). Each recovery code can only be used once.
          </template>
        </p>
      </div>

      <input
        v-if="!useRecovery"
        ref="totpInput"
        v-model="totpCode"
        class="code-input"
        type="text"
        inputmode="numeric"
        autocomplete="one-time-code"
        maxlength="6"
        placeholder="••••••"
        aria-label="6-digit authenticator code"
        :aria-invalid="error ? 'true' : undefined"
        @input="onTotpInput"
      />

      <input
        v-else
        ref="recoveryInput"
        v-model="recoveryCode"
        class="recovery-input"
        type="text"
        autocomplete="off"
        spellcheck="false"
        maxlength="9"
        placeholder="XXXX-XXXX"
        aria-label="8-character recovery code"
        :aria-invalid="error ? 'true' : undefined"
        @input="onRecoveryInput"
      />

      <button type="button" class="link-btn align-self-center" :disabled="busy" @click="toggleMode">
        {{ useRecovery ? 'Use 6-digit authenticator code instead' : "Can't access your authenticator app? Use a recovery code" }}
      </button>

      <p v-if="error" class="small text-danger fw-medium mb-0" role="alert">{{ error }}</p>
    </form>

    <template #footer>
      <UButton variant="secondary" size="md" :disabled="busy" @click="$emit('close')">Cancel</UButton>
      <UButton
        type="submit"
        form="two-factor-verify-form"
        variant="primary"
        size="md"
        :loading="busy"
        :disabled="!canSubmit"
      >
        Verify &amp; sign in
      </UButton>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import UModal from '../ui/UModal.vue';
import UButton from '../ui/UButton.vue';
import { useAuthStore } from '../../stores/auth';
import { useToastStore } from '../../stores/toast';

const props = defineProps<{
  isOpen: boolean;
  pendingToken: string | null;
}>();

const emit = defineEmits<{
  (e: 'authenticated', isNewUser: boolean): void;
  (e: 'close'): void;
}>();

const authStore = useAuthStore();
const toastStore = useToastStore();

const useRecovery = ref(false);
const totpCode = ref('');
const recoveryCode = ref('');
const busy = ref(false);
const error = ref<string | null>(null);

const totpInput = ref<HTMLInputElement | null>(null);
const recoveryInput = ref<HTMLInputElement | null>(null);

const canSubmit = computed(() => {
  if (useRecovery.value) {
    const clean = recoveryCode.value.replace(/[\s-]/g, '');
    return /^[A-Za-z0-9]{8}$/.test(clean);
  }
  return /^\d{6}$/.test(totpCode.value);
});

async function focusActiveInput() {
  await nextTick();
  if (useRecovery.value) {
    recoveryInput.value?.focus();
  } else {
    totpInput.value?.focus();
  }
}

watch(
  () => props.isOpen,
  (open) => {
    if (open) {
      useRecovery.value = false;
      totpCode.value = '';
      recoveryCode.value = '';
      error.value = null;
      focusActiveInput();
    }
  }
);

function toggleMode() {
  useRecovery.value = !useRecovery.value;
  totpCode.value = '';
  recoveryCode.value = '';
  error.value = null;
  focusActiveInput();
}

function onTotpInput() {
  totpCode.value = totpCode.value.replace(/\D/g, '').slice(0, 6);
  if (totpCode.value.length === 6) {
    submit();
  }
}

function onRecoveryInput() {
  const alnum = recoveryCode.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 8);
  recoveryCode.value = alnum.length > 4 ? `${alnum.slice(0, 4)}-${alnum.slice(4)}` : alnum;
}

async function submit() {
  if (busy.value || !canSubmit.value || !props.pendingToken) return;
  busy.value = true;
  error.value = null;
  try {
    const code = useRecovery.value ? recoveryCode.value.trim() : totpCode.value.trim();
    const outcome = await authStore.verifyTwoFactorLogin({
      pendingToken: props.pendingToken,
      code,
    });
    if (outcome.usedRecoveryCode) {
      toastStore.info('Signed in with a one-time recovery code.');
    }
    emit('authenticated', outcome.isNewUser);
  } catch (err: any) {
    error.value = err.message || 'Invalid verification code. Please try again.';
  } finally {
    busy.value = false;
  }
}
</script>

<style scoped lang="scss">
.totp-hero {
  background: var(--unmute-chip-pink);
  border: 1px solid var(--unmute-glass-border);
}

.totp-hero-icon {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 2.75rem;
  height: 2.75rem;
  border-radius: 0.9rem;
  background: var(--unmute-card);
  color: var(--unmute-cta);
  font-size: 1.4rem;
}

.code-input,
.recovery-input {
  height: 3.6rem;
  border: 1px solid var(--unmute-input-border);
  border-radius: var(--unmute-radius-sm);
  background: var(--unmute-input-bg);
  color: var(--unmute-text-heading);
  font-weight: 700;
  text-align: center;
  outline: none;

  &:focus {
    border-color: var(--unmute-primary);
    box-shadow: 0 0 0 4px var(--unmute-primary-surface);
  }
}

.code-input {
  font-size: 1.6rem;
  letter-spacing: 0.6em;
  text-indent: 0.6em;
}

.recovery-input {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 1.35rem;
  letter-spacing: 0.2em;
  text-indent: 0.2em;
  text-transform: uppercase;
}

.link-btn {
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--unmute-accent-text);
  font-weight: 600;
  font-size: 0.85rem;
  text-decoration: underline;
  text-underline-offset: 3px;

  &:disabled {
    color: var(--unmute-text-muted);
    text-decoration: none;
  }
}
</style>

