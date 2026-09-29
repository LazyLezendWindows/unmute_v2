<template>
  <div class="app-shell min-vh-100 d-flex flex-column position-relative u-page">
    <AppNav :show-mobile-dock="showMobileDock" />

    <main
      :class="{ 'has-mobile-dock': showMobileDock }"
      class="app-main flex-grow-1 d-flex flex-column position-relative"
    >
      <div class="app-stage flex-grow-1 d-flex flex-column w-100 mx-auto">
        <PlanBanner />
        <slot />
      </div>
    </main>

    <!-- Global mutual-match celebration -->
    <MatchModal :match="discoverStore.activeMatch" @dismiss="discoverStore.dismissMatchModal" />
    <!-- Calls from matches ring on any screen -->
    <IncomingCall />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import AppNav from '../components/layout/AppNav.vue';
import MatchModal from '../components/matching/MatchModal.vue';
import PlanBanner from '../components/layout/PlanBanner.vue';
import IncomingCall from '../components/matching/IncomingCall.vue';
import { useDiscoverStore } from '../stores/discover';

const route = useRoute();

// Full-screen flows with their own bottom actions: the call screen and the filters screen.
const FOCUSED_SCREENS = ['call', 'discover-filters'];
const discoverStore = useDiscoverStore();

// Inside an open conversation the message composer owns the bottom of the screen, and the
// new-account setup steps are a focused flow without the tab bar.
const showMobileDock = computed(
  () => !(route.name === 'chat' && route.params.id) && !route.query.setup && !FOCUSED_SCREENS.includes(String(route.name))
);
</script>

<style scoped lang="scss">
// Grows with its content (the body is a full-height flex column, which would otherwise squeeze
// this to one screen), and clips only sideways so the page itself keeps scrolling vertically.
.app-shell {
  flex-shrink: 0;
  overflow-x: clip;
}

.app-main {
  z-index: 10;
  padding: 0.5rem 1rem 1.5rem;

  // Clearance for the mobile tab bar (and the home indicator).
  &.has-mobile-dock {
    padding-bottom: calc(7rem + env(safe-area-inset-bottom, 0px));
  }

  // Desktop: content sits to the right of the sidebar.
  @media (min-width: 768px) {
    &,
    &.has-mobile-dock {
      padding: 2rem 2.5rem 2rem calc(var(--unmute-dock-width) + 2.5rem);
    }
  }
}

.app-stage {
  max-width: 72rem;
}
</style>
