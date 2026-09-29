<template>
  <div class="verify-page">
    <PageHeader
      title="Verify Your Identity"
      subtitle="Build trust and get better matches with a verified profile"
      :back="setup.step.value ? setup.previous.value ?? undefined : '/profile'"
    >
      <template v-if="setup.step.value" #actions><router-link :to="setup.next.value" class="pill-skip">Skip</router-link></template>
    </PageHeader>
    <SetupProgress v-if="setup.step.value" :step="setup.step.value" />

    <div class="banner">
      <span class="banner-icon" aria-hidden="true"><i class="ri-shield-check-fill"></i></span>
      <div>
        <strong>Verified profiles get more likes</strong>
        <p class="mb-0">Show that you're real and serious about meaningful connections.</p>
      </div>
    </div>

    <ul class="steps">
      <li>
        <button type="button" class="step" @click="startPhone">
          <span class="step-icon" aria-hidden="true"><i class="ri-smartphone-line"></i></span>
          <span class="step-text">
            <strong>Verify Mobile Number</strong>
            <span>{{ phone ? displayPhone(phone) : 'Confirm your phone number' }}</span>
          </span>
          <span v-if="phone" class="badge-ok"><i class="ri-checkbox-circle-fill" aria-hidden="true"></i>Verified</span>
          <span v-else class="badge-todo">Verify</span>
          <i class="ri-arrow-right-s-line chev" aria-hidden="true"></i>
        </button>
      </li>
      <li>
        <button type="button" class="step" @click="comingSoon('Email verification')">
          <span class="step-icon" aria-hidden="true"><i class="ri-mail-line"></i></span>
          <span class="step-text">
            <strong>Verify Email Address</strong>
            <span>{{ authStore.user?.email ? 'Confirm your email for account security' : 'Add an email for account security' }}</span>
          </span>
          <span class="badge-todo">Verify</span>
          <i class="ri-arrow-right-s-line chev" aria-hidden="true"></i>
        </button>
      </li>
      <li>
        <button type="button" class="step" @click="comingSoon('Photo verification')">
          <span class="step-icon" aria-hidden="true"><i class="ri-user-follow-line"></i></span>
          <span class="step-text">
            <strong>Photo Verification</strong>
            <span>Take a live selfie to confirm you're real</span>
          </span>
          <span v-if="authStore.profile?.isVerified" class="badge-ok"><i class="ri-checkbox-circle-fill" aria-hidden="true"></i>Verified</span>
          <i class="ri-arrow-right-s-line chev" aria-hidden="true"></i>
        </button>
      </li>
      <li>
        <button type="button" class="step" @click="comingSoon('ID verification')">
          <span class="step-icon" aria-hidden="true"><i class="ri-profile-line"></i></span>
          <span class="step-text">
            <strong>Government ID (Optional)</strong>
            <span>Add ID for extra trust and visibility</span>
          </span>
          <i class="ri-arrow-right-s-line chev" aria-hidden="true"></i>
        </button>
      </li>
    </ul>

    <!-- A selfie being checked, with a camera and a lock orbiting it -->
    <section class="art-card" aria-labelledby="quick-title">
      <div class="art" aria-hidden="true">
        <span class="orbit"></span>
        <span class="selfie">
          <img v-if="authStore.profile?.avatarUrl" :src="mediaUrl(authStore.profile.avatarUrl)" alt="" />
          <i v-else class="ri-user-smile-line"></i>
          <span class="frame"></span>
          <span class="scan"></span>
        </span>
        <span class="shield"><i class="ri-shield-check-fill"></i></span>
        <span class="bubble bubble-cam"><i class="ri-camera-line"></i></span>
        <span class="bubble bubble-lock"><i class="ri-lock-fill"></i></span>
      </div>
      <h2 id="quick-title">Quick &amp; Secure Verification</h2>
      <p class="mb-0">It only takes a minute and keeps Unmute safe for everyone.</p>
    </section>

    <UButton variant="primary" size="lg" block class="continue" @click="$router.push(setup.step.value ? setup.next.value : '/profile')">
      {{ setup.step.value ? 'Continue' : 'Done' }} <i class="ri-arrow-right-line ms-2" aria-hidden="true"></i>
    </UButton>

    <!-- Number first, then the SMS code -->
    <UModal :is-open="numberOpen" title="Verify Mobile Number" max-width="sm" @close="numberOpen = false">
      <form id="verify-number" class="d-flex flex-column gap-2" @submit.prevent="sendToNumber">
        <p class="small mb-1 u-text-secondary">We'll text a 6-digit code to confirm it's yours.</p>
        <UInput v-model="typed" type="tel" placeholder="Phone number" icon="ri-phone-line" autocomplete="tel" hint="Indian numbers can be typed as is; others with their country code, like +44…" />
      </form>
      <template #footer>
        <UButton variant="secondary" size="md" @click="numberOpen = false">Cancel</UButton>
        <UButton type="submit" form="verify-number" variant="primary" size="md" :disabled="!validNumber">Send code</UButton>
      </template>
    </UModal>
    <PhoneCodeDialog :is-open="codeOpen" :phone="pendingPhone" :busy="linking" :error="linkError" @submit="confirm" @close="codeOpen = false" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import PageHeader from '../components/layout/PageHeader.vue';
import SetupProgress from '../components/layout/SetupProgress.vue';
import UButton from '../components/ui/UButton.vue';
import UInput from '../components/ui/UInput.vue';
import UModal from '../components/ui/UModal.vue';
import PhoneCodeDialog from '../components/auth/PhoneCodeDialog.vue';
import { useAuthStore } from '../stores/auth';
import { useToastStore } from '../stores/toast';
import { useSetupStep } from '../composables/useSetupStep';
import { mediaUrl } from '../services/media';
import { comingSoon } from '../utils/profileFormat';

const authStore = useAuthStore();
const setup = useSetupStep();

const phone = computed(() => authStore.user?.phone ?? null);
const numberOpen = ref(false);
const codeOpen = ref(false);
const typed = ref('');
const pendingPhone = ref('');
const linking = ref(false);
const linkError = ref<string | null>(null);

/** Indian numbers can be typed bare; anything starting with + is sent as given. */
function normalise(raw: string): string {
  const digits = raw.replace(/[\s\-()]/g, '');
  return digits.startsWith('+') ? digits : `+91${digits.replace(/^0/, '')}`;
}
const validNumber = computed(() => /^\+[1-9]\d{7,14}$/.test(normalise(typed.value)));

function displayPhone(p: string) {
  return p.startsWith('+91') && p.length === 13 ? `+91 ${p.slice(3, 8)} ${p.slice(8)}` : p;
}

function startPhone() {
  typed.value = '';
  numberOpen.value = true;
}

function sendToNumber() {
  if (!validNumber.value) return;
  pendingPhone.value = normalise(typed.value);
  linkError.value = null;
  numberOpen.value = false;
  codeOpen.value = true;
}

async function confirm(code: string) {
  linking.value = true;
  linkError.value = null;
  try {
    await authStore.linkPhone(pendingPhone.value, code);
    codeOpen.value = false;
    useToastStore().success('Mobile number verified.');
  } catch (err: any) {
    linkError.value = err.message || 'Could not verify that number.';
  } finally {
    linking.value = false;
  }
}
</script>

<style scoped lang="scss">
$ink: var(--unmute-text-heading);

.verify-page {
  width: 100%;
  max-width: 34rem;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
  padding-bottom: 1rem;
}

.banner {
  display: flex;
  align-items: center;
  gap: 0.9rem;
  padding: 0.9rem 1rem;
  border-radius: 1.3rem;
  background: #fbe9f5;
  color: var(--unmute-text-secondary);
  font-size: 0.88rem;

  strong {
    display: block;
    margin-bottom: 0.15rem;
    color: $ink;
    font-size: 0.98rem;
  }
}

.banner-icon {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 3.4rem;
  height: 3.4rem;
  border-radius: 1rem;
  background: #fff;
  color: var(--unmute-cta);
  font-size: 2rem;
}

.steps {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.step {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  width: 100%;
  padding: 0.75rem 0.6rem 0.75rem 0.75rem;
  border: 0;
  border-radius: 1.3rem;
  background: var(--unmute-surface);
  box-shadow: 0 8px 20px -16px rgba(117, 48, 170, 0.5);
  text-align: left;
}

.step-icon {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 2.7rem;
  height: 2.7rem;
  border-radius: 50%;
  background: #fbe9f5;
  color: var(--unmute-cta);
  font-size: 1.3rem;
}

.step-text {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  color: var(--unmute-text-secondary);
  font-size: 0.76rem;

  strong {
    color: $ink;
    font-size: 0.9rem;
    white-space: nowrap;
  }
}

.badge-ok,
.badge-todo {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  gap: 0.3rem;
  padding: 0.3rem 0.65rem;
  border-radius: var(--unmute-radius-pill);
  font-size: 0.76rem;
  font-weight: 600;
}

.badge-ok {
  background: #e3f8ea;
  color: #137a3a;
}

.badge-todo {
  background: #fbe4f2;
  color: var(--unmute-cta);
}

.chev {
  flex-shrink: 0;
  color: $ink;
  font-size: 1.3rem;
}

.art-card {
  padding: 1.2rem 1rem 1.3rem;
  border-radius: 1.5rem;
  background: rgba(251, 233, 245, 0.7);
  text-align: center;
  color: var(--unmute-text-secondary);
  font-size: 0.88rem;

  h2 {
    margin: 0.8rem 0 0.25rem;
    font-size: 1.15rem;
    font-weight: 800;
    color: $ink;
  }
}

.art {
  position: relative;
  display: grid;
  place-items: center;
  height: 12rem;
}

.orbit {
  position: absolute;
  width: 13rem;
  height: 13rem;
  border: 1.5px dashed rgba(242, 24, 114, 0.35);
  border-radius: 50%;
}

.selfie {
  position: relative;
  display: grid;
  place-items: center;
  width: 7.5rem;
  height: 10rem;
  overflow: hidden;
  border-radius: 1.3rem;
  background: linear-gradient(160deg, #f3e8fb, #e2d3f3);
  color: #8a6fb8;
  font-size: 3.5rem;
  box-shadow: 0 14px 30px -16px rgba(74, 0, 91, 0.5);

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
}

// Scan-frame corners and a glowing line over the face.
.frame {
  position: absolute;
  inset: 22% 18%;
  background:
    linear-gradient(#fff, #fff) left top / 14px 2px no-repeat, linear-gradient(#fff, #fff) left top / 2px 14px no-repeat,
    linear-gradient(#fff, #fff) right top / 14px 2px no-repeat, linear-gradient(#fff, #fff) right top / 2px 14px no-repeat,
    linear-gradient(#fff, #fff) left bottom / 14px 2px no-repeat, linear-gradient(#fff, #fff) left bottom / 2px 14px no-repeat,
    linear-gradient(#fff, #fff) right bottom / 14px 2px no-repeat, linear-gradient(#fff, #fff) right bottom / 2px 14px no-repeat;
}

.scan {
  position: absolute;
  left: 12%;
  right: 12%;
  top: 45%;
  height: 2px;
  background: linear-gradient(90deg, transparent, #ffd36e, transparent);
  box-shadow: 0 0 10px 2px rgba(255, 196, 80, 0.7);
  animation: scan 2.4s ease-in-out infinite;
}

@keyframes scan {
  0%, 100% { top: 30%; }
  50% { top: 68%; }
}

.shield {
  position: absolute;
  top: 0.4rem;
  left: calc(50% + 2.6rem);
  color: var(--unmute-cta);
  font-size: 2.4rem;
  filter: drop-shadow(0 4px 8px rgba(242, 24, 114, 0.35));
}

.bubble {
  position: absolute;
  display: grid;
  place-items: center;
  width: 2.8rem;
  height: 2.8rem;
  border-radius: 50%;
  background: #fff;
  color: var(--unmute-cta);
  font-size: 1.3rem;
  box-shadow: 0 6px 14px -8px rgba(117, 48, 170, 0.5);
}

.bubble-cam {
  top: 3.5rem;
  left: calc(50% - 8rem);
}

.bubble-lock {
  bottom: 2.5rem;
  right: calc(50% - 8rem);
}

.continue {
  margin-top: 0.3rem;
}

@media (prefers-reduced-motion: reduce) {
  .scan {
    animation: none;
  }
}
</style>
