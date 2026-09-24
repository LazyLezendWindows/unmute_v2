<template>
  <header class="page-header">
    <ScreenBar :back="back">
      <template v-if="$slots.actions" #actions>
        <slot name="actions" />
      </template>
    </ScreenBar>
    <h1 class="page-title">{{ title }}</h1>
    <p v-if="subtitle" class="page-subtitle">{{ subtitle }}</p>
  </header>
</template>

<script setup lang="ts">
import ScreenBar from './ScreenBar.vue';

/** The brand screens' header: the logo bar (with `back` when set), then a large title. */
defineProps<{ title: string; subtitle?: string; back?: string }>();
</script>

<style scoped>
.page-header {
  margin-bottom: 1.1rem;
}

.page-title {
  margin: 0;
  font-size: clamp(2rem, 6vw, 2.3rem);
  font-weight: 800;
  letter-spacing: -0.02em;
  color: #10106b;
}

.page-subtitle {
  margin: 0.1rem 0 0;
  font-size: 1.2rem;
  color: #5b4bc4;
}

:global([data-theme='dark']) .page-title {
  color: var(--unmute-text-heading);
}
</style>
