<template>
  <div class="edit-page">
    <ScreenBar back="/profile" />
    <header class="edit-head">
      <h1>Edit Profile</h1>
      <p>Show your true self</p>
    </header>

    <!-- Photos: the main one, then up to six more. Picked files upload and save straight away. -->
    <section class="photo-grid" aria-label="Photos" :aria-busy="Boolean(uploading)">
      <div class="photo-main" :style="photoBackground(form.avatarUrl)">
        <span v-if="!form.avatarUrl" class="photo-empty"><i class="ri-user-3-line" aria-hidden="true"></i></span>
        <span v-if="uploading === 'main'" class="photo-busy"><span class="spinner-border" aria-hidden="true"></span></span>
        <button type="button" class="photo-camera" aria-label="Change main photo" :disabled="Boolean(uploading) || saving" @click="pick('main')">
          <i class="ri-camera-line" aria-hidden="true"></i>
        </button>
      </div>
      <div class="photo-slots">
        <template v-for="index in MAX_PHOTOS" :key="index">
          <div v-if="form.photos[index - 1]" class="photo-slot" :style="photoBackground(form.photos[index - 1])">
            <button type="button" class="photo-remove" :aria-label="`Remove photo ${index}`" :disabled="Boolean(uploading) || saving" @click="removePhoto(index - 1)">
              <i class="ri-close-line" aria-hidden="true"></i>
            </button>
          </div>
          <button
            v-else-if="index - 1 === form.photos.length"
            type="button"
            class="photo-slot is-add"
            :disabled="Boolean(uploading) || saving"
            @click="pick('add')"
          >
            <span v-if="uploading === 'add'" class="spinner-border spinner-border-sm" aria-hidden="true"></span>
            <i v-else class="ri-add-circle-fill" aria-hidden="true"></i>{{ uploading === 'add' ? 'Uploading…' : 'Add Photo' }}
          </button>
          <span v-else class="photo-slot is-add is-idle" aria-hidden="true"><i class="ri-add-circle-fill"></i>Add Photo</span>
        </template>
      </div>
      <input ref="fileInput" type="file" accept="image/jpeg,image/png,image/webp" class="d-none" :multiple="picking === 'add'" @change="onFiles" />
    </section>

    <div v-if="errorMsg" class="edit-error" role="alert">{{ errorMsg }}</div>

    <!-- Basic information -->
    <section class="e-card">
      <div class="e-card-head"><i class="ri-user-3-line" aria-hidden="true"></i><h2>Basic Information</h2><i class="ri-arrow-right-s-line e-chev" aria-hidden="true"></i></div>
      <div class="rows">
        <button type="button" class="row-item" @click="openField('name')">
          <i class="ri-user-line" aria-hidden="true"></i><span class="row-label">Name</span>
          <span class="row-value">{{ form.displayName }}</span><i class="ri-arrow-right-s-line row-chev" aria-hidden="true"></i>
        </button>
        <div class="row-item" title="From your date of birth">
          <i class="ri-cake-2-line" aria-hidden="true"></i><span class="row-label">Age</span>
          <span class="row-value">{{ authStore.profile?.age ?? '' }}</span><i class="ri-lock-line row-chev" aria-hidden="true"></i>
        </div>
        <button type="button" class="row-item" @click="openField('education')">
          <i class="ri-graduation-cap-line" aria-hidden="true"></i><span class="row-label">Education</span>
          <span class="row-value" :class="{ 'is-empty': !educationLabel }">{{ educationLabel || 'Add' }}</span><i class="ri-arrow-right-s-line row-chev" aria-hidden="true"></i>
        </button>
        <button type="button" class="row-item" @click="openField('profession')">
          <i class="ri-briefcase-4-line" aria-hidden="true"></i><span class="row-label">Profession</span>
          <span class="row-value" :class="{ 'is-empty': !form.profession }">{{ form.profession || 'Add' }}</span><i class="ri-arrow-right-s-line row-chev" aria-hidden="true"></i>
        </button>
        <router-link to="/profile/location" class="row-item">
          <i class="ri-map-pin-line" aria-hidden="true"></i><span class="row-label">Location</span>
          <span class="row-value" :class="{ 'is-empty': !authStore.profile?.location }">{{ authStore.profile?.location?.placeName || 'Add' }}</span><i class="ri-arrow-right-s-line row-chev" aria-hidden="true"></i>
        </router-link>
        <button type="button" class="row-item" @click="openField('gender')">
          <i class="ri-user-heart-line" aria-hidden="true"></i><span class="row-label">Gender</span>
          <span class="row-value" :class="{ 'is-empty': !form.gender }">{{ genderLabel || 'Add' }}</span><i class="ri-arrow-right-s-line row-chev" aria-hidden="true"></i>
        </button>
        <button type="button" class="row-item" @click="openField('height')">
          <i class="ri-ruler-line" aria-hidden="true"></i><span class="row-label">Height</span>
          <span class="row-value" :class="{ 'is-empty': !form.heightCm }">{{ form.heightCm ? `${form.heightCm} cm` : 'Add' }}</span><i class="ri-arrow-right-s-line row-chev" aria-hidden="true"></i>
        </button>
      </div>
    </section>

    <!-- About -->
    <section class="e-card">
      <label for="edit-bio" class="e-card-head"><i class="ri-edit-box-line" aria-hidden="true"></i><h2>About Me</h2><i class="ri-arrow-right-s-line e-chev" aria-hidden="true"></i></label>
      <div class="bio-box">
        <textarea id="edit-bio" v-model="form.bio" rows="3" :maxlength="BIO_MAX" placeholder="Passionate about travel, good food and meaningful conversations…"></textarea>
        <span class="bio-count">{{ form.bio.length }}/{{ BIO_MAX }}</span>
      </div>
    </section>

    <!-- Interests: removals save with the rest; adding opens the full picker -->
    <section class="e-card">
      <div class="e-card-head"><i class="ri-heart-3-line" aria-hidden="true"></i><h2>Interests</h2><router-link to="/profile/interests" class="e-chev" aria-label="Choose interests"><i class="ri-arrow-right-s-line"></i></router-link></div>
      <div class="chips">
        <span v-for="(interest, index) in keptInterests" :key="interest.id" class="int-chip" :class="{ 'is-blue': index % 4 === 0 && index > 0 }">
          <i :class="interestIcon(interest.name)" class="int-icon" aria-hidden="true"></i>{{ interest.name }}
          <button type="button" :aria-label="`Remove ${interest.name}`" @click="removeInterest(interest.id)"><i class="ri-close-line" aria-hidden="true"></i></button>
        </span>
      </div>
      <router-link to="/profile/interests" class="add-interest"><i class="ri-add-line" aria-hidden="true"></i> Add Interest</router-link>
    </section>

    <!-- Looking for & lifestyle (used by Discover's filters and shown on your profile) -->
    <section class="e-card">
      <div class="e-card-head"><i class="ri-search-eye-line" aria-hidden="true"></i><h2>Looking For</h2></div>
      <div class="chips">
        <button
          v-for="option in LOOKING_FOR"
          :key="option"
          type="button"
          class="pick-chip"
          :aria-pressed="form.interactionPreferences.includes(option)"
          @click="togglePreference(option)"
        >
          {{ option }}
        </button>
      </div>
    </section>

    <section class="e-card">
      <div class="e-card-head"><i class="ri-leaf-line" aria-hidden="true"></i><h2>Lifestyle</h2></div>
      <div v-for="(options, key) in LIFESTYLE_OPTIONS" :key="key" class="life-row">
        <span class="life-label">{{ LIFESTYLE_LABELS[key] }}</span>
        <div class="chips">
          <button
            v-for="option in options"
            :key="option.value"
            type="button"
            class="pick-chip is-small"
            :aria-pressed="form.lifestyle[key] === option.value"
            @click="toggleLifestyle(key, option.value)"
          >
            {{ option.label }}
          </button>
        </div>
      </div>
    </section>

    <!-- Prompts: short answers that give people something to talk about -->
    <section class="e-card">
      <div class="e-card-head"><i class="ri-chat-quote-line" aria-hidden="true"></i><h2>Prompts</h2></div>
      <p class="e-hint">Answer up to {{ MAX_PROMPTS }}. They show on your profile and make starting a chat easy.</p>
      <div v-for="(prompt, index) in form.prompts" :key="prompt.q" class="prompt-edit">
        <div class="prompt-edit-head">
          <strong>{{ PROMPT_QUESTIONS[prompt.q] }}</strong>
          <button type="button" class="prompt-remove" :aria-label="`Remove prompt: ${PROMPT_QUESTIONS[prompt.q]}`" @click="removePrompt(index)">
            <i class="ri-close-line" aria-hidden="true"></i>
          </button>
        </div>
        <textarea v-model="prompt.a" maxlength="200" rows="2" class="prompt-answer" :aria-label="PROMPT_QUESTIONS[prompt.q]" placeholder="Your answer"></textarea>
        <span class="prompt-count">{{ prompt.a.length }}/200</span>
      </div>
      <div v-if="form.prompts.length < MAX_PROMPTS" class="prompt-add">
        <select v-model="newPrompt" class="prompt-select" aria-label="Choose a prompt">
          <option value="" disabled>Choose a prompt…</option>
          <option v-for="q in unusedPrompts" :key="q" :value="q">{{ PROMPT_QUESTIONS[q] }}</option>
        </select>
        <button type="button" class="add-interest" :disabled="!newPrompt" @click="addPrompt"><i class="ri-add-line" aria-hidden="true"></i> Add</button>
      </div>
    </section>

    <!-- Background: optional details people often filter by -->
    <section class="e-card">
      <div class="e-card-head"><i class="ri-earth-line" aria-hidden="true"></i><h2>Background</h2></div>
      <p class="e-hint">All optional. Tap a choice again to clear it.</p>
      <div class="life-row">
        <span class="life-label">Religion</span>
        <div class="chips">
          <button v-for="o in RELIGIONS" :key="o.value" type="button" class="pick-chip is-small" :aria-pressed="form.religion === o.value" @click="form.religion = form.religion === o.value ? null : o.value">{{ o.label }}</button>
        </div>
      </div>
      <div class="life-row">
        <label class="life-label" for="mother-tongue">Mother tongue</label>
        <select id="mother-tongue" v-model="form.motherTongue" class="prompt-select">
          <option :value="null">Not set</option>
          <option v-for="o in LANGUAGES" :key="o.value" :value="o.value">{{ o.label }}</option>
        </select>
      </div>
      <div class="life-row">
        <span class="life-label">Languages I speak <small>(up to {{ MAX_LANGUAGES }})</small></span>
        <div class="chips">
          <button
            v-for="o in LANGUAGES"
            :key="o.value"
            type="button"
            class="pick-chip is-small"
            :aria-pressed="form.languages.includes(o.value)"
            :disabled="!form.languages.includes(o.value) && form.languages.length >= MAX_LANGUAGES"
            @click="toggleLanguage(o.value)"
          >{{ o.label }}</button>
        </div>
      </div>
      <div class="life-row">
        <span class="life-label">Diet</span>
        <div class="chips">
          <button v-for="o in DIETS" :key="o.value" type="button" class="pick-chip is-small" :aria-pressed="form.diet === o.value" @click="form.diet = form.diet === o.value ? null : o.value">{{ o.label }}</button>
        </div>
      </div>
      <div class="life-row">
        <span class="life-label">Relationship status</span>
        <div class="chips">
          <button v-for="o in MARITAL_STATUSES" :key="o.value" type="button" class="pick-chip is-small" :aria-pressed="form.maritalStatus === o.value" @click="form.maritalStatus = form.maritalStatus === o.value ? null : o.value">{{ o.label }}</button>
        </div>
      </div>
      <div class="life-row">
        <span class="life-label">Family plans</span>
        <div class="chips">
          <button v-for="o in FAMILY_PLANS" :key="o.value" type="button" class="pick-chip is-small" :aria-pressed="form.familyPlans === o.value" @click="form.familyPlans = form.familyPlans === o.value ? null : o.value">{{ o.label }}</button>
        </div>
      </div>
    </section>

    <button type="button" class="save-btn" :disabled="saving || Boolean(uploading)" @click="saveProfile">
      <span v-if="saving" class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>Save Changes
    </button>

    <!-- One small editor for whichever row was tapped -->
    <UModal :is-open="Boolean(editing)" :title="editorTitle" @close="editing = null">
      <form v-if="editing && editing !== 'education'" id="field-form" class="d-flex flex-column gap-3" @submit.prevent="applyField">
        <UInput v-if="editing === 'name'" v-model="fieldValue" label="Name" required :maxlength="50" />
        <template v-if="editing === 'profession'">
          <UInput v-model="fieldValue" label="Job title" placeholder="e.g. Product Designer" :maxlength="80" />
          <span class="life-label">Field</span>
          <div class="chips">
            <button
              v-for="option in PROFESSION_FIELDS"
              :key="option.value"
              type="button"
              class="pick-chip is-small"
              :aria-pressed="form.professionField === option.value"
              @click="form.professionField = form.professionField === option.value ? null : option.value"
            >
              {{ option.label }}
            </button>
          </div>
        </template>
        <UInput v-if="editing === 'height'" v-model="fieldValue" label="Height (cm)" type="number" :min="120" :max="220" placeholder="165" />
        <div v-if="editing === 'gender'" class="chips">
          <button v-for="option in GENDERS" :key="option.value" type="button" class="pick-chip" :aria-pressed="fieldValue === option.value" @click="fieldValue = option.value">
            {{ option.label }}
          </button>
        </div>
        <p v-if="editing === 'gender'" class="small u-text-muted mb-0">Not shown on your profile; used for "Show me" in other people's filters.</p>
        <p v-if="fieldError" class="small text-danger mb-0" role="alert">{{ fieldError }}</p>
      </form>
      <template v-if="editing === 'education'">
        <span class="life-label">Highest level</span>
        <div class="chips mb-3">
          <button
            v-for="option in EDUCATION_LEVELS"
            :key="option.value"
            type="button"
            class="pick-chip is-small"
            :aria-pressed="form.educationLevel === option.value"
            @click="setEducationLevel(option.value)"
          >
            {{ option.label }}
          </button>
        </div>
        <EducationPicker @saved="editing = null" />
      </template>
      <template v-if="editing && editing !== 'education'" #footer>
        <UButton variant="ghost" size="md" @click="editing = null">Cancel</UButton>
        <UButton type="submit" form="field-form" variant="primary" size="md">Done</UButton>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import ScreenBar from '../components/layout/ScreenBar.vue';
import { photoBackground, photoProblem, uploadPhoto } from '../services/media';
import UModal from '../components/ui/UModal.vue';
import UInput from '../components/ui/UInput.vue';
import UButton from '../components/ui/UButton.vue';
import EducationPicker from '../components/education/EducationPicker.vue';
import { useAuthStore } from '../stores/auth';
import { useToastStore } from '../stores/toast';
import { interestIcon } from '../utils/interestIcon';
import { EDUCATION_LEVELS, LIFESTYLE_OPTIONS, LOOKING_FOR, PROFESSION_FIELDS, educationLine } from '../utils/profileFormat';
import { EducationLevel, Gender, Language, Lifestyle, PromptAnswer } from '../types';
import { DIETS, FAMILY_PLANS, LANGUAGES, MARITAL_STATUSES, MAX_LANGUAGES, MAX_PROMPTS, PROMPT_QUESTIONS, RELIGIONS } from '../content/profileOptions';

const MAX_PHOTOS = 6;
const BIO_MAX = 500;
const LIFESTYLE_LABELS: Record<keyof Lifestyle, string> = { drinking: 'Drinking', smoking: 'Smoking', workout: 'Workout' };
const GENDERS: { value: Gender; label: string }[] = [
  { value: 'woman', label: 'Woman' },
  { value: 'man', label: 'Man' },
  { value: 'nonbinary', label: 'Non-binary' },
];

type Field = 'name' | 'profession' | 'height' | 'gender' | 'education';

const authStore = useAuthStore();
const profile = authStore.profile;

const form = reactive({
  displayName: profile?.displayName || '',
  avatarUrl: profile?.avatarUrl || '',
  photos: [...(profile?.photos || [])],
  bio: profile?.bio || '',
  profession: profile?.profession || '',
  heightCm: profile?.heightCm ?? null,
  gender: profile?.gender ?? null,
  lifestyle: { drinking: null, smoking: null, workout: null, ...profile?.lifestyle } as Lifestyle,
  interactionPreferences: [...(profile?.interactionPreferences || [])],
  interestIds: (profile?.interests || []).map((i) => i.id),
  educationLevel: profile?.educationLevel ?? null,
  professionField: profile?.professionField ?? null,
  prompts: (profile?.prompts || []).map((p) => ({ ...p })) as PromptAnswer[],
  religion: profile?.religion ?? null,
  motherTongue: profile?.motherTongue ?? null,
  languages: [...(profile?.languages || [])] as Language[],
  diet: profile?.diet ?? null,
  maritalStatus: profile?.maritalStatus ?? null,
  familyPlans: profile?.familyPlans ?? null,
});

// ---- Prompts ----
const newPrompt = ref('');
const unusedPrompts = computed(() => Object.keys(PROMPT_QUESTIONS).filter((q) => !form.prompts.some((p) => p.q === q)));
function addPrompt() {
  if (!newPrompt.value || form.prompts.length >= MAX_PROMPTS) return;
  form.prompts.push({ q: newPrompt.value, a: '' });
  newPrompt.value = '';
}
function removePrompt(index: number) {
  form.prompts.splice(index, 1);
}

function toggleLanguage(value: Language) {
  form.languages = form.languages.includes(value) ? form.languages.filter((l) => l !== value) : [...form.languages, value];
}

const saving = ref(false);
const errorMsg = ref<string | null>(null);

const keptInterests = computed(() =>
  (authStore.profile?.interests || []).filter((interest) => form.interestIds.includes(interest.id))
);
const educationLabel = computed(() =>
  educationLine({ education: authStore.profile?.education, educationLevel: form.educationLevel })
);
const genderLabel = computed(() => GENDERS.find((g) => g.value === form.gender)?.label ?? '');

// ---- Photos ----
const fileInput = ref<HTMLInputElement | null>(null);
const picking = ref<'main' | 'add'>('add');
const uploading = ref<'main' | 'add' | 'remove' | null>(null);

function pick(which: 'main' | 'add') {
  if (uploading.value || saving.value) return;
  picking.value = which;
  fileInput.value?.click();
}

async function onFiles(event: Event) {
  const input = event.target as HTMLInputElement;
  const files = Array.from(input.files || []);
  input.value = ''; // Picking the same file again should still fire.
  if (!files.length || uploading.value || saving.value) return;
  const toast = useToastStore();
  const which = picking.value;
  const room = which === 'main' ? 1 : MAX_PHOTOS - form.photos.length;
  const chosen = files.slice(0, room);
  if (files.length > room) toast.show(`Only ${room} more photo${room === 1 ? '' : 's'} can be added.`);

  uploading.value = which;
  let avatarUrl = form.avatarUrl;
  const photos = [...form.photos];
  try {
    for (const file of chosen) {
      const problem = photoProblem(file);
      if (problem) {
        toast.error(`${file.name}: ${problem}`);
        continue;
      }
      try {
        const url = await uploadPhoto(file);
        if (which === 'main') avatarUrl = url;
        else photos.push(url);
      } catch (err: any) {
        toast.error(`${file.name}: Photo not uploaded. ${err.message}`);
      }
    }
    if (avatarUrl !== form.avatarUrl || photos.length !== form.photos.length) await savePhotos(avatarUrl, photos);
  } catch (err: any) {
    toast.error(`Photos not saved. ${err.message}`);
  } finally {
    uploading.value = null;
  }
}

async function removePhoto(index: number) {
  if (uploading.value || saving.value) return;
  uploading.value = 'remove';
  try {
    await savePhotos(form.avatarUrl, form.photos.filter((_, i) => i !== index));
  } catch (err: any) {
    useToastStore().error(`Photo not removed. ${err.message}`);
  } finally {
    uploading.value = null;
  }
}

/** Photo changes save on their own, so an upload is never lost by leaving without Save Changes. */
async function savePhotos(avatarUrl: string, photos: string[]) {
  await authStore.updateProfile({ avatarUrl, photos });
  form.avatarUrl = avatarUrl;
  form.photos = photos;
  useToastStore().success('Photos updated.');
}

function removeInterest(id: string) {
  form.interestIds = form.interestIds.filter((i) => i !== id);
}

/** Saves straight away, like the college picker beside it; tapping the chosen level clears it. */
async function setEducationLevel(value: EducationLevel) {
  const previous = form.educationLevel;
  form.educationLevel = previous === value ? null : value;
  try {
    await authStore.updateProfile({ educationLevel: form.educationLevel });
  } catch (err: any) {
    form.educationLevel = previous;
    useToastStore().error(`Education level not saved. ${err.message}`);
  }
}

/** Tapping the chosen answer again clears it. */
function toggleLifestyle(key: keyof Lifestyle, value: string) {
  (form.lifestyle as Record<keyof Lifestyle, string | null>)[key] = form.lifestyle[key] === value ? null : value;
}

function togglePreference(option: string) {
  form.interactionPreferences = form.interactionPreferences.includes(option)
    ? form.interactionPreferences.filter((p) => p !== option)
    : [...form.interactionPreferences, option];
}

// ---- Row editor ----
const editing = ref<Field | null>(null);
const fieldValue = ref<string>('');
const fieldError = ref('');

const editorTitle = computed(() => ({
  name: 'Name', profession: 'Profession', height: 'Height', gender: 'Gender',
  education: 'Education',
})[editing.value ?? 'name']);

function openField(field: Field) {
  fieldError.value = '';
  fieldValue.value = {
    name: form.displayName,
    profession: form.profession,
    height: form.heightCm ? String(form.heightCm) : '',
    gender: form.gender ?? '',
    education: '',
  }[field];
  editing.value = field;
}

function applyField() {
  const value = fieldValue.value.trim();
  fieldError.value = '';
  if (editing.value === 'height' && value) {
    const cm = Number(value);
    if (!Number.isInteger(cm) || cm < 120 || cm > 220) {
      fieldError.value = 'Enter a height between 120 and 220 cm.';
      return;
    }
  }
  switch (editing.value) {
    case 'name': form.displayName = value; break;
    case 'profession': form.profession = value; break;
    case 'height': form.heightCm = value ? Number(value) : null; break;
    case 'gender': form.gender = (value || null) as Gender | null; break;
  }
  editing.value = null;
}

async function saveProfile() {
  if (saving.value || uploading.value) return;
  saving.value = true;
  errorMsg.value = null;
  try {
    // A prompt without an answer isn't saved.
    await authStore.updateProfile({ ...form, prompts: form.prompts.map((p) => ({ q: p.q, a: p.a.trim() })).filter((p) => p.a) });
    useToastStore().success('Profile updated.');
  } catch (err: any) {
    errorMsg.value = err.message || 'Failed to update profile';
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped lang="scss">
$ink: #10106b;
$ink-soft: #3c3fa0;
$gradient: linear-gradient(95deg, #ff3d8b 0%, #e0149a 50%, #8a1fe0 100%);

.edit-page {
  width: 100%;
  max-width: 34rem;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.edit-head {
  margin-top: -0.4rem;
  text-align: center;

  h1 {
    margin: 0;
    font-size: 2.1rem;
    font-weight: 800;
    color: $ink;
  }

  p {
    margin: 0;
    font-size: 1.2rem;
    color: #5b4bc4;
  }
}

.photo-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(0, 1.6fr);
  gap: 0.6rem;
}

.photo-main,
.photo-slot {
  position: relative;
  border-radius: 1.3rem;
  background-size: cover;
  background-position: center;
  background-color: #f7e6f4;
}

.photo-main {
  min-height: 100%;
}

.photo-empty {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  font-size: 3rem;
  color: #d6a0cf;
}

.photo-camera {
  position: absolute;
  right: 0.6rem;
  bottom: 0.6rem;
  display: grid;
  place-items: center;
  width: 2.6rem;
  height: 2.6rem;
  border: 0;
  border-radius: 50%;
  background: #fff;
  color: $ink;
  font-size: 1.35rem;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.18);
}

.photo-slots {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  align-content: start;
  gap: 0.6rem;
}

.photo-slot {
  aspect-ratio: 0.93;

  &.is-add {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.2rem;
    border: 0;
    background: #fbe4f3;
    color: #e5147c;
    font-size: 0.85rem;

    i {
      font-size: 1.6rem;
    }
  }

  &.is-idle {
    opacity: 0.55;
  }
}

.photo-busy {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  border-radius: inherit;
  background: rgba(255, 255, 255, 0.55);
  color: #e5147c;
}

.photo-remove {
  position: absolute;
  top: 0.35rem;
  right: 0.35rem;
  display: grid;
  place-items: center;
  width: 1.5rem;
  height: 1.5rem;
  border: 0;
  border-radius: 50%;
  background: #fff;
  color: #e5147c;
  font-size: 1rem;
}

.edit-error {
  padding: 0.7rem 1rem;
  border-radius: 1rem;
  background: rgba(217, 45, 32, 0.08);
  color: var(--unmute-danger);
  font-size: 0.9rem;
}

.e-card {
  padding: 1rem 1rem 1.1rem;
  border-radius: 1.6rem;
  background: rgba(255, 255, 255, 0.82);
  box-shadow: 0 10px 30px -22px rgba(117, 48, 170, 0.5);
}

.e-card-head {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  margin-bottom: 0.75rem;

  > i:first-child {
    font-size: 1.7rem;
    color: #e5147c;
  }

  h2 {
    flex-grow: 1;
    margin: 0;
    font-size: 1.2rem;
    font-weight: 800;
    color: $ink;
  }
}

.e-chev {
  color: $ink;
  font-size: 1.5rem;
  text-decoration: none;
}

.rows {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}

.row-item {
  display: grid;
  grid-template-columns: 1.6rem 7.5rem 1fr auto;
  align-items: center;
  gap: 0.6rem;
  width: 100%;
  min-height: 3.1rem;
  padding: 0 0.8rem;
  border: 0;
  border-radius: 1rem;
  background: #f6f3fc;
  color: $ink;
  text-align: left;
  text-decoration: none;

  > i:first-child {
    font-size: 1.35rem;
    color: $ink-soft;
  }
}

.row-label {
  color: #4b4fa6;
  font-size: 1.02rem;
}

.row-value {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 1.02rem;

  &.is-empty {
    color: #a39ccc;
  }
}

.row-chev {
  color: $ink-soft;
  font-size: 1.3rem;
}

.bio-box {
  position: relative;
  border-radius: 1.1rem;
  background: #f6f3fc;

  textarea {
    display: block;
    width: 100%;
    padding: 0.9rem 1rem 1.8rem;
    border: 0;
    outline: none;
    resize: vertical;
    background: transparent;
    color: #4b4fa6;
    font-size: 1.05rem;
    line-height: 1.5;
  }
}

.bio-count {
  position: absolute;
  right: 1rem;
  bottom: 0.5rem;
  font-size: 0.85rem;
  color: #5b5fa8;
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.int-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.4rem 0.5rem 0.4rem 0.85rem;
  border-radius: var(--unmute-radius-pill);
  background: #fbeaf6;
  color: #c00078;
  font-size: 0.98rem;

  .int-icon {
    font-size: 1.3rem;
    color: #e5147c;
  }

  &.is-blue {
    background: #eef0fd;
    color: $ink;

    .int-icon {
      color: #3d6cf0;
    }
  }

  button {
    display: grid;
    place-items: center;
    border: 0;
    background: transparent;
    color: inherit;
    font-size: 1.05rem;
  }
}

.add-interest {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
  margin-top: 0.7rem;
  min-height: 2.9rem;
  border-radius: var(--unmute-radius-pill);
  background: #fbeaf6;
  color: #e5147c;
  font-size: 1.1rem;
  text-decoration: none;
}

.pick-chip {
  padding: 0.55rem 1rem;
  border: 0;
  border-radius: var(--unmute-radius-pill);
  background: #f5f1fc;
  color: #4b3fb8;
  font-size: 0.98rem;

  &.is-small {
    padding: 0.4rem 0.85rem;
    font-size: 0.9rem;
  }

  &[aria-pressed='true'] {
    background: $gradient;
    color: #fff;
  }
}

.life-row + .life-row {
  margin-top: 0.7rem;
}

.life-label {
  display: block;
  margin-bottom: 0.35rem;
  font-size: 0.9rem;
  font-weight: 600;
  color: #4b4fa6;
}

.e-hint {
  margin: -0.25rem 0 0.75rem;
  font-size: 0.85rem;
  color: #6b6a9a;
}

.prompt-edit {
  position: relative;
  padding: 0.75rem 0.85rem 1.4rem;
  border-radius: 1rem;
  background: #f8f5fd;

  & + & { margin-top: 0.6rem; }
}

.prompt-edit-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 0.4rem;
  color: $ink;
  font-size: 0.95rem;
}

.prompt-remove {
  flex-shrink: 0;
  display: grid;
  place-items: center;
  width: 1.8rem;
  height: 1.8rem;
  border: 0;
  border-radius: 50%;
  background: #fff;
  color: #6b6a9a;
}

.prompt-answer {
  width: 100%;
  padding: 0.55rem 0.75rem;
  border: 1px solid rgba(74, 0, 91, 0.12);
  border-radius: 0.8rem;
  background: #fff;
  color: $ink;
  font-size: 0.95rem;
  resize: vertical;
}

.prompt-count {
  position: absolute;
  right: 0.9rem;
  bottom: 0.3rem;
  font-size: 0.72rem;
  color: #8b8aa8;
}

.prompt-add {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.75rem;

  .add-interest {
    flex-shrink: 0;
    margin: 0;
    padding: 0 1.1rem;
    border: 0;

    &:disabled { opacity: 0.5; }
  }
}

.prompt-select {
  flex: 1;
  min-width: 0;
  width: 100%;
  min-height: 2.8rem;
  padding: 0 0.75rem;
  border: 1px solid rgba(74, 0, 91, 0.12);
  border-radius: 0.8rem;
  background: #fff;
  color: $ink;
  font-size: 0.95rem;
}

.pick-chip:disabled {
  opacity: 0.45;
}

.save-btn {
  min-height: 3.8rem;
  margin-bottom: 0.5rem;
  border: 0;
  border-radius: var(--unmute-radius-pill);
  background: $gradient;
  color: #fff;
  font-size: 1.4rem;
  box-shadow: 0 16px 34px -14px rgba(192, 0, 120, 0.75);

  &:disabled {
    opacity: 0.7;
  }
}
</style>
