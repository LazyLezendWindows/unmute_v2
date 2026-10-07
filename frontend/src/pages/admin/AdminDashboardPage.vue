<template>
  <div>
    <div class="page-head">
      <div>
        <h1 class="page-title">Dashboard</h1>
        <p class="page-sub">Platform overview</p>
      </div>
      <button type="button" class="refresh-btn" :disabled="!stats" @click="load">
        <i class="ri-refresh-line" aria-hidden="true"></i> Refresh
      </button>
    </div>

    <p v-if="error" class="error-banner" role="alert"><i class="ri-error-warning-fill"></i> {{ error }}</p>

    <div class="stats-grid">
      <router-link v-for="card in cards" :key="card.label" :to="card.to" class="stat-card" :class="card.tone">
        <div class="stat-icon"><i :class="card.icon" aria-hidden="true"></i></div>
        <div class="stat-body">
          <strong class="stat-value">{{ stats ? card.value(stats).toLocaleString() : '–' }}</strong>
          <span class="stat-label">{{ card.label }}</span>
        </div>
        <i class="ri-arrow-right-s-line stat-arrow" aria-hidden="true"></i>
      </router-link>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { adminApi } from '../../services/adminApi';

interface Stats { total: number; active: number; disabled: number; verified: number; paid: number; newThisWeek: number; pendingReviews: number; openReports: number }

const stats = ref<Stats | null>(null);
const error = ref<string | null>(null);

const cards: { label: string; icon: string; to: string; tone?: string; value: (s: Stats) => number }[] = [
  { label: 'Total members',      icon: 'ri-group-line',          to: '/admin/users',                    value: (s) => s.total },
  { label: 'Active',             icon: 'ri-user-follow-line',    to: '/admin/users?filter=active',      value: (s) => s.active },
  { label: 'Joined this week',   icon: 'ri-user-add-line',       to: '/admin/users',                    value: (s) => s.newThisWeek,      tone: 'is-green' },
  { label: 'Verified',           icon: 'ri-verified-badge-line', to: '/admin/users?filter=verified',    value: (s) => s.verified,         tone: 'is-blue' },
  { label: 'Paid plans',         icon: 'ri-vip-crown-2-line',    to: '/admin/users?filter=paid',        value: (s) => s.paid,             tone: 'is-gold' },
  { label: 'Disabled',           icon: 'ri-user-forbid-line',    to: '/admin/users?filter=disabled',    value: (s) => s.disabled,         tone: 'is-red' },
  { label: 'Pending reviews',    icon: 'ri-shield-check-line',   to: '/admin/verifications',            value: (s) => s.pendingReviews,   tone: 'is-pink' },
  { label: 'Open reports',       icon: 'ri-flag-line',           to: '/admin/reports',                  value: (s) => s.openReports,      tone: 'is-red' },
];

async function load() {
  error.value = null;
  try { stats.value = (await adminApi.get('/stats')).data.data; }
  catch (err: any) { error.value = err.message; }
}

onMounted(load);
</script>

<style scoped lang="scss">
.page-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.page-title { margin: 0; font-size: 1.75rem; font-weight: 800; color: #1d1633; }
.page-sub   { margin: 0.15rem 0 0; color: #8b8499; font-size: 0.9rem; }

.refresh-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.55rem 1rem;
  border: 1px solid #e4dcef;
  border-radius: 0.75rem;
  background: #fff;
  color: #5b5470;
  font-weight: 600;
  font-size: 0.88rem;
  transition: background 0.15s;

  &:hover { background: #f4f0fa; }
  &:disabled { opacity: 0.5; }
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

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(13rem, 1fr));
  gap: 1rem;
}

.stat-card {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1.1rem 1.1rem 1.1rem 1rem;
  border-radius: 1.1rem;
  background: #fff;
  border: 1px solid #ece7f5;
  color: #1d1633;
  text-decoration: none;
  transition: box-shadow 0.15s, transform 0.15s;

  &:hover { box-shadow: 0 8px 24px -12px rgba(29,22,51,0.18); transform: translateY(-2px); }
}

.stat-icon {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 2.8rem;
  height: 2.8rem;
  border-radius: 0.8rem;
  background: #f4f0fa;
  color: #7c3aed;
  font-size: 1.35rem;
}

.stat-body { flex: 1; min-width: 0; }
.stat-value { display: block; font-size: 1.75rem; font-weight: 800; line-height: 1.1; }
.stat-label { font-size: 0.8rem; color: #8b8499; font-weight: 600; }
.stat-arrow { color: #c9c0dc; font-size: 1.3rem; flex-shrink: 0; }

/* Tones */
.is-green .stat-icon { background: #e3f8ea; color: #137a3a; }
.is-blue  .stat-icon { background: #e2effe; color: #1d6fd8; }
.is-gold  .stat-icon { background: #fff4dc; color: #9a6200; }
.is-red   .stat-icon { background: #fde7e9; color: #c62839; }
.is-pink  .stat-icon { background: #fbe4f2; color: #c00078; }
</style>
