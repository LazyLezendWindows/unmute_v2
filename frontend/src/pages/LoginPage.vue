<template>
  <AuthStage title="Welcome back" subtitle="Sign in to continue your conversations" tagline logo-size="5.5rem">
    <div class="d-flex flex-column gap-4">

      <form class="d-flex flex-column gap-3" @submit.prevent="handleLogin">
        <UInput v-model="email" type="email" required placeholder="Email address" icon="ri-mail-line" autocomplete="email" />
        <UInput v-model="password" type="password" required placeholder="Password" icon="ri-lock-line" autocomplete="current-password" />
        <button type="button" class="auth-forgot btn btn-link p-0" @click="forgotOpen = true">Forgot password?</button>
        <UButton type="submit" variant="primary" size="lg" block :loading="loading" class="mt-1">
          Sign in <i class="ri-arrow-right-line ms-2" aria-hidden="true"></i>
        </UButton>
      </form>

      <div class="auth-divider" role="separator">or continue with</div>
      <div class="d-flex flex-column gap-2">
        <GoogleSignIn text="continue_with" @authenticated="onSignedIn" />
        <PhoneSignIn @authenticated="onSignedIn" />
      </div>

      <p class="text-center small mb-0 u-text-muted">
        Don't have an account?
        <router-link to="/register" class="auth-link ms-1">Create account</router-link>
      </p>
    </div>

    <!-- Reset by SMS: a code goes to the verified phone number on the account -->
    <UModal :is-open="forgotOpen" title="Reset Password" max-width="sm" @close="closeForgot">
      <form v-if="!forgotSent" id="forgot-form" class="d-flex flex-column gap-3" @submit.prevent="handleForgot">
        <p class="small mb-0 u-text-secondary">Enter your account email. We'll send a 6-digit code to it, and to your verified phone number if you have one.</p>
        <UInput v-model="forgotEmail" type="email" required placeholder="Email address" icon="ri-mail-line" autocomplete="email" />
      </form>
      <form v-else id="forgot-form" class="d-flex flex-column gap-3" @submit.prevent="handleReset">
        <p class="small mb-0 u-text-secondary">
          If <strong class="u-text-primary">{{ forgotEmail }}</strong> has an Unmute account, we've sent a code to it (check spam too) and to its verified phone number.
        </p>
        <p v-if="forgotDevCode" class="small mb-0 u-text-muted"><i class="ri-code-s-slash-line me-1"></i>Development mode, no email or SMS is sent. Your code is <strong>{{ forgotDevCode }}</strong></p>
        <UInput v-model="resetCode" inputmode="numeric" :maxlength="6" required placeholder="6-digit code" icon="ri-shield-keyhole-line" autocomplete="one-time-code" />
        <UInput v-model="resetPassword" type="password" required :minlength="8" placeholder="New password (8+ characters)" icon="ri-lock-line" autocomplete="new-password" />
        <p v-if="resetError" class="small text-danger mb-0" role="alert">{{ resetError }}</p>
      </form>
      <template #footer>
        <UButton variant="secondary" size="md" @click="closeForgot">Cancel</UButton>
        <UButton type="submit" form="forgot-form" variant="primary" size="md" :loading="forgotLoading">
          {{ forgotSent ? 'Set new password' : 'Send code' }}
        </UButton>
      </template>
    </UModal>
  </AuthStage>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import UInput from '../components/ui/UInput.vue';
import UModal from '../components/ui/UModal.vue';
import AuthStage from '../components/auth/AuthStage.vue';
import UButton from '../components/ui/UButton.vue';
import GoogleSignIn from '../components/auth/GoogleSignIn.vue';
import PhoneSignIn from '../components/auth/PhoneSignIn.vue';
import { useAuthStore } from '../stores/auth';
import { useToastStore } from '../stores/toast';
import { api } from '../services/api';
import { ONBOARDING_START } from '../onboarding';

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();

const email = ref('');
const password = ref('');
const loading = ref(false);
const forgotOpen = ref(false);
const forgotEmail = ref('');
const forgotLoading = ref(false);
const forgotSent = ref(false);
const forgotDevCode = ref<string | null>(null);
const resetCode = ref('');
const resetPassword = ref('');
const resetError = ref<string | null>(null);

function closeForgot() {
  forgotOpen.value = false;
  forgotSent.value = false;
  forgotDevCode.value = null;
  resetCode.value = '';
  resetPassword.value = '';
  resetError.value = null;
}

function postLoginPath(): string {
  const target = route.query.redirect;
  return typeof target === 'string' && target.startsWith('/') && !target.startsWith('//') ? target : '/discover';
}

function onSignedIn(isNewUser: boolean) {
  router.push(isNewUser ? ONBOARDING_START : postLoginPath());
}

async function handleLogin() {
  loading.value = true;
  try {
    await authStore.login({ email: email.value, password: password.value });
    router.push(postLoginPath());
  } catch (err: any) {
    useToastStore().error(err.message || 'Login failed');
  } finally {
    loading.value = false;
  }
}

async function handleForgot() {
  forgotLoading.value = true;
  try {
    const res = await api.post('/auth/password/forgot', { email: forgotEmail.value });
    forgotDevCode.value = res.data.data?.devCode ?? null;
    forgotSent.value = true;
  } catch (err: any) {
    useToastStore().error([404, 501, 502, 503].includes(err.status)
      ? 'Password reset is unavailable right now. Try again later or use your linked sign-in method.'
      : err.message || "Couldn't send a code. Please try again.");
  } finally {
    forgotLoading.value = false;
  }
}

/** Sets the new password with the recovery code, then signs straight in with it. */
async function handleReset() {
  forgotLoading.value = true;
  resetError.value = null;
  try {
    await api.post('/auth/password/reset', { email: forgotEmail.value, code: resetCode.value.trim(), password: resetPassword.value });
    await authStore.login({ email: forgotEmail.value, password: resetPassword.value });
    closeForgot();
    useToastStore().success('Password changed. You are signed in.');
    router.push(postLoginPath());
  } catch (err: any) {
    resetError.value = err.message || 'Could not reset your password.';
  } finally {
    forgotLoading.value = false;
  }
}
</script>
