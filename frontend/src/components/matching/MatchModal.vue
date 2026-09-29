<template>
  <Teleport to="body">
    <Transition name="match-fade">
      <div v-if="match" class="match-screen" role="dialog" aria-modal="true" aria-labelledby="match-title" @keydown.esc="dismiss">
        <!-- Soft lavender circles and waves, as on the sign-in screens -->
        <span class="orb orb-1" aria-hidden="true"></span>
        <span class="orb orb-2" aria-hidden="true"></span>
        <svg class="waves" viewBox="0 0 390 140" preserveAspectRatio="none" aria-hidden="true">
          <path d="M0 50C80 10 150 90 240 55S350 20 390 40V140H0Z" fill="#f6d4f0" opacity="0.6" />
          <path d="M0 85C90 55 170 125 270 90S360 70 390 80V140H0Z" fill="#dcc0f5" opacity="0.75" />
        </svg>

        <div class="match-inner">
          <div class="match-top">
            <BrandLogo size="2.4rem" />
            <button type="button" class="close-btn" aria-label="Close" @click="dismiss"><i class="ri-close-line" aria-hidden="true"></i></button>
          </div>

          <!-- The two of you over a soft heart, joined by a heart -->
          <div class="pair">
            <i class="ri-heart-3-fill big-heart" aria-hidden="true"></i>
            <div class="hearts" aria-hidden="true">
              <i v-for="n in 6" :key="n" class="ri-heart-3-fill" :class="`h${n}`"></i>
            </div>
            <span class="sparks" aria-hidden="true"><span></span><span></span><span></span></span>
            <span class="pair-photo"><UAvatar :src="me?.avatarUrl" :name="me?.displayName || 'You'" size="2xl" /></span>
            <span class="pair-photo"><UAvatar :src="person.avatarUrl" :name="person.displayName" size="2xl" /></span>
            <span class="pair-heart" aria-hidden="true"><i class="ri-heart-3-fill"></i></span>
          </div>

          <h1 id="match-title" class="match-title">It’s a Match!</h1>
          <p class="match-sub">You and {{ person.displayName }} liked each other <i class="ri-heart-3-fill" aria-hidden="true"></i></p>

          <ul class="ideas">
            <li>
              <span class="idea-icon" aria-hidden="true"><i class="ri-chat-3-fill"></i></span>
              <strong>Start a Conversation</strong>
              <span>Break the ice with a message</span>
            </li>
            <li>
              <span class="idea-icon" aria-hidden="true"><i class="ri-sparkling-2-fill"></i></span>
              <strong>Find Common Interests</strong>
              <span>{{ sharedLine }}</span>
            </li>
            <li>
              <span class="idea-icon" aria-hidden="true"><i class="ri-heart-3-fill"></i></span>
              <strong>Get to Know Each Other</strong>
              <span>See where the conversation goes</span>
            </li>
          </ul>

          <button ref="sendButton" type="button" class="send-btn" @click="openChat">
            <i class="ri-send-plane-line" aria-hidden="true"></i> Send a Message
          </button>
          <button type="button" class="swipe-btn" @click="dismiss">Keep Swiping</button>

          <section v-if="more.length" class="more" aria-labelledby="more-title">
            <div class="more-head">
              <h2 id="more-title">More People You Might Like</h2>
              <button type="button" class="see-all" @click="go('/discover')">See All <i class="ri-arrow-right-line" aria-hidden="true"></i></button>
            </div>
            <div class="more-row">
              <article v-for="p in more" :key="p.id" class="more-card">
                <button type="button" class="more-open" :aria-label="`${p.displayName}, ${p.age}`" @click="go(`/people/${p.id}`)">
                  <span class="more-photo" :style="photoBackground(p.avatarUrl)"></span>
                  <span class="more-body">
                    <strong>{{ p.displayName }}, {{ p.age }}<i v-if="p.isVerified" class="ri-verified-badge-fill verified-badge" aria-label="Verified"></i></strong>
                    <span v-if="p.distanceKm !== null"><i class="ri-map-pin-line" aria-hidden="true"></i>{{ p.distanceKm }} km away</span>
                  </span>
                </button>
                <button type="button" class="more-like" :aria-label="`Like ${p.displayName}`" @click="discoverStore.like(p)">
                  <i class="ri-heart-3-fill" aria-hidden="true"></i>
                </button>
              </article>
            </div>
          </section>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import UAvatar from '../ui/UAvatar.vue';
import BrandLogo from '../layout/BrandLogo.vue';
import { ActiveMatch, useDiscoverStore } from '../../stores/discover';
import { useAuthStore } from '../../stores/auth';
import { photoBackground } from '../../services/media';

const props = defineProps<{ match: ActiveMatch | null }>();
const emit = defineEmits<{ (e: 'dismiss'): void }>();

const router = useRouter();
const authStore = useAuthStore();
const discoverStore = useDiscoverStore();
const sendButton = ref<HTMLButtonElement | null>(null);

const me = computed(() => authStore.profile);
// Only read while `match` is set (the template is behind v-if).
const person = computed(() => props.match!.person);

/** "You both love Travel & Food", from the interests you share. */
const sharedLine = computed(() => {
  const shared = person.value.commonInterests.map((n) => n.split(/\s*[&/]\s*/)[0]);
  if (!shared.length) return 'Discover what you have in common';
  return `You both love ${shared.length === 1 ? shared[0] : `${shared[0]} & ${shared[1]}`}`;
});

/** Three more people from Discover, ones you haven't liked or passed yet. */
const more = computed(() => discoverStore.feed.filter((p) => p.id !== person.value.id).slice(0, 3));

// Focus moves into the dialog (for keyboards and screen readers) without a visible ring on open.
watch(
  () => props.match,
  async (value) => {
    if (!value) return;
    await nextTick();
    sendButton.value?.focus({ focusVisible: false } as Parameters<HTMLElement['focus']>[0]);
  }
);

function dismiss() {
  emit('dismiss');
}

function go(path: string) {
  dismiss();
  router.push(path);
}

function openChat() {
  if (props.match) go(`/chat/${props.match.conversationId}`);
}
</script>

<style scoped lang="scss">
$ink: var(--unmute-text-heading);
$soft: var(--unmute-text-secondary);
$pink: var(--unmute-cta);

.match-screen {
  position: fixed;
  inset: 0;
  z-index: 1060;
  overflow-y: auto;
  background: linear-gradient(180deg, #fdf5fb 0%, #fbf3fd 60%, #f7eefc 100%);
}

.orb {
  position: fixed;
  border-radius: 50%;
  background: rgba(233, 216, 250, 0.4);
  pointer-events: none;
}

.orb-1 { top: -8rem; left: -8rem; width: 20rem; height: 20rem; }
.orb-2 { top: 40%; right: -7rem; width: 12rem; height: 12rem; }

.waves {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  width: 100%;
  height: 8rem;
  opacity: 0.6;
  pointer-events: none;
}

.match-inner {
  position: relative;
  max-width: 28rem;
  margin: 0 auto;
  padding: calc(1rem + env(safe-area-inset-top, 0px)) 1rem calc(1.5rem + env(safe-area-inset-bottom, 0px));
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}

.match-top {
  position: relative;
  display: flex;
  justify-content: center;
  width: 100%;
  margin-bottom: 1.2rem;
}

.close-btn {
  position: absolute;
  right: 0;
  top: 50%;
  display: grid;
  place-items: center;
  width: 2.8rem;
  height: 2.8rem;
  border: 0;
  border-radius: 50%;
  background: #fff;
  color: $ink;
  font-size: 1.5rem;
  transform: translateY(-50%);
  box-shadow: 0 6px 18px -8px rgba(117, 48, 170, 0.35);
}

// ---- Photos ----
.pair {
  position: relative;
  display: flex;
  justify-content: center;
  gap: 0.2rem;
  width: 100%;
  padding: 2rem 0 0.5rem;
  --photo: clamp(8.5rem, 40vw, 10rem);
}

.big-heart {
  position: absolute;
  top: -0.6rem;
  left: 50%;
  transform: translateX(-50%);
  color: #fbdcef;
  font-size: 10rem;
  line-height: 1;
}

.pair-photo {
  position: relative;
  display: block;
  padding: 4px;
  border-radius: 50%;
  background: linear-gradient(135deg, #ff7a6e, #f21872 50%, #c00078);

  :deep(.u-avatar) {
    width: var(--photo);
    height: var(--photo);
    border: 4px solid #fff;
  }
}

.pair-heart {
  position: absolute;
  left: 50%;
  top: calc(2rem + var(--photo) / 2 + 4px);
  z-index: 2;
  display: grid;
  place-items: center;
  width: 3.8rem;
  height: 3.8rem;
  border: 4px solid #fff;
  border-radius: 50%;
  background: linear-gradient(135deg, #ff4f8e 0%, #f21872 55%, #d00a8a 100%);
  color: #fff;
  font-size: 1.7rem;
  transform: translate(-50%, -50%);
  box-shadow: 0 10px 24px -8px rgba(242, 24, 114, 0.6);
  animation: beat 1.6s ease-in-out infinite;
}

@keyframes beat {
  0%, 100% { transform: translate(-50%, -50%) scale(1); }
  15% { transform: translate(-50%, -50%) scale(1.1); }
  30% { transform: translate(-50%, -50%) scale(1); }
}

.sparks {
  position: absolute;
  left: 50%;
  top: calc(2rem + var(--photo) / 2 - 3.6rem);
  width: 3rem;
  height: 1.4rem;
  transform: translateX(-50%);

  span {
    position: absolute;
    bottom: 0;
    left: 50%;
    width: 3px;
    height: 0.9rem;
    border-radius: 3px;
    background: $pink;
    transform-origin: 50% 2rem;

    &:nth-child(1) { transform: translateX(-50%) rotate(-35deg); }
    &:nth-child(2) { transform: translateX(-50%); height: 1.1rem; }
    &:nth-child(3) { transform: translateX(-50%) rotate(35deg); }
  }
}

.hearts {
  position: absolute;
  inset: 0 -0.5rem;
  pointer-events: none;

  i {
    position: absolute;
    color: #f7609f;
    filter: drop-shadow(0 6px 10px rgba(242, 24, 114, 0.2));
    animation: float 6s ease-in-out infinite;
  }

  .h1 { top: 0; left: 12%; font-size: 2.2rem; }
  .h2 { top: -0.4rem; right: 16%; font-size: 1.8rem; animation-delay: -2s; }
  .h3 { top: 4rem; left: -0.2rem; font-size: 1.8rem; animation-delay: -3s; }
  .h4 { top: 4rem; right: -0.2rem; font-size: 1.8rem; color: #f9cde4; animation-delay: -1s; }
  .h5 { bottom: 0; left: 0; font-size: 2rem; color: #f9d6ea; animation-delay: -4s; }
  .h6 { bottom: 0.5rem; right: 0; font-size: 1.8rem; color: #f9d6ea; animation-delay: -2.5s; }
}

@keyframes float {
  0%, 100% { transform: translateY(0) rotate(-6deg); }
  50% { transform: translateY(-8px) rotate(6deg); }
}

// ---- Text ----
.match-title {
  margin: 1rem 0 0.2rem;
  font-family: var(--unmute-font-display);
  font-size: clamp(2.3rem, 10.5vw, 2.8rem);
  font-weight: 800;
  letter-spacing: -0.03em;
  color: $ink;
}

.match-sub {
  margin-bottom: 1.1rem;
  font-size: 1.05rem;
  color: $soft;

  i { color: $pink; }
}

.ideas {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  width: 100%;
  margin: 0 0 1rem;
  padding: 0.9rem 0.3rem;
  border-radius: 1.3rem;
  background: var(--unmute-surface);
  box-shadow: 0 10px 26px -20px rgba(117, 48, 170, 0.5);
  list-style: none;

  li {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
    padding: 0 0.35rem;
    color: $soft;
    font-size: 0.7rem;
    line-height: 1.3;

    & + li { border-left: 1px solid #efe6f6; }
  }

  strong {
    color: $ink;
    font-size: 0.74rem;
    line-height: 1.25;
  }
}

.idea-icon {
  display: grid;
  place-items: center;
  width: 2.5rem;
  height: 2.5rem;
  margin-bottom: 0.3rem;
  border-radius: 50%;
  background: #fbe4f2;
  color: $pink;
  font-size: 1.2rem;
}

.send-btn,
.swipe-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.6rem;
  width: 88%;
  min-height: 3.3rem;
  border-radius: var(--unmute-radius-pill);
  font-size: 1.1rem;
}

.send-btn {
  border: 0;
  background: linear-gradient(100deg, #ff7a6e 0%, #f21872 35%, #c00078 65%, #4a005b 100%);
  color: #fff;
  box-shadow: 0 16px 30px -14px rgba(192, 0, 120, 0.65);

  i { font-size: 1.3rem; }
}

.swipe-btn {
  margin-top: 0.6rem;
  border: 1.5px solid rgba(242, 24, 114, 0.45);
  background: #fdf0f7;
  color: $pink;
  font-weight: 600;
}

// ---- More people ----
.more {
  position: relative;
  z-index: 1;
  width: 100%;
  margin-top: 1.2rem;
  padding: 0.9rem 0.8rem;
  border-radius: 1.3rem;
  background: var(--unmute-surface);
  box-shadow: 0 10px 26px -20px rgba(117, 48, 170, 0.5);
  text-align: left;
}

.more-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.7rem;

  h2 {
    margin: 0;
    font-size: 1rem;
    font-weight: 800;
    color: $ink;
  }
}

.see-all {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
  border: 0;
  background: transparent;
  color: $soft;
  font-size: 0.88rem;
}

.more-row {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.5rem;
}

.more-card {
  position: relative;
  overflow: hidden;
  border-radius: 1rem;
  background: #fbf5fc;
}

.more-open {
  display: block;
  width: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  text-align: left;
}

.more-photo {
  display: block;
  aspect-ratio: 1.2;
  background: linear-gradient(150deg, #ff9aa8 0%, #c00078 60%, #4a005b 100%) center 25% / cover;
}

.more-body {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  padding: 0.4rem 1.9rem 0.5rem 0.5rem;
  min-width: 0;

  strong {
    overflow: hidden;
    color: $ink;
    font-size: 0.82rem;
    white-space: nowrap;
    text-overflow: ellipsis;

    .verified-badge { margin-left: 0.15rem; }
  }

  span {
    display: flex;
    align-items: center;
    gap: 0.15rem;
    color: $soft;
    font-size: 0.68rem;
  }
}

.more-like {
  position: absolute;
  right: 0.35rem;
  bottom: 0.45rem;
  display: grid;
  place-items: center;
  width: 1.8rem;
  height: 1.8rem;
  border: 0;
  border-radius: 50%;
  background: #fff;
  color: $pink;
  font-size: 1rem;
  box-shadow: 0 3px 8px rgba(0, 0, 0, 0.12);
}

// Dark mode: keep the layout, swap the pale backdrop for the app's dark one.
:global([data-theme='dark']) .match-screen {
  background: var(--unmute-app-bg);
}

:global([data-theme='dark']) .match-screen .big-heart {
  color: rgba(242, 24, 114, 0.15);
}

.match-fade-enter-active,
.match-fade-leave-active {
  transition: opacity 250ms ease;
}

.match-fade-enter-from,
.match-fade-leave-to {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .pair-heart,
  .hearts i {
    animation: none;
  }
}
</style>
