<template>
  <div class="google-sign-in w-100 d-flex flex-column align-items-center gap-2" :class="{ 'is-gis': state !== 'unavailable' }">
    <!-- No client ID configured: keep the button's place, disabled, so the screen still reads as designed. -->
    <button
      v-if="state === 'unavailable'"
      type="button"
      class="social-btn"
      disabled
      title="Google sign-in is not available right now."
    >
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
        <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
        <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
        <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
      </svg>
      Continue with Google
    </button>
    <div
      v-else
      ref="buttonSlot"
      class="google-button-slot w-100 d-flex justify-content-center"
      :class="{ 'is-busy': busy }"
      :aria-busy="busy"
    ></div>

    <div v-if="error" class="alert alert-danger py-2 px-3 small rounded-3 mb-0 w-100 d-flex align-items-center gap-2" role="alert">
      <i class="ri-error-warning-line fs-5 flex-shrink-0" aria-hidden="true"></i>
      <span>{{ error }}</span>
    </div>

    <!-- First Google sign-in: Unmute is 18+, so a date of birth is required before an account exists. -->
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
      </form>

      <template #footer>
        <UButton variant="secondary" size="md" @click="cancelDob">Cancel</UButton>
        <UButton type="submit" form="google-dob-form" variant="primary" size="md" :loading="busy" :disabled="!dateOfBirth">
          Create account
        </UButton>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue';
import UModal from '../ui/UModal.vue';
import UInput from '../ui/UInput.vue';
import UButton from '../ui/UButton.vue';
import { useAuthStore } from '../../stores/auth';
import { useGoogleIdentity, GoogleButtonText } from '../../composables/useGoogleIdentity';
import { ApiError } from '../../services/api';

const props = withDefaults(defineProps<{ text?: GoogleButtonText }>(), { text: 'continue_with' });
const emit = defineEmits<{ (e: 'authenticated', isNewUser: boolean): void }>();

const authStore = useAuthStore();
const { resolveClientId, renderButton } = useGoogleIdentity();
// 'loading' keeps the button slot in place (no layout jump) while the client ID is resolved.
const state = ref<'loading' | 'ready' | 'unavailable'>('loading');

const buttonSlot = ref<HTMLElement | null>(null);
const busy = ref(false);
const error = ref<string | null>(null);

const dobOpen = ref(false);
const dateOfBirth = ref('');
const dobError = ref<string | null>(null);
const pendingProfile = ref<{ email: string; displayName: string } | null>(null);
// The Google ID token is held in memory only, for re-submission with the date of birth.
let pendingCredential: string | null = null;

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
    await renderButton(buttonSlot.value, handleCredential, props.text);
  } catch (err: any) {
    error.value = err.message;
  }
});

async function handleCredential(credential: string) {
  busy.value = true;
  error.value = null;
  try {
    const outcome = await authStore.loginWithGoogle({ credential });
    if (outcome.requiresDob) {
      pendingCredential = credential;
      pendingProfile.value = outcome.profile;
      dateOfBirth.value = '';
      dobError.value = null;
      dobOpen.value = true;
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
  if (!pendingCredential || !dateOfBirth.value) return;
  busy.value = true;
  dobError.value = null;
  try {
    const outcome = await authStore.loginWithGoogle({ credential: pendingCredential, dateOfBirth: dateOfBirth.value });
    if (!outcome.requiresDob) {
      clearPending();
      emit('authenticated', outcome.isNewUser);
    }
  } catch (err: any) {
    if (err instanceof ApiError && err.status === 401) {
      // The Google credential expired while the dialog was open; start again from the button.
      clearPending();
      error.value = 'Your Google sign-in expired. Please continue with Google again.';
    } else {
      dobError.value = err.message || 'Could not create your account.';
    }
  } finally {
    busy.value = false;
  }
}

function clearPending() {
  pendingCredential = null;
  pendingProfile.value = null;
  dobOpen.value = false;
}

function cancelDob() {
  clearPending();
}
</script>

<style scoped lang="scss">
.google-button-slot {
  min-height: 44px;

  &.is-busy {
    opacity: 0.6;
    pointer-events: none;
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
</style>
