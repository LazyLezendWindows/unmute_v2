<template>
  <SectionShell>
    <template v-if="!setup.step.value" #aside><ProfileSummary /></template>
    <div class="location-page d-flex flex-column w-100">
      <template v-if="setup.step.value">
        <PageHeader title="Set Your Location" subtitle="Find people near you and get better matches" :back="'/profile/interests?setup=1'">
          <template #actions><router-link :to="setup.next.value" class="pill-skip">Skip</router-link></template>
        </PageHeader>
        <SetupProgress :step="setup.step.value" />
      </template>
      <PageHeader v-else title="Set Your Location" back="/profile" subtitle="Find people near you and get better matches" />

      <section class="location-card">
        <LocationPicker ref="picker" />
      </section>

      <ul class="location-points mt-3">
        <li v-for="point in POINTS" :key="point.title">
          <span class="point-icon" aria-hidden="true"><i :class="point.icon"></i></span>
          <span><strong>{{ point.title }}</strong><span>{{ point.text }}</span></span>
        </li>
      </ul>

      <div v-if="setup.step.value" class="d-flex flex-column gap-2 mt-4">
        <UButton v-if="hasArea" variant="primary" size="lg" block @click="$router.push(setup.next.value)">
          Continue <i class="ri-arrow-right-line ms-2" aria-hidden="true"></i>
        </UButton>
        <template v-else>
          <UButton variant="primary" size="lg" block :loading="allowing" :disabled="!picker?.geolocationSupported" @click="allowLocation">
            Allow Location <i class="ri-arrow-right-line ms-2" aria-hidden="true"></i>
          </UButton>
          <button type="button" class="later-btn" @click="$router.push(setup.next.value)">Maybe Later</button>
        </template>
      </div>
    </div>
  </SectionShell>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import PageHeader from '../components/layout/PageHeader.vue';
import SectionShell from '../components/layout/SectionShell.vue';
import ProfileSummary from '../components/profile/ProfileSummary.vue';
import SetupProgress from '../components/layout/SetupProgress.vue';
import UButton from '../components/ui/UButton.vue';
import LocationPicker from '../components/location/LocationPicker.vue';
import { useSetupStep } from '../composables/useSetupStep';
import { useAuthStore } from '../stores/auth';

const setup = useSetupStep();
const router = useRouter();
const authStore = useAuthStore();

const picker = ref<InstanceType<typeof LocationPicker> | null>(null);
const allowing = ref(false);
const hasArea = computed(() => Boolean(authStore.profile?.location));

/** Setup's main action: share the device position once, then go on to the next step. */
async function allowLocation() {
  if (!picker.value) return;
  allowing.value = true;
  try {
    if (await picker.value.useDevice()) router.push(setup.next.value);
  } finally {
    allowing.value = false;
  }
}

const POINTS = [
  { icon: 'ri-map-pin-fill', title: 'Discover People Nearby', text: 'See who is close by and sort Discover by distance.' },
  { icon: 'ri-shield-check-fill', title: 'Your Privacy Matters', text: 'Others only ever see your area’s name, never your exact position.' },
  { icon: 'ri-lock-fill', title: 'You’re in Control', text: 'Change how much you show, or remove your area, any time.' },
];
</script>

<style scoped lang="scss">
.location-points {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  margin: 0;
  padding: 0;
  list-style: none;

  li {
    display: flex;
    align-items: center;
    gap: 0.9rem;
    padding: 0.9rem 1rem;
    border-radius: var(--unmute-radius-lg);
    background: var(--unmute-surface);
    border: 1px solid var(--unmute-glass-border);
    box-shadow: var(--unmute-shadow-sm);

    > span:last-child {
      display: flex;
      flex-direction: column;
      font-size: 0.85rem;
      color: var(--unmute-text-secondary);
    }

    strong {
      font-size: 0.95rem;
      color: var(--unmute-text-heading);
    }
  }
}

.point-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 2.8rem;
  height: 2.8rem;
  border-radius: 50%;
  background: var(--unmute-primary-surface);
  color: var(--unmute-cta);
  font-size: 1.3rem;
}

.later-btn {
  min-height: 3.1rem;
  border: 0;
  border-radius: var(--unmute-radius-pill);
  background: var(--unmute-surface-overlay);
  color: var(--unmute-text-heading);
  font-size: 1rem;
  font-weight: 600;
}

.location-card {
  padding: 1.25rem;
  border-radius: var(--unmute-radius-lg);
  background: var(--unmute-surface);
  border: 1px solid var(--unmute-glass-border);
  box-shadow: var(--unmute-shadow-sm);
}
</style>
