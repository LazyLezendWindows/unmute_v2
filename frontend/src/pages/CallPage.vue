<template>
  <div class="call-screen" :style="backdropStyle">
    <!-- Their camera, full screen, once it arrives; their photo shows until then -->
    <video v-show="showRemoteVideo" ref="remoteVideo" class="remote-video" autoplay playsinline muted></video>
    <audio ref="remoteAudio" autoplay></audio>
    <button v-if="playbackBlocked" type="button" class="playback-retry" @click="playRemote">Tap to hear the call</button>
    <div class="call-shade" aria-hidden="true"></div>

    <div class="call-top">
      <ScreenBar>
        <template #start>
          <button type="button" class="glass-btn" aria-label="End call and go back" @click="endCall">
            <i class="ri-arrow-left-s-line" aria-hidden="true"></i>
          </button>
        </template>
        <template #actions>
          <button type="button" class="glass-btn" aria-label="Report or block" @click="safetyOpen = true">
            <i class="ri-more-fill" aria-hidden="true"></i>
          </button>
        </template>
      </ScreenBar>

      <div class="call-who">
        <h1 class="call-name">
          {{ other?.displayName || '…' }}<template v-if="other">, {{ other.age }}</template>
          <i v-if="other?.isVerified" class="ri-verified-badge-fill verified-badge" aria-label="Verified"></i>
        </h1>
        <p class="call-status" role="status" aria-live="polite">{{ statusLine }}</p>
      </div>

      <!-- Your camera -->
      <div v-if="isVideo" class="self-view" :class="{ 'is-off': call.cameraOff }">
        <video ref="localVideo" class="self-video" :class="{ 'is-mirrored': !flipped }" autoplay playsinline muted></video>
        <UAvatar v-if="call.cameraOff || !call.localStream" :src="me?.avatarUrl" :name="me?.displayName || 'You'" size="2xl" class="self-avatar" />
        <button type="button" class="self-flip" aria-label="Flip camera" @click="flip">
          <i class="ri-camera-switch-line" aria-hidden="true"></i>
        </button>
      </div>
    </div>

    <!-- Voice calls show their photo in the middle -->
    <div v-if="!isVideo" class="voice-avatar" :class="{ 'is-ringing': call.status === 'outgoing' }">
      <UAvatar :src="other?.avatarUrl" :name="other?.displayName" size="2xl" />
    </div>

    <p v-if="call.status === 'ended' && call.endReason" class="call-note" role="alert">{{ call.endReason }}</p>
    <div v-else class="call-spacer"></div>

    <div v-if="effectsOpen && isVideo" id="effects" class="effects" role="radiogroup" aria-label="Camera effect">
      <button
        v-for="e in EFFECTS"
        :key="e.id"
        type="button"
        role="radio"
        class="effect"
        :aria-checked="call.effect === e.id"
        @click="pickEffect(e.id)"
      >
        <span class="effect-swatch" :style="{ filter: e.filter }"></span>{{ e.label }}
      </button>
    </div>

    <div class="reactions">
      <button v-for="reaction in REACTIONS" :key="reaction.label" type="button" class="reaction" :class="reaction.tone" :aria-label="reaction.label" :disabled="call.status !== 'active'" @click="react(reaction.emoji)">
        {{ reaction.emoji }}
      </button>
    </div>
    <span v-for="bubble in bubbles" :key="bubble.id" class="burst" :style="{ left: `${bubble.x}%` }" aria-hidden="true">{{ bubble.emoji }}</span>

    <div class="controls">
      <button type="button" class="control" :aria-pressed="call.muted" @click="call.toggleMute()">
        <span class="control-ring"><i :class="call.muted ? 'ri-mic-off-fill' : 'ri-mic-fill'" aria-hidden="true"></i></span>
        {{ call.muted ? 'Unmute' : 'Mute' }}
      </button>
      <button v-if="isVideo" type="button" class="control" :aria-pressed="call.cameraOff" @click="call.toggleCamera()">
        <span class="control-ring"><i :class="call.cameraOff ? 'ri-vidicon-line' : 'ri-vidicon-fill'" aria-hidden="true"></i></span>
        {{ call.cameraOff ? 'Camera On' : 'Camera Off' }}
      </button>
      <button type="button" class="control is-end" @click="endCall">
        <span class="control-ring"><i class="ri-phone-fill" aria-hidden="true"></i></span>
        End Call
      </button>
      <button v-if="isVideo" type="button" class="control" @click="flip">
        <span class="control-ring"><i class="ri-camera-switch-line" aria-hidden="true"></i></span>
        Flip
      </button>
      <button v-if="isVideo" type="button" class="control" :aria-pressed="effectsOpen" aria-controls="effects" @click="effectsOpen = !effectsOpen">
        <span class="control-ring"><i class="ri-sparkling-2-fill" aria-hidden="true"></i></span>
        Effects
      </button>
      <button v-else type="button" class="control" :aria-pressed="speaker" @click="toggleSpeaker">
        <span class="control-ring"><i :class="speaker ? 'ri-volume-up-fill' : 'ri-volume-down-fill'" aria-hidden="true"></i></span>
        Speaker
      </button>
    </div>

    <SafetyModal
      v-if="other"
      :is-open="safetyOpen"
      :target-user-id="other.id"
      :target-name="other.displayName"
      @close="safetyOpen = false"
      @action-completed="afterBlock"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import ScreenBar from '../components/layout/ScreenBar.vue';
import UAvatar from '../components/ui/UAvatar.vue';
import SafetyModal from '../components/safety/SafetyModal.vue';
import { useAuthStore } from '../stores/auth';
import { useChatStore } from '../stores/chat';
import { CallEffect, CallMode, EFFECTS, useCallStore } from '../stores/call';
import { useToastStore } from '../stores/toast';
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
const call = useCallStore();

const conversationId = computed(() => route.params.id as string);
const isVideo = computed(() => call.mode === 'video');
const me = computed(() => authStore.profile);
const other = computed(() => chatStore.conversations.find((c) => c.id === conversationId.value)?.otherUser ?? null);

const remoteVideo = ref<HTMLVideoElement | null>(null);
const remoteAudio = ref<HTMLAudioElement | null>(null);
const localVideo = ref<HTMLVideoElement | null>(null);
const flipped = ref(false);
const speaker = ref(true);
const safetyOpen = ref(false);
const effectsOpen = ref(false);

async function pickEffect(id: CallEffect) {
  if (!(await call.setEffect(id))) useToastStore().show('Effects aren’t available in this browser.');
}
const bubbles = ref<{ id: number; emoji: string; x: number }[]>([]);
const now = ref(Date.now());
let nextBubble = 0;
let clock: ReturnType<typeof setInterval> | undefined;
let leaveTimer: ReturnType<typeof setTimeout> | undefined;

const showRemoteVideo = computed(() => isVideo.value && call.status === 'active' && Boolean(call.remoteStream?.getVideoTracks().length));

const elapsed = computed(() => {
  if (!call.startedAt) return '';
  const s = Math.max(0, Math.floor((now.value - call.startedAt) / 1000));
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return s >= 3600 ? `${Math.floor(s / 3600)}:${mm.slice(-2)}:${ss}` : `${mm}:${ss}`;
});

const statusLine = computed(() => {
  const kind = isVideo.value ? 'Video Call' : 'Voice Call';
  switch (call.status) {
    case 'outgoing': return 'Calling…';
    case 'connecting': return 'Connecting…';
    case 'active': return `${kind} • ${elapsed.value}`;
    case 'ended': return call.endReason ? kind : 'Call ended';
    default: return kind;
  }
});

const backdropStyle = computed(() =>
  isVideo.value && other.value?.avatarUrl ? photoBackground(other.value.avatarUrl) : {}
);

const playbackBlocked = ref(false);
async function playRemote() {
  const audio = remoteAudio.value;
  if (!audio?.srcObject) return;
  try { await audio.play(); playbackBlocked.value = false; }
  catch { playbackBlocked.value = true; }
}

// Streams go into the video and audio elements whenever they change (new call, flipped camera…).
watch(
  () => [call.localStream, localVideo.value] as const,
  ([stream, el]) => {
    if (el && el.srcObject !== stream) el.srcObject = stream;
  }
);
watch(
  () => [call.remoteStream, remoteVideo.value, remoteAudio.value] as const,
  ([stream, video, audio]) => {
    if (video && video.srcObject !== stream) video.srcObject = stream;
    if (audio && audio.srcObject !== stream) {
      audio.srcObject = stream;
      if (stream) void playRemote();
    }
  }
);

// Their reactions float up on your screen too.
watch(
  () => call.incomingReaction,
  (reaction) => reaction && burst(reaction.emoji)
);

// When the call ends, show why for a moment, then go back to the chat.
watch(
  () => call.status,
  (status) => {
    if (status === 'ended' || status === 'idle') {
      clearTimeout(leaveTimer);
      leaveTimer = setTimeout(backToChat, status === 'ended' ? 1800 : 0);
    }
  }
);

onMounted(async () => {
  clock = setInterval(() => (now.value = Date.now()), 1000);
  call.bindSocket();
  if (!other.value) await chatStore.loadConversations();
  if (!other.value) {
    router.replace('/chat');
    return;
  }
  // Answered calls arrive here already set up; anything else is a new call you're making.
  if (call.conversationId !== conversationId.value || !call.inCall) {
    const mode: CallMode = route.query.mode === 'voice' ? 'voice' : 'video';
    await call.start(conversationId.value, mode);
  }
  await nextTick();
  if (localVideo.value && call.localStream) localVideo.value.srcObject = call.localStream;
  if (remoteVideo.value && call.remoteStream) remoteVideo.value.srcObject = call.remoteStream;
  if (remoteAudio.value && call.remoteStream) {
    remoteAudio.value.srcObject = call.remoteStream;
    void playRemote();
  }
});

onBeforeUnmount(() => {
  clearInterval(clock);
  clearTimeout(leaveTimer);
  // Leaving the screen any other way (tab bar, browser back) also hangs up.
  if (call.inCall && call.conversationId === conversationId.value) call.hangUp();
  if (call.status === 'ended') call.reset();
});

function backToChat() {
  call.reset();
  router.replace(`/chat/${conversationId.value}`);
}

function endCall() {
  if (call.inCall) call.hangUp();
  else backToChat();
}

async function flip() {
  await call.flipCamera();
  flipped.value = !flipped.value;
}

type SinkElement = Omit<HTMLMediaElement, 'setSinkId'> & { setSinkId?: (id: string) => Promise<void> };
let outputIndex = 0;

/**
 * Moves the call's sound to the next output (speakers, headphones, Bluetooth) where the browser
 * allows choosing one. Phones don't expose earpiece vs loudspeaker to web pages, so there it
 * switches between full and quieter volume instead.
 */
async function toggleSpeaker() {
  const el = (remoteAudio.value ?? remoteVideo.value) as SinkElement | null;
  if (!el) return;
  const canPick = typeof el.setSinkId === 'function' && 'setSinkId' in HTMLMediaElement.prototype;
  const outputs = canPick
    ? (await navigator.mediaDevices.enumerateDevices().catch(() => [])).filter((d) => d.kind === 'audiooutput' && d.deviceId !== 'communications')
    : [];
  if (outputs.length > 1 && canPick) {
    outputIndex = (outputIndex + 1) % outputs.length;
    const device = outputs[outputIndex];
    try {
      await el.setSinkId!(device.deviceId);
      speaker.value = outputIndex === 0;
      useToastStore().show(`Sound: ${device.label || (outputIndex === 0 ? 'Default output' : `Output ${outputIndex + 1}`)}`);
      return;
    } catch {
      // Fall back to volume below.
    }
  }
  speaker.value = !speaker.value;
  el.volume = speaker.value ? 1 : 0.4;
}

function react(emoji: string) {
  call.sendReaction(emoji);
  burst(emoji);
}

/** A reaction floats up the screen and fades. */
function burst(emoji: string) {
  const id = nextBubble++;
  bubbles.value.push({ id, emoji, x: 35 + Math.random() * 30 });
  setTimeout(() => (bubbles.value = bubbles.value.filter((b) => b.id !== id)), 1600);
}

function afterBlock() {
  safetyOpen.value = false;
  if (call.inCall) call.hangUp();
  router.replace('/chat');
}
</script>

<style scoped lang="scss">
.playback-retry {
  position: absolute;
  top: 6rem;
  left: 50%;
  transform: translateX(-50%);
  z-index: 5;
  padding: .75rem 1rem;
  border: 2px solid white;
  border-radius: 2rem;
  background: #79006e;
  color: white;
}

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

.remote-video {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  background: #000;
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
    // A soft white glow keeps the dark "Un" readable over the photo.
    filter: drop-shadow(0 0 6px rgba(255, 255, 255, 0.85)) drop-shadow(0 0 14px rgba(255, 255, 255, 0.45));
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
  top: 8.6rem;
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

.self-video {
  width: 100%;
  height: 100%;
  object-fit: cover;

  &.is-mirrored {
    transform: scaleX(-1);
  }

  .is-off & {
    visibility: hidden;
  }
}

.self-avatar {
  position: absolute !important;
  inset: 0;
}

.call-spacer {
  margin-top: auto;
}

.voice-avatar.is-ringing :deep(.u-avatar) {
  animation: calling 1.6s ease-out infinite;
}

@keyframes calling {
  0% { box-shadow: 0 0 0 0 rgba(255, 255, 255, 0.35), 0 0 0 0 rgba(255, 255, 255, 0.2); }
  100% { box-shadow: 0 0 0 22px rgba(255, 255, 255, 0), 0 0 0 44px rgba(255, 255, 255, 0); }
}

.reaction:disabled {
  opacity: 0.5;
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

.effects {
  position: relative;
  display: flex;
  justify-content: center;
  gap: 0.5rem;
  margin-bottom: 1rem;
  padding: 0 0.5rem;
  overflow-x: auto;
}

.effect {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.3rem;
  border: 0;
  background: transparent;
  color: #fff;
  font-size: 0.75rem;

  &[aria-checked='true'] .effect-swatch {
    box-shadow: 0 0 0 3px #fff;
  }
}

// A little sample picture, run through the same filter.
.effect-swatch {
  width: 3rem;
  height: 3rem;
  border-radius: 50%;
  background: radial-gradient(circle at 35% 35%, #ffd1b3 0 28%, transparent 30%), linear-gradient(135deg, #ff8a65, #c2185b 55%, #4a148c);
  border: 2px solid rgba(255, 255, 255, 0.6);
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
  gap: 0.25rem;
  padding: 0 0.5rem calc(1.6rem + env(safe-area-inset-bottom, 0px));
}

.control {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex: 1 1 0;
  min-width: 0;
  gap: 0.5rem;
  border: 0;
  background: transparent;
  color: #fff;
  font-size: 0.8rem;
  white-space: nowrap;
}

.control-ring {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 3.5rem;
  height: 3.5rem;
  border: 1.5px solid rgba(255, 255, 255, 0.55);
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.12);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  font-size: 1.5rem;

  [aria-pressed='true'] & {
    background: rgba(255, 255, 255, 0.85);
    color: #7b1f6e;
  }
}

.is-end .control-ring {
  width: 4.5rem;
  height: 4.5rem;
  border: 0;
  background: #f21872;
  font-size: 2.2rem;
  box-shadow: 0 10px 30px -8px rgba(242, 24, 114, 0.7);

  i {
    transform: rotate(135deg);
  }
}
</style>
