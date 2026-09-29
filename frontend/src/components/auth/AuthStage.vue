<template>
  <div class="auth-stage min-vh-100 d-flex align-items-center justify-content-center u-page">
    <!-- Soft lavender circles, a thin ring and a heart around the edges, as in the brand screens -->
    <span class="auth-orb auth-orb-1" aria-hidden="true"></span>
    <span class="auth-orb auth-orb-2" aria-hidden="true"></span>
    <span class="auth-orb auth-orb-3" aria-hidden="true"></span>
    <span class="auth-ring" aria-hidden="true"></span>
    <i class="ri-heart-3-fill auth-heart auth-heart-1" aria-hidden="true"></i>
    <!-- Soft lilac waves along the bottom, as in the brand screens -->
    <svg class="auth-wave" viewBox="0 0 390 120" preserveAspectRatio="none" aria-hidden="true">
      <path d="M0 60C70 20 140 90 220 60S340 20 390 40V120H0Z" fill="#f6d4f0" opacity="0.7" />
      <path d="M0 85C90 55 170 115 260 85S360 65 390 75V120H0Z" fill="#e2c3f5" opacity="0.8" />
    </svg>

    <div class="auth-column w-100 position-relative">
      <router-link v-if="back" :to="back" class="auth-back" aria-label="Back">
        <i class="ri-arrow-left-s-line" aria-hidden="true"></i>
      </router-link>
      <header class="auth-header text-center">
        <BrandLogo layout="stacked" :size="logoSize" class="auth-logo" />
        <p v-if="tagline" class="auth-tagline mb-0">Real People<br />Real Conversations</p>
        <slot name="header" />
        <div v-if="title" class="auth-titles">
          <h1 class="auth-title mb-1">{{ title }}</h1>
          <p v-if="subtitle" class="auth-subtitle mb-0">{{ subtitle }}</p>
        </div>
      </header>
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
import BrandLogo from '../layout/BrandLogo.vue';

withDefaults(
  defineProps<{
    title?: string;
    subtitle?: string;
    /** Shows the brand line under the logo, as on the welcome and sign-in screens. */
    tagline?: boolean;
    /** Route for a back button in the top corner. */
    back?: string;
    logoSize?: string;
  }>(),
  { logoSize: '4.5rem' }
);
</script>

<style scoped lang="scss">
.auth-stage {
  padding: calc(2rem + env(safe-area-inset-top, 0px)) 1.25rem calc(2rem + env(safe-area-inset-bottom, 0px));
  overflow: hidden;
}

.auth-orb {
  position: fixed;
  z-index: 0;
  border-radius: 50%;
  background: rgba(233, 216, 250, 0.45);
  pointer-events: none;
}

.auth-orb-1 {
  top: -9rem;
  left: -9rem;
  width: 22rem;
  height: 22rem;
}

.auth-orb-2 {
  top: 38%;
  left: -8rem;
  width: 13rem;
  height: 13rem;
  background: rgba(233, 216, 250, 0.35);
}

.auth-orb-3 {
  top: 26%;
  right: -6rem;
  width: 11rem;
  height: 11rem;
}

:global([data-theme='dark']) .auth-orb {
  background: rgba(121, 0, 110, 0.12);
}

.auth-ring {
  position: fixed;
  top: 3rem;
  right: -5.5rem;
  width: 10rem;
  height: 10rem;
  border: 1px solid rgba(192, 0, 120, 0.15);
  border-radius: 50%;
  pointer-events: none;
}

.auth-heart {
  position: fixed;
  z-index: 0;
  color: #ffb3d1;
  filter: drop-shadow(0 6px 12px rgba(242, 24, 114, 0.25));
  pointer-events: none;
  animation: auth-heart-float 6s ease-in-out infinite;
}

.auth-heart-1 {
  top: 7.5rem;
  right: 10%;
  font-size: 2.1rem;
}


@keyframes auth-heart-float {
  0%, 100% { transform: translateY(0) rotate(-8deg); }
  50% { transform: translateY(-8px) rotate(4deg); }
}

.auth-wave {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 0;
  width: 100%;
  height: 7rem;
  pointer-events: none;
}

:global([data-theme='dark']) .auth-wave {
  opacity: 0.25;
}

.auth-column {
  max-width: 30rem;
  z-index: 1;

  @media (min-width: 576px) {
    // Full-bleed pieces (the welcome photo) stay inside the card's rounded corners.
    overflow: hidden;
    padding: 2.5rem 2.25rem;
    border-radius: var(--unmute-radius-xl);
    background: var(--unmute-glass-strong);
    backdrop-filter: blur(32px) saturate(160%);
    -webkit-backdrop-filter: blur(32px) saturate(160%);
    border: 1px solid var(--unmute-glass-border);
    box-shadow: var(--unmute-shadow-3d), var(--unmute-glass-edge);
  }
}

.auth-header {
  position: relative;
  z-index: 1;
  margin-bottom: 2rem;
}

.auth-logo {
  margin-bottom: 0.75rem;
}

.auth-tagline {
  margin-bottom: 1.9rem !important;
  font-size: 1rem;
  line-height: 1.35;
  color: var(--unmute-text-secondary);
}

.auth-back {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2.75rem;
  height: 2.75rem;
  border-radius: 50%;
  border: 1px solid var(--unmute-glass-border);
  background: var(--unmute-surface);
  box-shadow: var(--unmute-shadow-sm);
  color: var(--unmute-text-heading);
  font-size: 1.5rem;
  text-decoration: none;

  @media (min-width: 576px) {
    top: 1.5rem;
    left: 1.5rem;
  }
}

.auth-titles {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.auth-title {
  font-size: clamp(1.85rem, 4vw, 2.2rem);
  font-weight: 800;
  letter-spacing: -0.025em;
  color: var(--unmute-text-heading);
}

.auth-subtitle {
  font-size: 0.95rem;
  color: var(--unmute-text-muted);
  line-height: 1.5;
}

// White, softly rounded fields with plum icons.
.auth-column :deep(.u-input) {
  min-height: 3.3rem;
  border-radius: 1.1rem;
  border-color: rgba(74, 0, 91, 0.12);
  background-color: var(--unmute-surface);
  font-size: 0.98rem;
}

.auth-column :deep(.u-input-prefix),
.auth-column :deep(.u-input-reveal) {
  color: var(--unmute-brand-plum);
}

:global([data-theme='dark']) .auth-column :deep(.u-input-prefix),
:global([data-theme='dark']) .auth-column :deep(.u-input-reveal) {
  color: var(--unmute-text-secondary);
}

// The main call to action: coral into pink into deep plum, the arrow at the far right.
.auth-column :deep(.u-btn-primary.u-btn-lg) {
  min-height: 3.5rem;
  font-size: 1.1rem;
  font-weight: 700;
  background: linear-gradient(100deg, #ff7a6e 0%, #f21872 35%, #c00078 65%, #4a005b 100%);
  box-shadow: 0 16px 30px -14px rgba(192, 0, 120, 0.65);

  .ri-arrow-right-line {
    position: absolute;
    right: 1.5rem;
    margin: 0 !important;
    font-size: 1.35rem;
  }
}
</style>
