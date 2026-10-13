<template>
  <div class="audit-logs-page">
    <div class="page-head">
      <div>
        <h1 class="page-title">Audit Trail</h1>
        <p class="page-sub">Tamper-evident log of administrative actions, account suspensions, and moderation decisions.</p>
      </div>

      <button type="button" class="refresh-btn" :disabled="loading" @click="fetchLogs(page)">
        <i class="ri-refresh-line" :class="{ 'is-spinning': loading }" aria-hidden="true"></i>
        <span>Refresh</span>
      </button>
    </div>

    <p v-if="error" class="error-banner" role="alert"><i class="ri-error-warning-fill"></i> {{ error }}</p>

    <!-- Filters & Search Bar -->
    <div class="filters-card">
      <div class="search-input-wrapper">
        <i class="ri-search-line search-icon" aria-hidden="true"></i>
        <input
          v-model="searchTerm"
          type="search"
          class="search-input"
          placeholder="Search by admin name, email, target user, or detail..."
          @keyup.enter="applyFilters"
        />
      </div>

      <div class="action-filter-pills">
        <button
          v-for="f in ACTION_FILTERS"
          :key="f.value"
          type="button"
          class="filter-pill"
          :class="{ 'is-active': selectedAction === f.value }"
          @click="selectFilter(f.value)"
        >
          {{ f.label }}
        </button>
      </div>
    </div>

    <!-- Logs Table -->
    <div class="table-card">
      <table class="audit-table">
        <thead>
          <tr>
            <th>Timestamp</th>
            <th>Actor</th>
            <th>Action</th>
            <th>Target</th>
            <th>Reason / Detail</th>
            <th>IP Address</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="log in logs" :key="log.id" class="log-row">
            <td class="timestamp-col">
              <strong>{{ formatTime(log.createdAt) }}</strong>
              <small>{{ formatDate(log.createdAt) }}</small>
            </td>

            <td>
              <div class="actor-cell">
                <span class="actor-name">{{ log.actor.name }}</span>
                <span class="actor-role-pill" :class="log.actor.role">{{ formatRole(log.actor.role) }}</span>
              </div>
            </td>

            <td>
              <span class="action-pill" :class="actionClass(log.action)">
                {{ formatAction(log.action) }}
              </span>
            </td>

            <td>
              <div v-if="log.target" class="target-cell">
                <router-link :to="`/admin/users/${log.target.id}`" class="target-link">
                  {{ log.target.name }}
                </router-link>
              </div>
              <span v-else class="muted">–</span>
            </td>

            <td class="detail-col">
              <span class="detail-text">{{ log.detail || '–' }}</span>
            </td>

            <td class="ip-col">
              <code>{{ log.ipAddress || '–' }}</code>
            </td>
          </tr>

          <tr v-if="!logs.length && !loading">
            <td colspan="6" class="empty-row">No audit logs matching your criteria.</td>
          </tr>
          <tr v-if="loading">
            <td colspan="6" class="empty-row">Loading audit records...</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Pagination Controls -->
    <div v-if="totalPages > 1" class="pagination-bar">
      <span class="pagination-info">
        Showing {{ (page - 1) * pageSize + 1 }}–{{ Math.min(page * pageSize, total) }} of {{ total }} records
      </span>
      <div class="pagination-buttons">
        <button type="button" class="page-nav-btn" :disabled="page <= 1" @click="fetchLogs(page - 1)">
          <i class="ri-arrow-left-s-line"></i> Previous
        </button>
        <span class="page-indicator">Page {{ page }} of {{ totalPages }}</span>
        <button type="button" class="page-nav-btn" :disabled="page >= totalPages" @click="fetchLogs(page + 1)">
          Next <i class="ri-arrow-right-s-line"></i>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { adminApi, AuditLogEntry, AdminRole } from '../../services/adminApi';

const ACTION_FILTERS = [
  { label: 'All Actions', value: 'all' },
  { label: 'Disabled & Bans', value: 'disabled' },
  { label: 'Enabled / Reactivated', value: 'enabled' },
  { label: 'Verifications', value: 'selfie_approved' },
  { label: 'Reports', value: 'report_resolved' },
  { label: 'Admin & Roles', value: 'admin_created' },
  { label: 'MFA', value: 'mfa_enabled' },
  { label: 'Sign-in Events', value: 'login_success' },
];

const logs = ref<AuditLogEntry[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(25);
const selectedAction = ref('all');
const searchTerm = ref('');
const loading = ref(false);
const error = ref<string | null>(null);

const totalPages = computed(() => Math.ceil(total.value / pageSize.value) || 1);

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString();
}

function formatRole(role: AdminRole) {
  if (role === 'super_admin') return 'Super Admin';
  if (role === 'moderator') return 'Mod';
  return 'Admin';
}

function formatAction(action: string) {
  return action.replace(/_/g, ' ');
}

function actionClass(action: string) {
  if (action === 'disabled' || action === 'banned' || action === 'admin_removed' || action === 'login_failed') return 'is-danger';
  if (action === 'enabled' || action === 'unbanned' || action === 'selfie_approved' || action === 'mfa_enabled') return 'is-success';
  if (action === 'report_resolved') return 'is-purple';
  if (action === 'verified') return 'is-info';
  return 'is-default';
}

async function fetchLogs(targetPage = 1) {
  loading.value = true;
  error.value = null;
  try {
    const res = await adminApi.get('/audit-logs', {
      params: {
        page: targetPage,
        pageSize: pageSize.value,
        action: selectedAction.value !== 'all' ? selectedAction.value : undefined,
        q: searchTerm.value.trim() || undefined,
      },
    });
    logs.value = res.data.data.logs;
    total.value = res.data.data.total;
    page.value = res.data.data.page;
  } catch (err: any) {
    error.value = err.message || 'Failed to fetch audit logs.';
  } finally {
    loading.value = false;
  }
}

function selectFilter(act: string) {
  selectedAction.value = act;
  void fetchLogs(1);
}

function applyFilters() {
  void fetchLogs(1);
}

onMounted(() => {
  void fetchLogs(1);
});
</script>

<style scoped lang="scss">
.audit-logs-page {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.page-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
}

.page-title { margin: 0; font-size: 1.75rem; font-weight: 800; color: #1d1633; }
.page-sub   { margin: 0.2rem 0 0; color: #6c647d; font-size: 0.9rem; }

.refresh-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.5rem 0.9rem;
  border: 1px solid #e0d8ed;
  border-radius: 0.6rem;
  background: #fff;
  color: #1d1633;
  font-size: 0.82rem;
  font-weight: 700;
  cursor: pointer;

  &:hover { background: #f9f7fd; }
  &:disabled { opacity: 0.5; }
}

.filters-card {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  padding: 1.15rem;
  border-radius: 1rem;
  background: #fff;
  border: 1px solid #ebe4f5;
}

.search-input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.search-icon {
  position: absolute;
  left: 0.9rem;
  font-size: 1.1rem;
  color: #8b8499;
}

.search-input {
  width: 100%;
  padding: 0.65rem 1rem 0.65rem 2.5rem;
  border: 1px solid #e2d9f3;
  border-radius: 0.65rem;
  font-size: 0.88rem;
  outline: none;
  background: #faf8fd;

  &:focus {
    border-color: #7c3aed;
    background: #fff;
  }
}

.action-filter-pills {
  display: flex;
  gap: 0.4rem;
  flex-wrap: wrap;
}

.filter-pill {
  padding: 0.3rem 0.7rem;
  border-radius: 9999px;
  border: 1px solid #e2d9f3;
  background: #fff;
  color: #5b5470;
  font-size: 0.78rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.15s;

  &.is-active {
    background: #1d1633;
    border-color: #1d1633;
    color: #fff;
  }
}

.table-card {
  border-radius: 1rem;
  background: #fff;
  border: 1px solid #ebe4f5;
  overflow-x: auto;
}

.audit-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;

  th {
    padding: 0.85rem 1rem;
    text-align: left;
    font-weight: 700;
    color: #6c647d;
    border-bottom: 1px solid #f1ecf8;
    background: #faf8fd;
  }

  td {
    padding: 0.8rem 1rem;
    border-bottom: 1px solid #f7f5fa;
    vertical-align: middle;
  }
}

.timestamp-col {
  white-space: nowrap;
  strong { display: block; color: #1d1633; font-size: 0.82rem; }
  small { color: #8b8499; font-size: 0.72rem; }
}

.actor-cell {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  white-space: nowrap;
}

.actor-name { font-weight: 700; color: #1d1633; }

.actor-role-pill {
  font-size: 0.62rem;
  font-weight: 700;
  text-transform: uppercase;
  padding: 0.1rem 0.35rem;
  border-radius: 9999px;

  &.super_admin { background: #fef3c7; color: #b45309; }
  &.admin       { background: #e0e7ff; color: #4338ca; }
  &.moderator   { background: #ccfbf1; color: #0f766e; }
}

.action-pill {
  display: inline-block;
  padding: 0.2rem 0.55rem;
  border-radius: 9999px;
  font-size: 0.74rem;
  font-weight: 700;
  text-transform: capitalize;

  &.is-danger  { background: #fee2e2; color: #991b1b; }
  &.is-success { background: #d1fae5; color: #065f46; }
  &.is-purple  { background: #f3e8ff; color: #7e22ce; }
  &.is-info    { background: #dbeafe; color: #1e40af; }
  &.is-default { background: #f3f4f6; color: #374151; }
}

.target-link {
  color: #7c3aed;
  font-weight: 600;
  text-decoration: none;
  &:hover { text-decoration: underline; }
}

.detail-col {
  max-width: 20rem;
}

.detail-text {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  color: #554d66;
  font-size: 0.8rem;
  line-height: 1.35;
}

.ip-col code {
  font-size: 0.75rem;
  color: #8b8499;
  background: #f7f5fa;
  padding: 0.15rem 0.35rem;
  border-radius: 0.3rem;
}

.empty-row {
  text-align: center;
  padding: 3rem 1rem !important;
  color: #8b8499;
}

.pagination-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
}

.pagination-info { font-size: 0.82rem; color: #6c647d; }

.pagination-buttons {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.page-nav-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.35rem 0.75rem;
  border: 1px solid #dcd3eb;
  border-radius: 0.5rem;
  background: #fff;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;

  &:hover { background: #f5f2fb; }
  &:disabled { opacity: 0.4; cursor: not-allowed; }
}

.page-indicator {
  font-size: 0.8rem;
  font-weight: 700;
  color: #554d66;
}

.error-banner {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0;
  padding: 0.75rem 1rem;
  border-radius: 0.75rem;
  background: #fde7e9;
  color: #c62839;
  font-size: 0.9rem;
}
</style>
