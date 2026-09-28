<template>
  <div class="notifications-page">
    <ScreenBar back>
      <template #actions>
        <button
          type="button"
          class="round-btn"
          aria-label="Mark all as read"
          title="Mark all as read"
          :disabled="!store.unreadCount"
          @click="store.markAllRead()"
        >
          <i class="ri-check-double-line" aria-hidden="true"></i>
        </button>
      </template>
    </ScreenBar>

    <h1 class="page-title">Notifications</h1>
    <p class="page-sub">
      {{ store.unreadCount ? `${store.unreadCount} new` : 'You are all caught up' }}
    </p>

    <!-- Likes stay anonymous: a teaser, as dating apps do, that sends you back to the deck -->
    <router-link v-if="likes.length" to="/discover" class="likes-teaser">
      <span class="teaser-faces" aria-hidden="true">
        <span v-for="n in Math.min(likes.length, 3)" :key="n" class="teaser-face">
          <i class="ri-heart-3-fill"></i>
        </span>
      </span>
      <span class="teaser-text">
        <strong>{{ likes.length === 1 ? '1 person likes you' : `${likes.length} people like you` }}</strong>
        <span>Like them back in Discover to match</span>
      </span>
      <i class="ri-arrow-right-s-line teaser-arrow" aria-hidden="true"></i>
    </router-link>

    <div class="pill-tabs" role="group" aria-label="Show">
      <button v-for="tab in tabs" :key="tab.value" type="button" :aria-pressed="view === tab.value" @click="view = tab.value">
        {{ tab.label }}<span v-if="tab.unread" class="tab-count">{{ tab.unread }}</span>
      </button>
    </div>

    <div v-if="store.loading && !store.loaded" class="feed" aria-busy="true">
      <USkeleton v-for="n in 5" :key="n" height="4.5rem" class="row-skeleton" />
    </div>

    <UEmptyState v-else-if="visible.length === 0" :title="emptyText.title" :description="emptyText.description">
      <template #icon><i class="ri-notification-3-line fs-2"></i></template>
      <template #action>
        <UButton variant="primary" size="md" @click="$router.push('/discover')">Discover People</UButton>
      </template>
    </UEmptyState>

    <template v-else>
      <section v-for="group in groups" :key="group.label" class="feed-group" :aria-label="group.label">
        <h2 class="group-label">{{ group.label }}</h2>
        <ul class="feed">
          <li v-for="n in group.items" :key="n.id" class="feed-row" :class="{ 'is-unread': !n.read }">
            <button type="button" class="row-main" @click="open(n)">
              <span class="row-avatar">
                <span v-if="n.type === 'like'" class="like-avatar" aria-hidden="true">
                  <i class="ri-heart-3-fill"></i>
                </span>
                <UAvatar v-else :src="n.actor?.avatarUrl" :name="n.actor?.displayName" size="md" :online="n.actor?.isOnline" />
                <span class="type-badge" :class="`is-${n.type}`" aria-hidden="true">
                  <i :class="TYPE_ICONS[n.type]"></i>
                </span>
              </span>
              <span class="row-text">
                <span class="row-title">{{ describeNotification(n) }}</span>
                <span v-if="n.type === 'message' && n.preview" class="row-preview">“{{ n.preview }}”</span>
                <span v-else-if="n.type === 'match'" class="row-preview">Say hi before the spark fades</span>
                <span class="row-time">{{ timeLabel(n.createdAt) }}</span>
              </span>
              <span v-if="!n.read" class="unread-dot" aria-label="Unread"></span>
            </button>
            <button type="button" class="row-remove" aria-label="Remove notification" @click="store.remove(n)">
              <i class="ri-close-line" aria-hidden="true"></i>
            </button>
          </li>
        </ul>
      </section>

      <div v-if="store.hasMore" class="text-center mt-2">
        <UButton variant="secondary" size="md" :disabled="store.loading" @click="store.loadMore()">Show older</UButton>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import ScreenBar from '../components/layout/ScreenBar.vue';
import UAvatar from '../components/ui/UAvatar.vue';
import UButton from '../components/ui/UButton.vue';
import UEmptyState from '../components/ui/UEmptyState.vue';
import USkeleton from '../components/ui/USkeleton.vue';
import { describeNotification, useNotificationStore } from '../stores/notifications';
import { AppNotification, NotificationType } from '../types';

const TYPE_ICONS: Record<NotificationType, string> = {
  like: 'ri-heart-3-fill',
  match: 'ri-sparkling-2-fill',
  message: 'ri-chat-3-fill',
};

const DAY_MS = 24 * 60 * 60 * 1000;

const router = useRouter();
const store = useNotificationStore();
const view = ref<'all' | NotificationType>('all');

const likes = computed(() => store.items.filter((n) => n.type === 'like'));

const tabs = computed(() => {
  const unread = (type?: NotificationType) => store.items.filter((n) => !n.read && (!type || n.type === type)).length;
  return [
    { value: 'all' as const, label: 'All', unread: unread() },
    { value: 'match' as const, label: 'Matches', unread: unread('match') },
    { value: 'message' as const, label: 'Messages', unread: unread('message') },
    { value: 'like' as const, label: 'Likes', unread: unread('like') },
  ];
});

const visible = computed(() => (view.value === 'all' ? store.items : store.items.filter((n) => n.type === view.value)));

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** Today / Yesterday / This week / Earlier, newest first (the feed is already sorted). */
const groups = computed(() => {
  const today = startOfDay(new Date());
  const buckets: { label: string; items: AppNotification[] }[] = [
    { label: 'Today', items: [] },
    { label: 'Yesterday', items: [] },
    { label: 'This week', items: [] },
    { label: 'Earlier', items: [] },
  ];
  for (const n of visible.value) {
    const days = Math.round((today - startOfDay(new Date(n.createdAt))) / DAY_MS);
    buckets[days <= 0 ? 0 : days === 1 ? 1 : days < 7 ? 2 : 3].items.push(n);
  }
  return buckets.filter((b) => b.items.length);
});

const emptyText = computed(() => ({
  all: { title: 'No notifications yet', description: 'Likes, matches and messages will show up here.' },
  match: { title: 'No matches yet', description: 'When someone you like likes you back, you will hear about it here.' },
  message: { title: 'No messages yet', description: 'Say hi to a match and their replies will show up here.' },
  like: { title: 'No likes yet', description: 'A complete profile with a few photos gets noticed sooner.' },
})[view.value]);

function timeLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const minutes = Math.floor((Date.now() - date.getTime()) / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)}h ago`;
  const days = Math.floor(minutes / (24 * 60));
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

function open(n: AppNotification) {
  store.markRead(n);
  if (n.type === 'like') router.push('/discover');
  else if (n.conversationId) router.push(`/chat/${n.conversationId}`);
}

onMounted(() => store.load());
</script>

<style scoped lang="scss">
.notifications-page {
  width: 100%;
  max-width: 44rem;
}

.page-title {
  margin: 0;
  font-size: 2.3rem;
  font-weight: 800;
  color: var(--unmute-text-heading);
}

.page-sub {
  margin-bottom: 1rem;
  font-size: 1.1rem;
  color: var(--unmute-text-secondary);
}

.likes-teaser {
  display: flex;
  align-items: center;
  gap: 0.9rem;
  margin-bottom: 1.1rem;
  padding: 0.9rem 1rem;
  border-radius: 1.4rem;
  background: var(--unmute-primary-gradient);
  color: #fff;
  text-decoration: none;
  box-shadow: var(--unmute-glow-primary);
}

.teaser-faces {
  display: flex;
  flex-shrink: 0;
}

.teaser-face {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2.8rem;
  height: 2.8rem;
  border: 2px solid rgba(255, 255, 255, 0.9);
  border-radius: 50%;
  // A frosted stand-in for the hidden face.
  background: rgba(255, 255, 255, 0.25);
  backdrop-filter: blur(6px);
  font-size: 1.2rem;

  & + & {
    margin-left: -0.9rem;
  }
}

.teaser-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;

  strong {
    font-size: 1.05rem;
  }

  span {
    font-size: 0.88rem;
    opacity: 0.9;
  }
}

.teaser-arrow {
  font-size: 1.6rem;
}

.pill-tabs {
  display: flex;
  margin-bottom: 1rem;
  padding: 0.25rem;
  border-radius: var(--unmute-radius-pill);
  background: var(--unmute-primary-surface);
  overflow-x: auto;

  button {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    min-height: 2.6rem;
    padding: 0 0.7rem;
    border: 0;
    border-radius: var(--unmute-radius-pill);
    background: transparent;
    color: var(--unmute-text-secondary);
    font-size: 0.95rem;
    font-weight: 600;
    white-space: nowrap;
  }

  button[aria-pressed='true'] {
    background: var(--unmute-primary-gradient);
    color: #fff;
  }
}

.tab-count {
  min-width: 1.35rem;
  height: 1.35rem;
  padding: 0 0.35rem;
  border-radius: 9999px;
  background: var(--unmute-cta);
  color: #fff;
  font-size: 0.75rem;
  line-height: 1.35rem;

  [aria-pressed='true'] & {
    background: rgba(255, 255, 255, 0.28);
  }
}

.feed-group + .feed-group {
  margin-top: 1.1rem;
}

.group-label {
  margin: 0 0 0.5rem 0.25rem;
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--unmute-text-muted);
}

.feed {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.row-skeleton {
  border-radius: 1.1rem;
}

.feed-row {
  position: relative;
  display: flex;
  align-items: stretch;
  border-radius: 1.1rem;
  background: var(--unmute-surface);
  box-shadow: var(--unmute-shadow-md);

  &.is-unread {
    background: linear-gradient(0deg, var(--unmute-primary-surface), var(--unmute-primary-surface)), var(--unmute-surface);
  }
}

.row-main {
  display: flex;
  align-items: center;
  gap: 0.85rem;
  flex: 1;
  min-width: 0;
  padding: 0.75rem 0.5rem 0.75rem 0.85rem;
  border: 0;
  background: transparent;
  color: inherit;
  text-align: left;
}

.row-avatar {
  position: relative;
  flex-shrink: 0;
}

.like-avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 3rem;
  height: 3rem;
  border-radius: 50%;
  background: var(--unmute-primary-gradient);
  color: #fff;
  font-size: 1.3rem;
  filter: saturate(0.9);
}

.type-badge {
  position: absolute;
  right: -0.2rem;
  bottom: -0.2rem;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.35rem;
  height: 1.35rem;
  border-radius: 50%;
  color: #fff;
  font-size: 0.75rem;
  box-shadow: 0 0 0 2px var(--unmute-surface);

  &.is-like {
    background: var(--unmute-cta);
  }

  &.is-match {
    background: var(--unmute-primary);
  }

  &.is-message {
    background: var(--unmute-text-secondary);
  }
}

.row-text {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  min-width: 0;
  flex: 1;
}

.row-title {
  font-size: 0.97rem;
  color: var(--unmute-text-primary);

  .is-unread & {
    font-weight: 700;
    color: var(--unmute-text-heading);
  }
}

.row-preview {
  overflow: hidden;
  font-size: 0.88rem;
  color: var(--unmute-text-secondary);
  white-space: nowrap;
  text-overflow: ellipsis;
}

.row-time {
  font-size: 0.78rem;
  color: var(--unmute-text-muted);
}

.unread-dot {
  flex-shrink: 0;
  width: 0.6rem;
  height: 0.6rem;
  border-radius: 50%;
  background: var(--unmute-cta);
}

.row-remove {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 2.6rem;
  border: 0;
  border-radius: 0 1.1rem 1.1rem 0;
  background: transparent;
  color: var(--unmute-text-muted);
  font-size: 1.1rem;

  &:hover {
    color: var(--unmute-danger);
  }
}
</style>
