<template>
  <router-link to="/notifications" class="round-btn" :aria-label="label">
    <i :class="store.unreadCount ? 'ri-notification-3-fill' : 'ri-notification-3-line'" aria-hidden="true"></i>
    <span v-if="store.unreadCount" class="bell-count" aria-hidden="true">{{ store.unreadCount > 99 ? '99+' : store.unreadCount }}</span>
  </router-link>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useNotificationStore } from '../../stores/notifications';

const store = useNotificationStore();
const label = computed(() =>
  store.unreadCount ? `Notifications, ${store.unreadCount} unread` : 'Notifications'
);
</script>

<style scoped lang="scss">
.bell-count {
  position: absolute;
  top: -0.15rem;
  right: -0.15rem;
  min-width: 1.25rem;
  height: 1.25rem;
  padding: 0 0.3rem;
  border-radius: 9999px;
  background: var(--unmute-cta);
  color: #fff;
  font-size: 0.68rem;
  font-weight: 700;
  line-height: 1.25rem;
  text-align: center;
  box-shadow: 0 0 0 2px var(--unmute-surface);
}
</style>
