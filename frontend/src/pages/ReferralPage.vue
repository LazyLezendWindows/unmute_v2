<template>
  <SectionShell>
    <template #aside>
      <SettingsMenu />
    </template>

    <PageHeader title="Refer & earn" back="/settings" subtitle="Invite friends to Unmute. You both get 2 weeks free." />

    <div class="referral-page">
      <!-- The offer and your code -->
      <section class="hero" aria-labelledby="ref-hero-title">
        <span class="hero-gift" aria-hidden="true"><i class="ri-gift-2-fill"></i></span>
        <h2 id="ref-hero-title">Give 2 weeks, get 2 weeks</h2>
        <p>When a friend joins with your code and verifies their mobile number, you both get {{ info?.rewardDays ?? 14 }} days of free access.</p>

        <div class="code-box">
          <span class="code-label">Your referral code</span>
          <strong class="code" aria-live="polite">{{ info?.code ?? '…' }}</strong>
          <button type="button" class="copy-btn" :disabled="!info" @click="copy(info!.code, 'Code copied.')">
            <i class="ri-file-copy-line" aria-hidden="true"></i> Copy
          </button>
        </div>

        <div class="share-row">
          <button v-if="canShare" type="button" class="share-btn is-main" :disabled="!info" @click="share">
            <i class="ri-share-forward-fill" aria-hidden="true"></i> Share invite
          </button>
          <a v-if="info" :href="whatsappLink" target="_blank" rel="noopener" class="share-btn is-whatsapp">
            <i class="ri-whatsapp-fill" aria-hidden="true"></i> WhatsApp
          </a>
          <button type="button" class="share-btn" :disabled="!info" @click="copy(inviteLink, 'Invite link copied.')">
            <i class="ri-link" aria-hidden="true"></i> Copy link
          </button>
        </div>
      </section>

      <p v-if="error" class="small text-danger mb-0" role="alert">{{ error }}</p>

      <!-- What you've earned -->
      <section v-if="info" class="r-card stats" aria-label="Your referrals">
        <div class="stat">
          <strong>{{ info.friendsJoined }}</strong>
          <span>{{ info.friendsJoined === 1 ? 'friend joined' : 'friends joined' }}</span>
        </div>
        <div class="stat">
          <strong>{{ weeksEarned }}</strong>
          <span>{{ weeksEarned === 1 ? 'week earned' : 'weeks earned' }}</span>
        </div>
        <div class="stat">
          <strong>{{ Math.max(0, info.maxRewarded - info.friendsRewarded) }}</strong>
          <span>rewards left</span>
        </div>
        <p v-if="info.friendsJoined > info.friendsRewarded" class="stats-note">
          {{ info.friendsJoined - info.friendsRewarded }} waiting: they need to verify their mobile number.
        </p>
      </section>

      <!-- How it works -->
      <section class="r-card" aria-labelledby="ref-how">
        <h2 id="ref-how" class="r-title">How it works</h2>
        <ol class="steps">
          <li><span>1</span>Share your code or invite link with a friend.</li>
          <li><span>2</span>They sign up and enter your code (the invite link fills it in).</li>
          <li><span>3</span>Once they verify their mobile number, you both get 2 weeks of free access, added after any time you already have.</li>
        </ol>
        <p class="r-hint">You can earn from up to {{ info?.maxRewarded ?? 10 }} friends.</p>
      </section>

      <!-- Were you invited? -->
      <section v-if="info?.referredBy" class="r-card invited" aria-label="Who invited you">
        <i class="ri-user-heart-line" aria-hidden="true"></i>
        <span>
          You joined with <strong>{{ info.referredBy.name || 'a friend' }}</strong>'s code.
          {{ info.referredBy.rewarded ? 'Your 2 free weeks have been added.' : 'Verify your mobile number to get your 2 free weeks.' }}
        </span>
        <router-link v-if="!info.referredBy.rewarded" to="/settings/account" class="r-link">Verify</router-link>
      </section>
      <section v-else-if="info?.canEnterCode" class="r-card" aria-labelledby="ref-enter">
        <h2 id="ref-enter" class="r-title">Were you invited?</h2>
        <p class="r-hint">Enter your friend's code in your first week. You both get 2 weeks free.</p>
        <form class="enter-row" @submit.prevent="applyCode">
          <UInput v-model="friendCode" placeholder="Friend's code" icon="ri-gift-line" :maxlength="30" autocomplete="off" aria-label="Friend's referral code" />
          <UButton type="submit" variant="primary" size="md" :loading="applying" :disabled="!friendCode.trim()">Apply</UButton>
        </form>
      </section>
    </div>
  </SectionShell>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import SectionShell from '../components/layout/SectionShell.vue';
import PageHeader from '../components/layout/PageHeader.vue';
import SettingsMenu from '../components/settings/SettingsMenu.vue';
import UInput from '../components/ui/UInput.vue';
import UButton from '../components/ui/UButton.vue';
import { api } from '../services/api';
import { useToastStore } from '../stores/toast';
import { useSubscriptionStore } from '../stores/subscription';

interface ReferralInfo {
  code: string;
  rewardDays: number;
  maxRewarded: number;
  friendsJoined: number;
  friendsRewarded: number;
  daysEarned: number;
  referredBy: { code: string | null; name: string | null; rewarded: boolean } | null;
  canEnterCode: boolean;
}

const toast = useToastStore();
const info = ref<ReferralInfo | null>(null);
const error = ref<string | null>(null);
const friendCode = ref('');
const applying = ref(false);
const canShare = typeof navigator !== 'undefined' && 'share' in navigator;

const weeksEarned = computed(() => Math.round((info.value?.daysEarned ?? 0) / 7));
const inviteLink = computed(() => `${window.location.origin}/welcome?ref=${encodeURIComponent(info.value?.code ?? '')}`);
const inviteText = computed(
  () => `Join me on Unmute, a dating app for real conversations. Sign up with my code ${info.value?.code} and we both get 2 weeks free: ${inviteLink.value}`
);
const whatsappLink = computed(() => `https://wa.me/?text=${encodeURIComponent(inviteText.value)}`);

async function load() {
  try {
    info.value = (await api.get('/users/me/referral')).data.data;
  } catch (err: any) {
    error.value = err.message || 'Couldn’t load your referral code.';
  }
}

async function copy(text: string, done: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(done);
  } catch {
    toast.error('Couldn’t copy. Select and copy it yourself.');
  }
}

async function share() {
  try {
    await navigator.share({ title: 'Join me on Unmute', text: inviteText.value, url: inviteLink.value });
  } catch {
    // Closed the share sheet.
  }
}

async function applyCode() {
  applying.value = true;
  try {
    info.value = (await api.post('/users/me/referral', { code: friendCode.value.trim() })).data.data;
    friendCode.value = '';
    toast.success(info.value?.referredBy?.rewarded ? 'Code applied. 2 free weeks added!' : 'Code applied. Verify your mobile number to get your 2 free weeks.');
    void useSubscriptionStore().fetchStatus?.();
  } catch (err: any) {
    toast.error(err.message || 'That code didn’t work.');
  } finally {
    applying.value = false;
  }
}

onMounted(load);
</script>

<style scoped lang="scss">
.referral-page {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  max-width: 40rem;
}

.hero {
  position: relative;
  padding: 1.4rem 1.25rem 1.25rem;
  border-radius: var(--unmute-radius-xl);
  background: linear-gradient(135deg, #ff7a6e 0%, #f21872 40%, #c00078 72%, #4a005b 100%);
  color: #fff;
  box-shadow: 0 22px 44px -22px rgba(192, 0, 120, 0.75);
  overflow: hidden;

  h2 { margin: 0.6rem 0 0.35rem; font-size: 1.5rem; font-weight: 800; }
  p { margin: 0 0 1rem; font-size: 0.92rem; line-height: 1.45; opacity: 0.95; }
}

.hero-gift {
  display: grid;
  place-items: center;
  width: 3rem;
  height: 3rem;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.2);
  font-size: 1.6rem;
}

.code-box {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.25rem 0.75rem;
  padding: 0.75rem 0.9rem;
  border: 1.5px dashed rgba(255, 255, 255, 0.7);
  border-radius: 1rem;
  background: rgba(255, 255, 255, 0.12);
}

.code-label { width: 100%; font-size: 0.75rem; opacity: 0.85; }
.code { flex: 1; min-width: 0; font-size: 1.45rem; letter-spacing: 0.04em; overflow-wrap: anywhere; }

.copy-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.4rem 0.9rem;
  border: 0;
  border-radius: 9999px;
  background: #fff;
  color: #c00078;
  font-size: 0.85rem;
  font-weight: 700;
}

.share-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 0.85rem;
}

.share-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.55rem 1rem;
  border: 1px solid rgba(255, 255, 255, 0.6);
  border-radius: 9999px;
  background: transparent;
  color: #fff;
  font-size: 0.88rem;
  font-weight: 700;
  text-decoration: none;

  i { font-size: 1.1rem; }
  &.is-main { background: #fff; border-color: #fff; color: #c00078; }
  &.is-whatsapp { background: #25d366; border-color: #25d366; }
}

.r-card {
  padding: 1.1rem 1.15rem;
  border-radius: var(--unmute-radius-lg);
  background: var(--unmute-surface);
  border: 1px solid var(--unmute-glass-border);
  box-shadow: var(--unmute-shadow-sm);
}

.r-title { margin: 0 0 0.6rem; font-size: 1.05rem; font-weight: 800; color: var(--unmute-text-heading); }
.r-hint { margin: 0.5rem 0 0; font-size: 0.85rem; color: var(--unmute-text-muted); }
.r-link { flex-shrink: 0; font-weight: 700; color: var(--unmute-cta); }

.stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.5rem;
  text-align: center;
}

.stat {
  display: flex;
  flex-direction: column;

  strong { font-size: 1.6rem; font-weight: 800; color: var(--unmute-cta); }
  span { font-size: 0.78rem; color: var(--unmute-text-muted); }
}

.stats-note { grid-column: 1 / -1; margin: 0.25rem 0 0; font-size: 0.82rem; color: var(--unmute-text-muted); }

.steps {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  margin: 0;
  padding: 0;
  list-style: none;

  li { display: flex; align-items: flex-start; gap: 0.65rem; color: var(--unmute-text-secondary); font-size: 0.92rem; }

  span {
    flex-shrink: 0;
    display: grid;
    place-items: center;
    width: 1.6rem;
    height: 1.6rem;
    border-radius: 50%;
    background: var(--unmute-primary-surface);
    color: var(--unmute-cta);
    font-size: 0.82rem;
    font-weight: 800;
  }
}

.invited {
  display: flex;
  align-items: center;
  gap: 0.7rem;
  font-size: 0.9rem;
  color: var(--unmute-text-secondary);

  > i { font-size: 1.5rem; color: var(--unmute-cta); }
  span { flex: 1; }
}

.enter-row {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.75rem;

  > :first-child { flex: 1; min-width: 0; }
}
</style>
