<template>
  <!-- Rings over any screen when a match calls; answering opens the call screen. -->
  <Transition name="ring-fade">
    <div v-if="call.status === 'incoming'" class="ring-screen" role="alertdialog" aria-modal="true" aria-labelledby="ring-name">
      <div class="ring-inner">
        <BrandLogo size="2.2rem" class="ring-logo" />
        <div class="ring-photo">
          <span class="pulse" aria-hidden="true"></span>
          <span class="pulse pulse-2" aria-hidden="true"></span>
          <UAvatar :src="caller?.avatarUrl" :name="caller?.displayName || 'Your match'" size="2xl" />
        </div>
        <h1 id="ring-name" class="ring-name">{{ caller?.displayName || 'Your match' }}</h1>
        <p class="ring-status">
          <i :class="call.mode === 'video' ? 'ri-vidicon-fill' : 'ri-phone-fill'" aria-hidden="true"></i>
          Incoming {{ call.mode === 'video' ? 'video' : 'voice' }} call…
        </p>

        <div class="ring-actions">
          <button type="button" class="ring-btn is-decline" @click="call.decline()">
            <span><i class="ri-phone-fill" aria-hidden="true"></i></span>Decline
          </button>
          <button ref="acceptButton" type="button" class="ring-btn is-accept" @click="answer">
            <span><i :class="call.mode === 'video' ? 'ri-vidicon-fill' : 'ri-phone-fill'" aria-hidden="true"></i></span>Accept
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import UAvatar from '../ui/UAvatar.vue';
import BrandLogo from '../layout/BrandLogo.vue';
import { useCallStore } from '../../stores/call';
import { useChatStore } from '../../stores/chat';

const call = useCallStore();
const chatStore = useChatStore();
const router = useRouter();
const acceptButton = ref<HTMLButtonElement | null>(null);

const caller = computed(() => chatStore.conversations.find((c) => c.id === call.conversationId)?.otherUser ?? null);

// A short ringtone made in the browser (no sound file), repeated while it rings.
let audio: AudioContext | null = null;
let ringTimer: ReturnType<typeof setInterval> | undefined;

function beep() {
  try {
    audio ??= new AudioContext();
    const now = audio.currentTime;
    for (const [start, freq] of [[0, 880], [0.25, 660]] as const) {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now + start);
      gain.gain.exponentialRampToValueAtTime(0.15, now + start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + start + 0.22);
      osc.connect(gain).connect(audio.destination);
      osc.start(now + start);
      osc.stop(now + start + 0.25);
    }
  } catch {
    // Browsers may block sound before the page was touched; the screen still shows the call.
  }
}

function stopRinging() {
  clearInterval(ringTimer);
  ringTimer = undefined;
}

watch(
  () => call.status,
  async (status) => {
    if (status === 'incoming') {
      // Load the caller's name and photo if the chat list hasn't been opened yet.
      if (!caller.value) chatStore.loadConversations();
      beep();
      ringTimer = setInterval(beep, 2000);
      if ('vibrate' in navigator) navigator.vibrate([300, 200, 300]);
      await nextTick();
      acceptButton.value?.focus({ focusVisible: false } as Parameters<HTMLElement['focus']>[0]);
    } else {
      stopRinging();
    }
  }
);

async function answer() {
  const id = call.conversationId;
  const mode = call.mode;
  stopRinging();
  await call.accept();
  if (id && call.status !== 'ended') router.push(`/chat/${id}/call?mode=${mode}`);
}

onBeforeUnmount(stopRinging);
</script>

<style scoped lang="scss">
.ring-screen {
  position: fixed;
  inset: 0;
  z-index: 2050;
  overflow-y: auto;
  background: radial-gradient(70% 50% at 50% 35%, #8b3a7c 0%, #3a1640 100%);
  color: #fff;
}

.ring-inner {
  min-height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: calc(1.5rem + env(safe-area-inset-top, 0px)) 1.5rem calc(2.5rem + env(safe-area-inset-bottom, 0px));
  text-align: center;
}

.ring-logo {
  filter: drop-shadow(0 0 6px rgba(255, 255, 255, 0.85));
}

.ring-photo {
  position: relative;
  display: grid;
  place-items: center;
  margin: 4rem 0 1.5rem;

  :deep(.u-avatar) {
    position: relative;
    z-index: 1;
    width: 9.5rem;
    height: 9.5rem;
    border: 4px solid rgba(255, 255, 255, 0.85);
  }
}

.pulse {
  position: absolute;
  width: 9.5rem;
  height: 9.5rem;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.18);
  animation: ring-pulse 2s ease-out infinite;
}

.pulse-2 {
  animation-delay: 1s;
}

@keyframes ring-pulse {
  from { transform: scale(1); opacity: 0.8; }
  to { transform: scale(1.8); opacity: 0; }
}

.ring-name {
  margin: 0;
  color: #fff;
  font-size: 2rem;
  font-weight: 800;
}

.ring-status {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin: 0.3rem 0 0;
  font-size: 1.05rem;
  opacity: 0.9;
}

.ring-actions {
  display: flex;
  justify-content: space-around;
  width: 100%;
  max-width: 20rem;
  margin-top: auto;
  padding-top: 3rem;
}

.ring-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.6rem;
  border: 0;
  background: transparent;
  color: #fff;
  font-size: 1rem;

  span {
    display: grid;
    place-items: center;
    width: 4.6rem;
    height: 4.6rem;
    border-radius: 50%;
    font-size: 2rem;
  }

  &.is-decline span {
    background: #f21872;
    box-shadow: 0 10px 30px -8px rgba(242, 24, 114, 0.7);

    i { transform: rotate(135deg); }
  }

  &.is-accept span {
    background: #1fc75b;
    box-shadow: 0 10px 30px -8px rgba(31, 199, 91, 0.7);
    animation: shake 1.4s ease-in-out infinite;
  }
}

@keyframes shake {
  0%, 60%, 100% { transform: rotate(0); }
  10%, 30%, 50% { transform: rotate(-12deg); }
  20%, 40% { transform: rotate(12deg); }
}

.ring-fade-enter-active,
.ring-fade-leave-active {
  transition: opacity 200ms ease;
}

.ring-fade-enter-from,
.ring-fade-leave-to {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .pulse,
  .ring-btn.is-accept span {
    animation: none;
  }
}
</style>
