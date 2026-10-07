<template>
  <div class="photos-page">
    <PageHeader
      title="Add Your Photos"
      subtitle="Photos help you get more matches. Add at least 3 photos."
      :back="setup.step.value ? setup.previous.value ?? undefined : '/profile'"
    >
      <template v-if="setup.step.value" #actions><router-link :to="setup.next.value" class="pill-skip">Skip</router-link></template>
    </PageHeader>
    <SetupProgress v-if="setup.step.value" :step="setup.step.value" />

    <!-- The main photo first, then the rest; each saves as soon as it's uploaded or removed -->
    <section class="grid" aria-label="Your photos" :aria-busy="uploading">
      <div v-for="(url, index) in photos" :key="url + index" class="slot" :style="photoBackground(url)">
        <button type="button" class="remove" :aria-label="index === 0 ? 'Remove main photo' : `Remove photo ${index + 1}`" :disabled="uploading" @click="remove(index)">
          <i class="ri-close-line" aria-hidden="true"></i>
        </button>
        <span v-if="index === 0" class="main-tag"><i class="ri-vip-crown-2-fill" aria-hidden="true"></i>Main Photo</span>
        <button v-else type="button" class="make-main" :disabled="uploading" @click="makeMain(index)">Make main</button>
      </div>
      <button v-if="photos.length < MAX" type="button" class="slot is-add" :disabled="uploading" @click="fileInput?.click()">
        <span v-if="uploading" class="spinner-border" aria-hidden="true"></span>
        <span v-else class="add-dot" aria-hidden="true"><i class="ri-add-line"></i></span>
        {{ uploading ? 'Uploading…' : 'Add Photo' }}
      </button>
      <input ref="fileInput" type="file" accept="image/jpeg,image/png,image/webp" multiple class="d-none" @change="onFiles" />
    </section>

    <section class="tips" aria-labelledby="tips-title">
      <span class="tips-icon" aria-hidden="true"><i class="ri-lightbulb-flash-fill"></i></span>
      <div>
        <h2 id="tips-title">Photo Tips</h2>
        <ul>
          <li v-for="tip in TIPS" :key="tip"><i class="ri-check-line" aria-hidden="true"></i>{{ tip }}</li>
        </ul>
      </div>
    </section>

    <UButton variant="primary" size="lg" block :disabled="uploading" @click="$router.push(setup.step.value ? setup.next.value : '/profile')">
      {{ setup.step.value ? 'Continue' : 'Done' }} <i class="ri-arrow-right-line ms-2" aria-hidden="true"></i>
    </UButton>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import PageHeader from '../components/layout/PageHeader.vue';
import SetupProgress from '../components/layout/SetupProgress.vue';
import UButton from '../components/ui/UButton.vue';
import { useAuthStore } from '../stores/auth';
import { useToastStore } from '../stores/toast';
import { useSetupStep } from '../composables/useSetupStep';
import { photoBackground, photoProblem, uploadPhoto } from '../services/media';

/** Main photo plus five more, as in the brand screen. */
const MAX = 6;
const TIPS = [
  'Use clear and recent photos',
  'Show your face clearly',
  'Include a mix of close-up and full-body photos',
  'Avoid sunglasses in your main photo',
];

const authStore = useAuthStore();
const setup = useSetupStep();
const toast = useToastStore();
const fileInput = ref<HTMLInputElement | null>(null);
const uploading = ref(false);

/** The main photo (the avatar) and the extra ones, as one list. */
const photos = computed(() => {
  const p = authStore.profile;
  return [p?.avatarUrl, ...(p?.photos ?? [])].filter(Boolean) as string[];
});

function save(list: string[]) {
  const [avatarUrl = '', ...rest] = list;
  return authStore.updateProfile({ avatarUrl, photos: rest });
}

async function onFiles(event: Event) {
  const input = event.target as HTMLInputElement;
  const files = Array.from(input.files || []);
  input.value = ''; // Picking the same file again should still fire.
  if (!files.length) return;
  const room = MAX - photos.value.length;
  if (files.length > room) toast.show(`Only ${room} more photo${room === 1 ? '' : 's'} can be added.`);

  uploading.value = true;
  const added: string[] = [];
  try {
    for (const file of files.slice(0, room)) {
      const problem = photoProblem(file);
      if (problem) {
        toast.error(`${file.name}: ${problem}`);
        continue;
      }
      try {
        added.push(await uploadPhoto(file));
      } catch (err: any) {
        toast.error(`${file.name}: Photo not uploaded. ${err.message}`);
      }
    }
    if (added.length) await save([...photos.value, ...added]);
  } catch (err: any) {
    toast.error(`Photos not saved. ${err.message}`);
  } finally {
    uploading.value = false;
  }
}

async function update(list: string[], failure: string) {
  uploading.value = true;
  try {
    await save(list);
  } catch (err: any) {
    toast.error(`${failure} ${err.message}`);
  } finally {
    uploading.value = false;
  }
}

/** Removing the main photo makes the next one main. */
function remove(index: number) {
  update(photos.value.filter((_, i) => i !== index), 'Photo not removed.');
}

function makeMain(index: number) {
  const list = [...photos.value];
  const [picked] = list.splice(index, 1);
  update([picked, ...list], 'Main photo not changed.');
}
</script>

<style scoped lang="scss">
$ink: var(--unmute-text-heading);

.photos-page {
  width: 100%;
  max-width: 34rem;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding-bottom: 1rem;
}

.grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.6rem;
}

.slot {
  position: relative;
  aspect-ratio: 0.74;
  border-radius: 1.2rem;
  background: var(--unmute-chip-bg) center 25% / cover;
  overflow: hidden;

  &.is-add {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.6rem;
    border: 2px dashed rgba(242, 24, 114, 0.5);
    background: var(--unmute-chip-pink);
    color: var(--unmute-cta);
    font-weight: 700;
    font-size: 0.95rem;
  }
}

.add-dot {
  display: grid;
  place-items: center;
  width: 2.6rem;
  height: 2.6rem;
  border-radius: 50%;
  background: var(--unmute-cta);
  color: #fff;
  font-size: 1.5rem;
}

.remove {
  position: absolute;
  top: 0.45rem;
  right: 0.45rem;
  display: grid;
  place-items: center;
  width: 1.9rem;
  height: 1.9rem;
  border: 0;
  border-radius: 50%;
  background: var(--unmute-card);
  color: var(--unmute-cta);
  font-size: 1.1rem;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
}

.main-tag,
.make-main {
  position: absolute;
  left: 0.45rem;
  bottom: 0.45rem;
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.3rem 0.7rem;
  border: 0;
  border-radius: var(--unmute-radius-pill);
  background: var(--unmute-card);
  color: var(--unmute-cta);
  font-size: 0.75rem;
  font-weight: 600;
  white-space: nowrap;
}

.make-main {
  background: var(--unmute-card-soft);
  color: $ink;
  font-weight: 500;
}

.tips {
  display: flex;
  gap: 0.9rem;
  padding: 1.1rem;
  border-radius: 1.4rem;
  background: var(--unmute-surface);
  box-shadow: var(--unmute-shadow-sm);

  h2 {
    margin: 0.4rem 0 0.6rem;
    font-size: 1.05rem;
    font-weight: 800;
    color: $ink;
  }

  ul {
    display: flex;
    flex-direction: column;
    gap: 0.55rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  li {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    color: var(--unmute-text-secondary);
    font-size: 0.9rem;

    i {
      display: grid;
      place-items: center;
      flex-shrink: 0;
      width: 1.4rem;
      height: 1.4rem;
      border-radius: 50%;
      background: var(--unmute-cta);
      color: #fff;
      font-size: 0.85rem;
    }
  }
}

.tips-icon {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 3rem;
  height: 3rem;
  border-radius: 50%;
  background: var(--unmute-chip-pink);
  color: var(--unmute-cta);
  font-size: 1.6rem;
}
</style>
