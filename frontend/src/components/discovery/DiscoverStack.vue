<template>
  <div
    class="stack-stage"
    tabindex="0"
    role="group"
    :aria-label="`${top.displayName}, ${top.age}. Press right arrow to like, left arrow to pass, Enter to see their profile.`"
    @keydown.right.prevent="fling('right')"
    @keydown.left.prevent="fling('left')"
    @keydown.enter.prevent="$emit('open')"
  >
    <!-- Cards waiting behind, receding in depth -->
    <div
      v-for="(person, depth) in behind"
      :key="person.id"
      class="stack-card stack-card-behind"
      :style="{ '--depth': depth + 1, ...photoBackground(person.avatarUrl) }"
      aria-hidden="true"
    ></div>

    <!-- The live card -->
    <article
      :key="top.id"
      ref="card"
      class="stack-card stack-card-top discover-card-3d"
      :class="{ 'is-dragging': dragging, 'is-flying': flying }"
      :style="topStyle"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
    >
      <div class="card-photo" :style="photoBackground(photos[photoIndex])">
        <span v-if="!photos.length" class="photo-initial">{{ top.displayName.charAt(0) }}</span>
      </div>
      <div class="card-shade" aria-hidden="true"></div>

      <!-- One segment per photo; tap the left or right edge to move between them -->
      <div v-if="photos.length > 1" class="photo-bars" aria-hidden="true">
        <span v-for="(_, index) in photos" :key="index" :class="{ 'is-on': index === photoIndex }"></span>
      </div>
      <span v-if="photos.length" class="photo-count">{{ photoIndex + 1 }}/{{ photos.length }}</span>
      <span v-if="top.isOnline" class="online-pill"><span class="online-dot" aria-hidden="true"></span>Online now</span>

      <!-- Swipe verdict stamps -->
      <span class="verdict verdict-like" :style="{ opacity: likeOpacity }" aria-hidden="true">
        <i class="ri-heart-3-fill"></i> Like
      </span>
      <span class="verdict verdict-pass" :style="{ opacity: passOpacity }" aria-hidden="true">
        <i class="ri-close-line"></i> Pass
      </span>

      <div class="card-caption">
        <h2 class="caption-name">
          {{ top.displayName }}, {{ top.age }}
          <i v-if="top.isVerified" class="ri-verified-badge-fill caption-verified" aria-label="Verified"></i>
        </h2>
        <p v-if="top.profession" class="caption-line"><i class="ri-briefcase-4-fill" aria-hidden="true"></i>{{ top.profession }}</p>
        <p v-if="study" class="caption-line"><i class="ri-graduation-cap-fill" aria-hidden="true"></i>{{ study }}</p>
        <p v-if="distance || top.approximateLocation" class="caption-line">
          <i class="ri-map-pin-2-fill" aria-hidden="true"></i>{{ distance ? `${top.distanceKm} km away` : top.approximateLocation }}
        </p>
      </div>

      <div v-if="match !== null" class="match-pill" :title="`${top.commonInterestsCount} shared interests`">
        <span class="match-ring" :style="{ '--pct': match }"><i class="ri-heart-3-fill" aria-hidden="true"></i></span>
        <span><strong>{{ match }}%</strong>Match</span>
      </div>
    </article>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { DiscoveryCandidate } from '../../types';
import { formatDistance } from '../../services/directory';
import { photoBackground, photosOf } from '../../services/media';
import { educationLine, matchPercent } from '../../utils/profileFormat';
import { useAuthStore } from '../../stores/auth';

const props = defineProps<{
  top: DiscoveryCandidate;
  behind: DiscoveryCandidate[];
}>();

const emit = defineEmits<{
  (e: 'like'): void;
  (e: 'pass'): void;
  (e: 'open'): void;
}>();

const SWIPE_THRESHOLD = 110;
/** Movement under this many pixels is a tap, not a drag. */
const TAP_SLOP = 8;
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const authStore = useAuthStore();
const card = ref<HTMLElement | null>(null);
const dx = ref(0);
const dy = ref(0);
const dragging = ref(false);
const flying = ref(false);
const photoIndex = ref(0);
let startX = 0;
let startY = 0;
let pointerId: number | null = null;

watch(() => props.top.id, () => (photoIndex.value = 0));

const photos = computed(() => photosOf(props.top));
const distance = computed(() => formatDistance(props.top.distanceKm));
const study = computed(() => educationLine(props.top));
const match = computed(() =>
  matchPercent(props.top.commonInterestsCount, authStore.profile?.interests.length ?? 0, props.top.interests.length)
);

const topStyle = computed(() => ({
  transform: `translate3d(${dx.value}px, ${dy.value * 0.35}px, 0) rotate(${dx.value * 0.06}deg)`,
}));
const likeOpacity = computed(() => Math.max(0, Math.min(1, dx.value / SWIPE_THRESHOLD)));
const passOpacity = computed(() => Math.max(0, Math.min(1, -dx.value / SWIPE_THRESHOLD)));

function onPointerDown(e: PointerEvent) {
  if (flying.value || e.button !== 0) return;
  pointerId = e.pointerId;
  card.value?.setPointerCapture(e.pointerId);
  startX = e.clientX;
  startY = e.clientY;
  dragging.value = true;
}

function onPointerMove(e: PointerEvent) {
  if (!dragging.value || e.pointerId !== pointerId) return;
  dx.value = e.clientX - startX;
  dy.value = e.clientY - startY;
}

function onPointerUp(e: PointerEvent) {
  if (!dragging.value || e.pointerId !== pointerId) return;
  dragging.value = false;
  pointerId = null;
  if (e.type === 'pointerup' && Math.abs(dx.value) < TAP_SLOP && Math.abs(dy.value) < TAP_SLOP) {
    dx.value = 0;
    dy.value = 0;
    return onTap(e);
  }
  if (dx.value > SWIPE_THRESHOLD) fling('right');
  else if (dx.value < -SWIPE_THRESHOLD) fling('left');
  else {
    dx.value = 0;
    dy.value = 0;
  }
}

/** Edges step through photos; anywhere else opens the full profile. */
function onTap(e: PointerEvent) {
  const box = card.value?.getBoundingClientRect();
  if (!box) return;
  const x = (e.clientX - box.left) / box.width;
  const y = (e.clientY - box.top) / box.height;
  if (photos.value.length > 1 && y < 0.7 && (x < 0.3 || x > 0.7)) {
    const step = x < 0.3 ? -1 : 1;
    photoIndex.value = (photoIndex.value + step + photos.value.length) % photos.value.length;
    return;
  }
  emit('open');
}

/** Throws the card off-screen, then reports the decision. Also used by the action buttons. */
function fling(direction: 'left' | 'right') {
  if (flying.value) return;
  if ('vibrate' in navigator) navigator.vibrate(direction === 'right' ? [8, 40, 12] : 8);
  const done = () => {
    if (direction === 'right') emit('like');
    else emit('pass');
    flying.value = false;
    dx.value = 0;
    dy.value = 0;
  };
  if (reduceMotion) return done();
  flying.value = true;
  dx.value = (direction === 'right' ? 1 : -1) * (window.innerWidth * 0.9 + 200);
  dy.value = dy.value || -40;
  setTimeout(done, 320);
}

defineExpose({ fling });
</script>

<style scoped lang="scss">
.stack-stage {
  position: relative;
  width: 100%;
  aspect-ratio: 3 / 3.5;
  max-width: 100%;
  margin: 0 auto;
  perspective: 1400px;
  outline: none;
  touch-action: pan-y;

  @media (min-width: 768px) {
    max-width: 30rem;
  }

  &:focus-visible .stack-card-top {
    box-shadow: 0 0 0 3px var(--unmute-accent-text), var(--unmute-shadow-3d);
  }
}

.stack-card {
  position: absolute;
  inset: 0;
  border-radius: 1.8rem;
  overflow: hidden;
  background-color: #efe3f3;
  background-size: cover;
  background-position: center;
  box-shadow: 0 16px 36px -18px rgba(117, 48, 170, 0.45);
  user-select: none;
}

.stack-card-behind {
  transform: translate3d(0, calc(var(--depth) * 14px), calc(var(--depth) * -60px)) scale(calc(1 - var(--depth) * 0.04));
  filter: saturate(0.8) brightness(calc(1 - var(--depth) * 0.08));
  z-index: calc(10 - var(--depth));
  transition: transform var(--unmute-transition-bounce), filter var(--unmute-transition-normal);
}

.stack-card-top {
  z-index: 20;
  cursor: grab;
  transition: transform 420ms cubic-bezier(0.2, 0.9, 0.25, 1.1);

  &.is-dragging {
    cursor: grabbing;
    transition: none;
  }

  &.is-flying {
    transition: transform 320ms cubic-bezier(0.5, 0, 0.75, 0);
  }
}

.card-photo {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--unmute-surface-active);
  background-image: linear-gradient(150deg, #ff9aa8 0%, #c00078 60%, #4a005b 100%);
  background-size: cover;
  background-position: center 25%;
}

.photo-initial {
  font-size: 7rem;
  font-weight: 800;
  color: rgba(255, 255, 255, 0.85);
}

.card-shade {
  position: absolute;
  inset: 0;
  background: linear-gradient(to top, rgba(30, 10, 30, 0.82) 0%, rgba(30, 10, 30, 0.2) 38%, transparent 55%);
  pointer-events: none;
}

.photo-bars {
  position: absolute;
  top: 0.8rem;
  left: 1.2rem;
  right: 6rem;
  z-index: 3;
  display: flex;
  gap: 0.35rem;

  span {
    flex: 1;
    height: 4px;
    border-radius: 4px;
    background: rgba(255, 255, 255, 0.45);

    &.is-on {
      background: #fff;
    }
  }
}

.photo-count {
  position: absolute;
  top: 0.9rem;
  right: 1rem;
  z-index: 3;
  padding: 0.2rem 0.7rem;
  border-radius: 9999px;
  background: rgba(30, 20, 30, 0.6);
  color: #fff;
  font-size: 0.85rem;
  font-weight: 600;
}

.online-pill {
  position: absolute;
  top: 2rem;
  left: 1rem;
  z-index: 3;
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.3rem 0.8rem;
  border-radius: 9999px;
  background: rgba(255, 255, 255, 0.9);
  color: #1a7a3c;
  font-size: 0.85rem;
  font-weight: 600;
}

.verdict {
  position: absolute;
  top: 3.5rem;
  z-index: 3;
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.45rem 1rem;
  border-radius: var(--unmute-radius-pill);
  font-weight: 800;
  color: #fff;
  pointer-events: none;
}

.verdict-like {
  left: 1.25rem;
  background: rgba(242, 24, 114, 0.85);
  transform: rotate(-8deg);
}

.verdict-pass {
  right: 1.25rem;
  background: rgba(36, 21, 45, 0.7);
  transform: rotate(8deg);
}

.card-caption {
  position: absolute;
  left: 0;
  right: 8rem;
  bottom: 0;
  z-index: 2;
  padding: 1rem 1.2rem 1.2rem;
  color: #fff;
  pointer-events: none;
}

.caption-name {
  margin: 0 0 0.4rem;
  color: #fff;
  font-size: clamp(1.8rem, 7vw, 2.3rem);
  font-weight: 800;
  letter-spacing: -0.02em;
  text-shadow: 0 2px 14px rgba(0, 0, 0, 0.4);
}

.caption-verified {
  color: #1d8cf8;
  font-size: 0.75em;
  vertical-align: 0.05em;
  background: radial-gradient(circle, #fff 45%, transparent 46%);
}

.caption-line {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  margin: 0.2rem 0 0;
  font-size: 1.02rem;
  color: rgba(255, 255, 255, 0.95);

  i {
    font-size: 1.15rem;
  }
}

.match-pill {
  position: absolute;
  right: 1rem;
  bottom: 1.1rem;
  z-index: 3;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.45rem 0.9rem 0.45rem 0.45rem;
  border-radius: 1.4rem;
  background: rgba(255, 255, 255, 0.92);
  color: #3c3fa0;
  font-size: 0.85rem;
  pointer-events: none;

  strong {
    display: block;
    font-size: 1.15rem;
    color: #10106b;
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
</style>
