<template>
  <div class="filters-page">
    <ScreenBar back="/discover">
      <template #actions>
        <button type="button" class="reset-btn" @click="reset">Reset</button>
      </template>
    </ScreenBar>

    <h1 class="page-title">Filters</h1>
    <p class="page-sub">Find people who match your vibe</p>

    <form id="filters-form" class="d-flex flex-column gap-3" @submit.prevent="apply">
      <!-- Looking for -->
      <fieldset class="f-card">
        <legend class="f-head"><i class="ri-heart-3-line" aria-hidden="true"></i><span>Looking for</span></legend>
        <div class="tiles">
          <button
            v-for="option in LOOKING_FOR"
            :key="option.label"
            type="button"
            class="tile"
            :aria-pressed="draft.lookingFor === option.value"
            @click="draft.lookingFor = option.value"
          >
            <i :class="option.icon" aria-hidden="true"></i>{{ option.label }}
          </button>
        </div>
      </fieldset>

      <!-- Age -->
      <fieldset class="f-card">
        <legend class="f-head">
          <i class="ri-calendar-2-line" aria-hidden="true"></i><span>Age Range</span>
          <span class="f-value">{{ ageLabel }}</span>
        </legend>
        <div class="dual-range" :style="ageTrackStyle">
          <input v-model.number="ageLow" type="range" :min="AGE_MIN" :max="AGE_MAX" aria-label="Youngest age" @input="keepAgeOrder('low')" />
          <input v-model.number="ageHigh" type="range" :min="AGE_MIN" :max="AGE_MAX" aria-label="Oldest age" :aria-valuetext="ageHigh === AGE_MAX ? `${AGE_MAX} or older` : `${ageHigh}`" @input="keepAgeOrder('high')" />
        </div>
        <div class="ends"><span>{{ AGE_MIN }}</span><span>{{ AGE_MAX }}+</span></div>
      </fieldset>

      <!-- Distance -->
      <fieldset class="f-card">
        <legend class="f-head">
          <i class="ri-map-pin-line" aria-hidden="true"></i><span>Distance</span>
          <span class="f-value">{{ draft.radiusKm === null ? 'Anywhere' : `Within ${draft.radiusKm} km` }}</span>
        </legend>
        <input
          v-model.number="radiusIndex"
          class="single-range"
          type="range"
          min="0"
          :max="DISTANCE_STOPS.length - 1"
          :style="{ '--fill': `${(radiusIndex / (DISTANCE_STOPS.length - 1)) * 100}%` }"
          :disabled="!hasLocation"
          aria-label="Maximum distance"
          :aria-valuetext="draft.radiusKm === null ? 'Anywhere' : `${draft.radiusKm} kilometres`"
        />
        <div class="ends"><span>{{ DISTANCE_STOPS[0] }} km</span><span>Anywhere</span></div>
        <p v-if="!hasLocation" class="f-hint">
          <router-link to="/profile/location">Set your area</router-link> to filter by distance.
        </p>
      </fieldset>

      <!-- Gender -->
      <fieldset class="f-card">
        <legend class="f-head"><i class="ri-user-3-line" aria-hidden="true"></i><span>Gender</span></legend>
        <div class="row-3">
          <button
            v-for="option in SHOW_ME"
            :key="option.label"
            type="button"
            class="opt"
            :aria-pressed="draft.showMe === option.value"
            @click="draft.showMe = option.value"
          >
            <i :class="option.icon" aria-hidden="true"></i>{{ option.label }}
          </button>
        </div>
      </fieldset>

      <!-- Interests -->
      <fieldset class="f-card">
        <legend class="f-head">
          <i class="ri-star-line" aria-hidden="true"></i><span>Interest Preferences</span>
          <button v-if="allInterests.length > INTERESTS_SHOWN" type="button" class="f-link" @click="showAllInterests = !showAllInterests">
            {{ showAllInterests ? 'Fewer' : 'All' }}
          </button>
        </legend>
        <div class="grid-4">
          <button
            v-for="interest in shownInterests"
            :key="interest.id"
            type="button"
            class="opt is-small"
            :aria-pressed="isPicked(interest.id)"
            @click="toggleInterest(interest)"
          >
            <i :class="interestIcon(interest.name)" aria-hidden="true"></i><span>{{ interest.name }}</span>
          </button>
        </div>
      </fieldset>

      <!-- Background: free for everyone, as on most Indian dating apps -->
      <fieldset class="f-card">
        <legend class="f-head"><i class="ri-earth-line" aria-hidden="true"></i><span>Background</span></legend>
        <div class="row-2">
          <label v-for="item in BACKGROUND" :key="item.key" class="pick">
            <i :class="item.icon" aria-hidden="true"></i>
            <span class="pick-text"><small>{{ item.label }}</small><span>{{ labelOf(item.options, draft[item.key]) }}</span></span>
            <i class="ri-arrow-down-s-line pick-chev" aria-hidden="true"></i>
            <select v-model="draft[item.key]" :aria-label="item.label">
              <option :value="null">Any</option>
              <option v-for="o in item.options" :key="o.value" :value="o.value">{{ o.label }}</option>
            </select>
          </label>
        </div>
      </fieldset>

      <!-- Lifestyle -->
      <!-- Premium filters: locked (tap to upgrade) for free members -->
      <fieldset class="f-card" :class="{ 'is-locked': !premium.isPremium }" :disabled="!premium.isPremium">
        <router-link v-if="!premium.isPremium" to="/upgrade" class="lock-cover" aria-label="Premium filter. Upgrade to use it">
          <span><i class="ri-vip-crown-2-fill" aria-hidden="true"></i>Premium</span>
        </router-link>
        <legend class="f-head"><i class="ri-cup-line" aria-hidden="true"></i><span>Lifestyle</span></legend>
        <div class="row-3">
          <label v-for="item in LIFESTYLE" :key="item.key" class="pick">
            <i :class="item.icon" aria-hidden="true"></i>
            <span class="pick-text">
              <small>{{ item.label }}</small>
              <span>{{ lifestyleLabel(item.key) }}</span>
            </span>
            <i class="ri-arrow-down-s-line pick-chev" aria-hidden="true"></i>
            <select v-model="draft[item.key]" :aria-label="item.label">
              <option :value="null">Any</option>
              <option v-for="o in LIFESTYLE_OPTIONS[item.key]" :key="o.value" :value="o.value">{{ o.label }}</option>
            </select>
          </label>
        </div>
      </fieldset>

      <!-- Education & work -->
      <fieldset class="f-card" :class="{ 'is-locked': !premium.isPremium }" :disabled="!premium.isPremium">
        <router-link v-if="!premium.isPremium" to="/upgrade" class="lock-cover" aria-label="Premium filter. Upgrade to use it">
          <span><i class="ri-vip-crown-2-fill" aria-hidden="true"></i>Premium</span>
        </router-link>
        <legend class="f-head"><i class="ri-graduation-cap-line" aria-hidden="true"></i><span>Education &amp; Work</span></legend>
        <div class="row-2">
          <label class="pick">
            <i class="ri-graduation-cap-line" aria-hidden="true"></i>
            <span class="pick-text"><small>Education</small><span>{{ labelOf(EDUCATION_LEVELS, draft.educationLevel) }}</span></span>
            <i class="ri-arrow-down-s-line pick-chev" aria-hidden="true"></i>
            <select v-model="draft.educationLevel" aria-label="Education">
              <option :value="null">Any</option>
              <option v-for="o in EDUCATION_LEVELS" :key="o.value" :value="o.value">{{ o.label }}</option>
            </select>
          </label>
          <label class="pick">
            <i class="ri-briefcase-4-line" aria-hidden="true"></i>
            <span class="pick-text"><small>Profession</small><span>{{ labelOf(PROFESSION_FIELDS, draft.professionField) }}</span></span>
            <i class="ri-arrow-down-s-line pick-chev" aria-hidden="true"></i>
            <select v-model="draft.professionField" aria-label="Profession">
              <option :value="null">Any</option>
              <option v-for="o in PROFESSION_FIELDS" :key="o.value" :value="o.value">{{ o.label }}</option>
            </select>
          </label>
        </div>
        <label v-if="hasEducation" class="college-toggle">
          <input v-model="sameCollege" type="checkbox" />
          <span>Only people from my college</span>
        </label>
      </fieldset>

      <!-- Verified only -->
      <label class="f-card verified" :class="{ 'is-locked': !premium.isPremium }">
        <router-link v-if="!premium.isPremium" to="/upgrade" class="lock-cover" aria-label="Premium filter. Upgrade to use it">
          <span><i class="ri-vip-crown-2-fill" aria-hidden="true"></i>Premium</span>
        </router-link>
        <i class="ri-verified-badge-fill" aria-hidden="true"></i>
        <span class="verified-text">
          <strong>Show only verified profiles</strong>
          <span>See only people who have verified their profile</span>
        </span>
        <input v-model="draft.verifiedOnly" type="checkbox" role="switch" class="switch" :disabled="!premium.isPremium" />
      </label>

      <!-- Travel mode (Premium): Discover searches around another city -->
      <section class="f-card travel" :class="{ 'is-locked': !premium.isPremium }" aria-labelledby="travel-title">
        <router-link v-if="!premium.isPremium" to="/upgrade" class="lock-cover" aria-label="Premium filter. Upgrade to use it">
          <span><i class="ri-vip-crown-2-fill" aria-hidden="true"></i>Premium</span>
        </router-link>
        <div class="f-head">
          <i class="ri-plane-line" aria-hidden="true"></i><span id="travel-title">Travel mode</span>
        </div>
        <template v-if="premium.overview?.travel">
          <p class="travel-now">
            <i class="ri-map-pin-2-fill" aria-hidden="true"></i>
            Browsing <strong>{{ premium.overview.travel.label }}</strong>
          </p>
          <button type="button" class="travel-off" :disabled="travelBusy" @click="stopTravel">Back to my area</button>
        </template>
        <template v-else>
          <p class="f-hint">Planning a trip? Meet people in another city before you arrive.</p>
          <UTypeahead
            :model-value="null"
            :fetch-items="(q: string) => searchPlaces(q, { kinds: TRAVEL_KINDS })"
            :item-key="(p: Place) => p.id"
            :item-label="(p: Place) => p.name"
            :item-meta="placeMeta"
            placeholder="Search a city, e.g. Goa, Pune"
            icon="ri-search-line"
            :disabled="travelBusy || !premium.isPremium"
            @update:model-value="startTravel"
          />
        </template>
      </section>
    </form>

    <button type="submit" form="filters-form" class="apply-btn">
      Apply Filters <i class="ri-arrow-right-line" aria-hidden="true"></i>
    </button>
  </div>
</template>

<script setup lang="ts">
import UTypeahead from '../components/ui/UTypeahead.vue';
import { usePremiumStore } from '../stores/premium';
import { useToastStore } from '../stores/toast';
import { placeMeta, searchPlaces } from '../services/directory';
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import ScreenBar from '../components/layout/ScreenBar.vue';
import { DiscoverFilters, emptyFilters, useDiscoverStore } from '../stores/discover';
import { useAuthStore } from '../stores/auth';
import { api } from '../services/api';
import { interestIcon } from '../utils/interestIcon';
import { Interest, Place, PlaceKind } from '../types';
import { EDUCATION_LEVELS, LIFESTYLE_OPTIONS, PROFESSION_FIELDS } from '../utils/profileFormat';
import { PHOTO_INTEREST_ORDER } from '../utils/interestPhoto';
import { DIETS, LANGUAGES, MARITAL_STATUSES, RELIGIONS } from '../content/profileOptions';

const LOOKING_FOR = [
  { value: 'Relationship', label: 'Relationship', icon: 'ri-hearts-line' },
  { value: 'Casual', label: 'Casual Dating', icon: 'ri-heart-3-line' },
  { value: 'Friendship', label: 'Friendship', icon: 'ri-group-line' },
  { value: null, label: 'Open to Explore', icon: 'ri-vip-diamond-line' },
] as const;

const BACKGROUND = [
  { key: 'religion', label: 'Religion', icon: 'ri-sparkling-line', options: RELIGIONS },
  { key: 'language', label: 'Language', icon: 'ri-chat-voice-line', options: LANGUAGES },
  { key: 'diet', label: 'Diet', icon: 'ri-restaurant-2-line', options: DIETS },
  { key: 'maritalStatus', label: 'Status', icon: 'ri-heart-2-line', options: MARITAL_STATUSES },
] as const;

const LIFESTYLE = [
  { key: 'drinking', label: 'Drinks', icon: 'ri-goblet-line' },
  { key: 'smoking', label: 'Smoking', icon: 'ri-forbid-line' },
  { key: 'workout', label: 'Workout', icon: 'ri-leaf-line' },
] as const;

const SHOW_ME = [
  { value: 'women', label: 'Women', icon: 'ri-women-line' },
  { value: 'men', label: 'Men', icon: 'ri-men-line' },
  { value: null, label: 'Everyone', icon: 'ri-group-line' },
] as const;

/** The backend's allowed radii; the last stop means no distance limit. */
const DISTANCE_STOPS = [5, 10, 25, 50, 100, 200, null] as const;
// The slider ends mean "no limit": 18 is the youngest anyone can be, and the top is "50 or older".
const AGE_MIN = 18;
const AGE_MAX = 50;
const INTERESTS_SHOWN = 12;

const router = useRouter();
const premium = usePremiumStore();

// ---- Travel mode (Premium) ----
const TRAVEL_KINDS: PlaceKind[] = ['city', 'town', 'district'];
const travelBusy = ref(false);

async function startTravel(place: Place | null) {
  if (!place) return;
  travelBusy.value = true;
  try {
    await premium.setTravel(place.id);
    useToastStore().success(`Travel mode on: showing people around ${place.name}.`);
  } catch (err: any) {
    useToastStore().error(err.message);
  } finally {
    travelBusy.value = false;
  }
}

async function stopTravel() {
  travelBusy.value = true;
  try {
    await premium.clearTravel();
    useToastStore().success('Back to your own area.');
  } catch (err: any) {
    useToastStore().error(err.message);
  } finally {
    travelBusy.value = false;
  }
}
const discoverStore = useDiscoverStore();
discoverStore.syncFiltersOwner();
const authStore = useAuthStore();
// Distance works from home, or from the Travel mode city.
const hasLocation = computed(() => Boolean(authStore.profile?.location || premium.overview?.travel));
const hasEducation = computed(() => Boolean(authStore.profile?.education));

// Edits happen on a copy; nothing changes until Apply.
const draft = ref<DiscoverFilters>({ ...discoverStore.filters, interests: [...discoverStore.filters.interests] });
const sameCollege = ref(draft.value.sameInstitution);
const ageLow = ref(Math.min(Math.max(draft.value.minAge ?? AGE_MIN, AGE_MIN), AGE_MAX));
const ageHigh = ref(Math.min(Math.max(draft.value.maxAge ?? AGE_MAX, AGE_MIN), AGE_MAX));

const allInterests = ref<Interest[]>([]);
const showAllInterests = ref(false);

onMounted(async () => {
  try {
    allInterests.value = (await api.get('/users/interests')).data.data;
  } catch {
    // The rest of the filters still work without the interest list.
  }
});

/** Picked ones first, so they stay visible when the list is collapsed. */
const shownInterests = computed(() => {
  const rank = (name: string) => {
    const i = PHOTO_INTEREST_ORDER.indexOf(name.toLowerCase());
    return i === -1 ? Number.MAX_VALUE : i;
  };
  const sorted = [...allInterests.value].sort((a, b) => rank(a.name) - rank(b.name));
  const picked = sorted.filter((i) => isPicked(i.id));
  const rest = sorted.filter((i) => !isPicked(i.id));
  const ordered = [...picked, ...rest];
  return showAllInterests.value ? ordered : ordered.slice(0, Math.max(INTERESTS_SHOWN, picked.length));
});

function isPicked(id: string) {
  return draft.value.interests.some((i) => i.id === id);
}

function toggleInterest(interest: Interest) {
  draft.value.interests = isPicked(interest.id)
    ? draft.value.interests.filter((i) => i.id !== interest.id)
    : [...draft.value.interests, { id: interest.id, name: interest.name }];
}

const radiusIndex = computed({
  get: () => {
    const index = DISTANCE_STOPS.findIndex((km) => km === draft.value.radiusKm);
    return index === -1 ? DISTANCE_STOPS.length - 1 : index;
  },
  set: (index: number) => {
    draft.value.radiusKm = DISTANCE_STOPS[index] ?? null;
  },
});

/** The handles can meet but not cross; the one being dragged stops at the other. */
function keepAgeOrder(moved: 'low' | 'high') {
  if (ageLow.value <= ageHigh.value) return;
  if (moved === 'low') ageLow.value = ageHigh.value;
  else ageHigh.value = ageLow.value;
}

const ageLabel = computed(() => {
  if (ageLow.value === AGE_MIN && ageHigh.value === AGE_MAX) return 'Any age';
  return ageHigh.value === AGE_MAX ? `${ageLow.value}+ years` : `${ageLow.value} – ${ageHigh.value} years`;
});

function lifestyleLabel(key: (typeof LIFESTYLE)[number]['key']) {
  return LIFESTYLE_OPTIONS[key].find((o) => o.value === draft.value[key])?.label ?? 'Any';
}

function labelOf(options: readonly { value: string; label: string }[], value: string | null) {
  return options.find((o) => o.value === value)?.label ?? 'Any';
}

const ageTrackStyle = computed(() => {
  const pct = (age: number) => `${((age - AGE_MIN) / (AGE_MAX - AGE_MIN)) * 100}%`;
  return { '--from': pct(ageLow.value), '--to': pct(ageHigh.value) };
});

function reset() {
  draft.value = emptyFilters();
  sameCollege.value = false;
  ageLow.value = AGE_MIN;
  ageHigh.value = AGE_MAX;
}

function apply() {
  discoverStore.setFilters({
    ...draft.value,
    radiusKm: hasLocation.value ? draft.value.radiusKm : null,
    sameInstitution: hasEducation.value && sameCollege.value,
    institution: null,
    minAge: ageLow.value === AGE_MIN ? null : ageLow.value,
    maxAge: ageHigh.value === AGE_MAX ? null : ageHigh.value,
  });
  router.push('/discover');
}
</script>

<style scoped lang="scss">
$ink: var(--unmute-text-heading);
$soft: var(--unmute-text-secondary);
$pink: var(--unmute-cta);

.filters-page {
  width: 100%;
  max-width: 34rem;
  margin: 0 auto;
  padding-bottom: calc(6rem + env(safe-area-inset-bottom, 0px));
}

.reset-btn {
  padding: 0.7rem 1.4rem;
  border: 0;
  border-radius: var(--unmute-radius-pill);
  background: var(--unmute-card);
  color: $pink;
  font-size: 1rem;
  font-weight: 600;
  box-shadow: 0 6px 18px -8px rgba(117, 48, 170, 0.35);
}

.page-title {
  margin: 0;
  font-size: 2.2rem;
  font-weight: 800;
  color: $ink;
  text-align: center;
}

.page-sub {
  margin-bottom: 1rem;
  font-size: 1.1rem;
  color: var(--unmute-text-muted);
  text-align: center;
}

.f-card {
  min-width: 0;
  margin: 0;
  padding: 1rem;
  border: 1px solid var(--unmute-mobile-option-border, rgba(74, 0, 91, 0.06));
  border-radius: 1.4rem;
  background: var(--unmute-surface);
  box-shadow: 0 10px 30px -24px rgba(117, 48, 170, 0.5);
}

.f-head {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  width: 100%;
  float: left;
  margin: 0 0 0.8rem;
  padding: 0;
  font-size: 1.1rem;
  font-weight: 800;
  color: $ink;

  & + * {
    clear: both;
  }

  > i:first-child {
    font-size: 1.5rem;
    color: $pink;
  }
}

.f-value {
  margin-left: auto;
  font-size: 0.98rem;
  font-weight: 600;
  color: $pink;
}

.f-link {
  margin-left: auto;
  border: 0;
  background: transparent;
  color: $pink;
  font-size: 0.9rem;
  font-weight: 600;
}

.f-hint {
  margin: 0.6rem 0 0;
  font-size: 0.85rem;
  color: $soft;

  a {
    color: $pink;
    font-weight: 600;
  }
}

// Options: white with a hairline border; chosen ones turn soft pink with a pink edge.
@mixin option {
  border: 1.5px solid var(--unmute-mobile-option-border, rgba(74, 0, 91, 0.1));
  background: var(--unmute-card);
  color: $ink;

  i {
    color: $ink;
  }

  &[aria-pressed='true'] {
    border-color: var(--unmute-mobile-selected-border, rgba(242, 24, 114, 0.6));
    background: var(--unmute-chip-pink);
    color: $pink;

    i {
      color: $pink;
    }
  }
}

.tiles {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.4rem;
}

.tile {
  @include option;
  border: 2px solid var(--unmute-mobile-option-border, #c8b5d0);

  &[aria-pressed='true'] {
    border-color: var(--unmute-mobile-selected-border, #f21872);
  }

  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.35rem;
  min-width: 0;
  padding: 0.75rem 0.1rem;
  border-radius: 1rem;
  font-size: 0.72rem;
  letter-spacing: -0.01em;
  white-space: nowrap;

  i {
    font-size: 1.5rem;
  }
}

@media (max-width: 767px) {
  .tiles {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.75rem;
  }

  .tile {
    padding: 1rem 0.5rem;
    font-size: 0.85rem;
    white-space: normal;
    text-align: center;
  }
}

.row-3,
.row-2,
.grid-4 {
  display: grid;
  gap: 0.45rem;
}

.row-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.row-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.grid-4 { display: flex; flex-wrap: wrap; }

.opt {
  @include option;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  min-width: 0;
  min-height: 3rem;
  padding: 0 0.5rem;
  border-radius: 1rem;
  font-size: 0.92rem;

  i {
    font-size: 1.2rem;
  }

  &.is-small {
    flex: 1 1 auto;
    min-height: 2.5rem;
    padding: 0 0.75rem;
    border-radius: var(--unmute-radius-pill);
    font-size: 0.82rem;

    i {
      flex-shrink: 0;
      font-size: 1rem;
    }

    span {
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
  }
}

// A native select laid invisibly over a card, so the phone's own picker opens.
.pick {
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.4rem;
  min-width: 0;
  padding: 0.5rem 0.5rem 0.5rem 0.6rem;
  border: 1.5px solid var(--unmute-mobile-option-border, rgba(74, 0, 91, 0.1));
  border-radius: 1rem;
  color: $ink;

  > i:first-child {
    flex-shrink: 0;
    font-size: 1.3rem;
    color: $pink;
  }

  select {
    position: absolute;
    inset: 0;
    opacity: 0;
    cursor: pointer;
  }
}

.pick-text {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  line-height: 1.2;

  small {
    color: $soft;
    font-size: 0.68rem;
  }

  span {
    overflow: hidden;
    font-size: 0.8rem;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
}

.pick-chev {
  flex-shrink: 0;
  color: $ink;
}

.verified {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  cursor: pointer;

  > i {
    font-size: 1.7rem;
    color: var(--unmute-subtitle);
  }
}

.verified-text {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  color: $soft;
  font-size: 0.8rem;

  strong {
    color: $ink;
    font-size: 1rem;
  }
}

// Toggle switch: pink when on.
.switch {
  -webkit-appearance: none;
  appearance: none;
  position: relative;
  flex-shrink: 0;
  width: 3.2rem;
  height: 1.9rem;
  border-radius: 9999px;
  background: var(--unmute-track);
  cursor: pointer;
  transition: background var(--unmute-transition-fast);

  &::after {
    content: '';
    position: absolute;
    top: 0.2rem;
    left: 0.2rem;
    width: 1.5rem;
    height: 1.5rem;
    border-radius: 50%;
    background: var(--unmute-card);
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
    transition: transform var(--unmute-transition-fast);
  }

  &:checked {
    background: linear-gradient(90deg, #ff4f8e, #f21872);

    &::after {
      transform: translateX(1.3rem);
    }
  }
}

.college-toggle {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  margin-top: 0.8rem;
  color: $soft;
  font-size: 0.9rem;

  input {
    width: 1.2rem;
    height: 1.2rem;
    accent-color: $pink;
  }
}

// Sliders: pale track, gradient fill, white thumbs with a pink ring.
@mixin thumb {
  width: 1.7rem;
  height: 1.7rem;
  border-radius: 50%;
  border: 2px solid $pink;
  background: var(--unmute-card);
  box-shadow: 0 2px 8px rgba(192, 0, 120, 0.3);
  cursor: pointer;
}

input[type='range'] {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 40px;
  margin: 0;
  background: transparent;

  &::-webkit-slider-thumb { -webkit-appearance: none; @include thumb; }
  &::-moz-range-thumb { @include thumb; }
  &:disabled { opacity: 0.4; }
}

input.single-range {
  --fill: 0%;
  background: linear-gradient(90deg, #ff4f8e, #8a1fb0) 0 50% / var(--fill) 6px no-repeat,
    linear-gradient(var(--unmute-track), var(--unmute-track)) 0 50% / 100% 6px no-repeat;
}

// Two range inputs stacked on one track; only their thumbs take the pointer.
.dual-range {
  position: relative;
  height: 40px;
  background: linear-gradient(90deg, #ff4f8e, #8a1fb0) var(--from) 50% / calc(var(--to) - var(--from)) 6px no-repeat,
    linear-gradient(var(--unmute-track), var(--unmute-track)) 0 50% / 100% 6px no-repeat;

  input {
    position: absolute;
    inset: 0;
    pointer-events: none;

    &::-webkit-slider-thumb { pointer-events: auto; }
    &::-moz-range-thumb { pointer-events: auto; }
  }
}

.ends {
  display: flex;
  justify-content: space-between;
  color: $soft;
  font-size: 0.9rem;
}

.apply-btn {
  position: fixed;
  left: 50%;
  bottom: calc(1rem + env(safe-area-inset-bottom, 0px));
  z-index: 20;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  justify-content: center;
  width: min(32rem, calc(100% - 2rem));
  min-height: 3.6rem;
  border: 0;
  border-radius: var(--unmute-radius-pill);
  background: linear-gradient(100deg, #ff7a6e 0%, #f21872 35%, #c00078 65%, #4a005b 100%);
  color: #fff;
  font-size: 1.2rem;
  font-weight: 600;
  box-shadow: 0 16px 34px -14px rgba(192, 0, 120, 0.75);

  i {
    position: absolute;
    right: 1.5rem;
    font-size: 1.4rem;
  }

  @media (min-width: 768px) {
    left: calc(50% + var(--unmute-dock-width) / 2);
  }
}
// Premium sections for free members: dimmed, with a tap-to-upgrade cover.
.is-locked {
  position: relative;

  > :not(.lock-cover) {
    opacity: 0.45;
  }
}

.lock-cover {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: flex;
  align-items: flex-start;
  justify-content: flex-end;
  padding: 0.9rem;
  border-radius: inherit;
  text-decoration: none;

  span {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.3rem 0.7rem;
    border-radius: var(--unmute-radius-pill);
    background: linear-gradient(135deg, #ffd66b, #f5a524);
    color: #fff;
    font-size: 0.78rem;
    font-weight: 700;
    box-shadow: 0 4px 10px -4px rgba(245, 165, 36, 0.7);
  }
}

// On the one-line "verified" card, the badge sits where the switch is.
.verified .lock-cover {
  align-items: center;
}

.travel-now {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin: 0 0 0.6rem;
  color: $soft;

  i { color: $pink; }
  strong { color: $ink; }
}

.travel-off {
  padding: 0.5rem 1rem;
  border: 1.5px solid rgba(242, 24, 114, 0.45);
  border-radius: var(--unmute-radius-pill);
  background: var(--unmute-chip-pink);
  color: $pink;
  font-weight: 600;
}
</style>
