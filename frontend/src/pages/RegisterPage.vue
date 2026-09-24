<template>
  <AuthStage title="Create your account" subtitle="Let's get to know you better" back="/welcome" logo-size="3.5rem">
    <template #header><SetupProgress :step="0" class="register-steps" /></template>
    <div class="d-flex flex-column gap-4">

      <form class="d-flex flex-column gap-3" @submit.prevent="handleRegister">
        <UInput v-model="displayName" type="text" required placeholder="Full name" icon="ri-user-line" autocomplete="name" />
        <UInput v-model="email" type="email" required placeholder="Email address" icon="ri-mail-line" autocomplete="email" />
        <UInput
          v-model="dateOfBirth"
          label="Date of birth"
          type="date"
          required
          :max="maxDateFor18"
          icon="ri-cake-2-line"
          hint="Only your age is shown to others."
        />
        <UInput
          v-model="password"
          type="password"
          required
          :minlength="8"
          placeholder="Password (8+ characters)"
          icon="ri-lock-line"
          autocomplete="new-password"
        />
        <UInput
          v-model="confirmPassword"
          type="password"
          required
          placeholder="Confirm password"
          icon="ri-lock-line"
          autocomplete="new-password"
          :error="passwordMismatch ? 'Passwords do not match.' : undefined"
        />
        <label class="terms-check">
          <input v-model="agreed" type="checkbox" required />
          <span>I'm 18+ and agree to the Unmute Community Respect Guidelines</span>
        </label>
        <UButton type="submit" variant="primary" size="lg" block :loading="loading" class="mt-1">
          Create account <i class="ri-arrow-right-line ms-2" aria-hidden="true"></i>
        </UButton>
      </form>

      <div class="auth-divider" role="separator">or</div>
      <GoogleSignIn text="signup_with" @authenticated="onGoogleAuthenticated" />

      <p class="text-center small mb-0 u-text-muted">
        Already have an account?
        <router-link to="/login" class="auth-link ms-1">Sign in</router-link>
      </p>
    </div>
  </AuthStage>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import UInput from '../components/ui/UInput.vue';
import AuthStage from '../components/auth/AuthStage.vue';
import UButton from '../components/ui/UButton.vue';
import GoogleSignIn from '../components/auth/GoogleSignIn.vue';
import { useAuthStore } from '../stores/auth';
import { useToastStore } from '../stores/toast';
import SetupProgress from '../components/layout/SetupProgress.vue';
import { ONBOARDING_START } from '../onboarding';

const router = useRouter();
const authStore = useAuthStore();

const displayName = ref('');
const email = ref('');
const dateOfBirth = ref('');
const password = ref('');
const confirmPassword = ref('');
const agreed = ref(false);
const loading = ref(false);

const maxDateFor18 = computed(() => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 18);
  return d.toISOString().split('T')[0];
});

function onGoogleAuthenticated(isNewUser: boolean) {
  router.push(isNewUser ? ONBOARDING_START : '/discover');
}

// Only flagged once the second field has something in it, so it doesn't nag while typing the first.
const passwordMismatch = computed(() => Boolean(confirmPassword.value) && confirmPassword.value !== password.value);

async function handleRegister() {
  if (passwordMismatch.value) return;
  loading.value = true;
  try {
    await authStore.register({
      displayName: displayName.value,
      email: email.value,
      dateOfBirth: dateOfBirth.value,
      password: password.value,
    });
    router.push(ONBOARDING_START);
  } catch (err: any) {
    // 409: the email is already registered, so point them at sign-in.
    useToastStore().error(
      err.status === 409
        ? 'An account with this email already exists. Sign in instead.'
        : err.message || 'Registration failed'
    );
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped lang="scss">
.register-steps {
  margin: 0.5rem 0 1.5rem;
}

.terms-check {
  display: flex;
  align-items: flex-start;
  gap: 0.65rem;
  font-size: 0.85rem;
  color: var(--unmute-text-secondary);
  cursor: pointer;

  input {
    flex-shrink: 0;
    width: 1.25rem;
    height: 1.25rem;
    margin-top: 0.05rem;
    accent-color: var(--unmute-cta);
  }
}

</style>
