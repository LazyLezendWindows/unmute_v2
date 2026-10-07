<template>
  <!-- Confirms a phone number: texts a code when opened, then hands the typed code to the parent. -->
  <UModal :is-open="isOpen" title="Verify your number" max-width="sm" :close-on-backdrop="false" @close="$emit('close')">
    <form id="phone-code-form" class="d-flex flex-column gap-3" @submit.prevent="submit">
      <p class="small mb-0 u-text-secondary">
        Enter the 6-digit code we sent to <strong class="u-text-primary">{{ phone }}</strong>.
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
        :aria-invalid="shownError ? 'true' : undefined"
        @input="onInput"
      />
      <button type="button" class="link-btn align-self-center" :disabled="resendIn > 0 || sending" @click="send">
        {{ resendIn > 0 ? `Resend code in ${resendIn}s` : 'Resend code' }}
      </button>
      <p v-if="shownError" class="small text-danger fw-medium mb-0" role="alert">{{ shownError }}</p>
    </form>

    <template #footer>
      <UButton variant="secondary" size="md" @click="$emit('close')">Cancel</UButton>
      <UButton type="submit" form="phone-code-form" variant="primary" size="md" :loading="busy" :disabled="!/^\d{6}$/.test(code)">
        Verify
      </UButton>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import UModal from '../ui/UModal.vue';
import UButton from '../ui/UButton.vue';
import { useAuthStore } from '../../stores/auth';

const props = defineProps<{
  isOpen: boolean;
  /** E.164 number to text. */
  phone: string;
  /** True while the parent is checking the code. */
  busy?: boolean;
  /** The parent's answer to the last code (wrong, expired…). */
  error?: string | null;
}>();
const emit = defineEmits<{ (e: 'submit', code: string): void; (e: 'close'): void }>();

const authStore = useAuthStore();
const code = ref('');
const sending = ref(false);
const sendError = ref<string | null>(null);
const resendIn = ref(0);
const codeInput = ref<HTMLInputElement | null>(null);
let timer: ReturnType<typeof setInterval> | undefined;

const shownError = computed(() => sendError.value || props.error || null);

async function send() {
  sending.value = true;
  sendError.value = null;
  try {
    const result = await authStore.requestPhoneCode(props.phone);
    code.value = '';
    clearInterval(timer);
    resendIn.value = result.resendAfter;
    timer = setInterval(() => {
      resendIn.value = Math.max(0, resendIn.value - 1);
      if (!resendIn.value) clearInterval(timer);
    }, 1000);
    await nextTick();
    codeInput.value?.focus();
  } catch (err: any) {
    sendError.value = err.message || "We couldn't send a code. Please try again.";
  } finally {
    sending.value = false;
  }
}

watch(
  () => props.isOpen,
  (open) => {
    if (open) send();
    else clearInterval(timer);
  }
);

/** Digits only; the sixth digit submits, as SMS autofill does. */
function onInput() {
  code.value = code.value.replace(/\D/g, '').slice(0, 6);
  if (code.value.length === 6) submit();
}

function submit() {
  if (!props.busy && /^\d{6}$/.test(code.value)) emit('submit', code.value);
}

onBeforeUnmount(() => clearInterval(timer));
</script>

<style scoped lang="scss">
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
