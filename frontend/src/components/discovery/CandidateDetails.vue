<template>
  <section class="details" :aria-label="`About ${person.displayName}`">
    <div v-if="person.bio" class="d-card">
      <div class="d-head">
        <i class="ri-user-3-line" aria-hidden="true"></i>
        <h3>About Me</h3>
        <button type="button" class="d-more" aria-label="Report or block" @click="$emit('more')"><i class="ri-more-fill" aria-hidden="true"></i></button>
      </div>
      <p class="d-bio">{{ person.bio }}</p>
    </div>

    <!-- Prompts: one card per answer, the easiest thing to reply to -->
    <div v-for="prompt in prompts" :key="prompt.q" class="d-card d-prompt">
      <p class="d-prompt-q">{{ PROMPT_QUESTIONS[prompt.q] }}</p>
      <p class="d-prompt-a">{{ prompt.a }}</p>
    </div>

    <div v-if="interestNames.length" class="d-card">
      <div class="d-head">
        <i class="ri-heart-3-line" aria-hidden="true"></i>
        <h3>My Interests</h3>
      </div>
      <div class="d-chips">
        <span v-for="name in interestNames" :key="name" class="d-chip" :class="{ 'is-shared': shared.has(name) }" :title="shared.has(name) ? 'You both like this' : undefined">
          <i :class="interestIcon(name)" aria-hidden="true"></i>{{ name }}
        </span>
      </div>
    </div>

    <div v-if="background.length" class="d-card">
      <div class="d-head">
        <i class="ri-earth-line" aria-hidden="true"></i>
        <h3>Background</h3>
      </div>
      <div class="d-life">
        <span v-for="item in background" :key="item.text"><i :class="item.icon" aria-hidden="true"></i>{{ item.text }}</span>
      </div>
    </div>

    <div v-if="showLifestyle && lifestyle.length" class="d-card">
      <div class="d-head">
        <i class="ri-equalizer-line" aria-hidden="true"></i>
        <h3>Lifestyle</h3>
      </div>
      <div class="d-life">
        <span v-for="item in lifestyle" :key="item.key"><i :class="item.icon" aria-hidden="true"></i>{{ item.label }}</span>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { interestIcon } from '../../utils/interestIcon';
import { lifestyleItems } from '../../utils/profileFormat';
import { Diet, FamilyPlans, Language, Lifestyle, MaritalStatus, PromptAnswer, Religion } from '../../types';
import { PROMPT_QUESTIONS, backgroundChips } from '../../content/profileOptions';

const props = defineProps<{
  person: {
    displayName: string;
    bio: string;
    /** Interest objects (Discover) or names (matches). */
    interests: ({ name: string } | string)[];
    commonInterests?: string[];
    lifestyle?: Lifestyle;
    prompts?: PromptAnswer[];
    religion?: Religion | null;
    motherTongue?: Language | null;
    languages?: Language[];
    diet?: Diet | null;
    maritalStatus?: MaritalStatus | null;
    familyPlans?: FamilyPlans | null;
  };
  showLifestyle?: boolean;
}>();

defineEmits<{ (e: 'more'): void }>();

const interestNames = computed(() => props.person.interests.map((i) => (typeof i === 'string' ? i : i.name)));
const shared = computed(() => new Set(props.person.commonInterests ?? []));
const lifestyle = computed(() => lifestyleItems(props.person.lifestyle));
const prompts = computed(() => (props.person.prompts ?? []).filter((p) => PROMPT_QUESTIONS[p.q] && p.a));
const background = computed(() => backgroundChips(props.person));
</script>

<style scoped lang="scss">
.details {
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
  min-width: 0;
}

.d-card {
  padding: 1rem 1.1rem 1.1rem;
  border-radius: 1.5rem;
  background: rgba(255, 255, 255, 0.85);
  box-shadow: 0 10px 30px -22px rgba(117, 48, 170, 0.5);
}

.d-head {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.55rem;

  > i {
    font-size: 1.6rem;
    color: #e5147c;
  }

  h3 {
    flex-grow: 1;
    margin: 0;
    font-size: 1.2rem;
    font-weight: 800;
    color: #10106b;
  }
}

.d-more {
  border: 0;
  background: transparent;
  color: #10106b;
  font-size: 1.4rem;
  line-height: 1;
}

.d-bio {
  margin: 0;
  padding-left: 2.35rem;
  color: #4b4fa6;
  font-size: 1.02rem;
  line-height: 1.5;
  white-space: pre-line;
}

.d-prompt-q {
  margin: 0 0 0.35rem;
  font-size: 0.9rem;
  font-weight: 700;
  color: #7b1fd6;
}

.d-prompt-a {
  margin: 0;
  font-size: 1.2rem;
  font-weight: 700;
  line-height: 1.35;
  color: #10106b;
  white-space: pre-line;
}

.d-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.d-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.45rem 0.9rem;
  border-radius: var(--unmute-radius-pill);
  background: #eef0fd;
  color: #10106b;
  font-size: 0.95rem;

  i {
    font-size: 1.2rem;
    color: #3d6cf0;
  }

  &.is-shared {
    background: #fbeaf6;
    color: #c00078;

    i {
      color: #e5147c;
    }
  }
}

.d-life {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem 1.2rem;
  color: #4b4fa6;
  font-size: 0.98rem;

  span {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
  }

  i {
    font-size: 1.25rem;
    color: #7b1fd6;
  }
}
</style>
