<template>
  <!-- Covers the app while the device has no connection; it clears itself when the network returns. -->
  <Transition name="offline-fade">
    <div v-if="!online" class="offline-screen" role="alertdialog" aria-modal="true" aria-labelledby="offline-title" aria-describedby="offline-text">
      <span class="orb orb-1" aria-hidden="true"></span>
      <span class="orb orb-2" aria-hidden="true"></span>
      <span class="ring" aria-hidden="true"></span>
      <svg class="waves" viewBox="0 0 390 140" preserveAspectRatio="none" aria-hidden="true">
        <path d="M0 50C80 10 150 90 240 55S350 20 390 40V140H0Z" fill="#f6d4f0" opacity="0.6" />
        <path d="M0 85C90 55 170 125 270 90S360 70 390 80V140H0Z" fill="#dcc0f5" opacity="0.75" />
      </svg>

      <div class="offline-inner">
        <BrandLogo size="2.4rem" />

        <!-- A broken signal inside a soft glowing circle -->
        <div class="art" aria-hidden="true">
          <span class="art-glow"></span>
          <span class="art-circle"><i class="ri-wifi-off-line"></i></span>
          <i class="ri-heart-3-fill art-heart art-heart-1"></i>
          <i class="ri-heart-3-fill art-heart art-heart-2"></i>
          <i class="ri-sparkling-2-fill art-spark"></i>
        </div>

        <h1 id="offline-title" class="offline-title">No internet connection</h1>
        <p id="offline-text" class="offline-text">
          Looks like you're offline. Check your Wi‑Fi or mobile data, and we'll pick up right where you left off.
        </p>

        <ul class="tips">
          <li><i class="ri-wifi-line" aria-hidden="true"></i>Turn on Wi‑Fi or mobile data</li>
          <li><i class="ri-plane-line" aria-hidden="true"></i>Switch off airplane mode</li>
          <li><i class="ri-router-line" aria-hidden="true"></i>Move closer to your router</li>
        </ul>

        <button type="button" class="retry-btn" :disabled="checking" @click="retry">
          <span v-if="checking" class="spinner-border spinner-border-sm" aria-hidden="true"></span>
          <i v-else class="ri-refresh-line" aria-hidden="true"></i>
          {{ checking ? 'Checking…' : 'Try again' }}
        </button>
        <p class="status" role="status" aria-live="polite">{{ status }}</p>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import BrandLogo from './BrandLogo.vue';

const online = ref(typeof navigator === 'undefined' ? true : navigator.onLine);
const checking = ref(false);
const status = ref('');

function update() {
  online.value = navigator.onLine;
  if (online.value) status.value = '';
}

/** A real request to our own server: "online" in the browser doesn't always mean reachable. */
async function reachable(): Promise<boolean> {
  try {
    const res = await fetch('/api/v1/auth/config', { cache: 'no-store', signal: AbortSignal.timeout(6000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function retry() {
  checking.value = true;
  status.value = '';
  const ok = await reachable();
  checking.value = false;
  if (ok) online.value = true;
  else status.value = 'Still offline. Check your connection and try again.';
}

onMounted(() => {
  window.addEventListener('online', update);
  window.addEventListener('offline', update);
});
onBeforeUnmount(() => {
  window.removeEventListener('online', update);
  window.removeEventListener('offline', update);
});
</script>

<style scoped lang="scss">
.offline-screen {
  position: fixed;
  inset: 0;
  z-index: 2100;
  overflow-y: auto;
  background: linear-gradient(180deg, #fdf7fd 0%, #fbf4fd 60%, #f6ecfc 100%);
}

.orb {
  position: fixed;
  border-radius: 50%;
  background: rgba(233, 216, 250, 0.45);
  pointer-events: none;
}

.orb-1 {
  top: -8rem;
  left: -8rem;
  width: 20rem;
  height: 20rem;
}

.orb-2 {
  top: 35%;
  right: -6rem;
  width: 11rem;
  height: 11rem;
}

.ring {
  position: fixed;
  top: 4rem;
  right: -5rem;
  width: 10rem;
  height: 10rem;
  border: 1px solid rgba(192, 0, 120, 0.15);
  border-radius: 50%;
  pointer-events: none;
}

.waves {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  width: 100%;
  height: 8rem;
  pointer-events: none;
}

.offline-inner {
  position: relative;
  max-width: 26rem;
  min-height: 100%;
  margin: 0 auto;
  padding: calc(2rem + env(safe-area-inset-top, 0px)) 1.5rem calc(6rem + env(safe-area-inset-bottom, 0px));
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}

.art {
  position: relative;
  display: grid;
  place-items: center;
  width: 13rem;
  height: 13rem;
  margin: 2.5rem 0 1.5rem;
}

.art-glow {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(242, 24, 114, 0.14) 0%, rgba(242, 24, 114, 0.05) 55%, transparent 72%);
}

.art-circle {
  position: relative;
  display: grid;
  place-items: center;
  width: 8.5rem;
  height: 8.5rem;
  border-radius: 50%;
  background: linear-gradient(135deg, #ff7a6e 0%, #f21872 40%, #c00078 70%, #4a005b 100%);
  box-shadow: 0 0 0 12px rgba(252, 220, 240, 0.7), 0 22px 44px -16px rgba(192, 0, 120, 0.6);
  color: #fff;
  font-size: 3.6rem;
  animation: pulse 2.4s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.04); }
}

.art-heart {
  position: absolute;
  color: #f7609f;
  filter: drop-shadow(0 6px 10px rgba(242, 24, 114, 0.25));
  animation: float 6s ease-in-out infinite;
}

.art-heart-1 {
  top: 0.5rem;
  left: 0.2rem;
  font-size: 1.8rem;
}

.art-heart-2 {
  bottom: 1rem;
  right: 0;
  font-size: 1.4rem;
  color: #f47ec0;
  animation-delay: -3s;
}

.art-spark {
  position: absolute;
  top: 1rem;
  right: 1.2rem;
  font-size: 1.3rem;
  color: #d86be0;
}

@keyframes float {
  0%, 100% { transform: translateY(0) rotate(-6deg); }
  50% { transform: translateY(-8px) rotate(6deg); }
}

.offline-title {
  margin: 0 0 0.5rem;
  font-size: clamp(1.8rem, 8vw, 2.1rem);
  font-weight: 800;
  letter-spacing: -0.02em;
  color: var(--unmute-text-heading);
}

.offline-text {
  margin-bottom: 1.5rem;
  font-size: 1rem;
  line-height: 1.5;
  color: var(--unmute-text-muted);
}

.tips {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  width: 100%;
  margin: 0 0 1.75rem;
  padding: 0;
  list-style: none;

  li {
    display: flex;
    align-items: center;
    gap: 0.8rem;
    padding: 0.75rem 1rem;
    border-radius: 1.1rem;
    background: var(--unmute-surface);
    border: 1px solid rgba(74, 0, 91, 0.08);
    color: var(--unmute-text-heading);
    font-size: 0.95rem;
    text-align: left;
  }

  i {
    display: grid;
    place-items: center;
    flex-shrink: 0;
    width: 2.2rem;
    height: 2.2rem;
    border-radius: 50%;
    background: var(--unmute-primary-surface);
    color: var(--unmute-cta);
    font-size: 1.1rem;
  }
}

.retry-btn {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.6rem;
  width: 100%;
  min-height: 3.5rem;
  border: 0;
  border-radius: var(--unmute-radius-pill);
  background: linear-gradient(100deg, #ff7a6e 0%, #f21872 35%, #c00078 65%, #4a005b 100%);
  color: #fff;
  font-size: 1.1rem;
  font-weight: 700;
  box-shadow: 0 16px 30px -14px rgba(192, 0, 120, 0.65);

  i {
    font-size: 1.3rem;
  }

  &:disabled {
    opacity: 0.8;
  }
}

.status {
  min-height: 1.3rem;
  margin: 0.75rem 0 0;
  font-size: 0.88rem;
  color: var(--unmute-danger);
}

:global([data-theme='dark']) .offline-screen {
  background: var(--unmute-app-bg);
}

:global([data-theme='dark']) .offline-screen .waves,
:global([data-theme='dark']) .offline-screen .orb {
  opacity: 0.2;
}

.offline-fade-enter-active,
.offline-fade-leave-active {
  transition: opacity 250ms ease;
}

.offline-fade-enter-from,
.offline-fade-leave-to {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .art-circle,
  .art-heart {
    animation: none;
  }
}
</style>
