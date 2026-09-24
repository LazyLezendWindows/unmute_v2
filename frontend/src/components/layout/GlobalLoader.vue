<template>
  <!-- Thin brand-gradient bar across the top while any request or page load is in flight -->
  <div
    class="global-loader"
    :class="{ 'is-visible': visible }"
    role="progressbar"
    aria-label="Loading"
    :aria-hidden="!visible"
    :aria-busy="visible"
  >
    <span class="global-loader-bar"></span>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue';
import { isBusy } from '../../services/activity';

// Quick requests finish before the bar appears (no flicker); once shown it stays long enough to read as motion.
const SHOW_DELAY_MS = 150;
const MIN_VISIBLE_MS = 400;

const visible = ref(false);
let showTimer: ReturnType<typeof setTimeout> | undefined;
let hideTimer: ReturnType<typeof setTimeout> | undefined;
let shownAt = 0;

watch(isBusy, (busy) => {
  clearTimeout(showTimer);
  clearTimeout(hideTimer);
  if (busy) {
    if (!visible.value) {
      showTimer = setTimeout(() => {
        visible.value = true;
        shownAt = Date.now();
      }, SHOW_DELAY_MS);
    }
  } else if (visible.value) {
    hideTimer = setTimeout(() => (visible.value = false), Math.max(0, MIN_VISIBLE_MS - (Date.now() - shownAt)));
  }
});

onBeforeUnmount(() => {
  clearTimeout(showTimer);
  clearTimeout(hideTimer);
});
</script>

<style scoped>
.global-loader {
  position: fixed;
  z-index: 2000;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  overflow: hidden;
  pointer-events: none;
  opacity: 0;
  transition: opacity 200ms ease;
}

.global-loader.is-visible {
  opacity: 1;
}

.global-loader-bar {
  position: absolute;
  top: 0;
  bottom: 0;
  left: -40%;
  width: 40%;
  border-radius: 0 3px 3px 0;
  background: var(--unmute-primary-gradient);
  box-shadow: 0 0 10px color-mix(in srgb, var(--unmute-primary) 60%, transparent);
  animation: global-loader-slide 1.1s cubic-bezier(0.4, 0, 0.2, 1) infinite;
}

@keyframes global-loader-slide {
  0% {
    left: -40%;
    width: 40%;
  }
  60% {
    width: 55%;
  }
  100% {
    left: 100%;
    width: 30%;
  }
}

/* No sliding for people who prefer less motion: a gentle pulse of the full bar instead. */
@media (prefers-reduced-motion: reduce) {
  .global-loader-bar {
    left: 0;
    width: 100%;
    animation: global-loader-pulse 1.4s ease-in-out infinite;
  }

  @keyframes global-loader-pulse {
    50% {
      opacity: 0.4;
    }
  }
}
</style>
