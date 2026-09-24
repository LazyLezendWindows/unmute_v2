<template>
  <div
    class="u-skeleton position-relative overflow-hidden"
    :class="[typeClass, customClass]"
    :style="customStyle"
  ></div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

type SkeletonType = 'text' | 'title' | 'avatar' | 'card' | 'button' | 'custom';

const props = withDefaults(
  defineProps<{
    type?: SkeletonType;
    width?: string;
    height?: string;
    customClass?: string;
  }>(),
  {
    type: 'text',
  }
);

const typeClass = computed(() => {
  switch (props.type) {
    case 'avatar':
      return 'skeleton-avatar flex-shrink-0';
    case 'title':
      return 'skeleton-title w-75';
    case 'button':
      return 'skeleton-button w-100';
    case 'card':
      return 'skeleton-card w-100';
    case 'text':
    default:
      return 'skeleton-text w-100';
  }
});

const customStyle = computed(() => {
  const style: Record<string, string> = {};
  if (props.width) style.width = props.width;
  if (props.height) style.height = props.height;
  return style;
});
</script>

<style scoped lang="scss">
.u-skeleton {
  background: linear-gradient(
    90deg,
    var(--unmute-surface-overlay) 25%,
    var(--unmute-surface-active) 50%,
    var(--unmute-surface-overlay) 75%
  );
  background-size: 200% 100%;
  animation: shimmer 1.8s infinite ease-in-out;
  border-radius: var(--radius-md, 12px);
}

.skeleton-avatar {
  width: 3rem;
  height: 3rem;
  border-radius: 50%;
}

.skeleton-title {
  height: 1.5rem;
  border-radius: var(--radius-sm, 10px);
}

.skeleton-button {
  height: 2.75rem;
  border-radius: var(--radius-md, 14px);
}

.skeleton-card {
  height: 18rem;
  border-radius: var(--radius-xl, 24px);
}

.skeleton-text {
  height: 1rem;
  border-radius: var(--radius-sm, 8px);
}

@media (prefers-reduced-motion: reduce) {
  .u-skeleton {
    animation: none;
  }
}

@keyframes shimmer {
  0% {
    background-position: -200% 0;
  }
  100% {
    background-position: 200% 0;
  }
}
</style>
