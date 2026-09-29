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
        <button type="button" class="step" :disabled="info?.email.verified" @click="openEmail">
          <span class="step-icon" aria-hidden="true"><i class="ri-mail-line"></i></span>
          <span class="step-text">
            <strong>Verify Email Address</strong>
            <span class="text-truncate">{{ info?.email.address || 'Add an email for account security' }}</span>
          </span>
          <span v-if="info?.email.verified" class="badge-ok"><i class="ri-checkbox-circle-fill" aria-hidden="true"></i>Verified</span>
          <span v-else class="badge-todo">Verify</span>
          <i class="ri-arrow-right-s-line chev" aria-hidden="true"></i>
        </button>
      </li>
      <li>
        <button type="button" class="step" disabled @click="openSelfie">
          <span class="step-icon" aria-hidden="true"><i class="ri-user-follow-line"></i></span>
          <span class="step-text">
            <strong>Photo Verification</strong>
            <span>{{ info?.selfie.status === 'rejected' ? info.selfie.reason : 'Take a live selfie to confirm you’re real' }}</span>
          </span>
          <VerifyBadge v-if="info?.selfie.status === 'verified' || info?.selfie.status === 'pending'" :status="info.selfie.status" /><span v-else class="badge-soon">Coming soon</span>
          <i class="ri-arrow-right-s-line chev" aria-hidden="true"></i>
        </button>
      </li>
      <li>
        <button type="button" class="step" disabled @click="openId">
          <span class="step-icon" aria-hidden="true"><i class="ri-profile-line"></i></span>
          <span class="step-text">
            <strong>Government ID (Optional)</strong>
            <span>{{ info?.id.status === 'rejected' ? info.id.reason : 'Add ID for extra trust and visibility' }}</span>
          </span>
          <VerifyBadge v-if="info?.id.status === 'verified' || info?.id.status === 'pending'" :status="info.id.status" /><span v-else class="badge-soon">Coming soon</span>
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

    <!-- Email: address, then the code from the email -->
    <UModal :is-open="emailOpen" title="Verify Email Address" max-width="sm" @close="emailOpen = false">
      <form v-if="!emailSent" id="email-form" class="d-flex flex-column gap-3" @submit.prevent="sendEmailCode">
        <p class="small mb-0 u-text-secondary">We'll email you a 6-digit code to confirm the address is yours.</p>
        <UInput v-model="emailAddress" type="email" required placeholder="Email address" icon="ri-mail-line" autocomplete="email" />
      </form>
      <form v-else id="email-form" class="d-flex flex-column gap-3" @submit.prevent="confirmEmail">
        <p class="small mb-0 u-text-secondary">Enter the code we sent to <strong class="u-text-primary">{{ emailAddress }}</strong>. Check your spam folder if you don't see it.</p>
        <p v-if="emailDevCode" class="small mb-0 u-text-muted"><i class="ri-code-s-slash-line me-1"></i>Development mode, no email is sent. Your code is <strong>{{ emailDevCode }}</strong></p>
        <UInput v-model="emailCode" inputmode="numeric" :maxlength="6" required placeholder="6-digit code" icon="ri-shield-keyhole-line" autocomplete="one-time-code" />
      </form>
      <p v-if="emailError" class="small text-danger mt-3 mb-0" role="alert">{{ emailError }}</p>
      <template #footer>
        <UButton variant="secondary" size="md" @click="emailOpen = false">Cancel</UButton>
        <UButton type="submit" form="email-form" variant="primary" size="md" :loading="emailBusy">{{ emailSent ? 'Verify' : 'Send code' }}</UButton>
      </template>
    </UModal>

    <!-- Live selfie copying a pose, checked by our team against your profile photos -->
    <UModal :is-open="selfieOpen" title="Photo Verification" max-width="sm" @close="selfieOpen = false">
      <p class="small u-text-secondary">Copy the pose below in a live selfie. Our team compares it with your profile photos, usually within a day; you'll then get the verified badge.</p>
      <SelfieCapture v-if="selfieGesture" :gesture="selfieGesture" :busy="selfieBusy" @submit="submitSelfie" />
      <p v-if="selfieError" class="small text-danger mt-3 mb-0" role="alert">{{ selfieError }}</p>
    </UModal>

    <!-- ID photo: private, seen only by our team, deleted once checked -->
    <UModal :is-open="idOpen" title="Government ID" max-width="sm" @close="closeId">
      <div class="d-flex flex-column gap-3">
        <p class="small mb-0 u-text-secondary">
          Upload a clear photo of the front of your Aadhaar, PAN, driving licence, voter ID or passport. The name and face must be readable.
        </p>
        <ul class="id-privacy">
          <li><i class="ri-lock-fill" aria-hidden="true"></i>Stored privately, never shown on your profile</li>
          <li><i class="ri-eye-off-fill" aria-hidden="true"></i>Seen only by our verification team</li>
          <li><i class="ri-delete-bin-6-fill" aria-hidden="true"></i>Deleted as soon as it's checked</li>
        </ul>
        <img v-if="idPreview" :src="idPreview" alt="Your ID photo" class="id-preview" />
        <label class="id-pick">
          <i class="ri-camera-line" aria-hidden="true"></i> {{ idPreview ? 'Choose a different photo' : 'Take or choose a photo' }}
          <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" class="d-none" @change="pickId" />
        </label>
        <p v-if="idError" class="small text-danger mb-0" role="alert">{{ idError }}</p>
      </div>
      <template #footer>
        <UButton variant="secondary" size="md" @click="closeId">Cancel</UButton>
        <UButton variant="primary" size="md" :loading="idBusy" :disabled="!idFile" @click="submitId">Submit for review</UButton>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
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
import { api } from '../services/api';
import SelfieCapture from '../components/verification/SelfieCapture.vue';
import VerifyBadge from '../components/verification/VerifyBadge.vue';

const authStore = useAuthStore();
const setup = useSetupStep();

const phone = computed(() => authStore.user?.phone ?? null);
const numberOpen = ref(false);
const codeOpen = ref(false);
const typed = ref('');
const pendingPhone = ref('');
const linking = ref(false);
const linkError = ref<string | null>(null);

interface CheckState { status: 'none' | 'pending' | 'verified' | 'rejected' | 'approved'; reason: string | null }
const info = ref<{ email: { address: string | null; verified: boolean }; selfie: CheckState; id: CheckState } | null>(null);

async function loadInfo() {
  try {
    info.value = (await api.get('/users/me/verification')).data.data;
  } catch {
    // The rows still work; badges fill in on the next visit.
  }
}
onMounted(loadInfo);

// ---- Email ----
const emailOpen = ref(false);
const emailAddress = ref('');
const emailSent = ref(false);
const emailCode = ref('');
const emailDevCode = ref<string | null>(null);
const emailBusy = ref(false);
const emailError = ref<string | null>(null);

function openEmail() {
  if (info.value?.email.verified) return;
  emailAddress.value = info.value?.email.address || authStore.user?.email || '';
  emailSent.value = false;
  emailCode.value = '';
  emailError.value = null;
  emailOpen.value = true;
}

async function sendEmailCode() {
  emailBusy.value = true;
  emailError.value = null;
  try {
    const res = await api.post('/users/me/verification/email/start', { email: emailAddress.value.trim() });
    emailDevCode.value = res.data.data?.devCode ?? null;
    emailSent.value = true;
  } catch (err: any) {
    emailError.value = [404, 501, 502, 503].includes(err.status) ? 'Email verification is unavailable right now. Please try again later.' : err.message;
  } finally {
    emailBusy.value = false;
  }
}

async function confirmEmail() {
  emailBusy.value = true;
  emailError.value = null;
  try {
    info.value = (await api.post('/users/me/verification/email/confirm', { email: emailAddress.value.trim(), code: emailCode.value.trim() })).data.data;
    await authStore.fetchMe();
    emailOpen.value = false;
    useToastStore().success('Email verified.');
  } catch (err: any) {
    emailError.value = err.message;
  } finally {
    emailBusy.value = false;
  }
}

// ---- Selfie ----
const selfieOpen = ref(false);
const selfieGesture = ref<string | null>(null);
let selfieRequest = '';
const selfieBusy = ref(false);
const selfieError = ref<string | null>(null);

async function openSelfie() {
  if (info.value?.selfie.status === 'pending' && !confirm('Your selfie is already being reviewed. Take a new one instead?')) return;
  selfieError.value = null;
  selfieGesture.value = null;
  selfieOpen.value = true;
  try {
    const res = await api.post('/users/me/verification/selfie/start');
    selfieRequest = res.data.data.requestId;
    selfieGesture.value = res.data.data.gesture;
  } catch (err: any) {
    selfieError.value = err.message;
  }
}

async function submitSelfie(photo: Blob) {
  selfieBusy.value = true;
  selfieError.value = null;
  try {
    info.value = (await api.post(`/users/me/verification/selfie/${selfieRequest}`, photo, { headers: { 'Content-Type': photo.type || 'image/jpeg' } })).data.data;
    selfieOpen.value = false;
    useToastStore().success('Selfie sent. We’ll review it soon.');
  } catch (err: any) {
    selfieError.value = err.message;
  } finally {
    selfieBusy.value = false;
  }
}

// ---- Government ID ----
const idOpen = ref(false);
const idFile = ref<File | null>(null);
const idPreview = ref<string | null>(null);
const idBusy = ref(false);
const idError = ref<string | null>(null);

function openId() {
  idError.value = null;
  idOpen.value = true;
}

function closeId() {
  idOpen.value = false;
  if (idPreview.value) URL.revokeObjectURL(idPreview.value);
  idPreview.value = null;
  idFile.value = null;
}

function pickId(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    idError.value = 'Use a JPG, PNG or WebP photo.';
    return;
  }
  if (file.size > 8 * 1024 * 1024) {
    idError.value = 'The photo must be 8 MB or smaller.';
    return;
  }
  idError.value = null;
  idFile.value = file;
  if (idPreview.value) URL.revokeObjectURL(idPreview.value);
  idPreview.value = URL.createObjectURL(file);
}

async function submitId() {
  if (!idFile.value) return;
  idBusy.value = true;
  idError.value = null;
  try {
    info.value = (await api.post('/users/me/verification/id', idFile.value, { headers: { 'Content-Type': idFile.value.type } })).data.data;
    closeId();
    useToastStore().success('ID sent. We’ll review it soon.');
  } catch (err: any) {
    idError.value = err.message;
  } finally {
    idBusy.value = false;
  }
}


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
.step:disabled {
  cursor: default;
}

.id-privacy {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  margin: 0;
  padding: 0.7rem 0.9rem;
  border-radius: 1rem;
  background: var(--unmute-surface-overlay);
  list-style: none;
  font-size: 0.82rem;
  color: var(--unmute-text-secondary);

  li { display: flex; align-items: center; gap: 0.5rem; }
  i { color: var(--unmute-cta); }
}

.id-preview {
  width: 100%;
  max-height: 14rem;
  object-fit: contain;
  border-radius: 1rem;
  background: #f3effc;
}

.id-pick {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  min-height: 3rem;
  border: 2px dashed rgba(242, 24, 114, 0.45);
  border-radius: 1rem;
  background: #fdf1f9;
  color: var(--unmute-cta);
  font-weight: 600;
  cursor: pointer;
}
</style>
