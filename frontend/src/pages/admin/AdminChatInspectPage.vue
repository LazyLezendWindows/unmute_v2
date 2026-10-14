<template>
  <div class="inspect-page">
    <div class="inspect-top-nav">
      <button type="button" class="back-link" @click="goBack">
        <i class="ri-arrow-left-s-line" aria-hidden="true"></i> Back
      </button>
      <div class="audit-notice" role="alert">
        <i class="ri-shield-keyhole-line" aria-hidden="true"></i>
        <span><strong>Superadmin Audit View</strong> · Read-only conversation inspection. Access is logged in the tamper-evident audit trail.</span>
      </div>
    </div>

    <p v-if="error" class="error-banner" role="alert"><i class="ri-error-warning-fill"></i> {{ error }}</p>

    <div v-if="loading" class="loading-state">
      <i class="ri-loader-4-line spin" aria-hidden="true"></i> Loading conversation inspection...
    </div>

    <template v-else-if="data">
      <!-- Conversation & Participants Header -->
      <header class="header-card">
        <div class="participants-grid">
          <!-- User A -->
          <div class="participant-box">
            <UAvatar :src="data.conversation.userA.avatarUrl" :name="data.conversation.userA.name" size="lg" />
            <div class="participant-info">
              <div class="participant-name-row">
                <router-link :to="`/admin/users/${data.conversation.userA.id}`" class="user-link">
                  <strong>{{ data.conversation.userA.name }}</strong>
                </router-link>
                <span class="badge" :class="data.conversation.userA.isSuspended ? 'is-warn' : data.conversation.userA.isActive ? 'is-ok' : 'is-off'">
                  {{ data.conversation.userA.isSuspended ? 'Suspended' : data.conversation.userA.isActive ? 'Active' : 'Disabled' }}
                </span>
              </div>
              <span class="user-id mono">ID: {{ data.conversation.userA.id }}</span>
            </div>
          </div>

          <div class="match-meta">
            <span class="match-badge"><i class="ri-heart-2-line" aria-hidden="true"></i> Match Conversation</span>
            <small class="muted">Started: {{ formatDate(data.conversation.createdAt) }}</small>
            <small class="muted">Total Messages: {{ data.totalMessages }}</small>
          </div>

          <!-- User B -->
          <div class="participant-box">
            <UAvatar :src="data.conversation.userB.avatarUrl" :name="data.conversation.userB.name" size="lg" />
            <div class="participant-info">
              <div class="participant-name-row">
                <router-link :to="`/admin/users/${data.conversation.userB.id}`" class="user-link">
                  <strong>{{ data.conversation.userB.name }}</strong>
                </router-link>
                <span class="badge" :class="data.conversation.userB.isSuspended ? 'is-warn' : data.conversation.userB.isActive ? 'is-ok' : 'is-off'">
                  {{ data.conversation.userB.isSuspended ? 'Suspended' : data.conversation.userB.isActive ? 'Active' : 'Disabled' }}
                </span>
              </div>
              <span class="user-id mono">ID: {{ data.conversation.userB.id }}</span>
            </div>
          </div>
        </div>
      </header>

      <!-- Associated Reports Context -->
      <section v-if="data.relatedReports.length" class="reports-context-card">
        <h3><i class="ri-flag-fill" aria-hidden="true"></i> Related Moderation Reports ({{ data.relatedReports.length }})</h3>
        <div class="reports-list">
          <div v-for="r in data.relatedReports" :key="r.id" class="report-box" :class="{ 'is-active-report': r.id === currentReportId }">
            <div class="report-top">
              <span class="badge is-warn"><strong>{{ r.category }}</strong></span>
              <span class="badge" :class="r.status === 'resolved' ? 'is-ok' : 'is-warn'">{{ r.status }}</span>
              <span class="muted">{{ formatDate(r.createdAt) }}</span>
            </div>
            <p v-if="r.details" class="report-desc">“{{ r.details }}”</p>
          </div>
        </div>
      </section>

      <!-- Chronological Messages Card -->
      <section class="messages-card">
        <div class="messages-head">
          <h2><i class="ri-chat-history-line" aria-hidden="true"></i> Chronological Messages</h2>
          <span class="muted-note">Read-only transcript (Oldest to newest)</span>
        </div>

        <div v-if="!data.messages.length" class="empty-messages">
          <p class="muted">No messages in this conversation yet.</p>
        </div>

        <div v-else class="message-feed">
          <div
            v-for="m in data.messages"
            :key="m.id"
            class="message-row"
            :class="{
              'is-user-a': m.senderId === data.conversation.userA.id,
              'is-user-b': m.senderId === data.conversation.userB.id,
              'is-call': m.kind === 'call',
            }"
          >
            <div class="message-bubble-wrapper">
              <div class="sender-header">
                <span class="sender-name">{{ m.senderName }}</span>
                <span class="msg-time">{{ formatTime(m.createdAt) }}</span>
                <span v-if="m.deletedAt" class="badge is-off delete-tag">Deleted</span>
              </div>

              <!-- Reply quote -->
              <div v-if="m.replyToContent" class="reply-preview">
                <i class="ri-reply-line"></i>
                <span>{{ m.replyToContent }}</span>
              </div>

              <!-- Call message -->
              <div v-if="m.kind === 'call'" class="call-banner">
                <i :class="m.callMode === 'video' ? 'ri-video-line' : 'ri-phone-line'"></i>
                <div class="call-details">
                  <strong>{{ m.callMode === 'video' ? 'Video call' : 'Voice call' }}</strong>
                  <span>Outcome: {{ m.callOutcome || 'ended' }}<template v-if="m.callSeconds"> · {{ formatDuration(m.callSeconds) }}</template></span>
                </div>
              </div>

              <!-- Regular text message -->
              <div v-else class="message-content">
                <p>{{ m.content }}</p>
              </div>

              <div class="status-footer">
                <span class="msg-status">{{ m.status }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Pagination -->
        <div v-if="data.totalMessages > data.pageSize" class="pager">
          <button type="button" :disabled="data.page <= 1" @click="loadPage(data.page - 1)">
            <i class="ri-arrow-left-s-line" aria-hidden="true"></i> Previous
          </button>
          <span>Page {{ data.page }} of {{ totalPages }}</span>
          <button type="button" :disabled="data.page >= totalPages" @click="loadPage(data.page + 1)">
            Next <i class="ri-arrow-right-s-line" aria-hidden="true"></i>
          </button>
        </div>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import UAvatar from '../../components/ui/UAvatar.vue';
import { inspectConversation, InspectionData } from '../../services/adminApi';

const route = useRoute();
const router = useRouter();

const conversationId = computed(() => String(route.params.id));
const currentReportId = computed(() => (route.query.reportId ? String(route.query.reportId) : undefined));

const data = ref<InspectionData | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);

const totalPages = computed(() => (data.value ? Math.max(1, Math.ceil(data.value.totalMessages / data.value.pageSize)) : 1));

async function load(page = 1) {
  loading.value = true;
  error.value = null;
  try {
    data.value = await inspectConversation(conversationId.value, {
      page,
      pageSize: 50,
      reportId: currentReportId.value,
      reason: 'Superadmin moderation investigation',
    });
  } catch (err: any) {
    error.value = err.message || 'Failed to inspect conversation';
  } finally {
    loading.value = false;
  }
}

function loadPage(p: number) {
  load(p);
}

function goBack() {
  if (window.history.length > 1) {
    router.back();
  } else {
    router.push('/admin/reports');
  }
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDuration(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs}s`;
}

onMounted(() => {
  load(1);
});
</script>

<style scoped lang="scss">
.inspect-page {
  max-width: 58rem;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.inspect-top-nav {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.back-link {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  border: none;
  background: none;
  color: #6c5ce7;
  font-weight: 600;
  font-size: 0.95rem;
  cursor: pointer;
  padding: 0;

  &:hover { text-decoration: underline; }
}

.audit-notice {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.45rem 0.85rem;
  background: #fdf2f2;
  border: 1px solid #fed7d7;
  border-radius: 9999px;
  color: #9b1c1c;
  font-size: 0.82rem;

  i { font-size: 1rem; color: #e02424; }
}

.header-card, .reports-context-card, .messages-card {
  background: #fff;
  border: 1px solid #ece7f5;
  border-radius: 1rem;
  padding: 1.5rem;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.03);
}

.participants-grid {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 1.5rem;
}

.participant-box {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.participant-info {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.participant-name-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.user-link {
  color: #1d1633;
  text-decoration: none;
  font-size: 1.05rem;
  &:hover { text-decoration: underline; color: #6c5ce7; }
}

.user-id {
  font-size: 0.75rem;
  color: #8b8499;
}

.mono { font-family: monospace; }

.match-meta {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
  text-align: center;
}

.match-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  background: #f4f0fa;
  color: #6c5ce7;
  font-weight: 700;
  font-size: 0.78rem;
  padding: 0.3rem 0.75rem;
  border-radius: 9999px;
}

.reports-context-card {
  background: #fffaf0;
  border-color: #feebc8;

  h3 {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    color: #9a6200;
    font-size: 0.95rem;
    margin: 0 0 0.85rem;
  }
}

.reports-list {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}

.report-box {
  padding: 0.75rem 1rem;
  border-radius: 0.5rem;
  background: #fff;
  border: 1px solid #fbd38d;

  &.is-active-report {
    border-color: #dd6b20;
    box-shadow: 0 0 0 2px rgba(221, 107, 32, 0.2);
  }
}

.report-top {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.82rem;
}

.report-desc {
  margin: 0.4rem 0 0;
  font-size: 0.88rem;
  color: #4a5568;
}

.messages-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.25rem;
  padding-bottom: 0.75rem;
  border-bottom: 1px solid #f0ecf7;

  h2 {
    font-size: 1.1rem;
    margin: 0;
    display: flex;
    align-items: center;
    gap: 0.4rem;
    color: #1d1633;
  }

  .muted-note {
    font-size: 0.8rem;
    color: #8b8499;
  }
}

.message-feed {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 0.5rem 0;
}

.message-row {
  display: flex;
  width: 100%;

  &.is-user-a {
    justify-content: flex-start;
    .message-bubble-wrapper {
      background: #f8f6fc;
      border-left: 3px solid #6c5ce7;
    }
  }

  &.is-user-b {
    justify-content: flex-end;
    .message-bubble-wrapper {
      background: #edf2f7;
      border-right: 3px solid #4a5568;
    }
  }

  &.is-call {
    justify-content: center;
    .message-bubble-wrapper {
      background: #fffaf0;
      border: 1px solid #feebc8;
      max-width: 24rem;
    }
  }
}

.message-bubble-wrapper {
  max-width: 32rem;
  border-radius: 0.75rem;
  padding: 0.75rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.sender-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.78rem;

  .sender-name { font-weight: 700; color: #1d1633; }
  .msg-time { color: #8b8499; }
}

.delete-tag {
  font-size: 0.68rem;
  padding: 0.1rem 0.4rem;
}

.reply-preview {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.78rem;
  color: #718096;
  background: rgba(0, 0, 0, 0.04);
  padding: 0.25rem 0.5rem;
  border-radius: 0.35rem;
}

.call-banner {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  color: #9a6200;

  i { font-size: 1.25rem; }
  .call-details {
    display: flex;
    flex-direction: column;
    font-size: 0.82rem;
  }
}

.message-content {
  p {
    margin: 0;
    font-size: 0.92rem;
    line-height: 1.45;
    color: #2d3748;
    white-space: pre-wrap;
    word-break: break-word;
  }
}

.status-footer {
  display: flex;
  justify-content: flex-end;
  font-size: 0.68rem;
  color: #a0aec0;
  text-transform: capitalize;
}

.badge {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
  padding: 0.15rem 0.5rem;
  border-radius: 9999px;
  font-size: 0.72rem;
  font-weight: 700;

  &.is-ok   { background: #e3f8ea; color: #137a3a; }
  &.is-off  { background: #fde7e9; color: #c62839; }
  &.is-warn { background: #fff4dc; color: #9a6200; }
  &.is-grey { background: #f4f0fa; color: #5b5470; }
}

.pager {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  margin-top: 1.5rem;
  padding-top: 1rem;
  border-top: 1px solid #f0ecf7;

  button {
    display: inline-flex;
    align-items: center;
    gap: 0.2rem;
    padding: 0.45rem 0.9rem;
    border: 1px solid #e4dcef;
    border-radius: 9999px;
    background: #fff;
    color: #5b5470;
    font-weight: 600;
    font-size: 0.85rem;
    cursor: pointer;

    &:disabled { opacity: 0.4; cursor: not-allowed; }
    &:hover:not(:disabled) { background: #f4f0fa; }
  }
}

.loading-state, .empty-messages {
  text-align: center;
  padding: 3rem 1rem;
  color: #8b8499;
}

.spin { animation: spin 1s linear infinite; }
@keyframes spin { 100% { transform: rotate(360deg); } }

@media (max-width: 640px) {
  .participants-grid {
    grid-template-columns: 1fr;
    gap: 1rem;
  }
  .match-meta { order: -1; }
}
</style>

