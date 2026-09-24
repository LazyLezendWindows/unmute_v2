<template>
  <div class="call-screen" :style="backdropStyle">
    <div class="call-shade" aria-hidden="true"></div>

    <div class="call-top">
      <ScreenBar>
        <template #start>
          <button type="button" class="glass-btn" aria-label="Back to chat" @click="endCall">
            <i class="ri-arrow-left-s-line" aria-hidden="true"></i>
          </button>
        </template>
        <template #actions>
          <button type="button" class="glass-btn" aria-label="More" @click="comingSoon('Call options')">
            <i class="ri-more-fill" aria-hidden="true"></i>
          </button>
        </template>
      </ScreenBar>

      <div class="call-who">
        <h1 class="call-name">
          {{ other?.displayName || '…' }}<template v-if="other">, {{ other.age }}</template>
          <i v-if="other?.isVerified" class="ri-verified-badge-fill verified-badge" aria-label="Verified"></i>
        </h1>
        <p class="call-status">{{ isVideo ? 'Video Call' : 'Voice Call' }} • Coming soon</p>
      </div>

      <!-- Your camera preview (your photo until calling is live) -->
      <div v-if="isVideo" class="self-view" :class="{ 'is-off': cameraOff }">
        <UAvatar :src="me?.avatarUrl" :name="me?.displayName || 'You'" size="2xl" />
        <button type="button" class="self-flip" aria-label="Flip camera" @click="comingSoon('Flipping the camera')">
          <i class="ri-camera-switch-line" aria-hidden="true"></i>
        </button>
      </div>
    </div>

    <!-- Voice calls show their photo in the middle instead of video -->
    <div v-if="!isVideo" class="voice-avatar">
      <UAvatar :src="other?.avatarUrl" :name="other?.displayName" size="2xl" />
    </div>

    <p class="call-note" role="status">
      {{ isVideo ? 'Video' : 'Voice' }} calls are coming soon. You can keep chatting in the meantime.
    </p>

    <div class="reactions">
      <button v-for="reaction in REACTIONS" :key="reaction.label" type="button" class="reaction" :class="reaction.tone" :aria-label="reaction.label" @click="burst(reaction.emoji)">
        {{ reaction.emoji }}
      </button>
    </div>
    <span v-for="bubble in bubbles" :key="bubble.id" class="burst" :style="{ left: `${bubble.x}%` }" aria-hidden="true">{{ bubble.emoji }}</span>

    <div class="controls">
      <button type="button" class="control" :aria-pressed="muted" @click="muted = !muted">
        <span class="control-ring"><i :class="muted ? 'ri-mic-off-fill' : 'ri-mic-fill'" aria-hidden="true"></i></span>
        {{ muted ? 'Unmute' : 'Mute' }}
      </button>
      <button v-if="isVideo" type="button" class="control" :aria-pressed="cameraOff" @click="cameraOff = !cameraOff">
        <span class="control-ring"><i :class="cameraOff ? 'ri-vidicon-line' : 'ri-vidicon-fill'" aria-hidden="true"></i></span>
        {{ cameraOff ? 'Camera On' : 'Camera Off' }}
      </button>
      <button type="button" class="control is-end" @click="endCall">
        <span class="control-ring"><i class="ri-phone-fill" aria-hidden="true"></i></span>
        End Call
      </button>
      <button v-if="isVideo" type="button" class="control" @click="comingSoon('Flipping the camera')">
        <span class="control-ring"><i class="ri-camera-switch-line" aria-hidden="true"></i></span>
        Flip
      </button>
      <button type="button" class="control" @click="comingSoon(isVideo ? 'Video effects' : 'Speaker mode')">
        <span class="control-ring"><i :class="isVideo ? 'ri-sparkling-2-fill' : 'ri-volume-up-fill'" aria-hidden="true"></i></span>
        {{ isVideo ? 'Effects' : 'Speaker' }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import ScreenBar from '../components/layout/ScreenBar.vue';
import UAvatar from '../components/ui/UAvatar.vue';
import { useAuthStore } from '../stores/auth';
import { useChatStore } from '../stores/chat';
import { comingSoon } from '../utils/profileFormat';
import { photoBackground } from '../services/media';

const REACTIONS = [
  { emoji: '💖', label: 'Send a heart', tone: 'is-violet' },
  { emoji: '😍', label: 'Send heart eyes', tone: 'is-rose' },
  { emoji: '👍', label: 'Send a thumbs up', tone: 'is-pink' },
];

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const chatStore = useChatStore();

const conversationId = computed(() => route.params.id as string);
const isVideo = computed(() => route.query.mode !== 'voice');
const me = computed(() => authStore.profile);
const other = computed(() => chatStore.conversations.find((c) => c.id === conversationId.value)?.otherUser ?? null);

const muted = ref(false);
const cameraOff = ref(false);
const bubbles = ref<{ id: number; emoji: string; x: number }[]>([]);
let nextBubble = 0;

onMounted(async () => {
  if (!other.value) await chatStore.loadConversations();
  if (!other.value) router.replace('/chat');
});

const backdropStyle = computed(() =>
  isVideo.value && other.value?.avatarUrl
    ? photoBackground(other.value.avatarUrl)
    : {}
);

/** A reaction floats up the screen and fades. */
function burst(emoji: string) {
  const id = nextBubble++;
  bubbles.value.push({ id, emoji, x: 35 + Math.random() * 30 });
  setTimeout(() => (bubbles.value = bubbles.value.filter((b) => b.id !== id)), 1600);
}

function endCall() {
  router.push(`/chat/${conversationId.value}`);
}
</script>

<style scoped lang="scss">
.call-screen {
  position: fixed;
  inset: 0;
  z-index: 1040;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  color: #fff;
  background-color: #3a1640;
  background-image: radial-gradient(70% 50% at 50% 35%, #8b3a7c 0%, #3a1640 100%);
  background-size: cover;
  background-position: center 30%;
}

.call-shade {
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, rgba(40, 10, 40, 0.45) 0%, transparent 25%, transparent 55%, rgba(120, 30, 110, 0.75) 100%);
  pointer-events: none;
}

.call-top {
  position: relative;
  padding: 0.75rem 1.1rem 0;

  :deep(.bar-logo) {
    visibility: visible;
  }
}

.glass-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 3rem;
  height: 3rem;
  border: 1px solid rgba(255, 255, 255, 0.35);
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.14);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  color: #fff;
  font-size: 1.45rem;
}

.call-who {
  text-align: center;
  text-shadow: 0 2px 12px rgba(0, 0, 0, 0.35);
}

.call-name {
  margin: 0;
  font-size: 1.8rem;
  font-weight: 800;
  color: #fff;
}

.call-status {
  margin: 0.2rem 0 0;
  font-size: 1.1rem;
}

.self-view {
  position: absolute;
  top: 6.8rem;
  right: 1.1rem;
  width: 7rem;
  height: 9.5rem;
  border: 2px solid rgba(255, 255, 255, 0.85);
  border-radius: 1.3rem;
  overflow: hidden;
  background: #4a2450;

  :deep(.u-avatar-wrapper),
  :deep(.u-avatar) {
    width: 100% !important;
    height: 100% !important;
    border-radius: 0 !important;
  }

  &.is-off :deep(.u-avatar) {
    opacity: 0;
  }
}

.self-flip {
  position: absolute;
  right: 0.4rem;
  bottom: 0.4rem;
  border: 0;
  background: transparent;
  color: #fff;
  font-size: 1.4rem;
}

.voice-avatar {
  position: relative;
  display: flex;
  justify-content: center;
  margin-top: 3rem;

  :deep(.u-avatar) {
    width: 11rem;
    height: 11rem;
    border: 4px solid rgba(255, 255, 255, 0.8);
    box-shadow: 0 0 0 14px rgba(255, 255, 255, 0.12), 0 0 0 28px rgba(255, 255, 255, 0.06);
  }
}

.call-note {
  position: relative;
  align-self: center;
  max-width: 20rem;
  margin: auto 1rem 1rem;
  padding: 0.55rem 1rem;
  border-radius: 1rem;
  background: rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  font-size: 0.9rem;
  text-align: center;
}

.reactions {
  position: relative;
  display: flex;
  justify-content: center;
  gap: 1.1rem;
  margin-bottom: 1.6rem;
}

.reaction {
  width: 3.9rem;
  height: 3.9rem;
  border: 1px solid rgba(255, 255, 255, 0.4);
  border-radius: 50%;
  font-size: 1.9rem;
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);

  &.is-violet { background: rgba(110, 40, 120, 0.55); }
  &.is-rose { background: rgba(190, 90, 120, 0.55); }
  &.is-pink { background: rgba(236, 110, 200, 0.7); }
}

.burst {
  position: absolute;
  bottom: 12rem;
  font-size: 2.4rem;
  animation: rise 1.6s ease-out forwards;
  pointer-events: none;
}

@keyframes rise {
  from { transform: translateY(0) scale(0.8); opacity: 1; }
  to { transform: translateY(-14rem) scale(1.3); opacity: 0; }
}

.controls {
  position: relative;
  display: flex;
  justify-content: space-around;
  align-items: flex-end;
  padding: 0 0.5rem calc(1.6rem + env(safe-area-inset-bottom, 0px));
}

.control {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.55rem;
  border: 0;
  background: transparent;
  color: #fff;
  font-size: 0.95rem;
}

.control-ring {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 4rem;
  height: 4rem;
  border: 1.5px solid rgba(255, 255, 255, 0.55);
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.12);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  font-size: 1.7rem;

  [aria-pressed='true'] & {
    background: rgba(255, 255, 255, 0.85);
    color: #7b1f6e;
  }
}

.is-end .control-ring {
  width: 5rem;
  height: 5rem;
  border: 0;
  background: #f21872;
  font-size: 2.2rem;
  box-shadow: 0 10px 30px -8px rgba(242, 24, 114, 0.7);

  i {
    transform: rotate(135deg);
  }
}
</style>
