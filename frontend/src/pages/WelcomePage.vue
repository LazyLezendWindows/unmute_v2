<template>
  <AuthStage tagline logo-size="6rem">
    <div class="d-flex flex-column gap-4">
      <div class="welcome-hero" aria-hidden="true">
        <img :src="couplePhoto" alt="" class="hero-photo" fetchpriority="high" />
        <svg class="hero-wave" viewBox="0 0 390 100" preserveAspectRatio="none">
          <path d="M0 38C60 12 120 62 200 42S330 8 390 30V100H0Z" fill="#d9a8ef" opacity="0.55" />
          <path d="M0 58C80 36 150 86 240 60S350 40 390 52V100H0Z" fill="#efd3f7" opacity="0.85" />
          <path d="M0 78C90 62 180 98 270 80S360 70 390 76V100H0Z" fill="#fbf2fc" />
        </svg>
        <i class="ri-heart-3-fill hero-heart"></i>
      </div>

      <UButton class="welcome-actions" variant="primary" size="lg" block @click="$router.push('/register')">
        Get Started <i class="ri-arrow-right-line ms-2" aria-hidden="true"></i>
      </UButton>

      <div class="auth-divider" role="separator">or continue with</div>
      <div class="social-row">
        <GoogleSignIn text="continue_with" @authenticated="onSignedIn" />
        <PhoneSignIn @authenticated="onSignedIn" />
      </div>

      <p class="text-center small mb-0 u-text-muted">
        Already have an account?
        <router-link to="/login" class="auth-link ms-1">Sign in</router-link>
      </p>
    </div>
  </AuthStage>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router';
import AuthStage from '../components/auth/AuthStage.vue';
import UButton from '../components/ui/UButton.vue';
import GoogleSignIn from '../components/auth/GoogleSignIn.vue';
import PhoneSignIn from '../components/auth/PhoneSignIn.vue';
import { ONBOARDING_START } from '../onboarding';
import couplePhoto from '../assets/welcome-couple.webp';

const router = useRouter();

function onSignedIn(isNewUser: boolean) {
  router.push(isNewUser ? ONBOARDING_START : '/discover');
}
</script>

<style scoped lang="scss">
// The couple at sunset, edge to edge: its sky fades up behind the tagline and lilac waves wash
// over its lower edge, just above Get Started.
.welcome-hero {
  position: relative;
  z-index: 0;
  height: 20rem;
  margin: -8.5rem -1.25rem -2.75rem;
  overflow: hidden;
  pointer-events: none;

  @media (min-width: 576px) {
    margin-inline: -2.25rem;
  }
}

.hero-photo {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center 72%;
  -webkit-mask-image: linear-gradient(to bottom, transparent 0%, rgba(0, 0, 0, 0.35) 22%, #000 48%);
  mask-image: linear-gradient(to bottom, transparent 0%, rgba(0, 0, 0, 0.35) 22%, #000 48%);
}

.hero-wave {
  position: absolute;
  left: 0;
  right: 0;
  bottom: -1px;
  width: 100%;
  height: 6.5rem;
}

.hero-heart {
  position: absolute;
  right: 9%;
  bottom: 4.2rem;
  font-size: 1.5rem;
  color: #ffc2dc;
  filter: drop-shadow(0 4px 10px rgba(242, 24, 114, 0.3));
  animation: hero-float 5s ease-in-out infinite;
}

@keyframes hero-float {
  0%, 100% { transform: translateY(0) rotate(-6deg); }
  50% { transform: translateY(-6px) rotate(4deg); }
}

.welcome-actions {
  position: relative;
  z-index: 1;
}

// Google and Phone side by side, as in the brand screen. Google's own button can't be narrower
// than 200px, so once it loads the two stack instead.
.social-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.75rem;

  &:has(.is-gis) {
    grid-template-columns: minmax(0, 1fr);
  }

  :deep(.social-btn) {
    justify-content: flex-start;
    min-height: 3.75rem;
    padding: 0.5rem 0.9rem;
    gap: 0.6rem;
    font-size: 0.92rem;
    line-height: 1.2;
    text-align: left;
    border-radius: 1.25rem;
  }

  &:has(.is-gis) :deep(.social-btn) {
    justify-content: center;
    min-height: 3.25rem;
    border-radius: var(--unmute-radius-pill);
  }
}

:global([data-theme='dark']) .hero-wave {
  opacity: 0.35;
}
</style>
