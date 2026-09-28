<template>
  <div class="discover-page d-flex flex-column flex-grow-1">
    <ScreenBar>
      <template #actions>
        <NotificationBell />
        <button
          type="button"
          class="round-btn"
          :class="{ 'is-tinted': searchOpen }"
          :aria-label="searchOpen ? 'Close search' : 'Search'"
          :aria-expanded="searchOpen"
          aria-controls="discover-search"
          @click="toggleSearch"
        >
          <i :class="searchOpen ? 'ri-close-line' : 'ri-search-line'" aria-hidden="true"></i>
        </button>
        <router-link to="/discover/filters" class="round-btn is-accent" :aria-label="filterButtonLabel">
          <i class="ri-equalizer-2-line" aria-hidden="true"></i>
          <span v-if="discoverStore.activeFilterCount" class="filter-dot" aria-hidden="true">{{ discoverStore.activeFilterCount }}</span>
        </router-link>
      </template>
    </ScreenBar>

    <!-- Search: narrows the deck by name, work, bio, interests, college or area -->
    <form v-if="searchOpen" id="discover-search" class="search-bar mb-3" role="search" @submit.prevent="applySearch">
      <i class="ri-search-line search-icon" aria-hidden="true"></i>
      <input
        ref="searchInput"
        v-model="searchText"
        type="search"
        class="search-input"
        placeholder="Search name, work, interests, college…"
        aria-label="Search people"
        maxlength="60"
        enterkeyhint="search"
        autocomplete="off"
        @input="scheduleSearch"
        @keydown.esc="closeSearch"
      />
      <button v-if="searchText" type="button" class="search-clear" aria-label="Clear search" @click="clearSearch">
        <i class="ri-close-circle-fill" aria-hidden="true"></i>
      </button>
    </form>

    <!-- Order of the deck -->
    <div class="sort-tabs mb-3" role="group" aria-label="Order people by">
      <button
        v-for="tab in SORT_TABS"
        :key="tab.value"
        type="button"
        :aria-pressed="discoverStore.sort === tab.value"
        @click="discoverStore.setSort(tab.value)"
      >
        <i :class="tab.icon" aria-hidden="true"></i> {{ tab.label }}
      </button>
    </div>

    <!-- Active filter chips -->
    <div v-if="activeChips.length" class="filter-chips d-flex flex-wrap gap-2 mb-3">
      <button
        v-for="chip in activeChips"
        :key="chip.key"
        type="button"
        class="chip chip-selected chip-removable"
        :aria-label="`Remove filter: ${chip.label}`"
        @click="removeFilter(chip.key)"
      >
        {{ chip.label }}
        <i class="ri-close-line ms-1" aria-hidden="true"></i>
      </button>
    </div>

    <!-- Content area -->
    <div
      class="flex-grow-1 d-flex flex-column"
      :class="{ 'justify-content-center': !discoverStore.loading && !discoverStore.currentCandidate }"
    >
      <!-- Loading skeletons -->
      <div v-if="discoverStore.loading" class="discover-grid">
        <USkeleton type="card" height="30rem" class="deck-skeleton" />
      </div>

      <!-- Deck -->
      <div v-else-if="discoverStore.currentCandidate" class="discover-grid animate-fade-in">
        <DiscoverStack
          ref="stack"
          class="grid-card"
          :top="discoverStore.currentCandidate"
          :behind="behind"
          @like="handleLike"
          @pass="handlePass"
          @open="openProfile"
        />
        <CandidateDetails class="grid-details" :person="discoverStore.currentCandidate" @more="openSafety" />
        <div class="deck-actions grid-actions">
          <button type="button" class="act act-undo" aria-label="Undo" @click="comingSoon('Rewind')">
            <i class="ri-arrow-go-back-line" aria-hidden="true"></i>
          </button>
          <button type="button" class="act act-pass" aria-label="Pass" @click="stack?.fling('left')">
            <i class="ri-close-line" aria-hidden="true"></i>
          </button>
          <button type="button" class="act act-like" aria-label="Like" @click="stack?.fling('right')">
            <i class="ri-heart-3-fill" aria-hidden="true"></i>
          </button>
          <button type="button" class="act act-star" aria-label="Super like" @click="comingSoon('Super Like')">
            <i class="ri-star-fill" aria-hidden="true"></i>
          </button>
          <button type="button" class="act act-send" aria-label="Send a message" @click="comingSoon('Messaging before you match')">
            <i class="ri-send-plane-fill" aria-hidden="true"></i>
          </button>
        </div>
      </div>

      <!-- Error -->
      <UEmptyState v-else-if="discoverStore.error" title="Couldn't load people" :description="discoverStore.error">
        <template #icon><i class="ri-wifi-off-line fs-2"></i></template>
        <template #action>
          <UButton variant="primary" size="md" @click="discoverStore.loadFeed">
            <i class="ri-refresh-line me-2"></i> Try again
          </UButton>
        </template>
      </UEmptyState>

      <!-- No search results -->
      <UEmptyState
        v-else-if="discoverStore.search"
        :title="`No one matches “${discoverStore.search}”`"
        :description="discoverStore.activeFilterCount ? 'Try another word, or clear your filters to search everyone.' : 'Try another word, like an interest, a job or a college.'"
      >
        <template #icon><i class="ri-search-eye-line fs-2"></i></template>
        <template #action>
          <UButton v-if="discoverStore.activeFilterCount" variant="secondary" size="md" @click="discoverStore.clearFilters">Clear filters</UButton>
          <UButton variant="primary" size="md" @click="clearSearch">Clear search</UButton>
        </template>
      </UEmptyState>

      <!-- No filter results -->
      <UEmptyState
        v-else-if="discoverStore.activeFilterCount"
        title="No one matches these filters"
        description="Try a wider distance or area, or clear some filters to see more people."
      >
        <template #icon><i class="ri-filter-off-line fs-2"></i></template>
        <template #action>
          <UButton variant="secondary" size="md" @click="$router.push('/discover/filters')">Adjust filters</UButton>
          <UButton variant="primary" size="md" @click="discoverStore.clearFilters">Clear all</UButton>
        </template>
      </UEmptyState>

      <!-- All caught up -->
      <UEmptyState
        v-else
        title="You're all caught up!"
        description="You've seen everyone for now. Check back soon, or add more interests."
      >
        <template #icon><i class="ri-sparkling-fill fs-2"></i></template>
        <template #action>
          <UButton variant="secondary" size="md" @click="discoverStore.loadFeed">
            <i class="ri-refresh-line me-2"></i> Refresh
          </UButton>
          <UButton variant="primary" size="md" @click="$router.push('/profile')">Edit interests</UButton>
        </template>
      </UEmptyState>
    </div>

    <SafetyModal
      v-if="safetyTarget"
      :is-open="isSafetyOpen"
      :target-user-id="safetyTarget.id"
      :target-name="safetyTarget.displayName"
      @close="isSafetyOpen = false"
      @action-completed="onSafetyActionCompleted"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, onMounted } from 'vue';
import DiscoverStack from '../components/discovery/DiscoverStack.vue';
import ScreenBar from '../components/layout/ScreenBar.vue';
import NotificationBell from '../components/layout/NotificationBell.vue';
import CandidateDetails from '../components/discovery/CandidateDetails.vue';
import SafetyModal from '../components/safety/SafetyModal.vue';
import USkeleton from '../components/ui/USkeleton.vue';
import UEmptyState from '../components/ui/UEmptyState.vue';
import UButton from '../components/ui/UButton.vue';
import { useDiscoverStore } from '../stores/discover';
import { EDUCATION_LEVELS, PROFESSION_FIELDS, comingSoon } from '../utils/profileFormat';
import { useRouter } from 'vue-router';

const discoverStore = useDiscoverStore();
const router = useRouter();

function openProfile() {
  if (discoverStore.currentCandidate) router.push(`/people/${discoverStore.currentCandidate.id}`);
}

const SORT_TABS = [
  { value: 'distance', label: 'Nearby', icon: 'ri-map-pin-2-fill' },
  { value: 'recommended', label: 'Recommended', icon: 'ri-star-line' },
  { value: 'interests', label: 'Interests', icon: 'ri-sparkling-2-fill' },
  { value: 'online', label: 'Online', icon: 'ri-checkbox-blank-circle-fill' },
] as const;

type ChipKey = 'radius' | 'place' | 'college' | 'age' | 'lookingFor' | 'showMe' | 'interests' | 'educationLevel' | 'professionField';

const activeChips = computed(() => {
  const f = discoverStore.filters;
  const chips: { key: ChipKey; label: string }[] = [];
  if (f.radiusKm !== null) chips.push({ key: 'radius', label: `Within ${f.radiusKm} km` });
  if (f.place) chips.push({ key: 'place', label: f.place.name });
  if (f.sameInstitution) chips.push({ key: 'college', label: 'My college' });
  else if (f.institution) chips.push({ key: 'college', label: f.institution.shortName || f.institution.name });
  if (f.minAge !== null || f.maxAge !== null) {
    const label =
      f.minAge !== null && f.maxAge !== null
        ? `Age ${f.minAge}–${f.maxAge}`
        : f.minAge !== null
          ? `Age ${f.minAge}+`
          : `Age up to ${f.maxAge}`;
    chips.push({ key: 'age', label });
  }
  if (f.educationLevel) chips.push({ key: 'educationLevel', label: EDUCATION_LEVELS.find((l) => l.value === f.educationLevel)?.label ?? '' });
  if (f.professionField) chips.push({ key: 'professionField', label: PROFESSION_FIELDS.find((l) => l.value === f.professionField)?.label ?? '' });
  if (f.lookingFor) chips.push({ key: 'lookingFor', label: f.lookingFor });
  if (f.showMe) chips.push({ key: 'showMe', label: f.showMe === 'women' ? 'Women' : 'Men' });
  if (f.interests.length) {
    const names = f.interests.map((i) => i.name);
    chips.push({ key: 'interests', label: names.length > 2 ? `${names.slice(0, 2).join(', ')} +${names.length - 2}` : names.join(', ') });
  }
  return chips;
});

const filterButtonLabel = computed(() =>
  discoverStore.activeFilterCount ? `Filters, ${discoverStore.activeFilterCount} active` : 'Filters'
);

function removeFilter(key: ChipKey) {
  const next = { ...discoverStore.filters };
  if (key === 'radius') next.radiusKm = null;
  if (key === 'place') next.place = null;
  if (key === 'college') { next.sameInstitution = false; next.institution = null; }
  if (key === 'age') { next.minAge = null; next.maxAge = null; }
  if (key === 'lookingFor') next.lookingFor = null;
  if (key === 'educationLevel') next.educationLevel = null;
  if (key === 'professionField') next.professionField = null;
  if (key === 'showMe') next.showMe = null;
  if (key === 'interests') next.interests = [];
  discoverStore.setFilters(next);
}

const SEARCH_DEBOUNCE_MS = 400;

// Opens with the last search still applied (the store keeps it until cleared).
const searchOpen = ref(Boolean(discoverStore.search));
const searchText = ref(discoverStore.search);
const searchInput = ref<HTMLInputElement | null>(null);
let searchTimer: ReturnType<typeof setTimeout> | undefined;

async function toggleSearch() {
  if (searchOpen.value) {
    closeSearch();
    return;
  }
  searchOpen.value = true;
  await nextTick();
  searchInput.value?.focus();
}

function scheduleSearch() {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(applySearch, SEARCH_DEBOUNCE_MS);
}

function applySearch() {
  clearTimeout(searchTimer);
  discoverStore.setSearch(searchText.value);
}

function clearSearch() {
  searchText.value = '';
  applySearch();
  searchInput.value?.focus();
}

/** Closing the bar drops the search, so the deck is never narrowed by something out of sight. */
function closeSearch() {
  searchOpen.value = false;
  searchText.value = '';
  applySearch();
}

onBeforeUnmount(() => clearTimeout(searchTimer));

const isSafetyOpen = ref(false);
const safetyTarget = ref<{ id: string; displayName: string } | null>(null);

onMounted(() => discoverStore.loadFeed());

const stack = ref<InstanceType<typeof DiscoverStack> | null>(null);
const behind = computed(() =>
  discoverStore.feed.slice(discoverStore.currentIndex + 1, discoverStore.currentIndex + 3)
);

function handleLike() { discoverStore.likeCurrent(); }
function handlePass() { discoverStore.passCurrent(); }

function openSafety() {
  if (discoverStore.currentCandidate) {
    safetyTarget.value = { id: discoverStore.currentCandidate.id, displayName: discoverStore.currentCandidate.displayName };
    isSafetyOpen.value = true;
  }
}

function onSafetyActionCompleted() { discoverStore.currentIndex++; }
</script>

<style scoped lang="scss">
.search-bar {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0 0.5rem 0 1.1rem;
  min-height: 3.2rem;
  border-radius: var(--unmute-radius-pill);
  background: var(--unmute-surface);
  box-shadow: 0 6px 18px -14px rgba(117, 48, 170, 0.5);
  border: 1.5px solid transparent;

  &:focus-within {
    border-color: var(--unmute-cta);
  }
}

.search-icon {
  font-size: 1.25rem;
  color: var(--unmute-text-secondary);
}

.search-input {
  flex: 1;
  min-width: 0;
  height: 3rem;
  border: 0;
  outline: none;
  background: transparent;
  color: var(--unmute-text-primary);
  font-size: 1rem;

  &::placeholder {
    color: var(--unmute-text-muted);
  }

  // The bar has its own clear button.
  &::-webkit-search-cancel-button {
    display: none;
  }
}

.search-clear {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2.4rem;
  height: 2.4rem;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--unmute-text-muted);
  font-size: 1.3rem;
}

.sort-tabs {
  display: flex;
  gap: 0.25rem;
  padding: 0.25rem;
  overflow-x: auto;
  scrollbar-width: none;
  border-radius: var(--unmute-radius-pill);
  background: rgba(255, 255, 255, 0.75);
  box-shadow: 0 6px 18px -14px rgba(117, 48, 170, 0.5);

  button {
    flex: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.35rem;
    min-height: 2.8rem;
    padding: 0 0.8rem;
    border: 0;
    border-radius: var(--unmute-radius-pill);
    background: transparent;
    color: #2a2a8a;
    font-size: 0.95rem;
    font-weight: 500;
    white-space: nowrap;

    i {
      color: #7b3fe4;
    }

    &:last-child i {
      color: #1fc75b;
      font-size: 0.8rem;
    }
  }

  button[aria-pressed='true'] {
    background: linear-gradient(95deg, #ff3d8b 0%, #e0149a 50%, #8a1fe0 100%);
    color: #fff;

    i {
      color: #fff !important;
    }
  }

  // Phones: all four tabs fit; icons give way except Online's green dot.
  @media (max-width: 575.98px) {
    button {
      flex: 1 1 auto;
      min-width: 0;
      padding: 0 0.5rem;
      font-size: 0.82rem;
    }

    button:not(:last-child) i {
      display: none;
    }
  }
}

.filter-dot {
  position: absolute;
  top: -0.2rem;
  right: -0.2rem;
  min-width: 1.2rem;
  height: 1.2rem;
  padding: 0 0.25rem;
  border-radius: 9999px;
  background: #f21872;
  color: #fff;
  font-size: 0.65rem;
  font-weight: 700;
  line-height: 1.2rem;
  text-align: center;
  box-shadow: 0 0 0 2px #fff;
}

.chip-removable {
  cursor: pointer;
}

// Phones: card, then About/Interests, then the buttons. Web: buttons under the card, details beside.
.discover-grid {
  display: grid;
  gap: 1rem;
  grid-template-areas: 'card' 'details' 'actions';
  align-items: start;

  @media (min-width: 992px) {
    grid-template-columns: minmax(20rem, 28rem) minmax(18rem, 1fr);
    grid-template-areas: 'card details' 'actions details';
    column-gap: 2rem;
  }
}

.grid-card { grid-area: card; }
.grid-details { grid-area: details; }
.grid-actions { grid-area: actions; }

.deck-skeleton {
  width: 100%;
  max-width: 30rem;
  margin: 0 auto;
  border-radius: 1.8rem;
}

.deck-actions {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: clamp(0.5rem, 3vw, 1rem);
  padding-bottom: 0.5rem;
}

.act {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 3.9rem;
  height: 3.9rem;
  border: 0;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 10px 24px -12px rgba(117, 48, 170, 0.45);
  font-size: 1.9rem;
  transition: transform var(--unmute-transition-bounce);

  &:hover { transform: translateY(-3px); }
  &:active { transform: scale(0.93); }

  @media (max-width: 379.98px) {
    width: 3.3rem;
    height: 3.3rem;
    font-size: 1.6rem;
  }
}

.act-undo { color: #8a3fe4; }
.act-pass { color: #f0364a; }
.act-star { color: #8a1fe0; }
.act-send { color: #7b3fe4; }

.act-like {
  width: 5.2rem;
  height: 5.2rem;
  color: #fff;
  font-size: 2.4rem;
  background: linear-gradient(135deg, #ff4f8e 0%, #f21872 55%, #d00a8a 100%);
  box-shadow: 0 14px 30px -12px rgba(242, 24, 114, 0.7);

  @media (max-width: 379.98px) {
    width: 4.4rem;
    height: 4.4rem;
  }
}
</style>
