<template>
  <!-- Desktop: white sidebar with the full logo and labelled destinations -->
  <nav class="side-nav d-none d-md-flex flex-column" aria-label="Main">
    <router-link to="/discover" class="side-logo" aria-label="Unmute home">
      <BrandLogo size="2.1rem" class="d-none d-xl-inline-flex" />
      <BrandLogo layout="mark" size="2.1rem" class="d-xl-none" />
    </router-link>

    <div class="d-flex flex-column gap-1">
      <router-link
        v-for="item in desktopItems"
        :key="item.to"
        :to="item.to"
        class="side-item"
        :class="{ 'is-active': isNavActive(item, $route.path) }"
        :aria-current="isNavActive(item, $route.path) ? 'page' : undefined"
        :aria-label="item.label"
        :title="item.label"
      >
        <i :class="iconClass(item)" aria-hidden="true"></i>
        <span class="side-label">{{ item.label }}</span>
        <span v-if="badgeFor(item)" class="nav-badge side-badge">{{ badgeFor(item) }}</span>
      </router-link>
    </div>

    <router-link v-if="authStore.isAuthenticated" to="/profile" class="side-me mt-auto" aria-label="Your profile">
      <UAvatar :src="authStore.profile?.avatarUrl" :name="authStore.profile?.displayName || 'You'" size="md" />
      <span class="side-label min-w-0">
        <span class="side-me-name text-truncate">{{ authStore.profile?.displayName || 'You' }}</span>
        <span class="side-me-sub">View profile</span>
      </span>
    </router-link>
  </nav>

  <!-- Mobile: the tab bar (each screen draws its own top bar) -->
  <nav v-if="showMobileDock" class="tab-bar d-flex d-md-none" aria-label="Main">
    <router-link
      v-for="item in mobileItems"
      :key="item.to"
      :to="item.to"
      class="tab-item"
      :class="{ 'is-active': isNavActive(item, $route.path) }"
      :aria-current="isNavActive(item, $route.path) ? 'page' : undefined"
    >
      <span class="tab-icon">
        <i :class="iconClass(item)" aria-hidden="true"></i>
        <span v-if="badgeFor(item)" class="nav-badge tab-badge">{{ badgeFor(item) }}</span>
      </span>
      <span class="tab-label">{{ item.label }}</span>
    </router-link>
  </nav>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import { useRoute } from 'vue-router';
import UAvatar from '../ui/UAvatar.vue';
import BrandLogo from './BrandLogo.vue';
import { NAV_ITEMS, NavItem, isNavActive } from '../../navigation';
import { useAuthStore } from '../../stores/auth';
import { useChatStore } from '../../stores/chat';
import { useNotificationStore } from '../../stores/notifications';
import { useCallStore } from '../../stores/call';
import { usePremiumStore } from '../../stores/premium';
import { syncPush } from '../../services/push';

defineProps<{ showMobileDock: boolean }>();

const route = useRoute();
const authStore = useAuthStore();
const chatStore = useChatStore();
const notificationStore = useNotificationStore();
const callStore = useCallStore();
const premiumStore = usePremiumStore();
const desktopItems = NAV_ITEMS.filter((item) => item.desktop);
const mobileItems = NAV_ITEMS.filter((item) => item.mobile);

function badgeFor(item: NavItem): number {
  if (item.unreadBadge) return chatStore.totalUnreadCount;
  if (item.matchBadge) return chatStore.matches.length;
  if (item.notificationBadge) return notificationStore.unreadCount;
  return 0;
}

// The tab badges need both lists wherever the app is opened; notifications arrive live from then on.
onMounted(() => {
  chatStore.initSocketHandlers();
  if (!chatStore.matches.length) chatStore.loadMatches();
  if (!chatStore.conversations.length) chatStore.loadConversations();
  notificationStore.bindSocket();
  callStore.bindSocket();
  syncPush();
  premiumStore.load();
  notificationStore.refreshCount();
});

function iconClass(item: NavItem): string {
  return isNavActive(item, route.path) ? `${item.icon}-fill` : `${item.icon}-line`;
}
</script>

<style scoped lang="scss">
// ---- Desktop sidebar ----
.side-nav {
  position: fixed;
  z-index: 1030;
  top: 0;
  bottom: 0;
  left: 0;
  width: var(--unmute-dock-width);
  padding: 1.5rem 1rem 1.25rem;
  gap: 2rem;
  background: var(--unmute-surface);
  border-right: 1px solid var(--unmute-glass-border);
}

.side-logo {
  padding: 0 0.6rem;
  text-decoration: none;
}

// Below 1200px (tablets, small laptops) the sidebar is an icon rail.
@media (max-width: 1199.98px) {
  .side-nav {
    align-items: center;
    padding-left: 0.6rem;
    padding-right: 0.6rem;
  }

  .side-logo {
    padding: 0;
  }

  .side-label {
    display: none !important;
  }

  .side-item {
    position: relative;
    justify-content: center;
    width: 3.2rem;
    height: 3.2rem;
    padding: 0;
  }

  .side-badge {
    position: absolute;
    top: 0.3rem;
    right: 0.2rem;
  }

  .side-me {
    padding: 0.3rem;
    border-radius: 50%;
  }
}

@media (min-width: 1200px) {
  .side-badge {
    margin-left: auto;
  }
}

.side-item {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  padding: 0.7rem 0.9rem;
  border-radius: var(--unmute-radius-sm);
  font-weight: 600;
  font-size: 0.92rem;
  color: var(--unmute-text-muted);
  text-decoration: none;
  transition: background var(--unmute-transition-fast), color var(--unmute-transition-fast);

  i {
    font-size: 1.25rem;
  }

  &:hover {
    color: var(--unmute-text-primary);
    background: var(--unmute-surface-raised);
  }

  &.is-active {
    color: var(--unmute-accent-text);
    background: var(--unmute-primary-surface);
  }
}

.side-me {
  display: flex;
  align-items: center;
  gap: 0.7rem;
  padding: 0.6rem;
  border-radius: var(--unmute-radius-md);
  text-decoration: none;
  background: var(--unmute-surface-raised);

  > span {
    display: flex;
    flex-direction: column;
  }
}

.side-me-name {
  font-weight: 700;
  font-size: 0.9rem;
  color: var(--unmute-text-primary);
}

.side-me-sub {
  font-size: 0.75rem;
  color: var(--unmute-text-muted);
}

.nav-badge {
  min-width: 1.15rem;
  height: 1.15rem;
  padding: 0 0.3rem;
  border-radius: 9999px;
  background: var(--unmute-cta);
  color: #fff;
  font-size: 0.65rem;
  font-weight: 700;
  line-height: 1.15rem;
  text-align: center;
}

// ---- Mobile ----
@media (max-height: 500px) and (orientation: landscape) {
  .tab-bar {
    padding-top: 0.2rem;
  }
}

.tab-bar {
  position: fixed;
  z-index: 1030;
  left: max(0.75rem, env(safe-area-inset-left));
  right: max(0.75rem, env(safe-area-inset-right));
  bottom: max(0.75rem, env(safe-area-inset-bottom));
  justify-content: space-around;
  padding: 0.75rem 0.5rem 0.6rem;
  border-radius: 1.9rem;
  background: var(--unmute-surface);
  box-shadow: 0 10px 40px -12px rgba(117, 48, 170, 0.3);
}

.tab-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.1rem;
  position: relative;
  min-width: 0;
  flex: 1;
  padding-bottom: 0.35rem;
  color: var(--unmute-text-secondary);
  text-decoration: none;

  &.is-active {
    color: var(--unmute-cta);
    &::after {
      content: '';
      position: absolute;
      bottom: -0.3rem;
      width: 1.4rem;
      height: 3px;
      border-radius: 3px;
      background: currentColor;
    }
  }
}

.tab-icon {
  position: relative;
  font-size: 1.65rem;
  line-height: 1.9rem;
}

.tab-badge {
  position: absolute;
  top: -0.2rem;
  left: 0.95rem;
  box-shadow: 0 0 0 2px var(--unmute-surface);
}

.tab-label {
  font-size: 0.85rem;
  font-weight: 600;
}

</style>
