<template>
  <div class="legal-page u-page">
    <!-- Public: readable before signing up, and linked from Settings. -->
    <div class="legal-card">
      <header class="legal-head">
        <button type="button" class="legal-back" aria-label="Back" @click="goBack">
          <i class="ri-arrow-left-s-line" aria-hidden="true"></i>
        </button>
        <router-link to="/" aria-label="Unmute home"><BrandLogo size="2rem" /></router-link>
      </header>
      <h1 class="legal-title">{{ doc.title }}</h1>
      <nav class="legal-switch" aria-label="Legal documents">
        <router-link to="/terms">Terms of Service</router-link>
        <router-link to="/privacy">Privacy Policy</router-link>
      </nav>
      <LegalDocumentView :doc="doc" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import BrandLogo from '../components/layout/BrandLogo.vue';
import LegalDocumentView from '../components/legal/LegalDocumentView.vue';
import { PRIVACY, TERMS } from '../content/legal';

const route = useRoute();
const router = useRouter();
const doc = computed(() => (route.name === 'privacy' ? PRIVACY : TERMS));

function goBack() {
  if (window.history.state?.back) router.back();
  else router.push('/');
}
</script>

<style scoped lang="scss">
.legal-page {
  min-height: 100vh;
  padding: calc(1rem + env(safe-area-inset-top, 0px)) 1rem calc(2rem + env(safe-area-inset-bottom, 0px));
  background: var(--unmute-app-bg, var(--unmute-chip-pink));
}

.legal-card {
  max-width: 46rem;
  margin: 0 auto;

  @media (min-width: 576px) {
    padding: 2rem 2.25rem;
    border-radius: var(--unmute-radius-xl);
    background: var(--unmute-surface);
    border: 1px solid var(--unmute-glass-border);
    box-shadow: var(--unmute-shadow-sm);
  }
}

.legal-head {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 1.25rem;
}

.legal-back {
  display: grid;
  place-items: center;
  width: 2.5rem;
  height: 2.5rem;
  border: 1px solid var(--unmute-glass-border);
  border-radius: 50%;
  background: var(--unmute-surface);
  color: var(--unmute-text-heading);
  font-size: 1.4rem;
}

.legal-title {
  margin: 0 0 0.75rem;
  font-size: clamp(1.6rem, 6vw, 2rem);
  font-weight: 800;
  color: var(--unmute-text-heading);
}

.legal-switch {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1.25rem;

  a {
    padding: 0.4rem 0.9rem;
    border-radius: var(--unmute-radius-pill);
    background: var(--unmute-primary-surface);
    color: var(--unmute-text-heading);
    font-size: 0.85rem;
    font-weight: 600;
    text-decoration: none;

    &.router-link-exact-active {
      background: var(--unmute-cta);
      color: #fff;
    }
  }
}
</style>
