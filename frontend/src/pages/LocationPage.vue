<template>
  <SectionShell>
    <template v-if="!setup.step.value" #aside><ProfileSummary /></template>
    <div class="location-page d-flex flex-column w-100">
      <template v-if="setup.step.value">
        <PageHeader title="Set Your Location" subtitle="Find people near you and get better matches" />
        <SetupProgress :step="setup.step.value" :skip-to="setup.next.value" />
      </template>
      <PageHeader v-else title="Set Your Location" back="/profile" subtitle="Find people near you and get better matches" />

      <section class="location-card">
        <LocationPicker />
      </section>

      <ul class="location-points mt-3">
        <li v-for="point in POINTS" :key="point.title">
          <span class="point-icon" aria-hidden="true"><i :class="point.icon"></i></span>
          <span><strong>{{ point.title }}</strong><span>{{ point.text }}</span></span>
        </li>
      </ul>

      <div v-if="setup.step.value" class="mt-4">
        <UButton variant="primary" size="lg" block @click="$router.push(setup.next.value)">
          Continue <i class="ri-arrow-right-line ms-2" aria-hidden="true"></i>
        </UButton>
      </div>
    </div>
  </SectionShell>
</template>

<script setup lang="ts">
import PageHeader from '../components/layout/PageHeader.vue';
import SectionShell from '../components/layout/SectionShell.vue';
import ProfileSummary from '../components/profile/ProfileSummary.vue';
import SetupProgress from '../components/layout/SetupProgress.vue';
import UButton from '../components/ui/UButton.vue';
import LocationPicker from '../components/location/LocationPicker.vue';
import { useSetupStep } from '../composables/useSetupStep';

const setup = useSetupStep();

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

.location-card {
  padding: 1.25rem;
  border-radius: var(--unmute-radius-lg);
  background: var(--unmute-surface);
  border: 1px solid var(--unmute-glass-border);
  box-shadow: var(--unmute-shadow-sm);
}
</style>
