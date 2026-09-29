<template>
  <div class="home">
    <ScreenBar>
      <template #actions>
        <NotificationBell />
        <button
          type="button"
          class="round-btn"
          :class="{ 'is-tinted': searchOpen }"
          :aria-label="searchOpen ? 'Close search' : 'Search'"
          :aria-expanded="searchOpen"
          aria-controls="home-search"
          @click="toggleSearch"
        >
          <i :class="searchOpen ? 'ri-close-line' : 'ri-search-line'" aria-hidden="true"></i>
        </button>
        <router-link to="/discover/filters" class="round-btn is-accent" :aria-label="filterLabel">
          <i class="ri-equalizer-2-line" aria-hidden="true"></i>
          <span v-if="store.activeFilterCount" class="filter-dot" aria-hidden="true">{{ store.activeFilterCount }}</span>
        </router-link>
      </template>
    </ScreenBar>

    <form v-if="searchOpen" id="home-search" class="search-bar" role="search" @submit.prevent="applySearch">
      <i class="ri-search-line" aria-hidden="true"></i>
      <input
        ref="searchInput"
        v-model="searchText"
        type="search"
        placeholder="Search name, work, interests, college…"
        aria-label="Search people"
        maxlength="60"
        enterkeyhint="search"
        autocomplete="off"
        @input="scheduleSearch"
        @keydown.esc="toggleSearch"
      />
    </form>

    <!-- Hero -->
    <section class="hero">
      <div class="hero-text">
        <h1 class="hero-title">Find<br />Real Connections</h1>
        <p class="hero-sub">Meaningful people. Genuine conversations.<br />Your story, without filters.</p>
        <button type="button" class="upgrade-btn" @click="$router.push('/upgrade')">
          <i class="ri-vip-crown-2-fill" aria-hidden="true"></i> Upgrade
        </button>
      </div>
      <img :src="heroPhoto" alt="" class="hero-photo" aria-hidden="true" />
      <i class="ri-heart-3-line hero-heart hero-heart-1" aria-hidden="true"></i>
      <i class="ri-heart-3-line hero-heart hero-heart-2" aria-hidden="true"></i>
    </section>

    <!-- Order of everyone below -->
    <div class="sort-tiles" role="group" aria-label="Order people by">
      <button
        v-for="tile in SORTS"
        :key="tile.value"
        type="button"
        class="sort-tile"
        :aria-pressed="store.sort === tile.value"
        @click="store.setSort(tile.value)"
      >
        <i :class="tile.icon" aria-hidden="true"></i>{{ tile.label }}
      </button>
    </div>

    <div v-if="store.loading && !store.feed.length" class="loading" aria-busy="true">
      <div class="rail">
        <USkeleton v-for="n in 3" :key="n" type="custom" class="rail-skeleton" />
      </div>
    </div>

    <UEmptyState v-else-if="store.error" title="Couldn't load people" :description="store.error">
      <template #icon><i class="ri-wifi-off-line fs-2"></i></template>
      <template #action>
        <UButton variant="primary" size="md" @click="store.loadFeed">Try again</UButton>
      </template>
    </UEmptyState>

    <UEmptyState
      v-else-if="!store.feed.length"
      :title="store.search ? `No one matches “${store.search}”` : 'You’re all caught up!'"
      :description="store.activeFilterCount ? 'Try wider filters to see more people.' : 'Check back soon, or add more interests to your profile.'"
    >
      <template #icon><i class="ri-sparkling-fill fs-2"></i></template>
      <template #action>
        <UButton v-if="store.activeFilterCount" variant="secondary" size="md" @click="store.clearFilters">Clear filters</UButton>
        <UButton variant="primary" size="md" @click="store.loadFeed">Refresh</UButton>
      </template>
    </UEmptyState>

    <template v-else>
      <!-- Best matches, side by side -->
      <section class="section" aria-labelledby="for-you">
        <div class="section-head">
          <h2 id="for-you">Matches for You</h2>
          <router-link to="/discover/swipe" class="see-all">See All <i class="ri-arrow-right-s-line" aria-hidden="true"></i></router-link>
        </div>
        <div class="rail">
          <router-link v-for="(p, i) in forYou" :key="p.id" :to="`/people/${p.id}`" class="rail-card enter-rise" :style="{ '--i': i }">
            <span class="rail-photo" :style="photoBackground(p.avatarUrl)">
              <span v-if="!p.avatarUrl" class="initial">{{ p.displayName.charAt(0) }}</span>
              <span v-if="p.isOnline" class="dot" aria-label="Online"></span>
              <span v-if="matchOf(p) !== null" class="pct"><i class="ri-heart-3-fill" aria-hidden="true"></i>{{ matchOf(p) }}%</span>
            </span>
            <span class="card-body">
              <span class="card-name">{{ p.displayName }}, {{ p.age }}<i v-if="p.isVerified" class="ri-verified-badge-fill verified-badge" aria-label="Verified"></i></span>
              <span v-if="p.profession" class="card-line"><i class="ri-briefcase-4-fill" aria-hidden="true"></i>{{ p.profession }}</span>
              <span v-if="where(p)" class="card-line"><i class="ri-map-pin-2-fill" aria-hidden="true"></i>{{ where(p) }}</span>
            </span>
          </router-link>
        </div>
      </section>

      <!-- Everyone -->
      <section class="section" aria-labelledby="people">
        <h2 id="people" class="mb-2">Discover People</h2>
        <div class="people-bar">
          <div class="tabs" role="group" aria-label="Show">
            <button v-for="tab in TABS" :key="tab.value" type="button" :aria-pressed="view === tab.value" @click="view = tab.value">
              {{ tab.label }}
            </button>
          </div>
          <label class="sort-btn">
            <i class="ri-arrow-up-down-line" aria-hidden="true"></i> Sort
            <select :value="store.sort" aria-label="Sort people" @change="store.setSort(($event.target as HTMLSelectElement).value as SortValue)">
              <option v-for="s in SORTS" :key="s.value" :value="s.value">{{ s.label }}</option>
            </select>
          </label>
        </div>

        <p v-if="!people.length" class="none">{{ TAB_EMPTY[view] }}</p>
        <div class="grid">
          <article v-for="(p, i) in people" :key="p.id" class="person enter-rise" :style="{ '--i': i }">
            <router-link :to="`/people/${p.id}`" class="person-link" :aria-label="`${p.displayName}, ${p.age}`">
              <span class="person-photo" :style="photoBackground(p.avatarUrl)">
                <span v-if="!p.avatarUrl" class="initial">{{ p.displayName.charAt(0) }}</span>
              </span>
              <span class="card-body">
                <span class="card-name">{{ p.displayName }}, {{ p.age }}<i v-if="p.isVerified" class="ri-verified-badge-fill verified-badge" aria-label="Verified"></i></span>
                <span v-if="p.profession" class="card-line"><i class="ri-briefcase-4-fill" aria-hidden="true"></i>{{ p.profession }}</span>
                <span v-if="where(p)" class="card-line"><i class="ri-map-pin-2-fill" aria-hidden="true"></i>{{ where(p) }}</span>
                <span v-if="p.isOnline" class="status is-online"><span></span>Online now</span>
                <span v-else-if="isNew(p)" class="status"><span></span>New here</span>
              </span>
            </router-link>
            <button type="button" class="like-btn" :aria-label="`Like ${p.displayName}`" @click="like(p)">
              <i class="ri-heart-3-line" aria-hidden="true"></i>
            </button>
          </article>
        </div>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import ScreenBar from '../components/layout/ScreenBar.vue';
import NotificationBell from '../components/layout/NotificationBell.vue';
import UEmptyState from '../components/ui/UEmptyState.vue';
import UButton from '../components/ui/UButton.vue';
import USkeleton from '../components/ui/USkeleton.vue';
import { useDiscoverStore } from '../stores/discover';
import { useAuthStore } from '../stores/auth';
import { useToastStore } from '../stores/toast';
import { photoBackground } from '../services/media';
import { formatDistance } from '../services/directory';
import { matchPercent } from '../utils/profileFormat';
import { DiscoveryCandidate } from '../types';
import heroPhoto from '../assets/welcome-couple.webp';

type SortValue = 'distance' | 'recommended' | 'new' | 'online';
type View = 'all' | 'nearby' | 'online' | 'new';

const SORTS: { value: SortValue; label: string; icon: string }[] = [
  { value: 'distance', label: 'Nearby', icon: 'ri-flashlight-fill' },
  { value: 'recommended', label: 'Recommended', icon: 'ri-star-line' },
  { value: 'new', label: 'New', icon: 'ri-sparkling-2-fill' },
  { value: 'online', label: 'Online', icon: 'ri-group-line' },
];
const TABS: { value: View; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'nearby', label: 'Nearby' },
  { value: 'online', label: 'Online' },
  { value: 'new', label: 'New' },
];
const TAB_EMPTY: Record<View, string> = {
  all: 'No one else to show right now.',
  nearby: 'No one within 25 km yet. Set your area in your profile to see who is close.',
  online: 'No one is online right now.',
  new: 'No one new this fortnight.',
};
const NEARBY_KM = 25;
const NEW_DAYS = 14;
const FOR_YOU = 8;

const store = useDiscoverStore();
const authStore = useAuthStore();
const view = ref<View>('all');

onMounted(() => store.loadFeed());

const myInterestCount = computed(() => authStore.profile?.interests.length ?? 0);
function matchOf(p: DiscoveryCandidate) {
  return matchPercent(p.commonInterestsCount, myInterestCount.value, p.interests.length);
}
function where(p: DiscoveryCandidate) {
  return formatDistance(p.distanceKm) ? `${p.distanceKm} km away` : p.approximateLocation;
}
function isNew(p: DiscoveryCandidate) {
  return Boolean(p.joinedOn) && Date.now() - new Date(p.joinedOn!).getTime() < NEW_DAYS * 86_400_000;
}

/** Highest match first; people with no shared interests only fill the row when needed. */
const forYou = computed(() =>
  [...store.feed].sort((a, b) => (matchOf(b) ?? -1) - (matchOf(a) ?? -1)).slice(0, FOR_YOU)
);

const people = computed(() => {
  const all = store.feed;
  if (view.value === 'nearby') return all.filter((p) => p.distanceKm !== null && p.distanceKm <= NEARBY_KM);
  if (view.value === 'online') return all.filter((p) => p.isOnline);
  if (view.value === 'new') return all.filter(isNew);
  return all;
});

function like(p: DiscoveryCandidate) {
  store.like(p);
  useToastStore().show(`You liked ${p.displayName}.`);
}

const filterLabel = computed(() => (store.activeFilterCount ? `Filters, ${store.activeFilterCount} active` : 'Filters'));

// ---- Search: narrows everyone by name, work, bio, interests, college or area ----
const searchOpen = ref(Boolean(store.search));
const searchText = ref(store.search);
const searchInput = ref<HTMLInputElement | null>(null);
let searchTimer: ReturnType<typeof setTimeout> | undefined;

async function toggleSearch() {
  if (searchOpen.value) {
    // Closing drops the search, so the list is never narrowed by something out of sight.
    searchOpen.value = false;
    searchText.value = '';
    applySearch();
    return;
  }
  searchOpen.value = true;
  await nextTick();
  searchInput.value?.focus();
}

function scheduleSearch() {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(applySearch, 400);
}

function applySearch() {
  clearTimeout(searchTimer);
  store.setSearch(searchText.value);
}

onBeforeUnmount(() => clearTimeout(searchTimer));
</script>

<style scoped lang="scss">
$ink: var(--unmute-text-heading);
$soft: var(--unmute-text-secondary);
$gradient: linear-gradient(100deg, #ff4f8e 0%, #f21872 45%, #c00078 100%);

.home {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 1.1rem;
}

.filter-dot {
  position: absolute;
  top: -0.2rem;
  right: -0.2rem;
  min-width: 1.2rem;
  height: 1.2rem;
  padding: 0 0.25rem;
  border-radius: 9999px;
  background: var(--unmute-cta);
  color: #fff;
  font-size: 0.65rem;
  font-weight: 700;
  line-height: 1.2rem;
  text-align: center;
  box-shadow: 0 0 0 2px var(--unmute-surface);
}

.search-bar {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  min-height: 3.2rem;
  padding: 0 1.1rem;
  border: 1.5px solid transparent;
  border-radius: var(--unmute-radius-pill);
  background: var(--unmute-surface);
  box-shadow: var(--unmute-shadow-sm);
  color: $soft;

  &:focus-within {
    border-color: var(--unmute-cta);
  }

  input {
    flex: 1;
    min-width: 0;
    border: 0;
    outline: none;
    background: transparent;
    color: var(--unmute-text-primary);
    font-size: 1rem;
  }
}

// ---- Hero ----
.hero {
  position: relative;
  min-height: 11.5rem;
  overflow: hidden;
  border-radius: 1.6rem;
  background: linear-gradient(115deg, #6c2bd9 0%, #a52fd6 45%, #e0449f 100%);
  color: #fff;
  box-shadow: 0 18px 36px -20px rgba(108, 43, 217, 0.7);
}

.hero-text {
  position: relative;
  z-index: 2;
  width: 62%;
  padding: 1.2rem 0 1.2rem 1.25rem;
}

.hero-title {
  margin: 0 0 0.4rem;
  color: #fff;
  font-size: clamp(1.35rem, 6vw, 1.75rem);
  font-weight: 800;
  line-height: 1.1;
}

.hero-sub {
  margin: 0 0 0.9rem;
  font-size: 0.78rem;
  line-height: 1.4;
  opacity: 0.92;
}

.upgrade-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.5rem 1.1rem;
  border: 0;
  border-radius: var(--unmute-radius-pill);
  background: #fff;
  color: #2a1470;
  font-weight: 700;
  font-size: 0.9rem;

  i {
    color: #9b2de0;
    font-size: 1.1rem;
  }
}

.hero-photo {
  position: absolute;
  top: 0;
  right: 0;
  width: 55%;
  max-width: 26rem;
  height: 100%;
  object-fit: cover;
  object-position: 60% 78%;
  -webkit-mask-image: linear-gradient(to right, transparent 0%, #000 45%);
  mask-image: linear-gradient(to right, transparent 0%, #000 45%);
}

.hero-heart {
  position: absolute;
  z-index: 2;
  color: #fff;

  &-1 { top: 1.4rem; right: 1.2rem; font-size: 1.5rem; }
  &-2 { bottom: 2rem; right: 2.8rem; font-size: 2rem; opacity: 0.9; }
}

// ---- Sort tiles ----
.sort-tiles {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.45rem;
}

.sort-tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.3rem;
  min-width: 0;
  padding: 0.75rem 0.2rem;
  border: 0;
  border-radius: 1.1rem;
  background: var(--unmute-surface);
  box-shadow: var(--unmute-shadow-sm);
  color: $ink;
  font-size: clamp(0.66rem, 2.85vw, 0.85rem);
  font-weight: 600;
  letter-spacing: -0.01em;
  white-space: nowrap;

  i {
    font-size: 1.5rem;
    color: #5a2bd9;
  }

  &[aria-pressed='true'] {
    background: $gradient;
    color: #fff;
    box-shadow: 0 12px 24px -12px rgba(242, 24, 114, 0.7);

    i { color: #fff; }
  }
}

// ---- Sections ----
.section h2 {
  font-size: 1.3rem;
  font-weight: 800;
  color: $ink;
}

.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.7rem;

  h2 { margin: 0; }
}

.see-all {
  display: inline-flex;
  align-items: center;
  color: var(--unmute-cta);
  font-weight: 600;
  text-decoration: none;
}

// Horizontal row that scrolls, running to the screen edge on phones.
.rail {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: 9.5rem;
  gap: 0.75rem;
  margin-inline: -1rem;
  padding: 0.2rem 1rem 0.8rem;
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  scroll-padding-inline: 1rem;
  scrollbar-width: none;

  @media (min-width: 768px) {
    margin-inline: 0;
    padding-inline: 0;
    grid-auto-columns: 11rem;
  }
}

.rail-skeleton {
  height: 14rem;
  border-radius: 1.2rem;
}

.rail-card,
.person {
  overflow: hidden;
  border-radius: 1.2rem;
  background: var(--unmute-surface);
  box-shadow: 0 10px 24px -18px rgba(117, 48, 170, 0.55);
  color: inherit;
  text-decoration: none;
}

.rail-card {
  scroll-snap-align: start;
}

.rail-photo,
.person-photo {
  position: relative;
  display: grid;
  place-items: center;
  background: linear-gradient(150deg, #ff9aa8 0%, #c00078 60%, #4a005b 100%) center 25% / cover;
}

.rail-photo {
  aspect-ratio: 0.95;
}

.person-photo {
  aspect-ratio: 1.05;
}

.initial {
  font-size: 2.6rem;
  font-weight: 800;
  color: rgba(255, 255, 255, 0.85);
}

.dot {
  position: absolute;
  top: 0.55rem;
  left: 0.55rem;
  width: 0.75rem;
  height: 0.75rem;
  border-radius: 50%;
  background: #1fc75b;
  box-shadow: 0 0 0 2px #fff;
}

.pct {
  position: absolute;
  right: 0.45rem;
  bottom: 0.45rem;
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
  padding: 0.15rem 0.5rem;
  border-radius: var(--unmute-radius-pill);
  background: #fff;
  color: $ink;
  font-size: 0.75rem;
  font-weight: 700;

  i { color: var(--unmute-cta); }
}

.card-body {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  min-width: 0;
  padding: 0.55rem 0.65rem 0.7rem;
}

.card-name {
  overflow: hidden;
  color: $ink;
  font-size: 0.98rem;
  font-weight: 800;
  white-space: nowrap;
  text-overflow: ellipsis;

  .verified-badge {
    margin-left: 0.25rem;
  }
}

.card-line {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  overflow: hidden;
  color: $soft;
  font-size: 0.76rem;
  white-space: nowrap;
  text-overflow: ellipsis;

  i {
    flex-shrink: 0;
    color: #5a2bd9;
  }
}

// ---- Discover People ----
.people-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 0.8rem;
}

.tabs {
  display: flex;
  gap: 0.2rem;
  min-width: 0;
  overflow-x: auto;
  scrollbar-width: none;

  button {
    position: relative;
    padding: 0.35rem 0.75rem 0.55rem;
    border: 0;
    background: transparent;
    color: $soft;
    font-size: 0.95rem;
    white-space: nowrap;

    &[aria-pressed='true'] {
      color: var(--unmute-cta);
      font-weight: 700;

      &::after {
        content: '';
        position: absolute;
        left: 50%;
        bottom: 0;
        width: 1.6rem;
        height: 3px;
        border-radius: 3px;
        background: var(--unmute-cta);
        transform: translateX(-50%);
      }
    }
  }
}

// A native select laid invisibly over the label, so the phone's own picker opens.
.sort-btn {
  position: relative;
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  gap: 0.3rem;
  color: $ink;
  font-weight: 600;
  cursor: pointer;

  select {
    position: absolute;
    inset: 0;
    opacity: 0;
    cursor: pointer;
  }
}

.none {
  color: $soft;
  font-size: 0.9rem;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(9.5rem, calc(33.33% - 0.5rem)), 1fr));
  gap: 0.75rem 0.6rem;
}

.person {
  position: relative;
}

.person-link {
  display: block;
  color: inherit;
  text-decoration: none;
}

.like-btn {
  position: absolute;
  top: 0.45rem;
  right: 0.45rem;
  display: grid;
  place-items: center;
  width: 2rem;
  height: 2rem;
  border: 0;
  border-radius: 50%;
  background: #fff;
  color: #9b2de0;
  font-size: 1.1rem;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.12);

  &:active {
    transform: scale(0.9);
  }
}

.status {
  display: inline-flex;
  align-self: flex-start;
  align-items: center;
  gap: 0.3rem;
  margin-top: 0.25rem;
  padding: 0.1rem 0.5rem;
  border-radius: var(--unmute-radius-pill);
  background: var(--unmute-surface-overlay);
  color: $soft;
  font-size: 0.68rem;

  span {
    width: 0.45rem;
    height: 0.45rem;
    border-radius: 50%;
    background: #5a2bd9;
  }

  &.is-online {
    background: #e3f8ea;
    color: #137a3a;

    span { background: #1fc75b; }
  }
}
</style>
