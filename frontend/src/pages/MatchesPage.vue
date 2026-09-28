<template>
  <div class="matches-page">
    <ScreenBar back>
      <template #actions>
        <NotificationBell />
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
    <p class="page-sub">People who liked you</p>

    <div class="pill-tabs" role="group" aria-label="Match views">
      <button v-for="tab in tabs" :key="tab.value" type="button" :aria-pressed="view === tab.value" @click="view = tab.value">
        {{ tab.label }}<span class="tab-count">{{ tab.count }}</span>
      </button>
    </div>

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
      <article v-for="match in visibleMatches" :key="match.matchId" class="match-card">
        <div class="card-photo" :style="photoBackground(match.user.avatarUrl)" role="link" tabindex="0" :aria-label="`View ${match.user.displayName}'s profile`" @click="$router.push(`/people/${match.user.id}`)" @keydown.enter="$router.push(`/people/${match.user.id}`)">
          <span v-if="!match.user.avatarUrl" class="photo-initial">{{ match.user.displayName.charAt(0) }}</span>
          <span v-if="statusOf(match)" class="status" :class="statusOf(match)!.tone">
            <span class="status-dot" aria-hidden="true"></span>{{ statusOf(match)!.label }}
          </span>
          <button type="button" class="photo-more" :aria-label="`Report or block ${match.user.displayName}`" @click="safetyTarget = match.user">
            <i class="ri-more-fill" aria-hidden="true"></i>
          </button>
        </div>
        <div class="card-body">
          <div class="card-line">
            <h2 class="card-name">
              {{ match.user.displayName }}, {{ match.user.age }}
              <i v-if="match.user.isVerified" class="ri-verified-badge-fill verified-badge" aria-label="Verified"></i>
            </h2>
            <span v-if="match.user.distanceKm !== null" class="card-distance">
              <i class="ri-map-pin-line" aria-hidden="true"></i>{{ match.user.distanceKm }} km
            </span>
          </div>
          <div v-if="match.user.interests.length" class="card-chips">
            <span v-for="name in match.user.interests.slice(0, 2)" :key="name" class="card-chip" :title="name">
              <i :class="interestIcon(name)" aria-hidden="true"></i>{{ shortName(name) }}
            </span>
          </div>
          <div class="card-actions">
            <button type="button" class="act-hide" :aria-label="`Hide ${match.user.displayName}`" @click="hide(match.matchId)">
              <i class="ri-close-line" aria-hidden="true"></i>
            </button>
            <router-link :to="`/chat/${match.conversationId}`" class="act-chat" :aria-label="`Chat with ${match.user.displayName}`">
              <i class="ri-heart-3-fill" aria-hidden="true"></i>
            </router-link>
          </div>
        </div>
      </article>
    </div>

    <SafetyModal
      v-if="safetyTarget"
      :is-open="Boolean(safetyTarget)"
      :target-user-id="safetyTarget.id"
      :target-name="safetyTarget.displayName"
      @close="safetyTarget = null"
      @action-completed="onSafetyCompleted"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import ScreenBar from '../components/layout/ScreenBar.vue';
import NotificationBell from '../components/layout/NotificationBell.vue';
import { photoBackground } from '../services/media';
import SafetyModal from '../components/safety/SafetyModal.vue';
import UButton from '../components/ui/UButton.vue';
import UEmptyState from '../components/ui/UEmptyState.vue';
import USkeleton from '../components/ui/USkeleton.vue';
import { useAuthStore } from '../stores/auth';
import { useChatStore } from '../stores/chat';
import { interestIcon } from '../utils/interestIcon';
import { Match } from '../types';

/** Matches within this many km count as Nearby. */
const NEARBY_KM = 25;

const authStore = useAuthStore();
const chatStore = useChatStore();
const view = ref<'all' | 'new' | 'nearby'>('all');
const safetyTarget = ref<{ id: string; displayName: string } | null>(null);

// Hiding a card is a per-viewer convenience kept on this device; the match itself stays.
const hiddenKey = computed(() => `unmute.hiddenMatches.v1:${authStore.user?.id ?? ''}`);
const hidden = ref<string[]>(readHidden());

function readHidden(): string[] {
  try {
    return JSON.parse(localStorage.getItem(hiddenKey.value) || '[]');
  } catch {
    return [];
  }
}

function hide(matchId: string) {
  hidden.value = [...hidden.value, matchId];
  try {
    localStorage.setItem(hiddenKey.value, JSON.stringify(hidden.value));
  } catch {
    // Still hidden for this visit.
  }
}

const shown = computed(() => chatStore.matches.filter((m) => !hidden.value.includes(m.matchId)));
const newMatches = computed(() => shown.value.filter((m) => !m.lastMessage));
const nearby = computed(() => shown.value.filter((m) => m.user.distanceKm !== null && m.user.distanceKm <= NEARBY_KM));

const tabs = computed(() => [
  { value: 'all' as const, label: 'All Matches', count: shown.value.length },
  { value: 'new' as const, label: 'New', count: newMatches.value.length },
  { value: 'nearby' as const, label: 'Nearby', count: nearby.value.length },
]);

const visibleMatches = computed(() => ({ all: shown.value, new: newMatches.value, nearby: nearby.value })[view.value]);

const emptyText = computed(() => ({
  all: { title: 'No matches yet', description: 'When someone you like also likes you back, they will appear here.' },
  new: { title: 'No new matches', description: 'You have said hello to all your matches.' },
  nearby: { title: 'No one nearby yet', description: `Matches within ${NEARBY_KM} km show up here once you both set your area.` },
})[view.value]);

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

onMounted(() => chatStore.loadMatches());
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
  margin-bottom: 1.1rem;
  padding: 0.25rem;
  border-radius: var(--unmute-radius-pill);
  background: #f3effc;

  button {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    min-height: 3rem;
    border: 0;
    border-radius: var(--unmute-radius-pill);
    background: transparent;
    color: #4b3fb8;
    font-size: 1.05rem;
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

.card-chips {
  display: flex;
  gap: 0.3rem;
  overflow: hidden;
}

.card-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  flex-shrink: 1;
  min-width: 0;
  padding: 0.25rem 0.55rem;
  border-radius: 9999px;
  background: #faf1fb;
  color: $ink;
  font-size: 0.8rem;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;

  i {
    color: #e5147c;
    font-size: 1rem;
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
