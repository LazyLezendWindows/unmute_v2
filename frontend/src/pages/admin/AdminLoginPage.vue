<template>
  <div class="admin-login">
    <form v-if="setup?.needsSetup" class="login-card" @submit.prevent="createFirst">
      <div class="login-logo">
        <BrandLogo size="2.2rem" />
        <span class="login-badge">Admin</span>
      </div>
      <div class="login-head">
        <h1>Create first admin</h1>
        <p>No admin account exists yet. This account can add more admins later.</p>
      </div>
      <UInput v-model="name" required placeholder="Your name" icon="ri-user-line" autocomplete="name" />
      <UInput v-model="email" type="email" required placeholder="Admin email" icon="ri-mail-line" autocomplete="username" />
      <UInput v-model="password" type="password" required :minlength="10" placeholder="Password (10+ characters)" icon="ri-lock-line" autocomplete="new-password" />
      <UInput
        v-model="confirmPassword"
        type="password"
        required
        placeholder="Confirm password"
        icon="ri-lock-line"
        autocomplete="new-password"
        :error="confirmPassword && confirmPassword !== password ? 'Passwords do not match.' : undefined"
      />
      <UInput
        v-if="setup.setupRequiresCode"
        v-model="code"
        required
        placeholder="Setup code (in the server log)"
        icon="ri-key-2-line"
        hint="Printed in the backend log on startup, e.g. 123-456-789."
      />
      <p v-if="error" class="login-error" role="alert"><i class="ri-error-warning-fill"></i> {{ error }}</p>
      <UButton type="submit" variant="primary" size="lg" block :loading="busy">Create admin &amp; sign in</UButton>
    </form>

    <form v-else-if="setup" class="login-card" @submit.prevent="signIn">
      <div class="login-logo">
        <BrandLogo size="2.2rem" />
        <span class="login-badge">Admin</span>
      </div>
      <div class="login-head">
        <h1>Welcome back</h1>
        <p>Sign in to the admin panel.</p>
      </div>
      <UInput v-model="email" type="email" required placeholder="Admin email" icon="ri-mail-line" autocomplete="username" />
      <UInput v-model="password" type="password" required placeholder="Password" icon="ri-lock-line" autocomplete="current-password" />
      <p v-if="error" class="login-error" role="alert"><i class="ri-error-warning-fill"></i> {{ error }}</p>
      <UButton type="submit" variant="primary" size="lg" block :loading="busy">Sign in</UButton>
      <p class="login-hint">Need an account? Ask an existing admin to add you.</p>
    </form>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import BrandLogo from '../../components/layout/BrandLogo.vue';
import UInput from '../../components/ui/UInput.vue';
import UButton from '../../components/ui/UButton.vue';
import { adminApi, adminSetupInfo } from '../../services/adminApi';

const route = useRoute();
const router = useRouter();
const setup = ref<{ needsSetup: boolean; setupRequiresCode: boolean } | null>(null);
const name = ref('');
const email = ref('');
const password = ref('');
const confirmPassword = ref('');
const code = ref('');
const busy = ref(false);
const error = ref<string | null>(null);

onMounted(async () => { setup.value = await adminSetupInfo(); });

function goIn() {
  const target = typeof route.query.redirect === 'string' && route.query.redirect.startsWith('/admin') ? route.query.redirect : '/admin';
  router.replace(target);
}

async function signIn() {
  busy.value = true; error.value = null;
  try {
    await adminApi.post('/login', { email: email.value, password: password.value });
    goIn();
  } catch (err: any) { error.value = err.message; }
  finally { busy.value = false; }
}

async function createFirst() {
  if (password.value !== confirmPassword.value) return;
  busy.value = true; error.value = null;
  try {
    await adminApi.post('/setup', {
      name: name.value.trim(), email: email.value.trim(), password: password.value,
      ...(setup.value?.setupRequiresCode ? { code: code.value.trim() } : {}),
    });
    goIn();
  } catch (err: any) {
    error.value = err.message;
    if (err.status === 409) setup.value = { needsSetup: false, setupRequiresCode: false };
  } finally { busy.value = false; }
}
</script>

<style scoped lang="scss">
.admin-login {
  display: grid;
  place-items: center;
  min-height: 100vh;
  padding: 1.5rem;
  background: linear-gradient(145deg, #1d1633 0%, #2d1f4e 50%, #1a1030 100%);
}

.login-card {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  width: min(26rem, 100%);
  padding: 2.25rem 2rem;
  border-radius: 1.5rem;
  background: #fff;
  box-shadow: 0 32px 64px -24px rgba(0,0,0,0.5);
}

.login-logo {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  margin-bottom: 0.25rem;
}

.login-badge {
  padding: 0.2rem 0.6rem;
  border-radius: 9999px;
  background: #1d1633;
  color: #fff;
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.login-head {
  h1 { margin: 0 0 0.2rem; font-size: 1.55rem; font-weight: 800; color: #1d1633; }
  p  { margin: 0; color: #8b8499; font-size: 0.9rem; }
}

.login-error {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin: 0;
  padding: 0.65rem 0.9rem;
  border-radius: 0.75rem;
  background: #fde7e9;
  color: #c62839;
  font-size: 0.88rem;

  i { font-size: 1rem; flex-shrink: 0; }
}

.login-hint {
  margin: 0;
  text-align: center;
  font-size: 0.8rem;
  color: #8b8499;
}
</style>
