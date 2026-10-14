<template>
  <div>
    <div class="page-head">
      <div>
        <h1 class="page-title">Users <span v-if="data" class="page-count">{{ data.total.toLocaleString() }}</span></h1>
        <p class="page-sub">All registered members</p>
      </div>
    </div>

    <div class="toolbar">
      <label class="search-box">
        <i class="ri-search-line" aria-hidden="true"></i>
        <input v-model="q" type="search" placeholder="Search name, email, phone or user ID…" aria-label="Search users" @input="debouncedLoad" />
      </label>
      <div class="filter-pills" role="group" aria-label="Filter users">
        <button v-for="f in FILTERS" :key="f.value" type="button" :aria-pressed="filter === f.value" @click="setFilter(f.value)">{{ f.label }}</button>
      </div>
    </div>

    <p v-if="error" class="error-banner" role="alert"><i class="ri-error-warning-fill"></i> {{ error }}</p>

    <div class="table-card">
      <table class="users-table">
        <thead>
          <tr>
            <th>Member</th>
            <th>Contact</th>
            <th>Plan</th>
            <th>Status</th>
            <th>Joined</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="u in data?.users" :key="u.id" class="user-row" @click="$router.push(`/admin/users/${u.id}`)">
            <td>
              <router-link :to="`/admin/users/${u.id}`" class="member-cell" @click.stop>
                <UAvatar :src="u.avatarUrl" :name="u.name" size="sm" />
                <span class="member-info">
                  <strong>{{ u.name }}<i v-if="u.isVerified" class="ri-verified-badge-fill verified-badge" aria-label="Verified"></i></strong>
                  <small v-if="u.age">{{ u.age }} yrs</small>
                </span>
              </router-link>
            </td>
            <td class="contact-cell">
              <span v-if="u.email">{{ u.email }}</span>
              <span v-if="u.phone" class="muted">{{ u.phone }}</span>
            </td>
            <td>
              <PremiumBadge v-if="u.plan" :plan="u.plan" label />
              <span v-else class="badge is-grey">Free</span>
            </td>
            <td>
              <span v-if="u.isBanned" class="badge is-off"><i class="ri-forbid-2-line" aria-hidden="true"></i> Banned</span>
              <span v-else-if="u.isSuspended" class="badge is-warn" :title="u.suspendedUntil ? `Until ${dateText(u.suspendedUntil)}` : ''"><i class="ri-timer-line" aria-hidden="true"></i> Suspended</span>
              <span v-else class="badge" :class="u.isActive ? 'is-ok' : 'is-off'">{{ u.isActive ? 'Active' : 'Disabled' }}</span>
              <span v-if="u.reports" class="badge is-warn ms-1" :title="`${u.reports} reports`">
                <i class="ri-flag-fill" aria-hidden="true"></i>{{ u.reports }}
              </span>
            </td>
            <td class="muted">{{ dateText(u.joinedAt) }}</td>
          </tr>
          <tr v-if="data && !data.users.length">
            <td colspan="5" class="empty-row">No users found.</td>
          </tr>
          <tr v-if="!data">
            <td v-for="n in 5" :key="n" class="skeleton-cell"><span class="skeleton"></span></td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="data && data.total > data.pageSize" class="pager">
      <button type="button" :disabled="page <= 1" @click="go(page - 1)">
        <i class="ri-arrow-left-s-line" aria-hidden="true"></i> Previous
      </button>
      <span class="pager-info">Page {{ page }} of {{ pages }}</span>
      <button type="button" :disabled="page >= pages" @click="go(page + 1)">
        Next <i class="ri-arrow-right-s-line" aria-hidden="true"></i>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import UAvatar from '../../components/ui/UAvatar.vue';
import PremiumBadge from '../../components/premium/PremiumBadge.vue';
import { adminApi } from '../../services/adminApi';

const FILTERS = [
  { value: 'all',        label: 'All' },
  { value: 'active',     label: 'Active' },
  { value: 'suspended',  label: 'Suspended' },
  { value: 'disabled',   label: 'Disabled' },
  { value: 'banned',     label: 'Banned' },
  { value: 'verified',   label: 'Verified' },
  { value: 'unverified', label: 'Unverified' },
  { value: 'paid',       label: 'Paid' },
  { value: 'trial',      label: 'Trial' },
  { value: 'reported',   label: 'Reported' },
];

interface Row {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  avatarUrl: string;
  age: number | null;
  isActive: boolean;
  isSuspended?: boolean;
  suspendedUntil?: string | null;
  isBanned?: boolean;
  isVerified: boolean;
  plan: string | null;
  reports: number;
  joinedAt: string;
}

const route = useRoute();
const router = useRouter();
const q = ref(String(route.query.q ?? ''));
const filter = ref(String(route.query.filter ?? 'all'));
const page = ref(Number(route.query.page ?? 1));
const data = ref<{ total: number; page: number; pageSize: number; users: Row[] } | null>(null);
const error = ref<string | null>(null);
const pages = computed(() => (data.value ? Math.max(1, Math.ceil(data.value.total / data.value.pageSize)) : 1));
let timer: ReturnType<typeof setTimeout> | undefined;

async function load() {
  error.value = null;
  router.replace({ query: { ...(q.value ? { q: q.value } : {}), ...(filter.value !== 'all' ? { filter: filter.value } : {}), ...(page.value > 1 ? { page: page.value } : {}) } });
  try { data.value = (await adminApi.get('/users', { params: { q: q.value || undefined, filter: filter.value, page: page.value } })).data.data; }
  catch (err: any) { error.value = err.message; }
}

function debouncedLoad() { clearTimeout(timer); timer = setTimeout(() => { page.value = 1; load(); }, 300); }
function setFilter(value: string) { filter.value = value; page.value = 1; load(); }
function go(p: number) { page.value = p; load(); }
function dateText(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

onMounted(load);
onBeforeUnmount(() => clearTimeout(timer));
</script>

<style scoped lang="scss">
.page-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; margin-bottom: 1.25rem; }
.page-title { margin: 0; font-size: 1.75rem; font-weight: 800; color: #1d1633; }
.page-count { margin-left: 0.5rem; font-size: 1rem; color: #8b8499; font-weight: 600; }
.page-sub   { margin: 0.15rem 0 0; color: #8b8499; font-size: 0.9rem; }

.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-bottom: 1rem;
}

.search-box {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex: 1 1 16rem;
  padding: 0 1rem;
  min-height: 2.75rem;
  border: 1px solid #e4dcef;
  border-radius: 0.8rem;
  background: #fff;
  color: #8b8499;
  transition: border-color 0.15s;

  &:focus-within { border-color: #7c3aed; }

  input { flex: 1; min-width: 0; border: 0; outline: none; background: transparent; color: #1d1633; font-size: 0.9rem; }
}

.filter-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;

  button {
    padding: 0.4rem 0.85rem;
    border: 1px solid #e4dcef;
    border-radius: 9999px;
    background: #fff;
    color: #5b5470;
    font-size: 0.82rem;
    font-weight: 600;
    transition: background 0.12s, border-color 0.12s, color 0.12s;

    &:hover { background: #f4f0fa; border-color: #c9b8e8; }
    &[aria-pressed='true'] { background: #1d1633; border-color: #1d1633; color: #fff; }
  }
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

.table-card {
  overflow-x: auto;
  border: 1px solid #ece7f5;
  border-radius: 1.1rem;
  background: #fff;
}

.users-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.88rem;

  th {
    padding: 0.75rem 1rem;
    border-bottom: 1px solid #ece7f5;
    color: #8b8499;
    font-size: 0.72rem;
    font-weight: 700;
    text-align: left;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    white-space: nowrap;
  }

  td {
    padding: 0.7rem 1rem;
    border-bottom: 1px solid #f3eff9;
    vertical-align: middle;
  }

  tbody tr:last-child td { border-bottom: 0; }
}

.user-row { cursor: pointer; transition: background 0.1s; &:hover { background: #faf8fd; } }

.member-cell {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  color: #1d1633;
  text-decoration: none;
}

.member-info {
  display: flex;
  flex-direction: column;

  strong { font-weight: 700; }
  small  { color: #8b8499; font-size: 0.78rem; }
}

.verified-badge { margin-left: 0.2rem; color: #1d8cf8; font-size: 0.85em; }

.contact-cell { display: flex; flex-direction: column; gap: 0.1rem; color: #5b5470; }

.muted { color: #8b8499; }

.badge {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
  padding: 0.2rem 0.6rem;
  border-radius: 9999px;
  font-size: 0.72rem;
  font-weight: 700;

  &.is-ok   { background: #e3f8ea; color: #137a3a; }
  &.is-off  { background: #fde7e9; color: #c62839; }
  &.is-warn { background: #fff4dc; color: #9a6200; }
  &.is-grey { background: #f4f0fa; color: #5b5470; }
}

.empty-row { padding: 2.5rem; text-align: center; color: #8b8499; }

.skeleton-cell { padding: 0.9rem 1rem; }
.skeleton { display: block; height: 1rem; border-radius: 0.5rem; background: linear-gradient(90deg, #f0ecf8 25%, #e8e2f4 50%, #f0ecf8 75%); background-size: 200% 100%; animation: shimmer 1.4s infinite; }
@keyframes shimmer { from { background-position: 200% 0; } to { background-position: -200% 0; } }

.pager {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  margin-top: 1.25rem;

  button {
    display: inline-flex;
    align-items: center;
    gap: 0.2rem;
    padding: 0.5rem 1rem;
    border: 1px solid #e4dcef;
    border-radius: 9999px;
    background: #fff;
    color: #5b5470;
    font-weight: 600;
    font-size: 0.88rem;
    transition: background 0.12s;

    &:hover:not(:disabled) { background: #f4f0fa; }
    &:disabled { opacity: 0.4; }
  }
}

.pager-info { color: #8b8499; font-size: 0.88rem; }

/* Phones: each member is a card (name, contact, then plan, status and joined on one line). */
@media (max-width: 640px) {
  .users-table thead { display: none; }

  .users-table,
  .users-table tbody { display: block; }

  .users-table .user-row {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 0.35rem 0.75rem;
    padding: 0.8rem 0.9rem;
    border-bottom: 1px solid #f0ecf7;
  }

  .users-table .user-row td {
    display: block;
    padding: 0;
    border: 0;
  }

  .users-table .user-row td:nth-child(1) { grid-column: 1 / -1; }
  .users-table .user-row td:nth-child(2) { grid-column: 1 / -1; padding-left: 2.6rem; font-size: 0.82rem; overflow-wrap: anywhere; }
  .users-table .user-row td:nth-child(3) { padding-left: 2.6rem; }
  .users-table .user-row td:nth-child(4) { justify-self: end; }
  .users-table .user-row td:nth-child(5) { grid-column: 1 / -1; padding-left: 2.6rem; font-size: 0.78rem; }

  .users-table tr:not(.user-row) { display: block; }
  .users-table tr:not(.user-row) td { display: block; }
}
</style>
