<template>
  <div class="admin-login">
    <!-- Step 1: Create First Admin if DB is empty -->
    <form v-if="setup?.needsSetup" class="login-card" @submit.prevent="createFirst">
      <div class="login-logo">
        <BrandLogo size="2.2rem" />
        <span class="login-badge">Admin</span>
      </div>
      <div class="login-head">
        <h1>Create first admin</h1>
        <p>No admin account exists yet. This account will be provisioned as Super Administrator.</p>
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
        placeholder="Setup code"
        icon="ri-key-2-line"
        hint="Enter your configured setup code (or check the server log on startup)."
      />
      <p v-if="error" class="login-error" role="alert"><i class="ri-error-warning-fill"></i> {{ error }}</p>
      <UButton type="submit" variant="primary" size="lg" block :loading="busy">Create admin &amp; sign in</UButton>
    </form>

    <!-- Step 2: 2FA / TOTP Challenge -->
    <form v-else-if="requiresMfa" class="login-card" @submit.prevent="verifyMfa">
      <div class="login-logo">
        <BrandLogo size="2.2rem" />
        <span class="login-badge">Security</span>
      </div>
      <div class="login-head">
        <h1>Two-Factor Authentication</h1>
        <p>Enter the 6-digit verification code from your authenticator app for <strong>{{ email }}</strong>.</p>
      </div>
      <UInput
        v-model="totpCode"
        required
        autofocus
        :maxlength="6"
        placeholder="000000"
        icon="ri-shield-keyhole-line"
        hint="Google Authenticator, Authy, or compatible app"
      />
      <p v-if="error" class="login-error" role="alert"><i class="ri-error-warning-fill"></i> {{ error }}</p>
      <UButton type="submit" variant="primary" size="lg" block :loading="busy">Verify &amp; Sign In</UButton>
      <button type="button" class="back-link-btn" @click="requiresMfa = false; totpCode = '';">
        <i class="ri-arrow-left-line"></i> Back to sign in
      </button>
    </form>

    <!-- Step 3: Regular Admin Login -->
    <form v-else-if="setup" class="login-card" @submit.prevent="signIn">
      <div class="login-logo">
        <BrandLogo size="2.2rem" />
        <span class="login-badge">Admin</span>
      </div>
      <div class="login-head">
        <h1>Welcome back</h1>
        <p>Sign in to the UnMute management console.</p>
      </div>
      <UInput v-model="email" type="email" required placeholder="Admin email" icon="ri-mail-line" autocomplete="username" />
      <UInput v-model="password" type="password" required placeholder="Password" icon="ri-lock-line" autocomplete="current-password" />
      <p v-if="error" class="login-error" role="alert"><i class="ri-error-warning-fill"></i> {{ error }}</p>
      <UButton type="submit" variant="primary" size="lg" block :loading="busy">Sign in</UButton>
      <p class="login-hint">Need an account? Contact a Super Administrator to be provisioned.</p>
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
const totpCode = ref('');
const requiresMfa = ref(false);
const busy = ref(false);
const error = ref<string | null>(null);

onMounted(async () => { setup.value = await adminSetupInfo(); });

function goIn() {
  const target = typeof route.query.redirect === 'string' && route.query.redirect.startsWith('/admin') ? route.query.redirect : '/admin';
  router.replace(target);
}

async function signIn() {
  busy.value = true;
  error.value = null;
  try {
    const res = await adminApi.post('/login', { email: email.value.trim(), password: password.value });
    if (res.data?.data?.requiresMfa) {
      requiresMfa.value = true;
      totpCode.value = '';
    } else {
      goIn();
    }
  } catch (err: any) {
    error.value = err.message;
  } finally {
    busy.value = false;
  }
}

async function verifyMfa() {
  if (totpCode.value.trim().length !== 6) {
    error.value = 'Please enter a 6-digit code.';
    return;
  }
  busy.value = true;
  error.value = null;
  try {
    await adminApi.post('/login', {
      email: email.value.trim(),
      password: password.value,
      code: totpCode.value.trim(),
    });
    goIn();
  } catch (err: any) {
    error.value = err.message;
  } finally {
    busy.value = false;
  }
}

async function createFirst() {
  if (password.value !== confirmPassword.value) return;
  busy.value = true;
  error.value = null;
  try {
    await adminApi.post('/setup', {
      name: name.value.trim(),
      email: email.value.trim(),
      password: password.value,
      ...(setup.value?.setupRequiresCode ? { code: code.value.trim() } : {}),
    });
    goIn();
  } catch (err: any) {
    error.value = err.message;
    if (err.status === 409) setup.value = { needsSetup: false, setupRequiresCode: false };
  } finally {
    busy.value = false;
  }
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
  gap: 1.25rem;
  width: 100%;
  max-width: 25rem;
  padding: 2.25rem;
  border-radius: 1.25rem;
  background: #fff;
  box-shadow: 0 1.5rem 3.5rem rgba(0, 0, 0, 0.35);
}

.login-logo {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.login-badge {
  padding: 0.25rem 0.65rem;
  border-radius: 9999px;
  background: #1d1633;
  color: #fff;
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.login-head {
  h1 {
    margin: 0;
    font-size: 1.5rem;
    font-weight: 800;
    color: #1d1633;
  }

  p {
    margin: 0.3rem 0 0;
    font-size: 0.88rem;
    color: #6c647d;
    line-height: 1.4;
  }
}

.login-error {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin: 0;
  padding: 0.65rem 0.85rem;
  border-radius: 0.6rem;
  background: #fde7e9;
  color: #c62839;
  font-size: 0.84rem;
  font-weight: 500;
}

.login-hint {
  margin: 0;
  text-align: center;
  font-size: 0.82rem;
  color: #8b8499;
}

.back-link-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
  border: 0;
  background: transparent;
  color: #7c3aed;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  padding: 0.4rem;
  transition: opacity 0.15s;

  &:hover {
    opacity: 0.8;
  }
}
</style>
