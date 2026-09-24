<template>
  <div v-if="person" class="person-page">
    <ScreenBar back>
      <template #actions>
        <button type="button" class="round-btn" aria-label="Report or block" @click="safetyOpen = true">
          <i class="ri-more-fill" aria-hidden="true"></i>
        </button>
      </template>
    </ScreenBar>

    <!-- Main photo, and the others beside it -->
    <section class="gallery" :class="{ 'has-thumbs': photos.length > 1 }" aria-label="Photos">
      <div class="gallery-main" :style="photoBackground(photos[current])">
        <span v-if="!photos.length" class="photo-initial">{{ person.displayName.charAt(0) }}</span>
        <span v-if="person.isOnline" class="online-pill"><span class="online-dot" aria-hidden="true"></span>Online now</span>
        <span v-if="photos.length" class="photo-count">{{ current + 1 }}/{{ photos.length }}</span>
      </div>
      <div v-if="photos.length > 1" class="gallery-thumbs">
        <button
          v-for="(url, index) in thumbs"
          :key="url + index"
          type="button"
          class="thumb"
          :class="{ 'is-on': index + thumbStart === current }"
          :style="photoBackground(url)"
          :aria-label="`Photo ${index + thumbStart + 1}`"
          @click="current = index + thumbStart"
        >
          <span v-if="index === thumbs.length - 1 && hiddenCount" class="thumb-more">+{{ hiddenCount }}</span>
        </button>
      </div>
    </section>

    <header class="person-head">
      <div class="min-w-0">
        <h1 class="person-name">
          {{ person.displayName }}, {{ person.age }}
          <i v-if="person.isVerified" class="ri-verified-badge-fill verified-badge" aria-label="Verified"></i>
        </h1>
        <p class="person-line">
          <span v-if="person.distanceKm !== null"><i class="ri-map-pin-2-fill" aria-hidden="true"></i>{{ person.distanceKm }} km away</span>
          <span v-else-if="person.approximateLocation"><i class="ri-map-pin-2-fill" aria-hidden="true"></i>{{ person.approximateLocation }}</span>
          <span v-if="person.isOnline"><span class="online-dot" aria-hidden="true"></span>Online now</span>
        </p>
        <p class="person-line is-facts">
          <span v-if="person.profession"><i class="ri-briefcase-4-fill" aria-hidden="true"></i>{{ person.profession }}</span>
          <span v-if="study"><i class="ri-graduation-cap-fill" aria-hidden="true"></i>{{ study }}</span>
          <span v-if="person.heightCm" class="is-split"><i class="ri-ruler-line" aria-hidden="true"></i>{{ person.heightCm }} cm</span>
        </p>
      </div>
      <div v-if="match !== null" class="match-pill">
        <span class="match-ring" :style="{ '--pct': match }"><i class="ri-heart-3-fill" aria-hidden="true"></i></span>
        <span><strong>{{ match }}%</strong>Match</span>
      </div>
    </header>

    <CandidateDetails :person="detailsPerson" show-lifestyle @more="safetyOpen = true" />

    <!-- Someone in Discover: pass / like; a match: go to the chat -->
    <div v-if="isCandidate" class="person-actions">
      <button type="button" class="act act-pass" aria-label="Pass" @click="decide('pass')"><i class="ri-close-line" aria-hidden="true"></i></button>
      <button type="button" class="act act-like" aria-label="Like" @click="decide('like')"><i class="ri-heart-3-fill" aria-hidden="true"></i></button>
      <button type="button" class="act act-star" aria-label="Super like" @click="comingSoon('Super Like')"><i class="ri-star-fill" aria-hidden="true"></i></button>
    </div>
    <router-link v-else-if="conversationId" :to="`/chat/${conversationId}`" class="message-btn">
      <i class="ri-send-plane-fill" aria-hidden="true"></i> Send a Message
    </router-link>

    <SafetyModal
      :is-open="safetyOpen"
      :target-user-id="person.id"
      :target-name="person.displayName"
      @close="safetyOpen = false"
      @action-completed="onSafetyCompleted"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import ScreenBar from '../components/layout/ScreenBar.vue';
import CandidateDetails from '../components/discovery/CandidateDetails.vue';
import SafetyModal from '../components/safety/SafetyModal.vue';
import { useDiscoverStore } from '../stores/discover';
import { useChatStore } from '../stores/chat';
import { useAuthStore } from '../stores/auth';
import { photoBackground, photosOf } from '../services/media';
import { comingSoon, educationLine, matchPercent } from '../utils/profileFormat';

/** Thumbnails shown beside the main photo; the last one says how many more there are. */
const THUMBS = 3;

const route = useRoute();
const router = useRouter();
const discoverStore = useDiscoverStore();
const chatStore = useChatStore();
const authStore = useAuthStore();

const id = computed(() => route.params.id as string);
const candidate = computed(() => discoverStore.feed.find((p) => p.id === id.value) ?? null);
const matchEntry = computed(() => chatStore.matches.find((m) => m.user.id === id.value) ?? null);
const person = computed(() => candidate.value ?? matchEntry.value?.user ?? null);
const conversationId = computed(() => matchEntry.value?.conversationId ?? null);
// Only the card on top of the deck can be liked or passed from here.
const isCandidate = computed(() => discoverStore.currentCandidate?.id === id.value);

const current = ref(0);
const safetyOpen = ref(false);

onMounted(async () => {
  if (!person.value) await chatStore.loadMatches();
  if (!person.value) router.replace('/discover');
});

const photos = computed(() => (person.value ? photosOf(person.value) : []));
const thumbStart = 1;
const thumbs = computed(() => photos.value.slice(thumbStart, thumbStart + THUMBS));
const hiddenCount = computed(() => Math.max(0, photos.value.length - thumbStart - THUMBS));

const myInterests = computed(() => new Set((authStore.profile?.interests || []).map((i) => i.name)));
const interestNames = computed(() =>
  (person.value?.interests || []).map((i: { name: string } | string) => (typeof i === 'string' ? i : i.name))
);
const common = computed(() => interestNames.value.filter((name) => myInterests.value.has(name)));
const match = computed(() => matchPercent(common.value.length, myInterests.value.size, interestNames.value.length));
const study = computed(() => (person.value ? educationLine(person.value) : ''));
const detailsPerson = computed(() => ({ ...person.value!, commonInterests: common.value }));

function decide(action: 'like' | 'pass') {
  if (action === 'like') discoverStore.likeCurrent();
  else discoverStore.passCurrent();
  router.push('/discover');
}

function onSafetyCompleted() {
  safetyOpen.value = false;
  if (isCandidate.value) discoverStore.currentIndex++;
  chatStore.loadMatches();
  router.push('/discover');
}
</script>

<style scoped lang="scss">
$ink: #10106b;

.person-page {
  width: 100%;
  max-width: 34rem;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding-bottom: 1rem;
}

.gallery {
  display: grid;
  gap: 0.6rem;

  &.has-thumbs {
    grid-template-columns: minmax(0, 3fr) minmax(0, 1.05fr);
  }
}

.gallery-main {
  position: relative;
  aspect-ratio: 1.12;
  border-radius: 1.6rem;
  display: grid;
  place-items: center;
  background: linear-gradient(150deg, #ff9aa8 0%, #c00078 60%, #4a005b 100%) center / cover;
  background-size: cover;
  background-position: center 25%;

  .has-thumbs & {
    aspect-ratio: auto;
    min-height: 100%;
  }
}

.photo-initial {
  font-size: 6rem;
  font-weight: 800;
  color: rgba(255, 255, 255, 0.85);
}

.online-pill {
  position: absolute;
  top: 0.8rem;
  left: 0.8rem;
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.3rem 0.85rem;
  border-radius: 9999px;
  background: rgba(255, 255, 255, 0.92);
  color: #1a7a3c;
  font-size: 0.85rem;
  font-weight: 600;
}

.photo-count {
  position: absolute;
  right: 0.8rem;
  bottom: 0.8rem;
  padding: 0.2rem 0.7rem;
  border-radius: 9999px;
  background: rgba(30, 20, 30, 0.6);
  color: #fff;
  font-size: 0.85rem;
}

.gallery-thumbs {
  display: grid;
  grid-auto-rows: 1fr;
  gap: 0.6rem;
}

.thumb {
  position: relative;
  aspect-ratio: 1.1;
  border: 2px solid transparent;
  border-radius: 1.1rem;
  background: #efe3f3 center 25% / cover;
  overflow: hidden;

  &.is-on {
    border-color: #f21872;
  }
}

.thumb-more {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  background: rgba(30, 20, 30, 0.45);
  color: #fff;
  font-size: 1.5rem;
  font-weight: 600;
}

.person-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.8rem;
}

.person-name {
  margin: 0 0 0.3rem;
  font-size: clamp(1.9rem, 7vw, 2.3rem);
  font-weight: 800;
  color: $ink;
}

.person-line {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.3rem 1rem;
  margin: 0 0 0.35rem;
  color: #3c3fa0;
  font-size: 1.02rem;

  span {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
  }

  i {
    color: #3c3fa0;
    font-size: 1.15rem;
  }

  &.is-facts i {
    color: #5b2bc4;
  }

  .is-split {
    padding-left: 1rem;
    border-left: 1px solid #d9d1f0;
  }
}

.match-pill {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  gap: 0.5rem;
  padding: 0.45rem 0.9rem 0.45rem 0.45rem;
  border-radius: 1.4rem;
  background: #fbeaf6;
  color: #3c3fa0;
  font-size: 0.85rem;

  strong {
    display: block;
    font-size: 1.15rem;
    color: $ink;
  }

  span:last-child {
    line-height: 1.1;
  }
}

.match-ring {
  display: grid;
  place-items: center;
  width: 2.7rem;
  height: 2.7rem;
  border-radius: 50%;
  background: radial-gradient(circle, #fff 58%, transparent 60%),
    conic-gradient(#f21872 calc(var(--pct) * 1%), #fbd3e7 0);
  color: #f21872;
  font-size: 1.3rem;
}

.person-actions {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1.8rem;
  padding-top: 0.4rem;
}

.act {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 4.3rem;
  height: 4.3rem;
  border: 0;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 10px 24px -12px rgba(117, 48, 170, 0.45);
  font-size: 2rem;
}

.act-pass { color: $ink; }
.act-star { color: #8a1fe0; }

.act-like {
  width: 5.6rem;
  height: 5.6rem;
  color: #fff;
  font-size: 2.6rem;
  background: linear-gradient(135deg, #ff4f8e 0%, #f21872 55%, #d00a8a 100%);
  box-shadow: 0 14px 30px -12px rgba(242, 24, 114, 0.7);
}

.message-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.6rem;
  min-height: 3.7rem;
  border-radius: var(--unmute-radius-pill);
  background: linear-gradient(95deg, #ff3d8b 0%, #e0149a 50%, #8a1fe0 100%);
  color: #fff;
  font-size: 1.25rem;
  text-decoration: none;
  box-shadow: 0 14px 30px -14px rgba(192, 0, 120, 0.7);
}
</style>
