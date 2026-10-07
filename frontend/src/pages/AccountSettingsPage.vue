<template>
  <SectionShell>
    <template #aside>
      <SettingsMenu />
    </template>

    <PageHeader title="Account" back="/settings" subtitle="Sign-in details, password and visibility" />

    <div class="account-page">
      <!-- Sign-in details -->
      <section class="a-card" aria-labelledby="signin-title">
        <h2 id="signin-title" class="a-title"><i class="ri-shield-user-line" aria-hidden="true"></i>Sign-in details</h2>
        <div class="a-row">
          <i class="ri-mail-line a-icon" aria-hidden="true"></i>
          <span class="a-text">
            <small>Email</small>
            <span class="text-truncate">{{ email || 'Not added' }}</span>
            <span v-if="email" class="a-badge" :class="emailVerified ? 'is-ok' : 'is-warn'">{{ emailVerified ? 'Verified' : 'Not verified' }}</span>
          </span>
          <button type="button" class="a-btn" @click="openEmail">{{ email ? 'Change' : 'Add' }}</button>
        </div>
        <div class="a-row">
          <i class="ri-smartphone-line a-icon" aria-hidden="true"></i>
          <span class="a-text">
            <small>Mobile number</small>
            <span>{{ authStore.user?.phone ? displayPhone(authStore.user.phone) : 'Not added' }}</span>
          </span>
          <button type="button" class="a-btn" @click="openPhone">{{ authStore.user?.phone ? 'Change' : 'Add' }}</button>
        </div>
      </section>

      <!-- Password -->
      <section class="a-card" aria-labelledby="password-title">
        <h2 id="password-title" class="a-title"><i class="ri-lock-password-line" aria-hidden="true"></i>{{ hasPassword ? 'Change password' : 'Set a password' }}</h2>
        <p class="a-hint">
          {{ hasPassword ? 'Other devices signed in to your account will be signed out.' : 'Lets you sign in with your email and password as well as your phone.' }}
        </p>
        <form class="d-flex flex-column gap-2" @submit.prevent="savePassword">
          <UInput v-if="hasPassword" v-model="currentPassword" type="password" required placeholder="Current password" icon="ri-lock-line" autocomplete="current-password" />
          <UInput v-model="newPassword" type="password" required :minlength="8" placeholder="New password (8+ characters)" icon="ri-lock-2-line" autocomplete="new-password" />
          <UInput v-model="confirmPassword" type="password" required placeholder="Confirm new password" icon="ri-lock-2-line" autocomplete="new-password" :error="mismatch ? 'Passwords don’t match' : undefined" />
          <p v-if="passwordError" class="small text-danger mb-0" role="alert">{{ passwordError }}</p>
          <UButton type="submit" variant="primary" size="md" :loading="passwordBusy" :disabled="!canSavePassword">
            {{ hasPassword ? 'Change password' : 'Set password' }}
          </UButton>
        </form>
      </section>

      <!-- Pause -->
      <section class="a-card" aria-labelledby="pause-title">
        <label class="a-switch-row">
          <span class="a-text">
            <strong id="pause-title">Pause my profile</strong>
            <span>Hide from Discover while you take a break. Your matches and chats stay, and you can still message them.</span>
          </span>
          <input :checked="authStore.user?.isPaused" type="checkbox" role="switch" class="switch" :disabled="pauseBusy" @change="togglePause(($event.target as HTMLInputElement).checked)" />
        </label>
      </section>
    </div>

    <!-- Email: the new address, then the code sent to it -->
    <UModal :is-open="emailOpen" :title="email ? 'Change email' : 'Add email'" max-width="sm" @close="emailOpen = false">
      <form v-if="!emailSent" id="account-email-form" class="d-flex flex-column gap-3" @submit.prevent="sendEmailCode">
        <p class="small mb-0 u-text-secondary">We'll email a 6-digit code to the new address. {{ hasPassword ? 'You will then sign in with it.' : '' }}</p>
        <UInput v-model="newEmail" type="email" required placeholder="New email address" icon="ri-mail-line" autocomplete="email" />
      </form>
      <form v-else id="account-email-form" class="d-flex flex-column gap-3" @submit.prevent="confirmEmail">
        <p class="small mb-0 u-text-secondary">Enter the code we sent to <strong class="u-text-primary">{{ newEmail }}</strong>.</p>
        <p v-if="emailDevCode" class="small mb-0 u-text-muted"><i class="ri-code-s-slash-line me-1"></i>Development mode, no email is sent. Your code is <strong>{{ emailDevCode }}</strong></p>
        <UInput v-model="emailCode" inputmode="numeric" :maxlength="6" required placeholder="6-digit code" icon="ri-shield-keyhole-line" autocomplete="one-time-code" />
      </form>
      <p v-if="emailError" class="small text-danger mt-3 mb-0" role="alert">{{ emailError }}</p>
      <template #footer>
        <UButton variant="secondary" size="md" @click="emailOpen = false">Cancel</UButton>
        <UButton type="submit" form="account-email-form" variant="primary" size="md" :loading="emailBusy">{{ emailSent ? 'Confirm' : 'Send code' }}</UButton>
      </template>
    </UModal>

    <!-- Phone: the new number, then the SMS code -->
    <UModal :is-open="numberOpen" :title="authStore.user?.phone ? 'Change mobile number' : 'Add mobile number'" max-width="sm" @close="numberOpen = false">
      <form id="account-number" class="d-flex flex-column gap-2" @submit.prevent="sendToNumber">
        <p class="small mb-1 u-text-secondary">We'll text a 6-digit code to the new number. You'll sign in with it from then on.</p>
        <UInput v-model="typedPhone" type="tel" placeholder="Phone number" icon="ri-phone-line" autocomplete="tel" hint="Indian numbers can be typed as is; others with their country code, like +44…" />
      </form>
      <template #footer>
        <UButton variant="secondary" size="md" @click="numberOpen = false">Cancel</UButton>
        <UButton type="submit" form="account-number" variant="primary" size="md" :disabled="!validNumber">Send code</UButton>
      </template>
    </UModal>
    <PhoneCodeDialog :is-open="codeOpen" :phone="pendingPhone" :busy="linking" :error="linkError" @submit="confirmPhone" @close="codeOpen = false" />
  </SectionShell>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import SectionShell from '../components/layout/SectionShell.vue';
import PageHeader from '../components/layout/PageHeader.vue';
import SettingsMenu from '../components/settings/SettingsMenu.vue';
import UInput from '../components/ui/UInput.vue';
import UButton from '../components/ui/UButton.vue';
import UModal from '../components/ui/UModal.vue';
import PhoneCodeDialog from '../components/auth/PhoneCodeDialog.vue';
import { useAuthStore } from '../stores/auth';
import { useToastStore } from '../stores/toast';
import { api } from '../services/api';

const authStore = useAuthStore();
const toast = useToastStore();

const email = computed(() => authStore.user?.email ?? null);
const emailVerified = ref(false);
const hasPassword = computed(() => Boolean(authStore.user?.hasPassword));

async function loadVerification() {
  try {
    emailVerified.value = Boolean((await api.get('/users/me/verification')).data.data?.email?.verified);
  } catch {
    // The badge just stays hidden.
  }
}
onMounted(loadVerification);

function displayPhone(p: string) {
  return p.startsWith('+91') && p.length === 13 ? `+91 ${p.slice(3, 8)} ${p.slice(8)}` : p;
}

// ---- Password ----
const currentPassword = ref('');
const newPassword = ref('');
const confirmPassword = ref('');
const passwordBusy = ref(false);
const passwordError = ref<string | null>(null);
const mismatch = computed(() => confirmPassword.value.length > 0 && confirmPassword.value !== newPassword.value);
const canSavePassword = computed(
  () => newPassword.value.length >= 8 && confirmPassword.value === newPassword.value && (!hasPassword.value || currentPassword.value.length > 0)
);

async function savePassword() {
  if (!canSavePassword.value) return;
  passwordBusy.value = true;
  passwordError.value = null;
  try {
    const hadPassword = hasPassword.value;
    await authStore.changePassword(hadPassword ? currentPassword.value : undefined, newPassword.value);
    currentPassword.value = newPassword.value = confirmPassword.value = '';
    toast.success(hadPassword ? 'Password changed. Other devices were signed out.' : 'Password set.');
  } catch (err: any) {
    passwordError.value = err.message || 'Could not change your password.';
  } finally {
    passwordBusy.value = false;
  }
}

// ---- Pause ----
const pauseBusy = ref(false);
async function togglePause(paused: boolean) {
  pauseBusy.value = true;
  try {
    await authStore.setPaused(paused);
    toast.success(paused ? 'Your profile is paused. You won’t appear in Discover.' : 'Your profile is visible again.');
  } catch (err: any) {
    toast.error(err.message || 'Could not update your profile.');
  } finally {
    pauseBusy.value = false;
  }
}

// ---- Email ----
const emailOpen = ref(false);
const emailSent = ref(false);
const newEmail = ref('');
const emailCode = ref('');
const emailDevCode = ref<string | null>(null);
const emailBusy = ref(false);
const emailError = ref<string | null>(null);

function openEmail() {
  emailSent.value = false;
  newEmail.value = '';
  emailCode.value = '';
  emailDevCode.value = null;
  emailError.value = null;
  emailOpen.value = true;
}

async function sendEmailCode() {
  emailBusy.value = true;
  emailError.value = null;
  try {
    if (newEmail.value.trim().toLowerCase() === email.value?.toLowerCase() && emailVerified.value) {
      throw new Error('That is already your email address.');
    }
    const res = await api.post('/users/me/verification/email/start', { email: newEmail.value.trim() });
    emailDevCode.value = res.data.data?.devCode ?? null;
    emailSent.value = true;
  } catch (err: any) {
    emailError.value = err.message || 'Could not send a code.';
  } finally {
    emailBusy.value = false;
  }
}

async function confirmEmail() {
  emailBusy.value = true;
  emailError.value = null;
  try {
    await api.post('/users/me/verification/email/confirm', { email: newEmail.value.trim(), code: emailCode.value.trim() });
    await authStore.fetchMe();
    emailVerified.value = true;
    emailOpen.value = false;
    toast.success('Email updated.');
  } catch (err: any) {
    emailError.value = err.message || 'That code didn’t work.';
  } finally {
    emailBusy.value = false;
  }
}

// ---- Phone ----
const numberOpen = ref(false);
const codeOpen = ref(false);
const typedPhone = ref('');
const pendingPhone = ref('');
const linking = ref(false);
const linkError = ref<string | null>(null);

function normalise(raw: string): string {
  const digits = raw.replace(/[\s\-()]/g, '');
  return digits.startsWith('+') ? digits : `+91${digits.replace(/^0/, '')}`;
}
const validNumber = computed(() => /^\+[1-9]\d{7,14}$/.test(normalise(typedPhone.value)));

function openPhone() {
  typedPhone.value = '';
  numberOpen.value = true;
}

function sendToNumber() {
  if (!validNumber.value) return;
  if (normalise(typedPhone.value) === authStore.user?.phone) {
    toast.error('That is already your number.');
    return;
  }
  pendingPhone.value = normalise(typedPhone.value);
  linkError.value = null;
  numberOpen.value = false;
  codeOpen.value = true;
}

async function confirmPhone(code: string) {
  linking.value = true;
  linkError.value = null;
  try {
    await authStore.linkPhone(pendingPhone.value, code);
    codeOpen.value = false;
    toast.success('Mobile number updated.');
  } catch (err: any) {
    linkError.value = err.message || 'Could not verify that number.';
  } finally {
    linking.value = false;
  }
}
</script>

<style scoped lang="scss">
.account-page {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  max-width: 40rem;
}

.a-card {
  padding: 1.1rem 1.15rem;
  border-radius: var(--unmute-radius-lg);
  background: var(--unmute-surface);
  border: 1px solid var(--unmute-glass-border);
  box-shadow: var(--unmute-shadow-sm);
}

.a-title {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  margin: 0 0 0.75rem;
  font-size: 1.05rem;
  font-weight: 800;
  color: var(--unmute-text-heading);

  i { font-size: 1.3rem; color: var(--unmute-cta); }
}

.a-hint {
  margin: -0.35rem 0 0.75rem;
  font-size: 0.85rem;
  color: var(--unmute-text-muted);
}

.a-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.6rem 0;

  & + & { border-top: 1px solid var(--unmute-glass-border); }
}

.a-icon {
  flex-shrink: 0;
  font-size: 1.3rem;
  color: var(--unmute-brand-plum);
}

.a-text {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  color: var(--unmute-text-heading);

  small { color: var(--unmute-text-muted); font-size: 0.78rem; }
  > span:not(.a-badge) { font-size: 0.85rem; color: var(--unmute-text-muted); }
  strong { font-size: 1rem; }
}

.a-row .a-text > span:not(.a-badge) {
  font-size: 0.95rem;
  color: var(--unmute-text-heading);
}

.a-badge {
  align-self: flex-start;
  margin-top: 0.2rem;
  padding: 0.1rem 0.55rem;
  border-radius: 9999px;
  font-size: 0.72rem;
  font-weight: 700;

  &.is-ok { background: var(--unmute-success-surface); color: var(--unmute-success-text); }
  &.is-warn { background: var(--unmute-warn-surface); color: var(--unmute-warn-text); }
}

.a-btn {
  flex-shrink: 0;
  padding: 0.4rem 1rem;
  border: 1px solid var(--unmute-glass-border);
  border-radius: var(--unmute-radius-pill);
  background: var(--unmute-primary-surface);
  color: var(--unmute-cta);
  font-size: 0.88rem;
  font-weight: 700;
}

.a-switch-row {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin: 0;
  cursor: pointer;
}

.switch {
  flex-shrink: 0;
  appearance: none;
  position: relative;
  width: 3rem;
  height: 1.75rem;
  border-radius: 9999px;
  background: #d9d3e6;
  transition: background 0.15s;
  cursor: pointer;

  &::after {
    content: '';
    position: absolute;
    top: 0.2rem;
    left: 0.2rem;
    width: 1.35rem;
    height: 1.35rem;
    border-radius: 50%;
    background: var(--unmute-card);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
    transition: transform 0.15s;
  }

  &:checked { background: var(--unmute-cta); }
  &:checked::after { transform: translateX(1.25rem); }
  &:disabled { opacity: 0.6; }
}
</style>
