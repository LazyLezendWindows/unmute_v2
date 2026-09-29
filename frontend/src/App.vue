<template>
  <component :is="layout">
    <router-view v-slot="{ Component, route: current }">
      <Transition name="page" mode="out-in">
        <component :is="Component" :key="current.name" />
      </Transition>
    </router-view>
  </component>
  <GlobalLoader />
  <UToast />
  <OfflineScreen />
</template>

<script setup lang="ts">
import { computed, watch, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AppLayout from './layouts/AppLayout.vue';
import AdminLayout from './layouts/AdminLayout.vue';
import UToast from './components/ui/UToast.vue';
import GlobalLoader from './components/layout/GlobalLoader.vue';
import OfflineScreen from './components/layout/OfflineScreen.vue';
import { useCallStore } from './stores/call';
import { useAuthStore } from './stores/auth';
import { onSubscriptionRequired } from './services/api';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();

onMounted(() => {
  onSubscriptionRequired(() => {
    useCallStore().reset();
    if (route.name !== 'upgrade' && route.name !== 'safety') router.replace('/upgrade');
  });
});

// If the backend ends the session mid-use (expiry, revocation), leave protected screens immediately.
watch(
  () => authStore.status,
  (status) => {
    if (status === 'UNAUTHENTICATED' && route.meta.requiresAuth) {
      router.replace('/login');
    }
  }
);

const layout = computed(() => {
  if (route.meta.admin && !route.meta.adminPublic) return AdminLayout;
  return route.meta.requiresAuth ? AppLayout : 'div';
});
</script>

