<template>
  <div class="reports-page">
    <div class="page-head">
      <div>
        <h1 class="page-title">Reports <span v-if="data" class="page-count">{{ data.total.toLocaleString() }}</span></h1>
        <p class="page-sub">What members reported, newest first. Open the member to disable or ban them.</p>
      </div>
    </div>

    <div class="filter-pills" role="group" aria-label="Report status">
      <button v-for="f in FILTERS" :key="f.value" type="button" :aria-pressed="status === f.value" @click="setStatus(f.value)">{{ f.label }}</button>
    </div>

    <p v-if="error" class="error-banner" role="alert"><i class="ri-error-warning-fill"></i> {{ error }}</p>

    <div v-if="!data" class="loading-state"><i class="ri-loader-4-line spin" aria-hidden="true"></i> Loading…</div>

    <div v-else-if="!data.reports.length" class="empty-state">
      <i class="ri-shield-check-fill" aria-hidden="true"></i>
      <p>{{ status === 'pending' ? 'No open reports. Nice and quiet.' : 'No reports here.' }}</p>
    </div>

    <article v-for="r in data?.reports" :key="r.id" class="report-card" :class="{ 'is-resolved': r.status === 'resolved' }">
      <header class="report-head">
        <router-link :to="`/admin/users/${r.reported.id}`" class="member">
          <UAvatar :src="r.reported.avatarUrl" :name="r.reported.name || 'Member'" size="md" />
          <span class="member-info">
            <strong>{{ r.reported.name || 'Member' }}</strong>
            <small>
              Reported {{ r.reported.totalReports }} {{ r.reported.totalReports === 1 ? 'time' : 'times' }}
              · <span :class="r.reported.isActive ? 'ok' : 'off'">{{ r.reported.isActive ? 'Active' : 'Disabled' }}</span>
            </small>
          </span>
        </router-link>
        <span class="badge" :class="r.status === 'pending' ? 'is-warn' : 'is-grey'">{{ r.status === 'pending' ? 'Open' : 'Resolved' }}</span>
      </header>

      <p class="report-reason"><i class="ri-flag-fill" aria-hidden="true"></i><strong>{{ r.category }}</strong></p>
      <p v-if="r.details" class="report-details">“{{ r.details }}”</p>
      <p class="report-meta">
        By <router-link v-if="r.reporter.id" :to="`/admin/users/${r.reporter.id}`">{{ r.reporter.name || 'member' }}</router-link><template v-else>a deleted account</template>
        · {{ when(r.createdAt) }}
      </p>

      <div class="report-actions">
        <router-link :to="`/admin/users/${r.reported.id}`" class="action-btn is-plain"><i class="ri-user-search-line" aria-hidden="true"></i> Review member</router-link>
        <router-link
          v-if="me?.role === 'super_admin' && r.conversationId"
          :to="`/admin/conversations/${r.conversationId}?reportId=${r.id}`"
          class="action-btn is-inspect"
        >
          <i class="ri-chat-search-line" aria-hidden="true"></i> Inspect chat
        </router-link>
        <button v-if="r.status === 'pending'" type="button" class="action-btn is-ok" :disabled="busy === r.id" @click="resolve(r.id)">
          <i class="ri-check-line" aria-hidden="true"></i> Mark resolved
        </button>
      </div>
    </article>

    <div v-if="data && data.total > data.pageSize" class="pager">
      <button type="button" :disabled="page <= 1" @click="go(page - 1)"><i class="ri-arrow-left-s-line" aria-hidden="true"></i> Previous</button>
      <span>Page {{ page }} of {{ pages }}</span>
      <button type="button" :disabled="page >= pages" @click="go(page + 1)">Next <i class="ri-arrow-right-s-line" aria-hidden="true"></i></button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import UAvatar from '../../components/ui/UAvatar.vue';
import { adminApi, adminSession, AdminUser } from '../../services/adminApi';
import { useToastStore } from '../../stores/toast';

type Status = 'pending' | 'resolved' | 'all';
const FILTERS: { value: Status; label: string }[] = [
  { value: 'pending', label: 'Open' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'all', label: 'All' },
];

interface Report {
  id: string;
  category: string;
  details: string | null;
  status: 'pending' | 'resolved';
  createdAt: string;
  conversationId?: string | null;
  reporter: { id: string | null; name: string | null };
  reported: { id: string; name: string | null; avatarUrl: string; isActive: boolean; totalReports: number };
}

const me = ref<AdminUser | null>(null);
const status = ref<Status>('pending');
const page = ref(1);
const data = ref<{ total: number; page: number; pageSize: number; reports: Report[] } | null>(null);
const error = ref<string | null>(null);
const busy = ref<string | null>(null);
const pages = computed(() => (data.value ? Math.max(1, Math.ceil(data.value.total / data.value.pageSize)) : 1));

async function load() {
  error.value = null;
  try { data.value = (await adminApi.get('/reports', { params: { status: status.value, page: page.value } })).data.data; }
  catch (err: any) { error.value = err.message; }
}

function setStatus(value: Status) { status.value = value; page.value = 1; data.value = null; load(); }
function go(p: number) { page.value = p; load(); }

async function resolve(id: string) {
  busy.value = id;
  try {
    await adminApi.post(`/reports/${id}/resolve`);
    useToastStore().success('Report resolved.');
    await load();
  } catch (err: any) { useToastStore().error(err.message); }
  finally { busy.value = null; }
}

function when(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString([], { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

onMounted(async () => {
  me.value = await adminSession();
  load();
});
</script>

<style scoped lang="scss">
.reports-page { max-width: 54rem; }

.page-head { margin-bottom: 1rem; }
.page-title { margin: 0; font-size: 1.75rem; font-weight: 800; color: #1d1633; }
.page-count { margin-left: 0.5rem; font-size: 1rem; color: #8b8499; font-weight: 600; }
.page-sub { margin: 0.15rem 0 0; color: #8b8499; font-size: 0.9rem; }

.filter-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
  margin-bottom: 1rem;

  button {
    padding: 0.4rem 0.95rem;
    border: 1px solid #e4dcef;
    border-radius: 9999px;
    background: #fff;
    color: #5b5470;
    font-size: 0.85rem;
    font-weight: 600;

    &[aria-pressed='true'] { background: #1d1633; border-color: #1d1633; color: #fff; }
  }
}

.error-banner { display: flex; align-items: center; gap: 0.5rem; padding: 0.75rem 1rem; border-radius: 0.75rem; background: #fde7e9; color: #c62839; }
.loading-state { display: flex; align-items: center; gap: 0.5rem; padding: 2rem; color: #8b8499; }
.spin { animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  padding: 3rem 2rem;
  border: 1px solid #ece7f5;
  border-radius: 1.1rem;
  background: #fff;
  color: #5b5470;

  i { font-size: 2.5rem; color: #137a3a; }
  p { margin: 0; }
}

.report-card {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-bottom: 0.9rem;
  padding: 1.1rem 1.2rem;
  border: 1px solid #ece7f5;
  border-radius: 1.1rem;
  background: #fff;

  &.is-resolved { opacity: 0.75; }
}

.report-head { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; }

.member {
  display: flex;
  align-items: center;
  gap: 0.7rem;
  min-width: 0;
  color: #1d1633;
  text-decoration: none;
}

.member-info {
  display: flex;
  flex-direction: column;
  min-width: 0;

  strong { font-weight: 800; }
  small { color: #8b8499; font-size: 0.8rem; }
  .ok { color: #137a3a; }
  .off { color: #c62839; }
}

.report-reason { display: flex; align-items: center; gap: 0.4rem; margin: 0; color: #1d1633; i { color: #c62839; } }
.report-details { margin: 0; padding: 0.55rem 0.8rem; border-radius: 0.75rem; background: #faf8fd; color: #5b5470; font-size: 0.9rem; white-space: pre-line; overflow-wrap: anywhere; }
.report-meta { margin: 0; color: #8b8499; font-size: 0.82rem; a { color: #7c3aed; } }

.report-actions { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.25rem; }

.action-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.5rem 1rem;
  border: 0;
  border-radius: 0.75rem;
  font-size: 0.88rem;
  font-weight: 700;
  text-decoration: none;

  &:disabled { opacity: 0.55; }
  &.is-plain { background: #f4f0fa; color: #1d1633; }
  &.is-ok { background: #137a3a; color: #fff; }
  &.is-inspect { background: #6c5ce7; color: #fff; }
}

.badge {
  flex-shrink: 0;
  padding: 0.2rem 0.65rem;
  border-radius: 9999px;
  font-size: 0.72rem;
  font-weight: 700;

  &.is-warn { background: #fff4dc; color: #9a6200; }
  &.is-grey { background: #f4f0fa; color: #5b5470; }
}

.pager {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  margin-top: 1rem;
  color: #8b8499;
  font-size: 0.88rem;

  button { padding: 0.45rem 0.95rem; border: 1px solid #e4dcef; border-radius: 9999px; background: #fff; color: #5b5470; font-weight: 600; &:disabled { opacity: 0.4; } }
}
</style>
