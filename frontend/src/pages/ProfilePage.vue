<template>
  <div class="profile-page">
    <ScreenBar back>
      <template #actions>
        <router-link to="/settings" class="round-btn" aria-label="Settings"><i class="ri-settings-3-line" aria-hidden="true"></i></router-link>
      </template>
    </ScreenBar>

    <!-- Photo, name and numbers -->
    <section class="me-head">
      <router-link to="/profile/edit" class="me-avatar" aria-label="Change profile photo">
        <UAvatar :src="profile?.avatarUrl" :name="profile?.displayName || 'You'" size="2xl" />
        <span class="me-online" aria-hidden="true"></span>
      </router-link>
      <div class="min-w-0 flex-grow-1">
        <div class="me-title">
          <h1 class="me-name">
            {{ profile?.displayName || 'You' }}<template v-if="profile?.age">, {{ profile.age }}</template>
            <i v-if="profile?.isVerified" class="ri-verified-badge-fill verified-badge" aria-label="Verified"></i>
          </h1>
          <router-link to="/profile/edit" class="edit-pill"><i class="ri-pencil-fill" aria-hidden="true"></i> Edit Profile</router-link>
        </div>
        <p v-if="profile?.profession" class="me-line"><i class="ri-briefcase-4-line" aria-hidden="true"></i>{{ profile.profession }}</p>
        <p v-if="profile?.approximateLocation" class="me-line"><i class="ri-map-pin-line" aria-hidden="true"></i>{{ profile.approximateLocation }}</p>
        <p class="me-line"><span class="online-dot" aria-hidden="true"></span>Online now</p>
        <dl class="me-stats">
          <div><dd>{{ photos.length }}</dd><dt>Photos</dt></div>
          <div><dd>{{ compact(profile?.likesReceived ?? 0) }}</dd><dt>Likes</dt></div>
          <div><dd>{{ compact(chatStore.matches.length) }}</dd><dt>Matches</dt></div>
        </dl>
      </div>
    </section>

    <p v-if="profile?.bio" class="me-bio">{{ firstLine }}</p>

    <!-- Photo strip -->
    <router-link v-if="photos.length" to="/profile/edit" class="me-strip" aria-label="Edit photos">
      <span
        v-for="(url, index) in photos.slice(0, STRIP)"
        :key="url + index"
        class="strip-photo"
        :class="{ 'is-main': index === 0 }"
        :style="photoBackground(url)"
      >
        <span v-if="index === STRIP - 1 && photos.length > STRIP" class="strip-more">+{{ photos.length - STRIP }}</span>
      </span>
    </router-link>

    <router-link v-if="strength.next" :to="strength.next.to" class="me-card strength">
      <span class="strength-top"><strong>Complete your profile</strong><span>{{ strength.percent }}%</span></span>
      <span class="strength-bar" role="progressbar" :aria-valuenow="strength.percent" aria-valuemin="0" aria-valuemax="100" aria-label="Profile completeness">
        <span :style="{ width: `${strength.percent}%` }"></span>
      </span>
      <span class="strength-next">Next: {{ strength.next.label }}</span>
    </router-link>

    <router-link to="/profile/edit" class="me-card">
      <div class="card-head"><i class="ri-user-3-line" aria-hidden="true"></i><h2>About Me</h2><i class="ri-arrow-right-s-line card-chev" aria-hidden="true"></i></div>
      <p class="card-text">{{ profile?.bio || 'Tell people a little about yourself.' }}</p>
    </router-link>

    <section class="me-card">
      <div class="card-head">
        <i class="ri-heart-3-line" aria-hidden="true"></i><h2>My Interests</h2>
        <router-link to="/profile/interests" class="card-link">{{ profile?.interests.length ? 'View all' : 'Add' }} <i class="ri-arrow-right-s-line" aria-hidden="true"></i></router-link>
      </div>
      <div class="chips">
        <span v-for="interest in profile?.interests" :key="interest.id" class="int-chip">
          <i :class="interestIcon(interest.name)" aria-hidden="true"></i>{{ interest.name }}
        </span>
        <span v-if="!profile?.interests.length" class="card-text">Pick a few so people know what you love.</span>
      </div>
    </section>

    <!-- Who you want to meet: the Discover filters -->
    <router-link to="/discover/filters" class="me-card">
      <div class="card-head"><i class="ri-equalizer-line" aria-hidden="true"></i><h2>Preferences</h2><i class="ri-arrow-right-s-line card-chev" aria-hidden="true"></i></div>
      <div class="prefs">
        <span><i class="ri-map-pin-line" aria-hidden="true"></i><strong>{{ filters.radiusKm ? `${filters.radiusKm} km` : 'Anywhere' }}</strong><small>Distance</small></span>
        <span><i class="ri-group-line" aria-hidden="true"></i><strong>{{ ageRange }}</strong><small>Age Range</small></span>
        <span><i class="ri-heart-line" aria-hidden="true"></i><strong>{{ lookingFor }}</strong><small>Looking For</small></span>
      </div>
    </router-link>

    <nav class="me-card rows" aria-label="Account">
      <router-link to="/verify" class="row">
        <i class="ri-star-line" aria-hidden="true"></i><span>Verified Profile</span>
        <em :class="{ 'is-ok': profile?.isVerified }">{{ profile?.isVerified ? '✓ Verified' : 'Not verified' }}</em>
        <i class="ri-arrow-right-s-line" aria-hidden="true"></i>
      </router-link>
      <router-link to="/safety" class="row">
        <i class="ri-shield-check-line" aria-hidden="true"></i><span>Privacy Settings</span><em></em>
        <i class="ri-arrow-right-s-line" aria-hidden="true"></i>
      </router-link>
      <button type="button" class="row" @click="openAlerts">
        <i class="ri-notification-3-line" aria-hidden="true"></i><span>Notifications</span><em></em>
        <i class="ri-arrow-right-s-line" aria-hidden="true"></i>
      </button>
    </nav>

    <!-- Alerts while Unmute is closed (push notifications on this device) -->
    <UModal :is-open="alertsOpen" title="Notifications" max-width="sm" @close="alertsOpen = false">
      <div class="d-flex flex-column gap-3">
        <label class="alert-row">
          <span class="alert-text">
            <strong>Calls &amp; messages on this device</strong>
            <span>Receive call and message alerts while Unmute is closed.</span>
          </span>
          <input
            type="checkbox"
            role="switch"
            class="alert-switch"
            :checked="alertsOn"
            :disabled="alertsBusy || pushState === 'unsupported' || pushState === 'denied'"
            @change="toggleAlerts"
          />
        </label>
        <p v-if="pushState === 'unsupported'" class="small mb-0 u-text-muted">
          This browser can't show alerts. On iPhone, add Unmute to your Home Screen first (Share → Add to Home Screen).
        </p>
        <p v-else-if="pushState === 'denied'" class="small mb-0 u-text-muted">
          Notifications are blocked for Unmute. Allow them in your browser's site settings, then come back here.
        </p>
        <fieldset :disabled="preferencesBusy" class="border-0 p-0 d-grid gap-3">
          <legend class="small fw-bold">Push preferences for your account</legend>
          <label class="alert-row"><span>Incoming calls</span><input v-model="preferences.calls" type="checkbox" role="switch" @change="savePreferences" /></label>
          <label class="alert-row"><span>New messages</span><input v-model="preferences.messages" type="checkbox" role="switch" @change="savePreferences" /></label>
        </fieldset>
        <p v-if="preferencesError" role="alert" class="text-danger small">{{ preferencesError }}</p>
        <p class="small mb-0 u-text-muted">While Unmute is open, calls and messages always show inside the app.</p>
      </div>
      <template #footer>
        <UButton variant="primary" size="md" @click="alertsOpen = false">Done</UButton>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import ScreenBar from '../components/layout/ScreenBar.vue';
import UAvatar from '../components/ui/UAvatar.vue';
import { useAuthStore } from '../stores/auth';
import { useChatStore } from '../stores/chat';
import { useDiscoverStore } from '../stores/discover';
import { useProfileStrength } from '../composables/useProfileStrength';
import { photoBackground, photosOf } from '../services/media';
import { interestIcon } from '../utils/interestIcon';
import UModal from '../components/ui/UModal.vue';
import UButton from '../components/ui/UButton.vue';
import { useToastStore } from '../stores/toast';
import { api } from '../services/api';
import { disablePush, enablePush, pushState, pushSubscribed } from '../services/push';

/** Photos in the strip; the last one shows how many more there are. */
const STRIP = 6;

const authStore = useAuthStore();
const chatStore = useChatStore();
const discoverStore = useDiscoverStore();
const strength = useProfileStrength();

const profile = computed(() => authStore.profile);
const photos = computed(() => (profile.value ? photosOf(profile.value) : []));
const filters = computed(() => discoverStore.filters);
const firstLine = computed(() => (profile.value?.bio || '').split('\n')[0]);

onMounted(() => {
  chatStore.loadMatches();
  // Refreshes the likes count; the page still shows the cached profile if this fails.
  authStore.refreshProfile().catch(() => undefined);
});

const ageRange = computed(() => {
  const { minAge, maxAge } = filters.value;
  if (minAge === null && maxAge === null) return 'Any';
  return `${minAge ?? 18} - ${maxAge ?? '60+'}`;
});

const lookingFor = computed(
  () => filters.value.lookingFor ?? profile.value?.interactionPreferences[0] ?? 'Open to all'
);

/** 1200 → 1.2K, as in the stats row. */
function compact(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, '')}K` : String(n);
}

const alertsOpen = ref(false);
const alertsOn = ref(false);
const alertsBusy = ref(false);

const preferences = ref({ calls: true, messages: true });
const preferencesBusy = ref(false);
const preferencesError = ref('');
async function openAlerts() {
  alertsOpen.value = true;
  preferencesBusy.value = true;
  preferencesError.value = '';
  try {
    alertsOn.value = await pushSubscribed();
    preferences.value = (await api.get('/notifications/preferences')).data.data;
  } catch (err) { preferencesError.value = (err as Error).message; }
  finally { preferencesBusy.value = false; }
}
async function savePreferences() {
  preferencesBusy.value = true; preferencesError.value = '';
  try { await api.put('/notifications/preferences', preferences.value); }
  catch (err) {
    preferencesError.value = `Preferences were not saved. ${(err as Error).message}`;
    try { preferences.value = (await api.get('/notifications/preferences')).data.data; } catch { /* Keep the error visible. */ }
  } finally { preferencesBusy.value = false; }
}

async function toggleAlerts() {
  alertsBusy.value = true;
  try {
    if (alertsOn.value) {
      await disablePush();
      alertsOn.value = false;
    } else {
      alertsOn.value = await enablePush();
      if (!alertsOn.value && pushState.value !== 'denied') useToastStore().error("Couldn't turn on alerts. Please try again.");
    }
  } finally {
    alertsBusy.value = false;
  }
}
</script>

<style scoped lang="scss">
$ink: #10106b;
$soft: #4b4fa6;

.profile-page {
  width: 100%;
  max-width: 36rem;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
  padding-bottom: 1rem;
}

.me-head {
  display: flex;
  align-items: flex-start;
  gap: 1rem;
}

.me-avatar {
  position: relative;
  flex-shrink: 0;
  padding: 4px;
  border-radius: 50%;
  background: linear-gradient(135deg, #ffc1dc, #f6a6e0);

  :deep(.u-avatar) {
    width: clamp(7rem, 32vw, 9rem);
    height: clamp(7rem, 32vw, 9rem);
    border: 3px solid #fff;
  }
}

.me-online {
  position: absolute;
  right: 0.55rem;
  bottom: 0.55rem;
  width: 1.3rem;
  height: 1.3rem;
  border-radius: 50%;
  background: #1fc75b;
  box-shadow: 0 0 0 3px #fff;
}

.me-title {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.4rem 0.6rem;
}

.me-name {
  margin: 0;
  font-size: clamp(1.6rem, 6vw, 2rem);
  font-weight: 800;
  color: $ink;
}

.edit-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.4rem 0.95rem;
  border-radius: var(--unmute-radius-pill);
  background: #fbe4f2;
  color: #e5147c;
  font-size: 0.9rem;
  font-weight: 600;
  text-decoration: none;
}

.me-line {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  margin: 0.25rem 0 0;
  color: $soft;
  font-size: 0.98rem;

  i {
    font-size: 1.1rem;
  }
}

.me-stats {
  display: flex;
  margin: 0.8rem 0 0;

  > div {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;

    & + div {
      border-left: 1px solid #e3dcf3;
    }
  }

  dd {
    margin: 0;
    font-size: 1.4rem;
    font-weight: 800;
    color: #e5147c;
  }

  dt {
    font-size: 0.85rem;
    font-weight: 500;
    color: $soft;
  }
}

.me-bio {
  margin: 0;
  color: $soft;
  font-size: 1.05rem;
}

.me-strip {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 0.45rem;
  text-decoration: none;
}

.strip-photo {
  position: relative;
  aspect-ratio: 0.8;
  border: 2px solid transparent;
  border-radius: 0.9rem;
  background: #efe3f3 center 25% / cover;
  overflow: hidden;

  &.is-main {
    border-color: #f21872;
  }
}

.strip-more {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  background: rgba(30, 20, 30, 0.45);
  color: #fff;
  font-size: 1.2rem;
  font-weight: 600;
}

.me-card {
  display: block;
  padding: 1rem 1.1rem;
  border-radius: 1.5rem;
  background: rgba(255, 255, 255, 0.85);
  box-shadow: 0 10px 30px -22px rgba(117, 48, 170, 0.5);
  color: inherit;
  text-decoration: none;
}

.card-head {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.55rem;

  > i:first-child {
    font-size: 1.55rem;
    color: #e5147c;
  }

  h2 {
    flex-grow: 1;
    margin: 0;
    font-size: 1.2rem;
    font-weight: 800;
    color: $ink;
  }
}

.card-chev {
  color: #e5147c;
  font-size: 1.4rem;
}

.card-link {
  display: inline-flex;
  align-items: center;
  color: #e5147c;
  font-size: 0.95rem;
  text-decoration: none;
}

.card-text {
  margin: 0;
  color: $soft;
  font-size: 1rem;
  line-height: 1.5;
  white-space: pre-line;
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.int-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.45rem 0.9rem;
  border-radius: var(--unmute-radius-pill);
  background: #fbeaf6;
  color: $ink;
  font-size: 0.95rem;

  i {
    font-size: 1.2rem;
    color: #e5147c;
  }
}

.prefs {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));

  span {
    display: grid;
    grid-template-columns: auto 1fr;
    column-gap: 0.5rem;
    align-items: center;
    padding: 0 0.45rem;
    min-width: 0;

    & + span {
      border-left: 1px solid #e3dcf3;
    }
  }

  i {
    grid-row: span 2;
    font-size: 1.4rem;
    color: $ink;
  }

  strong {
    min-width: 0;
    color: $ink;
    font-size: 0.92rem;
    line-height: 1.25;
  }

  small {
    color: $soft;
    font-size: 0.8rem;
  }

  // Phones: the icon sits above its value so words never break mid-way.
  @media (max-width: 479.98px) {
    span {
      grid-template-columns: 1fr;
      row-gap: 0.15rem;
      text-align: center;
      justify-items: center;
    }

    i {
      grid-row: auto;
    }
  }
}

.rows {
  padding: 0.3rem 1.1rem;
}

.row {
  display: grid;
  grid-template-columns: 1.6rem 1fr auto auto;
  align-items: center;
  gap: 0.7rem;
  width: 100%;
  min-height: 3.4rem;
  border: 0;
  background: transparent;
  color: $soft;
  font-size: 1.05rem;
  text-align: left;
  text-decoration: none;

  & + .row {
    border-top: 1px solid #ece6f7;
  }

  > i {
    font-size: 1.4rem;
    color: $ink;
  }

  span {
    white-space: nowrap;
  }

  em {
    font-style: normal;
    font-size: 0.85rem;
    color: $soft;

    &.is-ok {
      color: #1a7a3c;
    }
  }
}

.strength {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.strength-top {
  display: flex;
  justify-content: space-between;
  color: $ink;

  span {
    color: #e5147c;
    font-weight: 700;
  }
}

.strength-bar {
  display: block;
  height: 0.45rem;
  border-radius: 9999px;
  background: #f1ebfb;
  overflow: hidden;

  span {
    display: block;
    height: 100%;
    background: linear-gradient(95deg, #ff3d8b, #8a1fe0);
  }
}

.strength-next {
  font-size: 0.85rem;
  color: $soft;
}
.alert-row {
  display: flex;
  align-items: center;
  gap: 0.9rem;
  cursor: pointer;
}

.alert-text {
  display: flex;
  flex-direction: column;
  flex: 1;
  font-size: 0.82rem;
  color: var(--unmute-text-secondary);

  strong {
    color: var(--unmute-text-heading);
    font-size: 0.98rem;
  }
}

.alert-switch {
  -webkit-appearance: none;
  appearance: none;
  position: relative;
  flex-shrink: 0;
  width: 3.2rem;
  height: 1.9rem;
  border-radius: 9999px;
  background: #e5dff2;
  cursor: pointer;

  &::after {
    content: '';
    position: absolute;
    top: 0.2rem;
    left: 0.2rem;
    width: 1.5rem;
    height: 1.5rem;
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
    transition: transform var(--unmute-transition-fast);
  }

  &:checked {
    background: linear-gradient(90deg, #ff4f8e, #f21872);

    &::after { transform: translateX(1.3rem); }
  }

  &:disabled { opacity: 0.45; cursor: not-allowed; }
}
</style>
