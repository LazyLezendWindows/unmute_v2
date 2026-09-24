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
        <div class="thumb-labels">
          <span :style="{ left: ageTrackStyle['--from'] }">{{ ageLow }}</span>
          <span :style="{ left: ageTrackStyle['--to'] }">{{ ageHigh === AGE_MAX ? `${AGE_MAX}+` : ageHigh }}</span>
        </div>
      </fieldset>

      <!-- Distance -->
      <fieldset class="f-card">
        <legend class="f-head">
          <i class="ri-map-pin-line" aria-hidden="true"></i><span>Distance</span>
          <span class="f-value is-muted">{{ draft.radiusKm === null ? 'Anywhere' : `Within ${draft.radiusKm} km` }}</span>
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
        <div class="ticks">
          <span v-for="(stop, index) in DISTANCE_STOPS" :key="index" :class="{ 'is-on': index === radiusIndex }">
            {{ stop === null ? 'Any' : `${stop} km` }}
          </span>
        </div>
        <p v-if="!hasLocation" class="f-hint">
          <router-link to="/profile/location">Set your area</router-link> to filter by distance.
        </p>
      </fieldset>

      <!-- Education -->
      <fieldset class="f-card">
        <legend class="f-head"><i class="ri-graduation-cap-line" aria-hidden="true"></i><span>Education</span></legend>
        <div class="chips">
          <button type="button" class="f-chip" :aria-pressed="!draft.educationLevel" @click="draft.educationLevel = null">
            Any<i v-if="!draft.educationLevel" class="ri-check-line" aria-hidden="true"></i>
          </button>
          <button
            v-for="level in EDUCATION_LEVELS"
            :key="level.value"
            type="button"
            class="f-chip"
            :aria-pressed="draft.educationLevel === level.value"
            @click="draft.educationLevel = level.value"
          >
            {{ level.label }}<i v-if="draft.educationLevel === level.value" class="ri-check-line" aria-hidden="true"></i>
          </button>
        </div>
        <label v-if="hasEducation" class="college-toggle">
          <input v-model="sameCollege" type="checkbox" />
          <span>Only people from my college</span>
        </label>
      </fieldset>

      <!-- Profession -->
      <fieldset class="f-card">
        <legend class="f-head"><i class="ri-briefcase-4-line" aria-hidden="true"></i><span>Profession</span></legend>
        <div class="chips">
          <button type="button" class="f-chip" :aria-pressed="!draft.professionField" @click="draft.professionField = null">
            Any<i v-if="!draft.professionField" class="ri-check-line" aria-hidden="true"></i>
          </button>
          <button
            v-for="field in PROFESSION_FIELDS"
            :key="field.value"
            type="button"
            class="f-chip"
            :aria-pressed="draft.professionField === field.value"
            @click="draft.professionField = field.value"
          >
            {{ field.label }}<i v-if="draft.professionField === field.value" class="ri-check-line" aria-hidden="true"></i>
          </button>
        </div>
      </fieldset>

      <!-- Interests -->
      <fieldset class="f-card">
        <legend class="f-head">
          <i class="ri-heart-3-line" aria-hidden="true"></i><span>Interests</span>
          <button type="button" class="f-link" @click="showAllInterests = !showAllInterests">
            {{ showAllInterests ? 'Show fewer' : 'Select interests' }} <i class="ri-arrow-right-s-line" aria-hidden="true"></i>
          </button>
        </legend>
        <div class="chips">
          <button
            v-for="interest in shownInterests"
            :key="interest.id"
            type="button"
            class="f-chip has-icon"
            :aria-pressed="isPicked(interest.id)"
            @click="toggleInterest(interest)"
          >
            <i :class="interestIcon(interest.name)" class="chip-icon" aria-hidden="true"></i>
            {{ interest.name }}<i v-if="isPicked(interest.id)" class="ri-check-line" aria-hidden="true"></i>
          </button>
        </div>
      </fieldset>

      <!-- Show me -->
      <fieldset class="f-card">
        <legend class="f-head"><i class="ri-equalizer-line" aria-hidden="true"></i><span>Show me</span></legend>
        <div class="chips is-row">
          <button
            v-for="option in SHOW_ME"
            :key="option.label"
            type="button"
            class="f-chip has-icon is-wide"
            :aria-pressed="draft.showMe === option.value"
            @click="draft.showMe = option.value"
          >
            <i :class="option.icon" class="chip-icon" aria-hidden="true"></i>{{ option.label }}
          </button>
        </div>
      </fieldset>
    </form>

    <button type="submit" form="filters-form" class="apply-btn">
      Apply Filters <i class="ri-arrow-right-line" aria-hidden="true"></i>
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import ScreenBar from '../components/layout/ScreenBar.vue';
import { DiscoverFilters, emptyFilters, useDiscoverStore } from '../stores/discover';
import { useAuthStore } from '../stores/auth';
import { api } from '../services/api';
import { interestIcon } from '../utils/interestIcon';
import { Interest } from '../types';
import { EDUCATION_LEVELS, PROFESSION_FIELDS } from '../utils/profileFormat';

const LOOKING_FOR = [
  { value: 'Relationship', label: 'Relationship', icon: 'ri-heart-3-line' },
  { value: 'Friendship', label: 'Friendship', icon: 'ri-group-line' },
  { value: 'Casual', label: 'Casual', icon: 'ri-goblet-line' },
  { value: null, label: 'Open to all', icon: 'ri-sparkling-line' },
] as const;

const SHOW_ME = [
  { value: 'women', label: 'Women', icon: 'ri-women-line' },
  { value: 'men', label: 'Men', icon: 'ri-men-line' },
  { value: null, label: 'Everyone', icon: 'ri-group-line' },
] as const;

/** The backend's allowed radii; the last stop means no distance limit. */
const DISTANCE_STOPS = [5, 10, 25, 50, 100, null] as const;
// The slider ends mean "no limit": 18 is the youngest anyone can be, and the top is "60 or older".
const AGE_MIN = 18;
const AGE_MAX = 60;
const INTERESTS_SHOWN = 8;

const router = useRouter();
const discoverStore = useDiscoverStore();
const authStore = useAuthStore();
const hasLocation = computed(() => Boolean(authStore.profile?.location));
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
  const picked = allInterests.value.filter((i) => isPicked(i.id));
  const rest = allInterests.value.filter((i) => !isPicked(i.id));
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
  return ageHigh.value === AGE_MAX ? `${ageLow.value}+` : `${ageLow.value} - ${ageHigh.value}`;
});

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
$ink: #10106b;
$lilac-text: #5b4bc4;
$gradient: linear-gradient(95deg, #ff3d8b 0%, #e0149a 50%, #8a1fe0 100%);

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
  background: #fff;
  color: #e5147c;
  font-size: 1.05rem;
  font-weight: 600;
  box-shadow: 0 6px 18px -8px rgba(117, 48, 170, 0.35);
}

.page-title {
  margin: 0;
  font-size: 2.3rem;
  font-weight: 800;
  color: $ink;
}

.page-sub {
  margin-bottom: 1rem;
  font-size: 1.25rem;
  color: $lilac-text;
}

.f-card {
  min-width: 0;
  margin: 0;
  padding: 1rem 1.1rem 1.1rem;
  border: 0;
  border-radius: 1.6rem;
  background: rgba(255, 255, 255, 0.8);
  box-shadow: 0 10px 30px -22px rgba(117, 48, 170, 0.5);
}

.f-head {
  display: flex;
  align-items: center;
  gap: 0.7rem;
  width: 100%;
  float: left;
  margin: 0 0 0.8rem;
  padding: 0;

  & + * {
    clear: both;
  }
  font-size: 1.2rem;
  font-weight: 800;
  color: $ink;

  > i {
    font-size: 1.6rem;
    color: $ink;
  }

  > i:first-child {
    color: #e5147c;
  }
}

.f-value {
  margin-left: auto;
  font-size: 1.05rem;
  font-weight: 500;
  color: #4b3fb8;
}

.f-link {
  display: inline-flex;
  align-items: center;
  margin-left: auto;
  border: 0;
  background: transparent;
  color: #5b5fb0;
  font-size: 0.95rem;
  font-weight: 500;
}

.f-hint {
  margin: 0.6rem 0 0;
  font-size: 0.85rem;
  color: $lilac-text;

  a {
    color: #e5147c;
    font-weight: 600;
  }
}

.tiles {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.5rem;
}

.tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.3rem;
  min-width: 0;
  padding: 0.75rem 0.2rem;
  border: 0;
  border-radius: 1rem;
  background: #f5f1fc;
  color: #4b3fb8;
  font-size: clamp(0.72rem, 3vw, 0.95rem);
  white-space: nowrap;

  i {
    font-size: 1.5rem;
  }

  &[aria-pressed='true'] {
    background: $gradient;
    color: #fff;
  }
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
}

.chips.is-row {
  flex-wrap: nowrap;

  .f-chip {
    flex: 1;
    justify-content: center;
    padding-left: 0.5rem;
    padding-right: 0.5rem;
  }
}

.f-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.6rem 1.1rem;
  border: 0;
  border-radius: var(--unmute-radius-pill);
  background: #f5f1fc;
  color: #4b3fb8;
  font-size: 1rem;

  &.is-wide {
    padding: 0.75rem clamp(0.9rem, 4vw, 1.6rem);
  }

  .chip-icon {
    font-size: 1.3rem;
    color: #d31a8c;
  }

  &[aria-pressed='true'] {
    background: $gradient;
    color: #fff;

    .chip-icon {
      color: #fff;
    }
  }

  &:disabled {
    opacity: 0.45;
  }
}

// Shared slider look: pale track, brand-gradient fill, white thumbs with a pink ring.
@mixin thumb {
  width: 1.9rem;
  height: 1.9rem;
  border-radius: 50%;
  border: 3px solid #e5147c;
  background: #fff;
  box-shadow: 0 2px 8px rgba(192, 0, 120, 0.3);
  cursor: pointer;
}

input[type='range'] {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 44px;
  margin: 0;
  background: transparent;

  &::-webkit-slider-thumb { -webkit-appearance: none; @include thumb; }
  &::-moz-range-thumb { @include thumb; }
  &:disabled { opacity: 0.4; }
}

input.single-range {
  --fill: 0%;
  background: linear-gradient(90deg, #ff3d8b, #8a1fe0) 0 50% / var(--fill) 8px no-repeat,
    linear-gradient(#ece7f8, #ece7f8) 0 50% / 100% 8px no-repeat;
}

// Two range inputs stacked on one track; only their thumbs take the pointer.
.dual-range {
  position: relative;
  height: 44px;
  background: linear-gradient(90deg, #ff3d8b, #8a1fe0) var(--from) 50% / calc(var(--to) - var(--from)) 8px no-repeat,
    linear-gradient(#ece7f8, #ece7f8) 0 50% / 100% 8px no-repeat;

  input {
    position: absolute;
    inset: 0;
    pointer-events: none;

    &::-webkit-slider-thumb { pointer-events: auto; }
    &::-moz-range-thumb { pointer-events: auto; }
  }
}

.thumb-labels {
  position: relative;
  height: 1.4rem;
  margin: 0 0.95rem;
  color: $ink;
  font-size: 1.05rem;

  span {
    position: absolute;
    transform: translateX(-50%);
  }
}

.ticks {
  display: flex;
  justify-content: space-between;
  color: $lilac-text;
  font-size: 0.95rem;

  .is-on {
    color: #e5147c;
  }
}

.college-toggle {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  margin-top: 0.8rem;
  color: #4b3fb8;
  font-size: 0.95rem;

  input {
    width: 1.2rem;
    height: 1.2rem;
    accent-color: #e5147c;
  }
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
  min-height: 3.8rem;
  border: 0;
  border-radius: var(--unmute-radius-pill);
  background: $gradient;
  color: #fff;
  font-size: 1.35rem;
  font-weight: 600;
  box-shadow: 0 16px 34px -14px rgba(192, 0, 120, 0.75);

  i {
    position: absolute;
    right: 1.5rem;
    font-size: 1.5rem;
  }

  @media (min-width: 768px) {
    left: calc(50% + var(--unmute-dock-width) / 2);
  }
}
</style>
