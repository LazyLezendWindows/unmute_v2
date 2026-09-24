<template>
  <AuthStage tagline logo-size="6rem">
    <div class="d-flex flex-column gap-4">
      <div class="welcome-hero" aria-hidden="true">
        <span class="hero-sun"></span>
        <span class="hero-hills"></span>
        <i class="ri-heart-3-fill hero-heart hero-heart-1"></i>
        <i class="ri-heart-3-fill hero-heart hero-heart-2"></i>
        <i class="ri-chat-heart-fill hero-bubble"></i>
      </div>

      <UButton variant="primary" size="lg" block @click="$router.push('/register')">
        Get Started <i class="ri-arrow-right-line ms-2" aria-hidden="true"></i>
      </UButton>

      <div class="auth-divider" role="separator">or continue with</div>
      <GoogleSignIn text="continue_with" @authenticated="onGoogleAuthenticated" />

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
import { ONBOARDING_START } from '../onboarding';

const router = useRouter();

function onGoogleAuthenticated(isNewUser: boolean) {
  router.push(isNewUser ? ONBOARDING_START : '/discover');
}
</script>

<style scoped lang="scss">
// A sunset over hills: the mood of the brand photo, drawn so it needs no image.
.welcome-hero {
  position: relative;
  height: 11rem;
  border-radius: var(--unmute-radius-xl);
  overflow: hidden;
  background: linear-gradient(180deg, #f6d6f0 0%, #fbc0cf 45%, #f7a7c0 70%, #d9a3e6 100%);
  box-shadow: var(--unmute-shadow-md);
}

.hero-sun {
  position: absolute;
  left: 58%;
  bottom: 3.2rem;
  width: 3.2rem;
  height: 3.2rem;
  border-radius: 50%;
  background: radial-gradient(circle, #fffbe8 0%, #ffe3c2 55%, transparent 72%);
  box-shadow: 0 0 60px 20px rgba(255, 236, 214, 0.7);
}

.hero-hills {
  position: absolute;
  inset: auto -10% -2.5rem;
  height: 6.5rem;
  border-radius: 50% 50% 0 0;
  background: linear-gradient(180deg, #b58ad6 0%, #8e5fb8 100%);
  box-shadow: -6rem 1.2rem 0 -1rem #a578cc, 7rem 1.6rem 0 -1.2rem #9a6cc2;
}

.hero-heart,
.hero-bubble {
  position: absolute;
  color: #fff;
  filter: drop-shadow(0 6px 14px rgba(192, 0, 120, 0.35));
  animation: hero-float 5s ease-in-out infinite;
}

.hero-heart-1 {
  top: 1.2rem;
  left: 1.5rem;
  font-size: 1.6rem;
  color: #ff9fc2;
}

.hero-heart-2 {
  top: 2.6rem;
  right: 1.8rem;
  font-size: 1.2rem;
  color: #ffc6db;
  animation-delay: -2s;
}

.hero-bubble {
  top: 2.6rem;
  left: 38%;
  font-size: 2.6rem;
  color: #fff;
  animation-delay: -1s;
}

@keyframes hero-float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-6px); }
}
</style>
