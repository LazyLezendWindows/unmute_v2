<template>
  <div class="user-page">
    <router-link to="/admin/users" class="back-link">
      <i class="ri-arrow-left-s-line" aria-hidden="true"></i> All users
    </router-link>

    <p v-if="error" class="error-banner" role="alert"><i class="ri-error-warning-fill"></i> {{ error }}</p>

    <template v-if="u">
      <!-- Header card -->
      <header class="head-card">
        <UAvatar :src="p?.avatarUrl" :name="p?.displayName || u.email || 'User'" size="xl" />
        <div class="head-info">
          <h1>
            {{ p?.displayName || '(no profile yet)' }}<template v-if="p?.age">, {{ p.age }}</template>
            <i v-if="p?.isVerified" class="ri-verified-badge-fill verified-badge" aria-label="Verified"></i>
          </h1>
          <div class="head-badges">
            <span class="badge" :class="u.isActive ? 'is-ok' : 'is-off'">{{ u.isActive ? 'Active' : 'Disabled' }}</span>
            <span class="badge" :class="p?.isVerified ? 'is-blue' : 'is-grey'">{{ p?.isVerified ? 'Verified' : 'Not verified' }}</span>
            <PremiumBadge v-if="u.subscription.state === 'paid'" :plan="u.subscription.plan" label />
            <span v-else class="badge is-grey">{{ u.subscription.state === 'trial' ? 'Free trial' : 'No plan' }}</span>
          </div>
          <p v-if="!u.isActive" class="disabled-note">
            <i class="ri-error-warning-fill"></i>
            Disabled {{ when(u.disabledAt) }}<template v-if="u.disabledReason">: "{{ u.disabledReason }}"</template>
          </p>
        </div>
        <div class="head-actions">
          <button v-if="p" type="button" class="action-btn" :class="p.isVerified ? 'is-plain' : 'is-verify'" :disabled="busy" @click="setVerified(!p.isVerified)">
            <i :class="p.isVerified ? 'ri-close-circle-line' : 'ri-verified-badge-fill'" aria-hidden="true"></i>
            {{ p.isVerified ? 'Remove verification' : 'Verify user' }}
          </button>
          <button v-if="u.isActive" type="button" class="action-btn is-danger" :disabled="busy" @click="disableOpen = true">
            <i class="ri-user-forbid-line" aria-hidden="true"></i> Disable
          </button>
          <button v-else type="button" class="action-btn is-enable" :disabled="busy" @click="setActive(true)">
            <i class="ri-user-follow-line" aria-hidden="true"></i> Enable
          </button>
        </div>
      </header>

      <div class="detail-grid">
        <!-- Account -->
        <section class="detail-card">
          <h2><i class="ri-user-3-line" aria-hidden="true"></i> Account</h2>
          <dl>
            <dt>User ID</dt><dd class="mono">{{ u.id }}</dd>
            <dt>Email</dt>
            <dd>{{ u.email || '—' }} <span v-if="u.email" class="badge" :class="u.emailVerified ? 'is-ok' : 'is-grey'">{{ u.emailVerified ? 'verified' : 'unverified' }}</span></dd>
            <dt>Phone</dt><dd>{{ u.phone || '—' }} <span v-if="u.phone" class="badge is-ok">verified</span></dd>
            <dt>Sign-in</dt><dd>{{ u.signInMethods.join(', ') || '—' }}</dd>
            <dt>Joined</dt><dd>{{ when(u.joinedAt) }}</dd>
            <dt>Last active</dt><dd>{{ u.lastActiveAt ? when(u.lastActiveAt) : '—' }}</dd>
          </dl>
        </section>

        <!-- Plan -->
        <section class="detail-card">
          <h2><i class="ri-vip-crown-2-line" aria-hidden="true"></i> Plan</h2>
          <dl>
            <dt>Status</dt><dd>{{ planStatus }}</dd>
            <dt>Access until</dt><dd>{{ u.subscription.expiresAt ? when(u.subscription.expiresAt) : '—' }}</dd>
            <dt>Trial ends</dt><dd>{{ u.subscription.trialEndsAt ? when(u.subscription.trialEndsAt) : '—' }}</dd>
            <dt v-if="u.subscription.planStartsAt">Plan starts</dt>
            <dd v-if="u.subscription.planStartsAt">{{ when(u.subscription.planStartsAt) }}</dd>
          </dl>
        </section>

        <!-- Activity -->
        <section class="detail-card">
          <h2><i class="ri-bar-chart-2-line" aria-hidden="true"></i> Activity</h2>
          <div class="counts-grid">
            <div class="count-item"><strong>{{ u.counts.matches }}</strong><span>Matches</span></div>
            <div class="count-item"><strong>{{ u.counts.likesReceived }}</strong><span>Likes received</span></div>
            <div class="count-item"><strong>{{ u.counts.likesSent }}</strong><span>Likes sent</span></div>
            <div class="count-item"><strong>{{ u.counts.messagesSent }}</strong><span>Messages sent</span></div>
            <div class="count-item"><strong>{{ u.counts.blockedBy }}</strong><span>Blocked by</span></div>
            <div class="count-item" :class="{ 'is-warn': u.reports.length }"><strong>{{ u.reports.length }}</strong><span>Reports</span></div>
          </div>
        </section>

        <!-- Profile -->
        <section v-if="p" class="detail-card wide">
          <h2><i class="ri-profile-line" aria-hidden="true"></i> Profile</h2>
          <div v-if="photos.length" class="photos-row">
            <a v-for="(url, i) in photos" :key="url + i" :href="mediaUrl(url)" target="_blank" rel="noopener" class="photo-thumb">
              <img :src="mediaUrl(url)" :alt="`Photo ${i + 1}`" />
            </a>
          </div>
          <dl>
            <dt>Bio</dt><dd class="pre">{{ p.bio || '—' }}</dd>
            <dt>Date of birth</dt><dd>{{ p.dateOfBirth || '—' }} ({{ p.age }})</dd>
            <dt>Gender</dt><dd>{{ p.gender || '—' }}</dd>
            <dt>Area</dt><dd>{{ p.location?.label || p.approximateLocation || '—' }}<template v-if="p.location"> · {{ p.location.source }}</template></dd>
            <dt>Profession</dt><dd>{{ p.profession || '—' }}<template v-if="p.professionField"> ({{ p.professionField }})</template></dd>
            <dt>Education</dt><dd>{{ p.education ? `${p.education.institutionName}${p.education.course ? ' · ' + p.education.course : ''}` : '—' }}</dd>
            <dt>Height</dt><dd>{{ p.heightCm ? `${p.heightCm} cm` : '—' }}</dd>
            <dt>Lifestyle</dt><dd>Drinks: {{ p.lifestyle?.drinking || '—' }} · Smokes: {{ p.lifestyle?.smoking || '—' }} · Workout: {{ p.lifestyle?.workout || '—' }}</dd>
            <dt>Looking for</dt><dd>{{ p.interactionPreferences?.join(', ') || '—' }}</dd>
            <dt>Interests</dt><dd>{{ p.interests?.map((i: any) => i.name).join(', ') || '—' }}</dd>
          </dl>
        </section>

        <!-- Verification -->
        <section class="detail-card">
          <h2><i class="ri-shield-check-line" aria-hidden="true"></i> Verification</h2>
          <dl>
            <dt>Selfie</dt>
            <dd>
              <span class="badge" :class="u.verification.selfie.status === 'approved' ? 'is-ok' : u.verification.selfie.status === 'pending' ? 'is-warn' : 'is-grey'">
                {{ u.verification.selfie.status }}
              </span>
              <template v-if="u.verification.selfie.reason"> — {{ u.verification.selfie.reason }}</template>
            </dd>
            <dt>Government ID</dt>
            <dd>
              <span class="badge" :class="u.verification.id.status === 'approved' ? 'is-ok' : u.verification.id.status === 'pending' ? 'is-warn' : 'is-grey'">
                {{ u.verification.id.status }}
              </span>
              <template v-if="u.verification.id.reason"> — {{ u.verification.id.reason }}</template>
            </dd>
          </dl>
          <router-link v-if="u.verification.selfie.status === 'pending' || u.verification.id.status === 'pending'" to="/admin/verifications" class="review-link">
            Review in Verifications <i class="ri-arrow-right-line" aria-hidden="true"></i>
          </router-link>
        </section>

        <!-- Reports -->
        <section class="detail-card wide">
          <h2><i class="ri-flag-line" aria-hidden="true"></i> Reports against this member</h2>
          <p v-if="!u.reports.length" class="muted-text">No reports.</p>
          <ul v-else class="reports-list">
            <li v-for="r in u.reports" :key="r.id" class="report-item">
              <div class="report-body">
                <strong>{{ r.category }}</strong>
                <span class="muted-text"> by <router-link :to="`/admin/users/${r.reporter.id}`">{{ r.reporter.name || 'member' }}</router-link> · {{ when(r.createdAt) }}</span>
                <p v-if="r.details" class="pre report-detail">{{ r.details }}</p>
              </div>
              <span v-if="r.status !== 'pending'" class="badge is-ok">{{ r.status }}</span>
              <button v-else type="button" class="resolve-btn" @click="resolve(r.id)">Mark resolved</button>
            </li>
          </ul>
        </section>

        <!-- Admin history -->
        <section class="detail-card wide">
          <h2><i class="ri-history-line" aria-hidden="true"></i> Admin history</h2>
          <p v-if="!u.adminHistory.length" class="muted-text">No admin actions yet.</p>
          <ul v-else class="history-list">
            <li v-for="(h, i) in u.adminHistory" :key="i">
              <strong>{{ h.action.replace('_', ' ') }}</strong>
              <template v-if="h.detail"> — {{ h.detail }}</template>
              <span class="muted-text"> by {{ h.admin || 'admin' }} · {{ when(h.at) }}</span>
            </li>
          </ul>
        </section>
      </div>
    </template>

    <UModal :is-open="disableOpen" title="Disable this user?" max-width="sm" @close="disableOpen = false">
      <div class="d-flex flex-column gap-3">
        <p class="small mb-0" style="color: var(--unmute-text-secondary)">They'll be signed out everywhere and can't sign in until you re-enable them.</p>
        <UInput v-model="reason" placeholder="Reason (for the admin record)" :maxlength="200" />
      </div>
      <template #footer>
        <UButton variant="secondary" size="md" @click="disableOpen = false">Cancel</UButton>
        <UButton variant="danger" size="md" :loading="busy" @click="setActive(false)">Disable user</UButton>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import UAvatar from '../../components/ui/UAvatar.vue';
import UModal from '../../components/ui/UModal.vue';
import UInput from '../../components/ui/UInput.vue';
import UButton from '../../components/ui/UButton.vue';
import PremiumBadge from '../../components/premium/PremiumBadge.vue';
import { adminApi } from '../../services/adminApi';
import { mediaUrl } from '../../services/media';
import { planTier } from '../../utils/plans';
import { useToastStore } from '../../stores/toast';

const route = useRoute();
const u = ref<any | null>(null);
const error = ref<string | null>(null);
const busy = ref(false);
const disableOpen = ref(false);
const reason = ref('');

const p = computed(() => u.value?.profile ?? null);
const photos = computed<string[]>(() => (p.value ? [p.value.avatarUrl, ...(p.value.photos || [])].filter(Boolean) : []));
const planStatus = computed(() => {
  const s = u.value?.subscription;
  if (!s) return '—';
  if (s.state === 'paid') return `Paid · ${planTier(s.plan).name} (${planTier(s.plan).length})`;
  if (s.state === 'trial') return s.planStartsAt ? `Free trial, then ${planTier(s.plan).name}` : 'Free trial';
  return 'Expired';
});

async function load() {
  error.value = null;
  try { u.value = (await adminApi.get(`/users/${route.params.id}`)).data.data; }
  catch (err: any) { error.value = err.message; }
}

async function setActive(active: boolean) {
  busy.value = true;
  try {
    u.value = (await adminApi.post(`/users/${u.value.id}/status`, { active, ...(active ? {} : { reason: reason.value.trim() || undefined }) })).data.data;
    disableOpen.value = false; reason.value = '';
    useToastStore().success(active ? 'User enabled.' : 'User disabled and signed out.');
  } catch (err: any) { useToastStore().error(err.message); }
  finally { busy.value = false; }
}

async function setVerified(verified: boolean) {
  busy.value = true;
  try {
    u.value = (await adminApi.post(`/users/${u.value.id}/verified`, { verified })).data.data;
    useToastStore().success(verified ? 'User verified.' : 'Verification removed.');
  } catch (err: any) { useToastStore().error(err.message); }
  finally { busy.value = false; }
}

async function resolve(reportId: string) {
  try { await adminApi.post(`/reports/${reportId}/resolve`); await load(); }
  catch (err: any) { useToastStore().error(err.message); }
}

function when(value: string | null) {
  if (!value) return '';
  const d = new Date(value.includes('T') ? value : `${value.replace(' ', 'T')}Z`);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

onMounted(load);
watch(() => route.params.id, (id) => id && load());
</script>

<style scoped lang="scss">
.back-link {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
  margin-bottom: 1.25rem;
  color: #5b5470;
  font-weight: 600;
  font-size: 0.9rem;
  text-decoration: none;
  transition: color 0.12s;

  &:hover { color: #1d1633; }
}

.error-banner {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 1rem;
  padding: 0.75rem 1rem;
  border-radius: 0.75rem;
  background: #fde7e9;
  color: #c62839;
  font-size: 0.9rem;
}

/* ---- Header card ---- */
.head-card {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 1.25rem;
  margin-bottom: 1.25rem;
  padding: 1.5rem;
  border: 1px solid #ece7f5;
  border-radius: 1.25rem;
  background: #fff;
}

.head-info {
  flex: 1 1 16rem;
  min-width: 0;

  h1 { margin: 0 0 0.5rem; font-size: 1.55rem; font-weight: 800; color: #1d1633; }
}

.verified-badge { margin-left: 0.3rem; color: #1d8cf8; font-size: 0.8em; }

.head-badges { display: flex; flex-wrap: wrap; gap: 0.4rem; align-items: center; }

.disabled-note {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  margin: 0.6rem 0 0;
  color: #c62839;
  font-size: 0.85rem;
}

.head-actions { display: flex; flex-wrap: wrap; gap: 0.5rem; }

.action-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.6rem 1.1rem;
  border: 0;
  border-radius: 0.75rem;
  font-weight: 700;
  font-size: 0.88rem;
  transition: opacity 0.12s;

  &:disabled { opacity: 0.55; }
  &.is-verify { background: #1d8cf8; color: #fff; }
  &.is-enable { background: #137a3a; color: #fff; }
  &.is-danger { background: #fde7e9; color: #c62839; }
  &.is-plain  { background: #f4f0fa; color: #5b5470; }
}

/* ---- Detail grid ---- */
.detail-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(20rem, 1fr));
  gap: 1rem;
}

.detail-card {
  padding: 1.25rem;
  border: 1px solid #ece7f5;
  border-radius: 1.1rem;
  background: #fff;

  &.wide { grid-column: 1 / -1; }

  h2 {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin: 0 0 1rem;
    font-size: 0.95rem;
    font-weight: 800;
    color: #1d1633;

    i { color: #7c3aed; font-size: 1.1rem; }
  }
}

dl {
  display: grid;
  grid-template-columns: 9rem 1fr;
  gap: 0.5rem 0.75rem;
  margin: 0;
  font-size: 0.88rem;

  dt { color: #8b8499; font-weight: 600; }
  dd { margin: 0; color: #1d1633; overflow-wrap: anywhere; }
}

.mono { font-family: ui-monospace, monospace; font-size: 0.78rem; }
.pre  { white-space: pre-line; }
.muted-text { color: #8b8499; font-size: 0.85rem; }
.review-link { display: inline-flex; align-items: center; gap: 0.2rem; margin-top: 0.9rem; color: #c00078; font-weight: 600; font-size: 0.88rem; text-decoration: none; }

.badge {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
  padding: 0.18rem 0.55rem;
  border-radius: 9999px;
  font-size: 0.72rem;
  font-weight: 700;

  &.is-ok   { background: #e3f8ea; color: #137a3a; }
  &.is-off  { background: #fde7e9; color: #c62839; }
  &.is-blue { background: #e2effe; color: #1d6fd8; }
  &.is-warn { background: #fff4dc; color: #9a6200; }
  &.is-grey { background: #f4f0fa; color: #5b5470; }
}

/* Activity counts */
.counts-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.75rem;
}

.count-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0.6rem;
  border-radius: 0.75rem;
  background: #faf8fd;
  text-align: center;

  strong { font-size: 1.4rem; font-weight: 800; color: #1d1633; }
  span   { font-size: 0.72rem; color: #8b8499; margin-top: 0.1rem; }

  &.is-warn strong { color: #c62839; }
}

/* Photos */
.photos-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.photo-thumb img {
  width: 7rem;
  height: 9rem;
  object-fit: cover;
  border-radius: 0.75rem;
  background: #f4f0fa;
  display: block;
  transition: opacity 0.12s;

  &:hover { opacity: 0.85; }
}

/* Reports */
.reports-list, .history-list {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: 0.88rem;
}

.report-item {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.8rem 1rem;
  border-radius: 0.8rem;
  background: #faf8fd;
}

.report-body { flex: 1; min-width: 0; }
.report-detail { margin: 0.3rem 0 0; white-space: pre-line; }

.resolve-btn {
  flex-shrink: 0;
  padding: 0.3rem 0.75rem;
  border: 1px solid #e4dcef;
  border-radius: 9999px;
  background: #fff;
  font-size: 0.78rem;
  font-weight: 600;
  color: #5b5470;
  transition: background 0.12s;

  &:hover { background: #f4f0fa; }
}

.history-list li {
  padding: 0.5rem 0;
  border-bottom: 1px solid #f3eff9;
  font-size: 0.88rem;

  &:last-child { border-bottom: 0; }
}
</style>
