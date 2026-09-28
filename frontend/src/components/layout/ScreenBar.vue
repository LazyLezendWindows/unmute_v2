<template>
  <!-- A screen's top bar: back on the left, the logo, the screen's own round buttons on the right -->
  <header class="screen-bar" :class="{ 'is-centered': centered }">
    <div class="bar-side">
      <button v-if="back" type="button" class="round-btn" aria-label="Back" @click="goBack">
        <i class="ri-arrow-left-s-line" aria-hidden="true"></i>
      </button>
      <slot name="start" />
    </div>
    <router-link to="/discover" class="bar-logo" aria-label="Unmute home">
      <BrandLogo size="2.5rem" />
    </router-link>
    <div class="bar-side bar-end">
      <slot name="actions" />
    </div>
  </header>
</template>

<script setup lang="ts">
import { computed, useSlots } from 'vue';
import { useRouter } from 'vue-router';
import BrandLogo from './BrandLogo.vue';

const props = defineProps<{
  /** Route the back button returns to; `true` goes back in history (falling back to Discover). */
  back?: boolean | string;
}>();

const router = useRouter();
const slots = useSlots();

// The logo sits in the middle whenever something is on its left, as in the mockups' sub-screens.
const centered = computed(() => Boolean(props.back || slots.start));

function goBack() {
  if (typeof props.back === 'string') router.push(props.back);
  else if (window.history.state?.back) router.back();
  else router.push('/discover');
}
</script>

<style scoped lang="scss">
.screen-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 1rem;
  padding-top: env(safe-area-inset-top, 0px);

  &.is-centered {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
  }
}

.bar-side {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  min-width: 0;

  &:empty {
    display: none;
  }

  .is-centered &:empty {
    display: flex;
  }
}

.bar-end {
  justify-content: flex-end;
}

.bar-logo {
  display: flex;
  text-decoration: none;
}

// Phones: with a back button on the left and two buttons on the right, the full wordmark no
// longer fits between them, so only the heart mark stays.
@media (max-width: 479.98px) {
  .screen-bar.is-centered:has(.bar-end > :nth-child(2)) :deep(.brand-logo-word) {
    display: none;
  }
}

// Very narrow phones: three buttons beside the full wordmark don't fit either.
@media (max-width: 399.98px) {
  .screen-bar:has(.bar-end > :nth-child(3)) :deep(.brand-logo-word) {
    display: none;
  }
}

// Web: the sidebar carries the logo, so the bar keeps only its buttons.
@media (min-width: 768px) {
  .bar-logo {
    visibility: hidden;
  }
}
</style>
