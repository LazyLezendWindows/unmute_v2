<template>
  <div class="d-flex flex-column gap-3">
    <nav class="menu-list" aria-label="Settings">
      <router-link to="/profile/edit" class="menu-row">
        <i class="ri-user-3-line" aria-hidden="true"></i>
        <span class="menu-text"><span class="menu-title">Account</span><span class="menu-sub text-truncate">{{ authStore.user?.email }}</span></span>
        <i class="ri-arrow-right-s-line menu-chevron" aria-hidden="true"></i>
      </router-link>
      <router-link to="/settings/appearance" class="menu-row">
        <i class="ri-palette-line" aria-hidden="true"></i>
        <span class="menu-text"><span class="menu-title">Appearance &amp; Theme</span></span>
        <span class="menu-value">{{ modeLabel }}</span>
        <i class="ri-arrow-right-s-line menu-chevron" aria-hidden="true"></i>
      </router-link>
      <router-link to="/safety" class="menu-row" exact-active-class="" :class="{ 'is-current': isSafety && !onBlocked }">
        <i class="ri-shield-check-line" aria-hidden="true"></i>
        <span class="menu-text"><span class="menu-title">Privacy &amp; Safety</span></span>
        <i class="ri-arrow-right-s-line menu-chevron" aria-hidden="true"></i>
      </router-link>
      <router-link :to="{ path: '/safety', hash: '#blocked' }" class="menu-row" exact-active-class="" :class="{ 'is-current': isSafety && onBlocked }">
        <i class="ri-user-forbid-line" aria-hidden="true"></i>
        <span class="menu-text"><span class="menu-title">Blocked users</span></span>
        <i class="ri-arrow-right-s-line menu-chevron" aria-hidden="true"></i>
      </router-link>
    </nav>

    <div class="menu-list">
      <button type="button" class="menu-row is-danger" @click="handleLogout">
        <i class="ri-logout-box-r-line" aria-hidden="true"></i>
        <span class="menu-text"><span class="menu-title">Log out</span></span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useThemeStore } from '../../stores/theme';
import { useAuthStore } from '../../stores/auth';

const router = useRouter();
const route = useRoute();

// Both rows open /safety; the router's highlight ignores the #hash, so these two compare it themselves.
const isSafety = computed(() => route.path === '/safety');
const onBlocked = computed(() => route.hash === '#blocked');
const themeStore = useThemeStore();
const authStore = useAuthStore();

const modeLabel = computed(() => ({ light: 'Light', dark: 'Dark', system: 'System' })[themeStore.mode]);

async function handleLogout() {
  await authStore.logout();
  router.push('/login');
}
</script>
