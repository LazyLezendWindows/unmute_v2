<template>
  <div class="matches-page">
    <ScreenBar back>
      <template #actions>
        <button
          type="button"
          class="round-btn"
          aria-label="Refresh matches"
          title="Refresh matches"
          :disabled="chatStore.matchesLoading"
          :aria-busy="chatStore.matchesLoading"
          @click="refresh"
        >
          <i class="ri-refresh-line" :class="{ 'is-spinning': chatStore.matchesLoading }" aria-hidden="true"></i>
        </button>
      </template>
    </ScreenBar>

    <h1 class="page-title">Matches</h1>
    <p class="page-sub">{{ SUBTITLES[view] }}</p>

    <div ref="tabStrip" class="pill-tabs" :class="{ 'has-more': tabsMore }" role="group" aria-label="Match views" @scroll.passive="updateTabsMore">
      <button v-for="tab in tabs" :key="tab.value" type="button" :aria-pressed="view === tab.value" @click="pickTab(tab.value, $event)">
        {{ tab.label }}<span v-if="tab.count" class="tab-count">{{ tab.count }}</span>
      </button>
    </div>

    <!-- Liked You: like back to match, or pass -->
    <template v-if="view === 'likesYou'">
      <div v-if="chatStore.likedLoading && !chatStore.likesReceived.length" class="match-grid" aria-busy="true">
        <USkeleton v-for="n in 4" :key="n" type="card" height="19rem" class="card-skeleton" />
      </div>
      <UEmptyState
        v-else-if="chatStore.likesReceived.length === 0"
        title="No new likes yet"
        description="When someone likes you, they'll show up here. Like them back to match."
      >
        <template #icon><i class="ri-heart-3-fill fs-2"></i></template>
      </UEmptyState>
      <div v-else class="match-grid">
        <article v-for="(person, i) in chatStore.likesReceived" :key="person.id" class="match-card enter-rise" :style="{ '--i': i }">
          <div class="card-photo" :style="photoBackground(person.avatarUrl)" role="link" tabindex="0" :aria-label="`View ${person.displayName}'s profile`" @click="$router.push(`/people/${person.id}`)" @keydown.enter="$router.push(`/people/${person.id}`)">
            <span v-if="!person.avatarUrl" class="photo-initial">{{ person.displayName.charAt(0) }}</span>
            <span v-if="person.superLike" class="status is-super"><i class="ri-star-fill" aria-hidden="true"></i>Super Like</span>
            <span v-else class="status is-liked"><span class="status-dot" aria-hidden="true"></span>Liked You</span>
          </div>
          <div class="card-body">
            <div class="card-line">
              <h2 class="card-name">
                {{ person.displayName }}, {{ person.age }}
                <i v-if="person.isVerified" class="ri-verified-badge-fill verified-badge" aria-label="Verified"></i><PremiumBadge v-if="person.isPremium" :plan="person.premiumPlan" />
              </h2>
            </div>
            <div v-if="person.interests.length" class="card-chips">
              <span v-for="name in person.interests.slice(0, 3)" :key="name" class="card-chip" :title="name">
                <i :class="interestIcon(name)" aria-hidden="true"></i>{{ shortName(name) }}
              </span>
            </div>
            <div class="card-actions">
              <button type="button" class="act-hide" :aria-label="`Pass on ${person.displayName}`" :disabled="answering === person.id" @click="answer(person, 'pass')">
                <i class="ri-close-line" aria-hidden="true"></i>
              </button>
              <button type="button" class="act-chat" :aria-label="`Like ${person.displayName} back`" :disabled="answering === person.id" @click="answer(person, 'like')">
                <i class="ri-heart-3-fill" aria-hidden="true"></i>
              </button>
            </div>
          </div>
        </article>
      </div>
    </template>

    <!-- Liked: people you liked, waiting for them -->
    <template v-else-if="view === 'liked'">
      <div v-if="chatStore.likedLoading" class="match-grid" aria-busy="true">
        <USkeleton v-for="n in 4" :key="n" type="card" height="19rem" class="card-skeleton" />
      </div>
      <UEmptyState
        v-else-if="chatStore.likedProfiles.length === 0"
        title="No likes sent yet"
        description="Profiles you like will appear here until they like you back."
      >
        <template #icon><i class="ri-heart-add-fill fs-2"></i></template>
        <template #action>
          <UButton variant="primary" size="md" @click="$router.push('/discover')">Discover People</UButton>
        </template>
      </UEmptyState>
      <div v-else class="match-grid">
        <article v-for="(person, i) in chatStore.likedProfiles" :key="person.id" class="match-card enter-rise" :style="{ '--i': i }">
          <div class="card-photo" :style="photoBackground(person.avatarUrl)" role="link" tabindex="0" :aria-label="`View ${person.displayName}'s profile`" @click="$router.push(`/people/${person.id}`)" @keydown.enter="$router.push(`/people/${person.id}`)">
            <span v-if="!person.avatarUrl" class="photo-initial">{{ person.displayName.charAt(0) }}</span>
            <span class="status is-new"><span class="status-dot" aria-hidden="true"></span>Waiting</span>
          </div>
          <div class="card-body">
            <div class="card-line">
              <h2 class="card-name">
                {{ person.displayName }}, {{ person.age }}
                <i v-if="person.isVerified" class="ri-verified-badge-fill verified-badge" aria-label="Verified"></i><PremiumBadge v-if="person.isPremium" :plan="person.premiumPlan" />
              </h2>
            </div>
            <div v-if="person.interests.length" class="card-chips">
              <span v-for="name in person.interests.slice(0, 3)" :key="name" class="card-chip" :title="name">
                <i :class="interestIcon(name)" aria-hidden="true"></i>{{ shortName(name) }}
              </span>
            </div>
          </div>
        </article>
      </div>
    </template>

    <!-- Matches tabs -->
    <template v-else>
      <div v-if="chatStore.matchesLoading && chatStore.matches.length === 0" class="match-grid" aria-busy="true">
        <USkeleton v-for="n in 4" :key="n" type="card" height="19rem" class="card-skeleton" />
      </div>

      <UEmptyState
        v-else-if="visibleMatches.length === 0"
        :title="emptyText.title"
        :description="emptyText.description"
      >
        <template #icon><i class="ri-heart-3-fill fs-2"></i></template>
        <template v-if="view === 'all'" #action>
          <UButton variant="primary" size="md" @click="$router.push('/discover')">Discover People</UButton>
        </template>
      </UEmptyState>

      <div v-else class="match-grid">
        <article v-for="(match, i) in visibleMatches" :key="match.matchId" class="match-card enter-rise" :style="{ '--i': i }">
          <div class="card-photo" :style="photoBackground(match.user.avatarUrl)" role="link" tabindex="0" :aria-label="`View ${match.user.displayName}'s profile`" @click="$router.push(`/people/${match.user.id}`)" @keydown.enter="$router.push(`/people/${match.user.id}`)">
            <span v-if="!match.user.avatarUrl" class="photo-initial">{{ match.user.displayName.charAt(0) }}</span>
            <span v-if="statusOf(match)" class="status" :class="statusOf(match)!.tone">
              <span class="status-dot" aria-hidden="true"></span>{{ statusOf(match)!.label }}
            </span>
            <button type="button" class="photo-more" :aria-label="`Report or block ${match.user.displayName}`" @click.stop="openSafety(match, 'report')" @keydown.enter.stop>
              <i class="ri-more-fill" aria-hidden="true"></i>
            </button>
          </div>
          <div class="card-body">
            <div class="card-line">
              <h2 class="card-name">
                {{ match.user.displayName }}, {{ match.user.age }}
                <i v-if="match.user.isVerified" class="ri-verified-badge-fill verified-badge" aria-label="Verified"></i><PremiumBadge v-if="match.user.isPremium" :plan="match.user.premiumPlan" />
              </h2>
              <span v-if="match.user.distanceKm !== null" class="card-distance">
                <i class="ri-map-pin-line" aria-hidden="true"></i>{{ match.user.distanceKm }} km
              </span>
            </div>
            <div v-if="match.user.interests.length" class="card-chips">
              <span v-for="name in match.user.interests.slice(0, 3)" :key="name" class="card-chip" :title="name">
                <i :class="interestIcon(name)" aria-hidden="true"></i>{{ shortName(name) }}
              </span>
            </div>
            <div class="card-actions">
              <button type="button" class="act-hide" :aria-label="`Unmatch ${match.user.displayName}`" @click="openSafety(match, 'unmatch')">
                <i class="ri-close-line" aria-hidden="true"></i>
              </button>
              <router-link :to="`/chat/${match.conversationId}`" class="act-chat" :aria-label="`Chat with ${match.user.displayName}`">
                <i class="ri-heart-3-fill" aria-hidden="true"></i>
              </router-link>
            </div>
          </div>
        </article>
      </div>
    </template>

    <SafetyModal
      v-if="safetyTarget"
      :is-open="Boolean(safetyTarget)"
      :target-user-id="safetyTarget.id"
      :target-name="safetyTarget.displayName"
      :match-id="safetyTarget.matchId"
      :initial-mode="safetyMode"
      @close="safetyTarget = null"
      @action-completed="onSafetyCompleted"
    />
  </div>
</template>

<script setup lang="ts">
import PremiumBadge from '../components/premium/PremiumBadge.vue';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import ScreenBar from '../components/layout/ScreenBar.vue';
import { photoBackground } from '../services/media';
import SafetyModal from '../components/safety/SafetyModal.vue';
import UButton from '../components/ui/UButton.vue';
import UEmptyState from '../components/ui/UEmptyState.vue';
import USkeleton from '../components/ui/USkeleton.vue';
import { useChatStore } from '../stores/chat';
import { interestIcon } from '../utils/interestIcon';
import { Match } from '../types';
import { api } from '../services/api';
import { useToastStore } from '../stores/toast';

/** Matches within this many km count as Nearby. */
const NEARBY_KM = 25;

const chatStore = useChatStore();
const router = useRouter();
type View = 'all' | 'new' | 'nearby' | 'likesYou' | 'liked';
const view = ref<View>('all');
const tabStrip = ref<HTMLElement | null>(null);
const tabsMore = ref(false);

function updateTabsMore() {
  const el = tabStrip.value;
  tabsMore.value = !!el && el.scrollLeft + el.clientWidth < el.scrollWidth - 4;
}

function pickTab(value: View, event: MouseEvent) {
  view.value = value;
  (event.currentTarget as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
}
const SUBTITLES: Record<View, string> = {
  all: 'People who liked you back',
  new: 'Matches you haven’t messaged yet',
  nearby: 'Matches close to you',
  likesYou: 'Like them back to match',
  liked: 'Waiting for them to like you back',
};
const safetyTarget = ref<{ id: string; displayName: string; matchId?: string } | null>(null);
const safetyMode = ref<'report' | 'unmatch'>('report');

function openSafety(match: { matchId: string; user: { id: string; displayName: string } }, mode: 'report' | 'unmatch') {
  safetyMode.value = mode;
  safetyTarget.value = { id: match.user.id, displayName: match.user.displayName, matchId: match.matchId };
}

// Unmatching removes a match for both people (Unmatch in the ✕ or ⋯ menu).
const shown = computed(() => chatStore.matches);
const newMatches = computed(() => shown.value.filter((m) => !m.lastMessage));
const nearby = computed(() => shown.value.filter((m) => m.user.distanceKm !== null && m.user.distanceKm <= NEARBY_KM));

const tabs = computed(() => [
  { value: 'all' as const, label: 'All Matches', count: shown.value.length },
  { value: 'new' as const, label: 'New', count: newMatches.value.length },
  { value: 'nearby' as const, label: 'Nearby', count: nearby.value.length },
  { value: 'likesYou' as const, label: 'Liked You', count: chatStore.likesReceived.length },
  { value: 'liked' as const, label: 'Liked', count: chatStore.likedProfiles.length },
]);

const visibleMatches = computed(() => {
  if (view.value === 'new') return newMatches.value;
  if (view.value === 'nearby') return nearby.value;
  return shown.value;
});

const EMPTY = {
  all: { title: 'No matches yet', description: 'When someone you like also likes you back, they will appear here.' },
  new: { title: 'No new matches', description: 'You have said hello to all your matches.' },
  nearby: { title: 'No one nearby yet', description: `Matches within ${NEARBY_KM} km show up here once you both set your area.` },
};
const emptyText = computed(() => (view.value === 'new' || view.value === 'nearby' ? EMPTY[view.value] : EMPTY.all));

const answering = ref<string | null>(null);

/** Liking back makes a match (the match screen opens); passing hides them. */
async function answer(person: { id: string; displayName: string }, action: 'like' | 'pass') {
  answering.value = person.id;
  try {
    const res = await api.post(`/interactions/${action}`, { targetUserId: person.id });
    chatStore.likesReceived = chatStore.likesReceived.filter((p) => p.id !== person.id);
    if (action === 'like' && res.data.data.matched) {
      await chatStore.loadMatches();
      const match = chatStore.matches.find((m) => m.user.id === person.id);
      if (match) router.push(`/chat/${match.conversationId}`);
      useToastStore().success(`It's a match with ${person.displayName}! Say hello.`);
    }
  } catch (err: any) {
    useToastStore().error(err.message);
  } finally {
    answering.value = null;
  }
}

/** Cards are narrow: "Reading & Books" shows as "Reading" (the full name is the tooltip). */
function shortName(name: string) {
  return name.split(/\s*[&/]\s*|\s+/)[0];
}

function statusOf(match: Match) {
  if (match.user.isOnline) return { label: 'Online', tone: 'is-online' };
  if (!match.lastMessage) return { label: 'New Match', tone: 'is-new' };
  return null;
}

function refresh() {
  chatStore.loadMatches();
}

function onSafetyCompleted() {
  safetyTarget.value = null;
  chatStore.loadMatches();
}

onMounted(() => {
  chatStore.loadMatches();
  chatStore.loadLikedProfiles();
  updateTabsMore();
  window.addEventListener('resize', updateTabsMore);
});
// Counts arriving change the tabs' width.
watch(tabs, () => nextTick(updateTabsMore), { deep: true });
onBeforeUnmount(() => window.removeEventListener('resize', updateTabsMore));
</script>

<style scoped lang="scss">
$ink: #10106b;
$gradient: linear-gradient(95deg, #ff3d8b 0%, #e0149a 50%, #8a1fe0 100%);

.matches-page {
  width: 100%;
}

.is-spinning {
  animation: refresh-spin 0.8s linear infinite;
}

@keyframes refresh-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .is-spinning {
    animation: none;
  }
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
  color: #5b4bc4;
}

.pill-tabs {
  display: flex;
  transition: mask-image 0.2s;

  // More tabs off to the right: fade the edge so it reads as scrollable.
  &.has-more {
    -webkit-mask-image: linear-gradient(90deg, #000 82%, transparent);
    mask-image: linear-gradient(90deg, #000 82%, transparent);
  }

  margin-bottom: 1.1rem;
  padding: 0.25rem;
  border-radius: var(--unmute-radius-pill);
  background: #f3effc;
  overflow-x: auto;
  scrollbar-width: none;

  button {
    flex: 1 0 auto;
    padding: 0 0.9rem;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    min-height: 3rem;
    border: 0;
    border-radius: var(--unmute-radius-pill);
    background: transparent;
    color: #4b3fb8;
    font-size: 0.92rem;
    white-space: nowrap;
  }

  button[aria-pressed='true'] {
    background: $gradient;
    color: #fff;
  }
}

.tab-count {
  min-width: 1.6rem;
  height: 1.6rem;
  padding: 0 0.4rem;
  border-radius: 9999px;
  background: #f21872;
  color: #fff;
  font-size: 0.85rem;
  line-height: 1.6rem;

  [aria-pressed='true'] & {
    background: rgba(255, 255, 255, 0.28);
  }
}

.match-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(15rem, calc(50% - 0.5rem)), 1fr));
  gap: 1rem 0.9rem;
}

.card-skeleton {
  border-radius: 1.4rem;
}

.match-card {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: 1.4rem;
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 12px 30px -20px rgba(117, 48, 170, 0.5);
}

.card-photo {
  position: relative;
  cursor: pointer;
  aspect-ratio: 1.55;
  display: flex;
  align-items: center;
  justify-content: center;
  background-size: cover;
  background-position: center 25%;
  background-image: linear-gradient(150deg, #ff9aa8 0%, #c00078 60%, #4a005b 100%);
}

.photo-initial {
  font-size: 3.5rem;
  font-weight: 800;
  color: rgba(255, 255, 255, 0.85);
}

.status {
  position: absolute;
  top: 0.6rem;
  left: 0.6rem;
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.2rem 0.65rem 0.2rem 0.45rem;
  border-radius: 9999px;
  color: #fff;
  font-size: 0.85rem;

  &.is-online {
    background: #1b9e4b;
  }

  &.is-liked {
    background: #f21872;
  }

  &.is-super {
    background: linear-gradient(95deg, #8a1fe0, #f21872);

    i { font-size: 0.8rem; }
  }

  &.is-new {
    background: rgba(40, 20, 50, 0.65);
  }
}

.status-dot {
  width: 0.65rem;
  height: 0.65rem;
  border-radius: 50%;
  background: #fff;
}

.photo-more {
  position: absolute;
  top: 0.55rem;
  right: 0.55rem;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.9rem;
  height: 1.9rem;
  border: 0;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.75);
  color: #333;
  font-size: 1.1rem;
}

.card-body {
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
  padding: 0.65rem 0.7rem 0.8rem;
}

.card-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.4rem;
}

.card-name {
  margin: 0;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 1.15rem;
  font-weight: 800;
  color: $ink;
}

.card-distance {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
  flex-shrink: 0;
  color: #3c3fa0;
  font-size: 0.95rem;
}

// One row of whole chips: any that don't fit drop out of sight rather than being cut mid-word.
.card-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
  height: 1.6rem;
  overflow: hidden;
}

.card-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
  height: 1.6rem;
  padding: 0 0.45rem;
  border-radius: 9999px;
  background: #faf1fb;
  color: $ink;
  font-size: 0.72rem;
  white-space: nowrap;

  i {
    color: #e5147c;
    font-size: 0.85rem;
  }
}

.card-actions {
  display: grid;
  grid-template-columns: 1fr 1.2fr;
  gap: 0.6rem;
  margin-top: auto;
  padding: 0.2rem 0.4rem 0;
}

.act-hide,
.act-chat {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 2.9rem;
  border: 0;
  border-radius: var(--unmute-radius-pill);
  font-size: 1.6rem;
  text-decoration: none;
}

.act-hide {
  background: #f1eefa;
  color: #3c3fa0;
}

.act-chat {
  background: $gradient;
  color: #fff;
  box-shadow: 0 10px 20px -12px rgba(192, 0, 120, 0.7);
}
</style>
