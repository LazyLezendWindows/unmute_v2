<template>
  <Teleport to="body">
    <Transition name="match-fade">
      <div v-if="match" class="match-screen" role="dialog" aria-modal="true" aria-labelledby="match-title">
        <div class="match-inner">
          <ScreenBar>
            <template #start>
              <button type="button" class="round-btn" aria-label="Close" @click="dismiss">
                <i class="ri-arrow-left-s-line" aria-hidden="true"></i>
              </button>
            </template>
            <template #actions>
              <button type="button" class="round-btn" aria-label="Report or block" @click="safetyOpen = true">
                <i class="ri-more-fill" aria-hidden="true"></i>
              </button>
            </template>
          </ScreenBar>

          <!-- Floating hearts behind the title -->
          <div class="hearts" aria-hidden="true">
            <i v-for="n in 9" :key="n" class="ri-heart-3-fill" :class="`h${n}`"></i>
          </div>

          <h1 id="match-title" class="match-title">
            <span class="title-top">It’s a</span>
            <span class="title-main">Match! <i class="ri-heart-3-line" aria-hidden="true"></i></span>
          </h1>
          <p class="match-sub">You and {{ person.displayName }} liked each other <span aria-hidden="true">❤️</span></p>

          <!-- The two of you, joined by a heart -->
          <div class="pair">
            <figure class="pair-person">
              <span class="pair-photo"><UAvatar :src="me?.avatarUrl" :name="me?.displayName || 'You'" size="2xl" /></span>
              <figcaption><strong>You</strong><span v-if="me?.age">{{ me.age }}</span></figcaption>
            </figure>
            <span class="pair-heart" aria-hidden="true"><i class="ri-heart-3-fill"></i></span>
            <figure class="pair-person">
              <span class="pair-photo"><UAvatar :src="person.avatarUrl" :name="person.displayName" size="2xl" /></span>
              <figcaption><strong>{{ person.displayName }}</strong><span>{{ person.age }}</span></figcaption>
            </figure>
          </div>

          <div v-if="facts.length" class="facts">
            <span v-for="fact in facts" :key="fact.icon" class="fact" :class="fact.tone">
              <i :class="fact.icon" aria-hidden="true"></i> {{ fact.label }}
            </span>
          </div>

          <!-- First message -->
          <section class="starter">
            <span class="starter-icon" aria-hidden="true"><i class="ri-chat-heart-line"></i></span>
            <h2 class="starter-title">Start a conversation</h2>
            <p class="starter-text">
              {{ person.commonInterestsCount ? 'You both seem to have a lot in common.' : 'Break the ice.' }}<br />Say something nice!
            </p>
            <div class="starter-chips">
              <button
                v-for="(starter, index) in starters"
                :key="starter"
                type="button"
                class="starter-chip"
                :class="{ 'is-lilac': index === 1, 'is-picked': message === starter }"
                @click="message = starter"
              >
                {{ starter }}
              </button>
            </div>
            <input
              v-if="message"
              v-model="message"
              type="text"
              class="starter-input"
              aria-label="Your first message"
              @keyup.enter="sendAndOpen"
            />
            <button type="button" class="send-btn" :disabled="sending" @click="sendAndOpen">
              <i class="ri-chat-smile-2-fill" aria-hidden="true"></i>
              <span>Send a Message</span>
              <i class="ri-arrow-right-s-line send-chevron" aria-hidden="true"></i>
            </button>
            <button type="button" class="swipe-btn" @click="dismiss">Keep Swiping</button>
          </section>
        </div>

        <SafetyModal
          :is-open="safetyOpen"
          :target-user-id="person.id"
          :target-name="person.displayName"
          @close="safetyOpen = false"
          @action-completed="dismiss"
        />
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import UAvatar from '../ui/UAvatar.vue';
import ScreenBar from '../layout/ScreenBar.vue';
import SafetyModal from '../safety/SafetyModal.vue';
import { ActiveMatch } from '../../stores/discover';
import { useAuthStore } from '../../stores/auth';
import { useChatStore } from '../../stores/chat';
import { useToastStore } from '../../stores/toast';
import { formatDistance } from '../../services/directory';

const props = defineProps<{ match: ActiveMatch | null }>();
const emit = defineEmits<{ (e: 'dismiss'): void }>();

const router = useRouter();
const authStore = useAuthStore();
const chatStore = useChatStore();

const message = ref('');
const sending = ref(false);
const safetyOpen = ref(false);
const me = computed(() => authStore.profile);
// Only read while `match` is set (the template is behind v-if).
const person = computed(() => props.match!.person);

/** Their work, study and distance, as in the mockup's three pills. */
const facts = computed(() => {
  const p = person.value;
  const distance = formatDistance(p.distanceKm);
  return [
    p.profession && { icon: 'ri-briefcase-4-fill', label: p.profession, tone: '' },
    p.education && { icon: 'ri-graduation-cap-fill', label: p.education.course || p.education.institutionShortName || p.education.institutionName, tone: 'is-lilac' },
    distance && { icon: 'ri-map-pin-fill', label: distance, tone: 'is-pink' },
  ].filter(Boolean) as { icon: string; label: string; tone: string }[];
});

/** Tapping one puts it in the box to send as is or edit. */
const starters = computed(() => {
  const shared = person.value.commonInterests[0];
  return ['Hey! 👋', 'How’s your week going? 😊', shared ? `${shared} fan too? ✨` : 'Any weekend plans? ✈️'];
});

function dismiss() {
  message.value = '';
  safetyOpen.value = false;
  emit('dismiss');
}

async function sendAndOpen() {
  if (!props.match || sending.value) return;
  const conversationId = props.match.conversationId;
  const text = message.value.trim();
  sending.value = true;
  try {
    if (text) {
      await chatStore.openConversation(conversationId);
      await chatStore.sendMessage(text);
    }
  } catch (err: any) {
    useToastStore().error(`Your message wasn't sent. ${err.message}`);
  } finally {
    sending.value = false;
  }
  dismiss();
  router.push(`/chat/${conversationId}`);
}
</script>

<style scoped lang="scss">
.match-screen {
  position: fixed;
  inset: 0;
  z-index: 1060;
  overflow-y: auto;
  background: radial-gradient(60% 40% at 100% 20%, rgba(242, 24, 114, 0.14), transparent 70%),
    radial-gradient(60% 40% at 0% 60%, rgba(192, 0, 120, 0.1), transparent 70%),
    linear-gradient(180deg, #fdf0fa 0%, #fbf3fd 50%, #f9eefb 100%);
}

.match-inner {
  position: relative;
  max-width: 30rem;
  margin: 0 auto;
  padding: 0.75rem 1.1rem calc(1.5rem + env(safe-area-inset-bottom, 0px));
  text-align: center;

  :deep(.bar-logo) {
    visibility: visible;
  }
}

.hearts i {
  position: absolute;
  color: #f45bb5;
  pointer-events: none;
  animation: float 6s ease-in-out infinite;

  &.h1 { top: 8.5rem; left: 10%; font-size: 1.6rem; }
  &.h2 { top: 11rem; left: 18%; font-size: 1rem; animation-delay: -1s; }
  &.h3 { top: 9rem; right: 30%; font-size: 0.7rem; }
  &.h4 { top: 7.5rem; right: 4%; font-size: 3.2rem; color: #e44cc4; animation-delay: -2s; }
  &.h5 { top: 16rem; left: 2%; font-size: 3rem; color: #c43ad0; animation-delay: -3s; }
  &.h6 { top: 18.5rem; right: 8%; font-size: 1.3rem; animation-delay: -4s; }
  &.h7 { top: 31rem; left: 9%; font-size: 1rem; }
  &.h8 { top: 30rem; right: 7%; font-size: 1.4rem; color: #fb8fb3; animation-delay: -1.5s; }
  &.h9 { top: 12rem; right: 16%; font-size: 0.8rem; color: #ffb3d6; }
}

@keyframes float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-8px); }
}

.match-title {
  position: relative;
  display: flex;
  flex-direction: column;
  margin: 1rem 0 0.5rem;
  font-family: var(--unmute-font-display);
  line-height: 1;
  letter-spacing: -0.03em;
}

.title-top {
  font-size: 3.1rem;
  font-weight: 800;
  color: #10106b;
}

.title-main {
  font-size: 4.6rem;
  font-weight: 800;
  background: linear-gradient(95deg, #ff3d8b 0%, #f21872 40%, #c00078 70%, #9b1fe0 100%);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;

  i {
    font-size: 2.6rem;
    vertical-align: 0.8em;
    -webkit-text-fill-color: #c02ad6;
  }
}

.match-sub {
  margin-bottom: 1.4rem;
  font-size: 1.1rem;
  color: #5f63b4;
}

.pair {
  position: relative;
  display: flex;
  justify-content: center;
  align-items: flex-start;
}

.pair-person {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.6rem;
  margin: 0;

  figcaption {
    display: flex;
    flex-direction: column;
    line-height: 1.2;

    strong {
      font-size: 1.35rem;
      font-weight: 800;
      color: #10106b;
    }

    span {
      font-size: 1.2rem;
      color: #5f63b4;
    }
  }
}

.pair-photo {
  display: block;
  padding: 5px;
  border-radius: 50%;
  background: linear-gradient(135deg, #ff4fa0, #d23cd6);

  :deep(.u-avatar) {
    width: clamp(8.5rem, 40vw, 10.5rem);
    height: clamp(8.5rem, 40vw, 10.5rem);
    border: 4px solid #fff;
  }
}

.pair-heart {
  position: relative;
  z-index: 2;
  margin: clamp(3.3rem, 15vw, 4.1rem) -2.2rem 0;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 4.6rem;
  height: 4.6rem;
  border-radius: 50%;
  background: #fff;
  color: #f21872;
  font-size: 2.4rem;
  box-shadow: 0 0 0 7px rgba(255, 214, 236, 0.8), 0 12px 30px -8px rgba(192, 0, 120, 0.5);
  animation: beat 1.6s ease-in-out infinite;

  i {
    background: linear-gradient(135deg, #ff4fa0, #d0158f);
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
  }
}

@keyframes beat {
  0%, 100% { transform: scale(1); }
  15% { transform: scale(1.1); }
  30% { transform: scale(1); }
}

.facts {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.55rem;
  margin: 1.4rem 0 1.2rem;
}

.fact {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.8rem 1.1rem;
  border-radius: var(--unmute-radius-pill);
  background: #fbeefa;
  color: #202080;
  font-size: 0.98rem;
  box-shadow: 0 6px 16px -10px rgba(117, 48, 170, 0.4);

  i {
    color: #7b1fd6;
    font-size: 1.2rem;
  }

  &.is-lilac {
    background: #f1ebfd;
  }

  &.is-pink {
    color: #c00078;

    i {
      color: #f21872;
    }
  }
}

.starter {
  padding: 1.4rem 1.1rem 1.2rem;
  border-radius: 2rem;
  background: rgba(255, 255, 255, 0.78);
  box-shadow: 0 20px 50px -30px rgba(117, 48, 170, 0.45);
}

.starter-icon {
  font-size: 2.8rem;
  line-height: 1;
  color: #d31aa6;
}

.starter-title {
  margin: 0.5rem 0 0.4rem;
  font-size: 1.5rem;
  font-weight: 800;
  color: #10106b;
}

.starter-text {
  margin-bottom: 1rem;
  color: #6c70b8;
}

.starter-chips {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.starter-chip {
  padding: 0.6rem 1rem;
  border: 1.5px solid transparent;
  border-radius: var(--unmute-radius-pill);
  background: #fde9f6;
  color: #c00078;
  font-size: 0.95rem;

  &.is-lilac {
    background: #efe9fd;
    color: #2a2a9a;
  }

  &.is-picked {
    border-color: #f21872;
  }
}

.starter-input {
  width: 100%;
  margin-bottom: 1rem;
  padding: 0.75rem 1.1rem;
  border: 1px solid rgba(123, 31, 214, 0.2);
  border-radius: var(--unmute-radius-pill);
  background: #fff;
  color: #10106b;
  outline: none;

  &:focus {
    border-color: #f21872;
  }
}

.send-btn {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.7rem;
  width: 100%;
  min-height: 3.7rem;
  border: 0;
  border-radius: var(--unmute-radius-pill);
  background: linear-gradient(95deg, #ff3d8b 0%, #e0149a 50%, #8a1fe0 100%);
  color: #fff;
  font-size: 1.2rem;
  font-weight: 600;
  box-shadow: 0 14px 30px -14px rgba(192, 0, 120, 0.7);

  > i:first-child {
    font-size: 1.6rem;
  }

  &:disabled {
    opacity: 0.7;
  }
}

.send-chevron {
  position: absolute;
  right: 1.3rem;
  font-size: 1.6rem;
}

.swipe-btn {
  width: 100%;
  min-height: 3.3rem;
  margin-top: 0.8rem;
  border: 1.5px solid #b98be6;
  border-radius: var(--unmute-radius-pill);
  background: transparent;
  color: #2a1a8a;
  font-size: 1.1rem;
  font-weight: 600;
}

.match-fade-enter-active,
.match-fade-leave-active {
  transition: opacity 250ms ease;
}

.match-fade-enter-from,
.match-fade-leave-to {
  opacity: 0;
}
</style>
