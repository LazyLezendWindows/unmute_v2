<template>
  <!-- The referral offer, shown on Discover, Profile and Upgrade so it's easy to find -->
  <div v-if="!hidden" class="ref-banner" :class="{ 'is-compact': compact, 'is-dismissible': dismissible }">
    <span class="ref-icon" aria-hidden="true"><i class="ri-gift-2-fill"></i></span>
    <span class="ref-text">
      <strong>{{ title }}</strong>
      <span>{{ text }}</span>
    </span>
    <router-link to="/referral" class="ref-cta">{{ cta }}</router-link>
    <button v-if="dismissible" type="button" class="ref-close" aria-label="Hide for now" @click="dismiss">
      <i class="ri-close-line" aria-hidden="true"></i>
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';

const props = withDefaults(
  defineProps<{
    title?: string;
    text?: string;
    cta?: string;
    compact?: boolean;
    /** Discover: can be hidden for a few days so it doesn't nag. */
    dismissible?: boolean;
  }>(),
  {
    title: 'Get 2 weeks free',
    text: 'Invite a friend. When they join with your code, you both get 2 weeks free.',
    cta: 'Invite',
  }
);

const KEY = 'unmute.referralBannerHiddenUntil';
const HIDE_DAYS = 3;

function hiddenNow(): boolean {
  if (!props.dismissible) return false;
  try {
    return Number(localStorage.getItem(KEY) || 0) > Date.now();
  } catch {
    return false;
  }
}

const hidden = ref(hiddenNow());

function dismiss() {
  hidden.value = true;
  try {
    localStorage.setItem(KEY, String(Date.now() + HIDE_DAYS * 24 * 3600 * 1000));
  } catch {
    // Hidden for this visit only.
  }
}
</script>

<style scoped lang="scss">
.ref-banner {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem;
  margin: 0 0 1rem;
  padding: 0.85rem 0.95rem;
  border-radius: 1.25rem;
  background: linear-gradient(110deg, #ff7a6e 0%, #f21872 42%, #c00078 75%, #6a0a7a 100%);
  color: #fff;
  box-shadow: 0 16px 32px -18px rgba(192, 0, 120, 0.75);
}

.ref-icon {
  flex-shrink: 0;
  display: grid;
  place-items: center;
  width: 2.6rem;
  height: 2.6rem;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.2);
  font-size: 1.4rem;
  animation: ref-wiggle 3s ease-in-out infinite;
}

@keyframes ref-wiggle {
  0%, 85%, 100% { transform: rotate(0); }
  90% { transform: rotate(-10deg); }
  95% { transform: rotate(10deg); }
}

.ref-text {
  display: flex;
  flex-direction: column;
  // Narrow spaces: the button drops below the text instead of squeezing it.
  flex: 1 1 11rem;
  min-width: 0;
  line-height: 1.3;

  strong { font-size: 1rem; }
  span { font-size: 0.82rem; opacity: 0.92; }
}

.ref-cta {
  flex-shrink: 0;
  margin-left: auto;
  padding: 0.45rem 1rem;
  border-radius: 9999px;
  background: var(--unmute-card);
  color: var(--unmute-accent-text);
  font-size: 0.85rem;
  font-weight: 800;
  text-decoration: none;
}

.is-dismissible {
  position: relative;
  padding-right: 2rem;
}

.ref-close {
  position: absolute;
  top: 0.35rem;
  right: 0.35rem;
  padding: 0.1rem;
  line-height: 1;
  border: 0;
  background: transparent;
  color: rgba(255, 255, 255, 0.85);
  font-size: 1.2rem;
}

.is-compact {
  .ref-text span { display: none; }
}

@media (prefers-reduced-motion: reduce) {
  .ref-icon { animation: none; }
}
</style>
