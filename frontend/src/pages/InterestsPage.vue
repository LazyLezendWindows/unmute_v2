<template>
  <SectionShell>
    <template v-if="!setup.step.value" #aside><ProfileSummary /></template>
    <div class="interests-page d-flex flex-column w-100">
      <template v-if="setup.step.value">
        <PageHeader title="Your Interests" subtitle="Select a few interests to find better matches">
          <template #actions><router-link :to="setup.next.value" class="pill-skip">Skip</router-link></template>
        </PageHeader>
        <SetupProgress :step="setup.step.value" />
      </template>
      <PageHeader v-else title="Your Interests" subtitle="Select a few interests to find better matches" back="/profile" />

      <UInput v-model="query" type="search" placeholder="Search interests" icon="ri-search-line" />

      <section class="mt-4" aria-label="Choose your interests" :aria-busy="loading">
        <p v-if="loadError" class="small text-danger" role="alert">{{ loadError }}</p>
        <p v-else-if="loading" class="u-text-muted">Loading interests…</p>
        <p v-else-if="!available.length" class="u-text-muted">No interests match “{{ query }}”.</p>
        <div class="interest-grid">
          <button v-for="interest in available" :key="interest.id" type="button"
            class="interest-tile" :class="{ 'is-selected': selectedIds.includes(interest.id) }"
            :aria-pressed="selectedIds.includes(interest.id)"
            :disabled="!selectedIds.includes(interest.id) && selectedIds.length >= MAX_INTERESTS"
            @click="toggle(interest.id)">
            <span class="interest-art"><i :class="interestIcon(interest.name)" aria-hidden="true"></i></span>
            <span>{{ interest.name }}</span>
            <i v-if="selectedIds.includes(interest.id)" class="ri-check-line selection-check" aria-hidden="true"></i>
          </button>
        </div>
      </section>
      <div class="interest-tip glass-pane mt-4" role="status">
        <i class="ri-lightbulb-flash-line" aria-hidden="true"></i>
        <div><strong>{{ selectedIds.length }} of {{ MAX_INTERESTS }} interests selected</strong><p class="mb-0 u-text-muted">Pick at least 3 to help people get to know you.</p></div>
      </div>

      <div class="save-bar">
        <UButton variant="primary" size="lg" block :loading="saving" @click="save">
          <template v-if="setup.step.value">Continue <i class="ri-arrow-right-line ms-2" aria-hidden="true"></i></template>
          <template v-else>Save interests</template>
        </UButton>
      </div>
    </div>
  </SectionShell>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import PageHeader from '../components/layout/PageHeader.vue';
import SectionShell from '../components/layout/SectionShell.vue';
import ProfileSummary from '../components/profile/ProfileSummary.vue';
import SetupProgress from '../components/layout/SetupProgress.vue';
import UInput from '../components/ui/UInput.vue';
import UButton from '../components/ui/UButton.vue';
import { api } from '../services/api';
import { useAuthStore } from '../stores/auth';
import { useToastStore } from '../stores/toast';
import { useSetupStep } from '../composables/useSetupStep';
import { interestIcon } from '../utils/interestIcon';
import { Interest } from '../types';

const MAX_INTERESTS = 10;

const router = useRouter();
const authStore = useAuthStore();
const setup = useSetupStep();

const allInterests = ref<Interest[]>([]);
const selectedIds = ref<string[]>((authStore.profile?.interests || []).map((i) => i.id));
const query = ref('');
const loading = ref(true);
const loadError = ref<string | null>(null);
const saving = ref(false);

onMounted(async () => {
  try {
    const res = await api.get('/users/interests');
    allInterests.value = res.data.data;
  } catch (err: any) {
    loadError.value = `Couldn't load interests. ${err.message}`;
  } finally {
    loading.value = false;
  }
});

const available = computed(() => {
  const q = query.value.trim().toLowerCase();
  return allInterests.value.filter(
    (i) => (!q || i.name.toLowerCase().includes(q) || i.category.toLowerCase().includes(q))
  );
});

function toggle(id: string) {
  if (selectedIds.value.includes(id)) {
    selectedIds.value = selectedIds.value.filter((i) => i !== id);
  } else if (selectedIds.value.length < MAX_INTERESTS) {
    selectedIds.value = [...selectedIds.value, id];
  }
}

async function save() {
  saving.value = true;
  try {
    await authStore.updateProfile({ interestIds: selectedIds.value });
    if (setup.step.value) {
      router.push(setup.next.value);
    } else {
      useToastStore().success('Interests saved.');
      router.push('/profile');
    }
  } catch (err: any) {
    useToastStore().error(`Interests not saved. ${err.message}`);
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped lang="scss">
.interest-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 0.7rem; }
.interest-tile { position: relative; display: flex; flex-direction: column; align-items: center; gap: 0.55rem; padding: 0.5rem 0.4rem 0.7rem; border: 1.5px solid transparent; border-radius: 1.1rem; background: var(--unmute-glass-strong); color: var(--unmute-text-heading); font-size: 0.85rem; overflow-wrap: anywhere; }
.interest-tile.is-selected { border-color: var(--unmute-cta); background: var(--unmute-primary-surface); }
.interest-tile:disabled { opacity: 0.45; }
.interest-art { display: grid; place-items: center; width: 100%; aspect-ratio: 1.6; border-radius: 0.8rem; background: linear-gradient(135deg, var(--unmute-primary-surface), var(--unmute-surface-overlay)); color: var(--unmute-cta); font-size: clamp(1.8rem, 4vw, 3rem); }
.selection-check { position: absolute; right: 0.25rem; top: 0.25rem; display: grid; place-items: center; width: 1.5rem; height: 1.5rem; background: var(--unmute-cta); color: white; border: 2px solid white; border-radius: 50%; }
.interest-tip { display: flex; align-items: center; gap: 0.8rem; padding: 1.2rem; border-radius: var(--unmute-radius-lg); font-size: 0.85rem; }
.interest-tip > i { color: var(--unmute-cta); font-size: 2rem; }
@media (max-width: 399px) { .interest-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
.section-heading {
  font-size: 0.9rem;
  font-weight: 700;
  margin-bottom: 0.75rem;
}

// The CTA follows the grid so it never covers tiles or the floating navigation.
.save-bar {
  margin-top: 1.5rem;
  padding-bottom: 0.5rem;
}
</style>
