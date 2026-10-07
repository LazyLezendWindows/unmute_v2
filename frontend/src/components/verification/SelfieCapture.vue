<template>
  <!-- Live front-camera view with the pose to copy; falls back to the phone's camera app if needed. -->
  <div class="selfie-capture">
    <p class="pose"><i class="ri-hand" aria-hidden="true"></i>{{ gesture }}</p>

    <div class="viewer">
      <img v-if="preview" :src="preview" alt="Your selfie" />
      <video v-else-if="streaming" ref="video" autoplay playsinline muted></video>
      <div v-else class="viewer-empty">
        <i class="ri-camera-line" aria-hidden="true"></i>
        <span>{{ cameraError || 'Starting camera…' }}</span>
      </div>
      <span v-if="streaming && !preview" class="oval" aria-hidden="true"></span>
    </div>

    <div class="actions">
      <template v-if="preview">
        <UButton variant="secondary" size="md" @click="retake">Retake</UButton>
        <UButton variant="primary" size="md" :loading="busy" @click="$emit('submit', blob!)">Submit for review</UButton>
      </template>
      <UButton v-else-if="streaming" variant="primary" size="md" @click="capture"><i class="ri-camera-fill me-2" aria-hidden="true"></i>Take selfie</UButton>
      <label v-else class="file-fallback">
        <i class="ri-camera-line" aria-hidden="true"></i> Open camera
        <input type="file" accept="image/*" capture="user" class="d-none" @change="fromFile" />
      </label>
    </div>
  </div>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import UButton from '../ui/UButton.vue';

defineProps<{ gesture: string; busy?: boolean }>();
defineEmits<{ (e: 'submit', photo: Blob): void }>();

const video = ref<HTMLVideoElement | null>(null);
const streaming = ref(false);
const cameraError = ref('');
const preview = ref<string | null>(null);
const blob = ref<Blob | null>(null);
let stream: MediaStream | null = null;

async function startCamera() {
  cameraError.value = '';
  if (!navigator.mediaDevices?.getUserMedia) {
    cameraError.value = 'Live camera isn’t available here.';
    return;
  }
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 } }, audio: false });
    streaming.value = true;
    await nextTick();
    if (video.value) video.value.srcObject = stream;
  } catch {
    cameraError.value = 'Allow camera access to take your selfie.';
  }
}

function stopCamera() {
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
  streaming.value = false;
}

function setPhoto(b: Blob) {
  blob.value = b;
  if (preview.value) URL.revokeObjectURL(preview.value);
  preview.value = URL.createObjectURL(b);
}

/** Grabs the current frame as a JPEG (mirrored back, so it matches what the member saw). */
function capture() {
  const el = video.value;
  if (!el || !el.videoWidth) return;
  const canvas = document.createElement('canvas');
  canvas.width = el.videoWidth;
  canvas.height = el.videoHeight;
  const ctx = canvas.getContext('2d')!;
  ctx.translate(canvas.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(el, 0, 0);
  canvas.toBlob((b) => b && (setPhoto(b), stopCamera()), 'image/jpeg', 0.9);
}

function fromFile(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (file) setPhoto(file);
}

async function retake() {
  if (preview.value) URL.revokeObjectURL(preview.value);
  preview.value = null;
  blob.value = null;
  await startCamera();
}

onMounted(startCamera);
onBeforeUnmount(() => {
  stopCamera();
  if (preview.value) URL.revokeObjectURL(preview.value);
});
</script>

<style scoped lang="scss">
.selfie-capture {
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
}

.pose {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  margin: 0;
  padding: 0.7rem 0.9rem;
  border-radius: 1rem;
  background: var(--unmute-chip-pink);
  color: var(--unmute-text-heading);
  font-weight: 600;
  font-size: 0.92rem;

  i {
    color: var(--unmute-cta);
    font-size: 1.4rem;
  }
}

.viewer {
  position: relative;
  aspect-ratio: 3 / 4;
  overflow: hidden;
  border-radius: 1.2rem;
  background: #2a1830;

  video,
  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  video {
    transform: scaleX(-1);
  }
}

.oval {
  position: absolute;
  inset: 12% 18% 18%;
  border: 3px dashed rgba(255, 255, 255, 0.75);
  border-radius: 50%;
  pointer-events: none;
}

.viewer-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  height: 100%;
  padding: 1rem;
  color: rgba(255, 255, 255, 0.85);
  text-align: center;
  font-size: 0.9rem;

  i {
    font-size: 2.4rem;
  }
}

.actions {
  display: flex;
  justify-content: center;
  gap: 0.6rem;
}

.file-fallback {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.6rem 1.2rem;
  border-radius: var(--unmute-radius-pill);
  background: var(--unmute-primary-gradient);
  color: #fff;
  font-weight: 600;
  cursor: pointer;
}
</style>
