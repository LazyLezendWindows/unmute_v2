<template>
  <AuthStage title="Welcome back" subtitle="Sign in to continue your conversations" tagline>
    <div class="d-flex flex-column gap-4">

      <form class="d-flex flex-column gap-3" @submit.prevent="handleLogin">
        <UInput v-model="email" type="email" required placeholder="Email address" icon="ri-mail-line" autocomplete="email" />
        <UInput v-model="password" type="password" required placeholder="Password" icon="ri-lock-line" autocomplete="current-password" />
        <UButton type="submit" variant="primary" size="lg" block :loading="loading" class="mt-1">
          Sign in <i class="ri-arrow-right-line ms-2" aria-hidden="true"></i>
        </UButton>
      </form>

      <div class="auth-divider" role="separator">or continue with</div>
      <GoogleSignIn text="continue_with" @authenticated="onGoogleAuthenticated" />

      <p class="text-center small mb-0 u-text-muted">
        Don't have an account?
        <router-link to="/register" class="auth-link ms-1">Create account</router-link>
      </p>
    </div>
  </AuthStage>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import UInput from '../components/ui/UInput.vue';
import AuthStage from '../components/auth/AuthStage.vue';
import UButton from '../components/ui/UButton.vue';
import GoogleSignIn from '../components/auth/GoogleSignIn.vue';
import { useAuthStore } from '../stores/auth';
import { useToastStore } from '../stores/toast';
import { ONBOARDING_START } from '../onboarding';

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();

const email = ref('');
const password = ref('');
const loading = ref(false);

function postLoginPath(): string {
  const target = route.query.redirect;
  return typeof target === 'string' && target.startsWith('/') && !target.startsWith('//') ? target : '/discover';
}

function onGoogleAuthenticated(isNewUser: boolean) {
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
</script>
