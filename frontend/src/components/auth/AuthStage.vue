<template>
  <div class="auth-stage min-vh-100 d-flex align-items-center justify-content-center u-page">
    <!-- Ambient blobs -->
    <div class="auth-blob auth-blob-1" aria-hidden="true"></div>
    <div class="auth-blob auth-blob-2" aria-hidden="true"></div>

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

.auth-blob {
  position: fixed;
  border-radius: 50%;
  pointer-events: none;
  z-index: 0;
  filter: blur(80px);
  opacity: 0.45;
}

.auth-blob-1 {
  width: 28rem;
  height: 28rem;
  top: -8rem;
  left: -8rem;
  background: radial-gradient(circle, rgba(242, 24, 114, 0.35) 0%, transparent 70%);
}

.auth-blob-2 {
  width: 22rem;
  height: 22rem;
  bottom: -6rem;
  right: -6rem;
  background: radial-gradient(circle, rgba(74, 0, 91, 0.3) 0%, transparent 70%);
}

.auth-column {
  max-width: 30rem;
  z-index: 1;

  @media (min-width: 576px) {
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
  margin-bottom: 2rem;
}

.auth-logo {
  margin-bottom: 0.75rem;
}

.auth-tagline {
  margin-bottom: 1.75rem !important;
  font-size: 1.05rem;
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
  font-size: clamp(1.75rem, 4vw, 2.2rem);
  font-weight: 800;
  letter-spacing: -0.025em;
  color: var(--unmute-text-heading);
}

.auth-subtitle {
  font-size: 0.9rem;
  color: var(--unmute-text-muted);
  line-height: 1.5;
}

:deep(.u-input) {
  min-height: 3.25rem;
  border-radius: var(--unmute-radius-sm);
  font-size: 0.95rem;
}

:deep(.u-btn-lg) {
  min-height: 3.4rem;
  font-size: 1rem;
  font-weight: 700;
}
</style>
