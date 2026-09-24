<template>
  <!-- Unmute logo: a heart whose right lobe is a speech bubble carrying sound bars, plus the two-tone wordmark -->
  <span class="brand-logo" :class="`brand-logo-${layout}`" :style="{ '--logo-size': size }" role="img" aria-label="Unmute">
    <svg class="brand-logo-mark" viewBox="0 0 100 92" aria-hidden="true">
      <defs>
        <linearGradient :id="`${uid}-left`" x1="0" y1="0" x2="0.9" y2="1">
          <stop offset="0%" stop-color="#ff7a6e" />
          <stop offset="55%" stop-color="#f21872" />
          <stop offset="100%" stop-color="#e0106f" />
        </linearGradient>
        <linearGradient :id="`${uid}-right`" x1="0.2" y1="0" x2="0.8" y2="1">
          <stop offset="0%" stop-color="#c00078" />
          <stop offset="45%" stop-color="#79006e" />
          <stop offset="100%" stop-color="#4a005b" />
        </linearGradient>
        <linearGradient :id="`${uid}-fold`" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#c00078" />
          <stop offset="100%" stop-color="#f21872" />
        </linearGradient>
      </defs>
      <!-- Left lobe (the heart) -->
      <path
        :fill="`url(#${uid}-left)`"
        d="M50 86C32 74 4 56 4 29C4 14 15 4 29 4C39 4 46 10 50 18C54 10 61 4 71 4C85 4 96 14 96 29C96 50 76 66 50 86Z"
      />
      <!-- Inner fold -->
      <path :fill="`url(#${uid}-fold)`" d="M48 34C40 28 30 32 30 42C30 52 40 62 50 72L52 44Z" opacity="0.85" />
      <!-- Right lobe (the speech bubble, tail at the bottom) -->
      <path
        :fill="`url(#${uid}-right)`"
        d="M50 18C54 10 61 4 71 4C85 4 96 14 96 29C96 48 80 62 60 72L53 86L52 70C46 58 42 42 50 18Z"
      />
      <!-- Sound bars -->
      <rect x="62" y="31" width="5.5" height="11" rx="2.75" fill="#fff0f5" />
      <rect x="71" y="25" width="5.5" height="23" rx="2.75" fill="#fff0f5" />
      <rect x="80" y="19" width="5.5" height="35" rx="2.75" fill="#fff0f5" />
    </svg>
    <span v-if="layout !== 'mark'" class="brand-logo-word">
      <span class="word-un">Un</span><span class="word-mute">mute</span>
    </span>
  </span>
</template>

<script setup lang="ts">
import { useId } from 'vue';

withDefaults(
  defineProps<{
    /** `mark` is the symbol alone; `inline` puts the wordmark beside it, `stacked` below it. */
    layout?: 'mark' | 'inline' | 'stacked';
    /** Height of the symbol. */
    size?: string;
  }>(),
  { layout: 'inline', size: '2rem' }
);

// Gradient ids must be unique per instance, or every logo on the page reuses the first one's.
const uid = `logo-${useId()}`;
</script>

<style scoped lang="scss">
.brand-logo {
  display: inline-flex;
  align-items: center;
  gap: calc(var(--logo-size) * 0.18);
  line-height: 1;
}

.brand-logo-stacked {
  flex-direction: column;
  gap: calc(var(--logo-size) * 0.08);
}

.brand-logo-mark {
  height: var(--logo-size);
  width: auto;
  flex-shrink: 0;
  overflow: visible;
  filter: drop-shadow(0 calc(var(--logo-size) * 0.06) calc(var(--logo-size) * 0.12) rgba(192, 0, 120, 0.22));
}

.brand-logo-word {
  font-family: var(--unmute-font-logo);
  font-weight: 900;
  font-size: calc(var(--logo-size) * 0.72);
  letter-spacing: -0.02em;
}

.brand-logo-stacked .brand-logo-word {
  font-size: calc(var(--logo-size) * 0.5);
}

.word-un {
  color: var(--unmute-logo-dark);
}

.word-mute {
  background: linear-gradient(100deg, #f21872 0%, #ff5f72 100%);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}
</style>
