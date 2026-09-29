<template>
  <AuthStage title="Create your account" subtitle="Let's get to know you better" back="/welcome" logo-size="4rem">
    <template #header><SetupProgress :step="0" compact class="register-steps" /></template>
    <div class="d-flex flex-column gap-4">

      <form class="d-flex flex-column gap-3" @submit.prevent="handleRegister">
        <UInput v-model="displayName" type="text" required placeholder="Full name" icon="ri-user-line" autocomplete="name" />
        <UInput v-model="email" type="email" required placeholder="Email address" icon="ri-mail-line" autocomplete="email" />

        <!-- Optional; confirmed by SMS before it's saved, then usable for phone sign-in -->
        <div class="phone-field">
          <i class="ri-phone-line phone-icon" aria-hidden="true"></i>
          <span class="country">
            <span class="country-flag" aria-hidden="true">{{ country.flag }}</span>
            <select v-model="dialCode" class="country-select" aria-label="Country code">
              <option v-for="c in COUNTRIES" :key="c.code" :value="c.code">{{ c.flag }} {{ c.name }} ({{ c.code }})</option>
            </select>
            <span class="country-code" aria-hidden="true">{{ country.code }}</span>
            <i class="ri-arrow-down-s-line" aria-hidden="true"></i>
          </span>
          <input
            v-model="phone"
            type="tel"
            inputmode="tel"
            autocomplete="tel-national"
            placeholder="Phone number"
            aria-label="Phone number (optional)"
            maxlength="15"
          />
        </div>

        <UInput
          v-model="dateOfBirth"
          type="date"
          required
          :max="maxDateFor18"
          icon="ri-cake-2-line"
          placeholder="Date of birth"
          hint="Date of birth: only your age is shown to others. You must be 18+."
        />
        <UInput
          v-model="password"
          type="password"
          required
          :minlength="8"
          placeholder="Password"
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
          <span>I agree to the <a href="#" class="terms-link" @click.prevent="comingSoon('Terms of Service')">Terms of Service</a> and <a href="#" class="terms-link" @click.prevent="comingSoon('Privacy Policy')">Privacy Policy</a></span>
        </label>
        <UButton type="submit" variant="primary" size="lg" block :loading="loading" class="mt-1">
          Create account <i class="ri-arrow-right-line ms-2" aria-hidden="true"></i>
        </UButton>
      </form>

      <p class="text-center mb-0 u-text-secondary">
        Already have an account?
        <router-link to="/login" class="auth-link ms-1">Sign in</router-link>
      </p>
    </div>

    <PhoneCodeDialog
      :is-open="codeOpen"
      :phone="fullPhone"
      :busy="loading"
      :error="codeError"
      @submit="finishWithCode"
      @close="codeOpen = false"
    />
  </AuthStage>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import UInput from '../components/ui/UInput.vue';
import AuthStage from '../components/auth/AuthStage.vue';
import UButton from '../components/ui/UButton.vue';
import PhoneCodeDialog from '../components/auth/PhoneCodeDialog.vue';
import { useAuthStore } from '../stores/auth';
import { useToastStore } from '../stores/toast';
import SetupProgress from '../components/layout/SetupProgress.vue';
import { ONBOARDING_START } from '../onboarding';
import { comingSoon } from '../utils/profileFormat';

const COUNTRIES = [
  { code: '+91', flag: '🇮🇳', name: 'India' },
  { code: '+1', flag: '🇺🇸', name: 'United States / Canada' },
  { code: '+44', flag: '🇬🇧', name: 'United Kingdom' },
  { code: '+971', flag: '🇦🇪', name: 'UAE' },
  { code: '+61', flag: '🇦🇺', name: 'Australia' },
  { code: '+65', flag: '🇸🇬', name: 'Singapore' },
];

const router = useRouter();
const authStore = useAuthStore();

const displayName = ref('');
const email = ref('');
const dialCode = ref('+91');
const phone = ref('');
const dateOfBirth = ref('');
const password = ref('');
const confirmPassword = ref('');
const agreed = ref(false);
const loading = ref(false);
const codeOpen = ref(false);
const codeError = ref<string | null>(null);

const country = computed(() => COUNTRIES.find((c) => c.code === dialCode.value) ?? COUNTRIES[0]);
/** The typed number with its country code, or '' when the field is empty. */
const fullPhone = computed(() => {
  const digits = phone.value.replace(/\D/g, '').replace(/^0+/, '');
  return digits ? `${dialCode.value}${digits}` : '';
});

const maxDateFor18 = computed(() => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 18);
  return d.toISOString().split('T')[0];
});

// Only flagged once the second field has something in it, so it doesn't nag while typing the first.
const passwordMismatch = computed(() => Boolean(confirmPassword.value) && confirmPassword.value !== password.value);

function details(code?: string) {
  return {
    displayName: displayName.value,
    email: email.value,
    dateOfBirth: dateOfBirth.value,
    password: password.value,
    ...(fullPhone.value ? { phone: fullPhone.value } : {}),
    ...(code ? { code } : {}),
  };
}

function registrationError(err: any): string {
  // 409: the email or number already has an account, so point them at sign-in.
  if (err.status === 409) {
    return /phone/i.test(err.message) ? err.message : 'An account with this email already exists. Sign in instead.';
  }
  return err.message || 'Registration failed';
}

async function handleRegister() {
  if (passwordMismatch.value) return;
  loading.value = true;
  try {
    const outcome = await authStore.register(details());
    if (outcome.requiresPhoneCode) {
      codeError.value = null;
      codeOpen.value = true;
      return;
    }
    router.push(ONBOARDING_START);
  } catch (err: any) {
    useToastStore().error(registrationError(err));
  } finally {
    loading.value = false;
  }
}

async function finishWithCode(code: string) {
  loading.value = true;
  codeError.value = null;
  try {
    await authStore.register(details(code));
    codeOpen.value = false;
    router.push(ONBOARDING_START);
  } catch (err: any) {
    codeError.value = registrationError(err);
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped lang="scss">
.register-steps {
  margin: 0.5rem auto 1.5rem;
}

.phone-field {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  min-height: 3.3rem;
  padding: 0 1rem;
  border: 1px solid rgba(74, 0, 91, 0.12);
  border-radius: 1.1rem;
  background: var(--unmute-surface);

  &:focus-within {
    border-color: var(--unmute-primary);
    box-shadow: 0 0 0 4px var(--unmute-primary-surface);
  }

  input {
    flex: 1;
    min-width: 0;
    border: 0;
    outline: none;
    background: transparent;
    color: var(--unmute-text-primary);
    font-size: 0.98rem;

    &::placeholder {
      color: var(--unmute-text-dim);
    }
  }
}

.phone-icon {
  font-size: 1.1rem;
  color: var(--unmute-brand-plum);
}

// A native select laid invisibly over the flag and code, so the phone's own picker opens.
.country {
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.35rem;
  padding-right: 0.75rem;
  border-right: 1px solid rgba(74, 0, 91, 0.12);
  color: var(--unmute-text-heading);
  font-weight: 600;
  white-space: nowrap;

  &:focus-within {
    color: var(--unmute-accent-text);
  }
}

.country-flag {
  font-size: 1.25rem;
  line-height: 1;
}

.country-select {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}

.terms-link {
  color: var(--unmute-cta);
  font-weight: 600;
  text-underline-offset: 3px;
}

.terms-check {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  font-size: 0.9rem;
  color: var(--unmute-text-secondary);
  cursor: pointer;

  input {
    flex-shrink: 0;
    width: 1.4rem;
    height: 1.4rem;
    accent-color: var(--unmute-cta);
  }
}

</style>
