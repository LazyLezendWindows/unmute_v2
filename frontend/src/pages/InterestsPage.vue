<template>
  <SectionShell>
    <template v-if="!setup.step.value" #aside><ProfileSummary /></template>
    <div class="interests-page d-flex flex-column w-100">
      <template v-if="setup.step.value">
        <PageHeader title="Your Interests" subtitle="Select a few interests to find better matches" :back="setup.previous.value ?? undefined">
          <template #actions><router-link :to="setup.next.value" class="pill-skip">Skip</router-link></template>
        </PageHeader>
        <SetupProgress :step="setup.step.value" />
      </template>
      <PageHeader v-else title="Your Interests" subtitle="Select a few interests to find better matches" back="/profile" />

      <UInput v-model="query" type="search" placeholder="Search interests..." icon="ri-search-line" />

      <section class="mt-4" aria-label="Choose your interests" :aria-busy="loading">
        <p v-if="loadError" class="small text-danger" role="alert">{{ loadError }}</p>
        <p v-else-if="loading" class="u-text-muted">Loading interests…</p>
        <p v-else-if="!available.length" class="u-text-muted">No interests match “{{ query }}”.</p>
        <div class="interest-grid">
          <button v-for="interest in shown" :key="interest.id" type="button"
            class="interest-tile" :class="{ 'is-selected': selectedIds.includes(interest.id), 'is-plain': !interestPhoto(interest.name) }"
            :aria-pressed="selectedIds.includes(interest.id)"
            :disabled="!selectedIds.includes(interest.id) && selectedIds.length >= MAX_INTERESTS"
            @click="toggle(interest.id)">
            <span v-if="interestPhoto(interest.name)" class="interest-art">
              <img :src="interestPhoto(interest.name)" alt="" loading="lazy" />
            </span>
            <span>{{ interest.name }}</span>
            <i v-if="selectedIds.includes(interest.id)" class="ri-check-line selection-check" aria-hidden="true"></i>
          </button>
          <button v-if="hiddenCount" type="button" class="interest-tile" :aria-expanded="showOthers" @click="showOthers = !showOthers">
            <span class="interest-art is-other"><i :class="showOthers ? 'ri-arrow-up-s-line' : 'ri-more-fill'" aria-hidden="true"></i></span>
            <span>{{ showOthers ? 'Fewer' : 'Other' }}</span>
          </button>
        </div>
      </section>
      <div class="interest-tip mt-4" role="status">
        <i class="ri-lightbulb-flash-fill" aria-hidden="true"></i>
        <div>
          <strong>{{ selectedIds.length >= 3 ? `${selectedIds.length} of ${MAX_INTERESTS} interests selected` : 'Select at least 3 interests' }}</strong>
          <p class="mb-0">This helps us show you more compatible people.</p>
        </div>
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
import { PHOTO_INTEREST_ORDER, interestPhoto } from '../utils/interestPhoto';
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

/**
 * The picture tiles first, in the brand screen's order; other interests (and any you already
 * picked among them) sit behind "Other". A search looks through everything.
 */
const showOthers = ref(false);
const rank = (name: string) => {
  const i = PHOTO_INTEREST_ORDER.indexOf(name.toLowerCase());
  return i === -1 ? Number.MAX_VALUE : i;
};
/** One of the 23 tiles of the brand screen; the rest sit behind "Other". */
const isMain = (name: string) => PHOTO_INTEREST_ORDER.includes(name.toLowerCase());
const ordered = computed(() => [...available.value].sort((a, b) => rank(a.name) - rank(b.name)));
const hiddenCount = computed(() =>
  query.value.trim() ? 0 : ordered.value.filter((i) => !isMain(i.name) && !selectedIds.value.includes(i.id)).length
);
const shown = computed(() =>
  query.value.trim() || showOthers.value
    ? ordered.value
    : ordered.value.filter((i) => isMain(i.name) || selectedIds.value.includes(i.id))
);

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
.interest-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 0.45rem; }
.interest-tile {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.45rem;
  padding: 0.35rem 0.35rem 0.6rem;
  border: 1.5px solid transparent;
  border-radius: 1.1rem;
  background: var(--unmute-surface);
  box-shadow: 0 6px 16px -14px rgba(117, 48, 170, 0.6);
  color: var(--unmute-text-heading);
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: -0.01em;
  white-space: nowrap;
}
// Interests without a picture: just the name, wrapped over two lines if needed.
.interest-tile.is-plain {
  justify-content: center;
  min-height: 3.4rem;
  padding: 0.5rem 0.4rem;
  white-space: normal;
  overflow-wrap: anywhere;
  text-align: center;
  line-height: 1.25;
}
.interest-tile.is-selected { border-color: var(--unmute-cta); background: #fdeef7; }
.interest-tile:disabled { opacity: 0.45; }
.interest-art {
  display: grid;
  place-items: center;
  width: 100%;
  aspect-ratio: 1.75;
  overflow: hidden;
  border-radius: 0.75rem;
  background: linear-gradient(135deg, var(--unmute-primary-surface), var(--unmute-surface-overlay));
  color: var(--unmute-cta);
  font-size: clamp(1.5rem, 4vw, 2.2rem);

  img { width: 100%; height: 100%; object-fit: cover; }

  &.is-other { background: var(--unmute-surface-overlay); color: #6c2bd9; }
}
.selection-check { position: absolute; right: 0.2rem; top: 0.2rem; display: grid; place-items: center; width: 1.4rem; height: 1.4rem; background: var(--unmute-cta); color: white; border: 2px solid white; border-radius: 50%; font-size: 0.85rem; }
.interest-tip {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  padding: 1rem 1.1rem;
  border-radius: var(--unmute-radius-lg);
  background: var(--unmute-surface);
  box-shadow: var(--unmute-shadow-sm);
  font-size: 0.85rem;
  color: var(--unmute-text-secondary);

  strong { color: var(--unmute-text-heading); font-size: 0.95rem; }
}
.interest-tip > i { color: var(--unmute-cta); font-size: 2rem; }
@media (max-width: 359px) { .interest-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
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
