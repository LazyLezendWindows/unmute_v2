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
            <span v-if="u.isBanned" class="badge is-off"><i class="ri-forbid-2-line" aria-hidden="true"></i> Banned</span>
            <span v-else-if="u.isSuspended" class="badge is-warn"><i class="ri-timer-line" aria-hidden="true"></i> Suspended</span>
            <span v-else class="badge" :class="u.isActive ? 'is-ok' : 'is-off'">{{ u.isActive ? 'Active' : 'Disabled' }}</span>
            <span v-if="u.isPaused" class="badge is-grey"><i class="ri-pause-circle-line" aria-hidden="true"></i> Paused</span>
            <span class="badge" :class="p?.isVerified ? 'is-blue' : 'is-grey'">{{ p?.isVerified ? 'Verified' : 'Not verified' }}</span>
            <PremiumBadge v-if="u.subscription.state === 'paid'" :plan="u.subscription.plan" label />
            <span v-else class="badge is-grey">{{ u.subscription.state === 'trial' ? 'Free trial' : 'No plan' }}</span>
          </div>
          <p v-if="u.isSuspended" class="disabled-note is-warn">
            <i class="ri-timer-line"></i>
            Temporarily suspended until {{ when(u.suspendedUntil) }}<template v-if="u.disabledReason">: "{{ u.disabledReason }}"</template>
            <template v-if="u.moderationNotes"><br><small class="muted-note">Internal notes: {{ u.moderationNotes }}</small></template>
          </p>
          <p v-else-if="!u.isActive" class="disabled-note">
            <i class="ri-error-warning-fill"></i>
            Disabled {{ when(u.disabledAt) }}<template v-if="u.disabledReason">: "{{ u.disabledReason }}"</template>
            <template v-if="u.moderationNotes"><br><small class="muted-note">Internal notes: {{ u.moderationNotes }}</small></template>
          </p>
        </div>
        <div class="head-actions">
          <button v-if="me?.role === 'super_admin'" type="button" class="action-btn is-mod" :disabled="busy" @click="openModerationModal">
            <i class="ri-shield-flash-line" aria-hidden="true"></i> Moderate User
          </button>
          <button v-if="p" type="button" class="action-btn" :class="p.isVerified ? 'is-plain' : 'is-verify'" :disabled="busy" @click="setVerified(!p.isVerified)">
            <i :class="p.isVerified ? 'ri-close-circle-line' : 'ri-verified-badge-fill'" aria-hidden="true"></i>
            {{ p.isVerified ? 'Remove verification' : 'Verify user' }}
          </button>
          <template v-if="me?.role !== 'super_admin'">
            <button v-if="u.isActive" type="button" class="action-btn is-danger" :disabled="busy" @click="disableOpen = true">
              <i class="ri-user-forbid-line" aria-hidden="true"></i> Disable
            </button>
            <button v-else-if="u.isBanned" type="button" class="action-btn is-enable" :disabled="busy" @click="liftBan">
              <i class="ri-user-follow-line" aria-hidden="true"></i> Lift ban
            </button>
            <button v-else type="button" class="action-btn is-enable" :disabled="busy" @click="setActive(true)">
              <i class="ri-user-follow-line" aria-hidden="true"></i> Enable
            </button>
          </template>
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
            <div v-for="(url, i) in photos" :key="url + i" class="photo-item">
              <a :href="mediaUrl(url)" target="_blank" rel="noopener" class="photo-thumb">
                <img :src="mediaUrl(url)" :alt="`Photo ${i + 1}`" />
              </a>
              <button type="button" class="photo-remove" :disabled="busy" :aria-label="`Remove photo ${i + 1}`" @click="removePhoto(url)">
                <i class="ri-delete-bin-6-line" aria-hidden="true"></i> Remove
              </button>
            </div>
          </div>
          <dl>
            <dt>Bio</dt><dd class="pre">{{ p.bio || '—' }}</dd>
            <dt>Date of birth</dt><dd>{{ p.dateOfBirth || '—' }} ({{ p.age }})</dd>
            <dt>Gender</dt><dd>{{ p.gender || '—' }}</dd>
            <dt>Prompts</dt>
            <dd>
              <template v-if="p.prompts?.length">
                <div v-for="pr in p.prompts" :key="pr.q" class="pre"><strong>{{ PROMPT_QUESTIONS[pr.q] || pr.q }}</strong> {{ pr.a }}</div>
              </template>
              <template v-else>—</template>
            </dd>
            <dt>Referral</dt>
            <dd>
              Code {{ u.referral?.code || '—' }} · {{ u.referral?.friendsJoined ?? 0 }} friends joined ({{ u.referral?.friendsRewarded ?? 0 }} rewarded)<template v-if="u.referral?.referredBy"> · invited by {{ u.referral.referredBy }}</template>
            </dd>
            <dt>Background</dt><dd>{{ backgroundChips(p).map((c) => c.text).join(' · ') || '—' }}</dd>
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
                <span class="muted-text"> by <router-link v-if="r.reporter.id" :to="`/admin/users/${r.reporter.id}`">{{ r.reporter.name || 'member' }}</router-link><template v-else>a deleted account</template> · {{ when(r.createdAt) }}</span>
                <p v-if="r.details" class="pre report-detail">{{ r.details }}</p>
              </div>
              <div class="report-actions-cell">
                <router-link
                  v-if="me?.role === 'super_admin' && r.conversationId"
                  :to="`/admin/conversations/${r.conversationId}?reportId=${r.id}`"
                  class="resolve-btn is-inspect-btn"
                >
                  <i class="ri-chat-search-line"></i> Inspect chat
                </router-link>
                <span v-if="r.status !== 'pending'" class="badge is-ok">{{ r.status }}</span>
                <button v-else type="button" class="resolve-btn" @click="resolve(r.id)">Mark resolved</button>
              </div>
            </li>
          </ul>
        </section>

        <!-- Superadmin Conversations & Chat Inspection -->
        <section v-if="me?.role === 'super_admin'" class="detail-card wide">
          <h2><i class="ri-chat-3-line" aria-hidden="true"></i> Conversations & Chat Inspection (Superadmin)</h2>
          <p v-if="!conversations.length" class="muted-text">No conversations found for this user.</p>
          <div v-else class="convs-table-wrapper">
            <table class="convs-table">
              <thead>
                <tr>
                  <th>Participant</th>
                  <th>Status</th>
                  <th>Last Message</th>
                  <th>Messages</th>
                  <th>Reports</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="c in conversations" :key="c.id">
                  <td>
                    <router-link :to="`/admin/users/${c.partner.id}`" class="partner-cell">
                      <UAvatar :src="c.partner.avatarUrl" :name="c.partner.name" size="sm" />
                      <span><strong>{{ c.partner.name }}</strong></span>
                    </router-link>
                  </td>
                  <td>
                    <span class="badge" :class="c.partner.isActive ? 'is-ok' : 'is-off'">
                      {{ c.partner.isActive ? 'Active' : 'Disabled' }}
                    </span>
                  </td>
                  <td class="muted">{{ c.lastMessageAt ? when(c.lastMessageAt) : 'Never' }}</td>
                  <td>{{ c.messageCount }}</td>
                  <td>
                    <span v-if="c.reportCount" class="badge is-warn"><i class="ri-flag-fill"></i> {{ c.reportCount }}</span>
                    <span v-else class="muted">0</span>
                  </td>
                  <td>
                    <router-link :to="`/admin/conversations/${c.id}`" class="action-btn is-inspect-table-btn">
                      <i class="ri-chat-search-line"></i> Inspect chat
                    </router-link>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
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

    <!-- Superadmin Moderation Modal -->
    <UModal :is-open="modOpen" title="Moderate User" max-width="md" @close="modOpen = false">
      <div class="d-flex flex-column gap-3">
        <p class="small mb-1" style="color: var(--unmute-text-secondary)">
          Superadmin moderation actions are enforced server-side, revoke sessions/sockets immediately, and are logged in the audit trail.
        </p>

        <!-- Moderation Action Selection -->
        <div class="mod-action-tabs">
          <button
            type="button"
            class="mod-tab-btn"
            :class="{ 'is-active': modAction === 'suspend' }"
            @click="modAction = 'suspend'"
          >
            <i class="ri-timer-line"></i> Suspend
          </button>
          <button
            type="button"
            class="mod-tab-btn"
            :class="{ 'is-active': modAction === 'disable' }"
            @click="modAction = 'disable'"
          >
            <i class="ri-user-forbid-line"></i> Disable
          </button>
          <button
            type="button"
            class="mod-tab-btn"
            :class="{ 'is-active': modAction === 'ban' }"
            @click="modAction = 'ban'"
          >
            <i class="ri-forbid-2-line"></i> Ban
          </button>
          <button
            v-if="!u?.isActive || u?.isSuspended || u?.isBanned"
            type="button"
            class="mod-tab-btn"
            :class="{ 'is-active': modAction === 'reactivate' }"
            @click="modAction = 'reactivate'"
          >
            <i class="ri-restart-line"></i> Reactivate
          </button>
        </div>

        <!-- Explanatory Alert -->
        <div class="mod-alert" :class="`is-${modAction}`">
          <i :class="modAction === 'reactivate' ? 'ri-check-circle-line' : 'ri-alert-line'"></i>
          <span v-if="modAction === 'suspend'">
            Temporary suspension revokes all active sessions, terminates WebSocket connections, and blocks logins until the suspension expires.
          </span>
          <span v-else-if="modAction === 'disable'">
            Account disabling immediately revokes sessions and terminates WebSocket connections. The account remains disabled until restored by a Superadmin.
          </span>
          <span v-else-if="modAction === 'ban'">
            Permanent ban revokes sessions, disconnects sockets, disables account, and blacklists email/phone to prevent future registrations.
          </span>
          <span v-else-if="modAction === 'reactivate'">
            Restores user access immediately, lifts any active bans or suspensions, and clears restrictions.
          </span>
        </div>

        <!-- Duration selector for Suspension -->
        <div v-if="modAction === 'suspend'" class="mod-field">
          <label class="mod-label">Suspension Duration</label>
          <select v-model="modDurationPreset" class="mod-select">
            <option :value="1">1 Hour</option>
            <option :value="24">24 Hours (1 Day)</option>
            <option :value="72">3 Days</option>
            <option :value="168">7 Days (1 Week)</option>
            <option :value="336">14 Days (2 Weeks)</option>
            <option :value="720">30 Days (1 Month)</option>
            <option value="custom">Custom End Date & Time</option>
          </select>

          <div v-if="modDurationPreset === 'custom'" class="mt-2">
            <label class="mod-label small">Suspend Until</label>
            <input v-model="modCustomUntil" type="datetime-local" class="mod-datetime-input" />
          </div>
        </div>

        <!-- Reason Input -->
        <div class="mod-field">
          <label class="mod-label">
            Moderation Reason <span v-if="modAction !== 'reactivate'" class="text-danger">*</span>
          </label>
          <UInput
            v-model="modReason"
            placeholder="Reason (e.g. Terms violation, abusive behavior in chat, harassment)"
            :maxlength="200"
          />
        </div>

        <!-- Internal Notes -->
        <div class="mod-field">
          <label class="mod-label">Internal Staff Notes (Optional)</label>
          <textarea
            v-model="modNotes"
            rows="2"
            class="mod-textarea"
            placeholder="Case notes or context (visible in admin audit records)"
          ></textarea>
        </div>
      </div>

      <template #footer>
        <UButton variant="secondary" size="md" @click="modOpen = false">Cancel</UButton>
        <UButton
          :variant="modAction === 'reactivate' ? 'primary' : 'danger'"
          size="md"
          :loading="busy"
          :disabled="modAction !== 'reactivate' && !modReason.trim()"
          @click="submitModeration"
        >
          {{ modActionBtnLabel }}
        </UButton>
      </template>
    </UModal>

    <!-- Legacy disable modal for non-superadmin -->
    <UModal :is-open="disableOpen" title="Disable this user?" max-width="sm" @close="disableOpen = false">
      <div class="d-flex flex-column gap-3">
        <p class="small mb-0" style="color: var(--unmute-text-secondary)">They'll be signed out everywhere and can't sign in until you re-enable them.</p>
        <UInput v-model="reason" placeholder="Reason (for the admin record)" :maxlength="200" />
        <label class="ban-check">
          <input v-model="alsoBan" type="checkbox" />
          <span><strong>Also ban</strong> their email and phone number, so they can't make a new account with them.</span>
        </label>
      </div>
      <template #footer>
        <UButton variant="secondary" size="md" @click="disableOpen = false">Cancel</UButton>
        <UButton variant="danger" size="md" :loading="busy" @click="alsoBan ? ban() : setActive(false)">{{ alsoBan ? 'Disable and ban' : 'Disable user' }}</UButton>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import { PROMPT_QUESTIONS, backgroundChips } from '../../content/profileOptions';
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import UAvatar from '../../components/ui/UAvatar.vue';
import UModal from '../../components/ui/UModal.vue';
import UInput from '../../components/ui/UInput.vue';
import UButton from '../../components/ui/UButton.vue';
import PremiumBadge from '../../components/premium/PremiumBadge.vue';
import { adminApi, adminSession, AdminUser, moderateUser, getUserConversations, UserConversationItem } from '../../services/adminApi';
import { mediaUrl } from '../../services/media';
import { planTier } from '../../utils/plans';
import { useToastStore } from '../../stores/toast';

const route = useRoute();
const me = ref<AdminUser | null>(null);
const u = ref<any | null>(null);
const error = ref<string | null>(null);
const busy = ref(false);
const disableOpen = ref(false);
const reason = ref('');

// Superadmin moderation state
const modOpen = ref(false);
const modAction = ref<'suspend' | 'disable' | 'ban' | 'reactivate'>('suspend');
const modDurationPreset = ref<number | string>(24);
const modCustomUntil = ref('');
const modReason = ref('');
const modNotes = ref('');
const conversations = ref<UserConversationItem[]>([]);

const modActionBtnLabel = computed(() => {
  if (modAction.value === 'suspend') return 'Apply Suspension';
  if (modAction.value === 'disable') return 'Disable Account';
  if (modAction.value === 'ban') return 'Permanently Ban';
  return 'Reactivate Account';
});

function openModerationModal() {
  if (u.value?.isSuspended) modAction.value = 'reactivate';
  else if (!u.value?.isActive) modAction.value = 'reactivate';
  else modAction.value = 'suspend';
  modReason.value = '';
  modNotes.value = '';
  modDurationPreset.value = 24;
  modCustomUntil.value = '';
  modOpen.value = true;
}

async function submitModeration() {
  if (modAction.value !== 'reactivate' && !modReason.value.trim()) {
    useToastStore().error('A moderation reason is required.');
    return;
  }

  let durationHours: number | undefined;
  let until: string | undefined;

  if (modAction.value === 'suspend') {
    if (modDurationPreset.value === 'custom') {
      if (!modCustomUntil.value) {
        useToastStore().error('Please specify the date and time until which the user should be suspended.');
        return;
      }
      until = new Date(modCustomUntil.value).toISOString();
    } else {
      durationHours = Number(modDurationPreset.value);
    }
  }

  busy.value = true;
  try {
    const updated = await moderateUser(u.value.id, {
      action: modAction.value,
      durationHours,
      suspendedUntil: until,
      until,
      reason: modReason.value.trim() || 'Account reactivated by Superadmin',
      notes: modNotes.value.trim() || undefined,
    });
    u.value = updated;
    modOpen.value = false;
    useToastStore().success(
      modAction.value === 'reactivate'
        ? 'Account restored and active.'
        : modAction.value === 'suspend'
        ? 'User temporarily suspended and signed out.'
        : modAction.value === 'disable'
        ? 'User disabled and signed out.'
        : 'User permanently banned.'
    );
    await load();
  } catch (err: any) {
    useToastStore().error(err.message);
  } finally {
    busy.value = false;
  }
}

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
  try {
    u.value = (await adminApi.get(`/users/${route.params.id}`)).data.data;
    if (me.value?.role === 'super_admin') {
      conversations.value = await getUserConversations(String(route.params.id)).catch(() => []);
    }
  } catch (err: any) {
    error.value = err.message;
  }
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

const alsoBan = ref(false);

async function ban() {
  busy.value = true;
  try {
    u.value = (await adminApi.post(`/users/${u.value.id}/ban`, { reason: reason.value.trim() || undefined })).data.data;
    disableOpen.value = false; reason.value = ''; alsoBan.value = false;
    useToastStore().success('User disabled and banned.');
  } catch (err: any) { useToastStore().error(err.message); }
  finally { busy.value = false; }
}

async function removePhoto(url: string) {
  if (!window.confirm('Remove this photo from their profile? The file is deleted.')) return;
  busy.value = true;
  try {
    u.value = (await adminApi.post(`/users/${u.value.id}/photos/remove`, { url })).data.data;
    useToastStore().success('Photo removed.');
  } catch (err: any) { useToastStore().error(err.message); }
  finally { busy.value = false; }
}

async function liftBan() {
  busy.value = true;
  try {
    u.value = (await adminApi.delete(`/users/${u.value.id}/ban`)).data.data;
    useToastStore().success('Ban lifted and account enabled.');
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

onMounted(async () => {
  me.value = await adminSession();
  await load();
});
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
  &.is-mod    { background: #6c5ce7; color: #fff; &:hover:not(:disabled) { background: #5a4bcf; } }
  &.is-verify { background: #1d8cf8; color: #fff; }
  &.is-enable { background: #137a3a; color: #fff; }
  &.is-danger { background: #fde7e9; color: #c62839; }
  &.is-plain  { background: #f4f0fa; color: #5b5470; }
  &.is-inspect-table-btn { padding: 0.35rem 0.75rem; font-size: 0.8rem; background: #6c5ce7; color: #fff; text-decoration: none; }
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

.photo-item { display: flex; flex-direction: column; gap: 0.3rem; }

.photo-remove {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.25rem;
  padding: 0.25rem 0.5rem;
  border: 0;
  border-radius: 0.5rem;
  background: #fde7e9;
  color: #c62839;
  font-size: 0.75rem;
  font-weight: 700;

  &:disabled { opacity: 0.55; }
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
  text-decoration: none;

  &:hover { background: #f4f0fa; }
  &.is-inspect-btn {
    background: #6c5ce7;
    color: #fff;
    border-color: #6c5ce7;
    &:hover { background: #5a4bcf; }
  }
}

.report-actions-cell {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.convs-table-wrapper {
  overflow-x: auto;
  margin-top: 0.5rem;
}

.convs-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.88rem;

  th {
    padding: 0.6rem 0.8rem;
    border-bottom: 1px solid #ece7f5;
    color: #8b8499;
    font-size: 0.72rem;
    font-weight: 700;
    text-align: left;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  td {
    padding: 0.65rem 0.8rem;
    border-bottom: 1px solid #f3eff9;
    vertical-align: middle;
  }

  tbody tr:last-child td { border-bottom: 0; }
}

.partner-cell {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  color: #1d1633;
  text-decoration: none;
  &:hover { text-decoration: underline; color: #6c5ce7; }
}

.mod-action-tabs {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(6.5rem, 1fr));
  gap: 0.4rem;
}

.mod-tab-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
  padding: 0.55rem 0.6rem;
  border: 1px solid #e4dcef;
  border-radius: 0.6rem;
  background: #faf8fd;
  color: #5b5470;
  font-weight: 600;
  font-size: 0.82rem;
  cursor: pointer;
  transition: all 0.12s;

  &:hover { background: #f0ebf8; }
  &.is-active {
    background: #6c5ce7;
    color: #fff;
    border-color: #6c5ce7;
  }
}

.mod-alert {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  padding: 0.65rem 0.85rem;
  border-radius: 0.6rem;
  font-size: 0.82rem;
  line-height: 1.4;

  i { font-size: 1rem; margin-top: 0.05rem; flex-shrink: 0; }

  &.is-suspend  { background: #fffaf0; border: 1px solid #feebc8; color: #9a6200; }
  &.is-disable  { background: #fdf2f2; border: 1px solid #fed7d7; color: #9b1c1c; }
  &.is-ban      { background: #fdf2f2; border: 1px solid #fed7d7; color: #9b1c1c; font-weight: 600; }
  &.is-reactivate { background: #f0fdf4; border: 1px solid #bbf7d0; color: #166534; }
}

.mod-field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.mod-label {
  font-size: 0.82rem;
  font-weight: 700;
  color: #4a5568;
}

.mod-select, .mod-datetime-input, .mod-textarea {
  width: 100%;
  padding: 0.5rem 0.75rem;
  border: 1px solid #e4dcef;
  border-radius: 0.5rem;
  font-size: 0.88rem;
  background: #fff;
  color: #1d1633;
  font-family: inherit;

  &:focus { outline: none; border-color: #6c5ce7; }
}

.muted-note {
  color: #8b8499;
  font-size: 0.78rem;
}

.history-list li {
  padding: 0.5rem 0;
  border-bottom: 1px solid #f3eff9;
  font-size: 0.88rem;

  &:last-child { border-bottom: 0; }
}

.ban-check {
  display: flex;
  align-items: flex-start;
  gap: 0.6rem;
  font-size: 0.88rem;
  color: var(--unmute-text-secondary);

  input { margin-top: 0.2rem; width: 1.1rem; height: 1.1rem; accent-color: #c62839; flex-shrink: 0; }
}
</style>
