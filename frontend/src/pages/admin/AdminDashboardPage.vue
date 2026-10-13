<template>
  <div class="analytics-dashboard">
    <div class="page-head">
      <div>
        <div class="head-title-row">
          <h1 class="page-title">Live Analytics &amp; Dashboard</h1>
          <span class="live-pill" :class="{ 'is-active': autoRefresh }">
            <span class="pulse-dot"></span>
            LIVE
          </span>
        </div>
        <p class="page-sub">Real-time metrics, online presence, and 30-day activity trends</p>
      </div>

      <div class="head-actions">
        <div class="filter-pills" role="radiogroup" aria-label="Trend duration">
          <button
            type="button"
            class="pill-btn"
            :class="{ 'is-selected': selectedDays === 7 }"
            @click="setDays(7)"
          >
            7 Days
          </button>
          <button
            type="button"
            class="pill-btn"
            :class="{ 'is-selected': selectedDays === 30 }"
            @click="setDays(30)"
          >
            30 Days
          </button>
        </div>

        <button
          type="button"
          class="auto-toggle-btn"
          :class="{ 'is-active': autoRefresh }"
          title="Toggle 30-second live auto-refresh"
          @click="autoRefresh = !autoRefresh"
        >
          <i :class="autoRefresh ? 'ri-pause-circle-line' : 'ri-play-circle-line'" aria-hidden="true"></i>
          <span>{{ autoRefresh ? 'Auto-refresh on' : 'Auto-refresh paused' }}</span>
        </button>

        <button type="button" class="refresh-btn" :disabled="loading" @click="fetchData">
          <i class="ri-refresh-line" :class="{ 'is-spinning': loading }" aria-hidden="true"></i>
          <span>Refresh</span>
        </button>
      </div>
    </div>

    <p v-if="error" class="error-banner" role="alert">
      <i class="ri-error-warning-fill"></i> {{ error }}
    </p>

    <!-- Row 1: High-Priority Realtime Metrics -->
    <div class="metric-section-title">
      <i class="ri-pulse-line"></i> Live &amp; User Presence
    </div>
    <div class="stats-grid main-grid">
      <!-- Users Online Now -->
      <div class="stat-card is-online">
        <div class="stat-icon"><i class="ri-broadcast-fill" aria-hidden="true"></i></div>
        <div class="stat-body">
          <strong class="stat-value">{{ metrics ? metrics.onlineNow.toLocaleString() : '–' }}</strong>
          <span class="stat-label">Online now</span>
          <span class="stat-subtext">Heartbeat within last 90s</span>
        </div>
      </div>

      <!-- Total Registered Users -->
      <router-link to="/admin/users" class="stat-card">
        <div class="stat-icon"><i class="ri-group-line" aria-hidden="true"></i></div>
        <div class="stat-body">
          <strong class="stat-value">{{ metrics ? metrics.totalUsers.toLocaleString() : '–' }}</strong>
          <span class="stat-label">Total registered users</span>
          <span class="stat-subtext">{{ metrics ? `${metrics.verifiedUsers} verified` : '' }}</span>
        </div>
        <i class="ri-arrow-right-s-line stat-arrow" aria-hidden="true"></i>
      </router-link>

      <!-- Active Users (24h & 7d) -->
      <router-link to="/admin/users?filter=active" class="stat-card is-green">
        <div class="stat-icon"><i class="ri-user-smile-line" aria-hidden="true"></i></div>
        <div class="stat-body">
          <strong class="stat-value">{{ metrics ? metrics.activeUsers24h.toLocaleString() : '–' }}</strong>
          <span class="stat-label">Active today (24h)</span>
          <span class="stat-subtext">{{ metrics ? `${metrics.activeUsers7d} active this week` : '' }}</span>
        </div>
        <i class="ri-arrow-right-s-line stat-arrow" aria-hidden="true"></i>
      </router-link>

      <!-- Suspended Users -->
      <router-link to="/admin/users?filter=disabled" class="stat-card is-red">
        <div class="stat-icon"><i class="ri-user-forbid-line" aria-hidden="true"></i></div>
        <div class="stat-body">
          <strong class="stat-value">{{ metrics ? metrics.suspendedUsers.toLocaleString() : '–' }}</strong>
          <span class="stat-label">Suspended accounts</span>
          <span class="stat-subtext">Disabled by moderators</span>
        </div>
        <i class="ri-arrow-right-s-line stat-arrow" aria-hidden="true"></i>
      </router-link>
    </div>

    <!-- Row 2: Registrations & Engagement Metrics -->
    <div class="metric-section-title">
      <i class="ri-chat-voice-line"></i> Engagement &amp; Moderation
    </div>
    <div class="stats-grid sub-grid">
      <!-- New Registrations Today / Week / Month -->
      <router-link to="/admin/users" class="stat-card is-purple">
        <div class="stat-icon"><i class="ri-user-add-line" aria-hidden="true"></i></div>
        <div class="stat-body">
          <strong class="stat-value">+{{ metrics ? metrics.newToday.toLocaleString() : '–' }}</strong>
          <span class="stat-label">New today</span>
          <span class="stat-subtext">{{ metrics ? `+${metrics.newThisWeek} this week · +${metrics.newThisMonth} this month` : '' }}</span>
        </div>
        <i class="ri-arrow-right-s-line stat-arrow" aria-hidden="true"></i>
      </router-link>

      <!-- Active Conversations -->
      <div class="stat-card is-blue">
        <div class="stat-icon"><i class="ri-chat-smile-2-line" aria-hidden="true"></i></div>
        <div class="stat-body">
          <strong class="stat-value">{{ metrics ? metrics.activeConversations.toLocaleString() : '–' }}</strong>
          <span class="stat-label">Active conversations</span>
          <span class="stat-subtext">Messages in the last 7 days</span>
        </div>
      </div>

      <!-- Messages Sent Today & This Week -->
      <div class="stat-card is-gold">
        <div class="stat-icon"><i class="ri-message-3-line" aria-hidden="true"></i></div>
        <div class="stat-body">
          <strong class="stat-value">{{ metrics ? metrics.messagesToday.toLocaleString() : '–' }}</strong>
          <span class="stat-label">Messages sent today</span>
          <span class="stat-subtext">{{ metrics ? `${metrics.messagesThisWeek.toLocaleString()} this week` : '' }}</span>
        </div>
      </div>

      <!-- Pending Connection Requests -->
      <div class="stat-card is-teal">
        <div class="stat-icon"><i class="ri-heart-add-line" aria-hidden="true"></i></div>
        <div class="stat-body">
          <strong class="stat-value">{{ metrics ? metrics.pendingRequests.toLocaleString() : '–' }}</strong>
          <span class="stat-label">Pending connection requests</span>
          <span class="stat-subtext">Likes awaiting match</span>
        </div>
      </div>

      <!-- Pending Reports -->
      <router-link to="/admin/reports?status=pending" class="stat-card is-pink">
        <div class="stat-icon"><i class="ri-flag-fill" aria-hidden="true"></i></div>
        <div class="stat-body">
          <strong class="stat-value">{{ metrics ? metrics.pendingReports.toLocaleString() : '–' }}</strong>
          <span class="stat-label">Pending reports</span>
          <span class="stat-subtext">Awaiting moderation</span>
        </div>
        <i class="ri-arrow-right-s-line stat-arrow" aria-hidden="true"></i>
      </router-link>
    </div>

    <!-- Row 3: Interactive SVG Trend Charts -->
    <div class="charts-row">
      <!-- Registrations Trend Chart -->
      <div class="chart-card">
        <div class="chart-header">
          <div>
            <h2 class="chart-title">New User Registrations</h2>
            <span class="chart-sub">Daily accounts created over the last {{ selectedDays }} days</span>
          </div>
          <span class="chart-badge is-purple">
            Total +{{ sumSeries(trends?.registrations || []) }}
          </span>
        </div>

        <div class="chart-container">
          <svg
            v-if="trends?.registrations && trends.registrations.length > 0"
            class="trend-svg"
            viewBox="0 0 600 220"
            preserveAspectRatio="none"
          >
            <defs>
              <linearGradient id="regGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#9333ea" stop-opacity="0.3" />
                <stop offset="100%" stop-color="#9333ea" stop-opacity="0.0" />
              </linearGradient>
            </defs>

            <!-- Guide grid lines -->
            <line x1="40" y1="30" x2="580" y2="30" stroke="#eee8f8" stroke-dasharray="3,3" />
            <line x1="40" y1="100" x2="580" y2="100" stroke="#eee8f8" stroke-dasharray="3,3" />
            <line x1="40" y1="170" x2="580" y2="170" stroke="#eee8f8" />

            <!-- Area fill -->
            <polygon :points="buildAreaPoints(trends.registrations, 40, 580, 30, 170)" fill="url(#regGrad)" />

            <!-- Trend line -->
            <polyline
              :points="buildLinePoints(trends.registrations, 40, 580, 30, 170)"
              fill="none"
              stroke="#9333ea"
              stroke-width="3"
              stroke-linecap="round"
              stroke-linejoin="round"
            />

            <!-- Data circles -->
            <circle
              v-for="(pt, idx) in calcPoints(trends.registrations, 40, 580, 30, 170)"
              :key="idx"
              :cx="pt.x"
              :cy="pt.y"
              r="3.5"
              fill="#fff"
              stroke="#9333ea"
              stroke-width="2"
            >
              <title>{{ pt.label }}: {{ pt.value }} new users</title>
            </circle>
          </svg>
          <div v-else class="chart-empty">No registration records found for this period.</div>
        </div>

        <div class="chart-footer">
          <span>{{ trends?.registrations?.[0]?.date }}</span>
          <span>{{ trends?.registrations?.at(-1)?.date }}</span>
        </div>
      </div>

      <!-- Messages & Activity Trend Chart -->
      <div class="chart-card">
        <div class="chart-header">
          <div>
            <h2 class="chart-title">Messages &amp; Platform Activity</h2>
            <span class="chart-sub">Daily messages sent over the last {{ selectedDays }} days</span>
          </div>
          <span class="chart-badge is-gold">
            Total {{ sumSeries(trends?.messages || []).toLocaleString() }} msgs
          </span>
        </div>

        <div class="chart-container">
          <svg
            v-if="trends?.messages && trends.messages.length > 0"
            class="trend-svg"
            viewBox="0 0 600 220"
            preserveAspectRatio="none"
          >
            <defs>
              <linearGradient id="msgGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#f59e0b" stop-opacity="0.35" />
                <stop offset="100%" stop-color="#f59e0b" stop-opacity="0.0" />
              </linearGradient>
            </defs>

            <!-- Guide grid lines -->
            <line x1="40" y1="30" x2="580" y2="30" stroke="#eee8f8" stroke-dasharray="3,3" />
            <line x1="40" y1="100" x2="580" y2="100" stroke="#eee8f8" stroke-dasharray="3,3" />
            <line x1="40" y1="170" x2="580" y2="170" stroke="#eee8f8" />

            <!-- Area fill -->
            <polygon :points="buildAreaPoints(trends.messages, 40, 580, 30, 170)" fill="url(#msgGrad)" />

            <!-- Trend line -->
            <polyline
              :points="buildLinePoints(trends.messages, 40, 580, 30, 170)"
              fill="none"
              stroke="#d97706"
              stroke-width="3"
              stroke-linecap="round"
              stroke-linejoin="round"
            />

            <!-- Data circles -->
            <circle
              v-for="(pt, idx) in calcPoints(trends.messages, 40, 580, 30, 170)"
              :key="idx"
              :cx="pt.x"
              :cy="pt.y"
              r="3.5"
              fill="#fff"
              stroke="#d97706"
              stroke-width="2"
            >
              <title>{{ pt.label }}: {{ pt.value }} messages</title>
            </circle>
          </svg>
          <div v-else class="chart-empty">No message activity recorded for this period.</div>
        </div>

        <div class="chart-footer">
          <span>{{ trends?.messages?.[0]?.date }}</span>
          <span>{{ trends?.messages?.at(-1)?.date }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue';
import { adminApi, AnalyticsData } from '../../services/adminApi';

const selectedDays = ref(30);
const autoRefresh = ref(true);
const loading = ref(false);
const error = ref<string | null>(null);

const metrics = ref<AnalyticsData['metrics'] | null>(null);
const trends = ref<AnalyticsData['trends'] | null>(null);

let timer: ReturnType<typeof setInterval> | null = null;

async function fetchData() {
  loading.value = true;
  error.value = null;
  try {
    const res = await adminApi.get('/analytics', { params: { days: selectedDays.value } });
    const data: AnalyticsData = res.data.data;
    metrics.value = data.metrics;
    trends.value = data.trends;
  } catch (err: any) {
    error.value = err.message || 'Failed to load live analytics data.';
  } finally {
    loading.value = false;
  }
}

function setDays(days: number) {
  selectedDays.value = days;
}

watch(selectedDays, () => {
  void fetchData();
});

watch(autoRefresh, (enabled) => {
  if (enabled) {
    startAutoRefresh();
  } else if (timer) {
    clearInterval(timer);
    timer = null;
  }
});

function startAutoRefresh() {
  if (timer) clearInterval(timer);
  timer = setInterval(() => {
    if (autoRefresh.value) void fetchData();
  }, 30_000);
}

function sumSeries(series: { count: number }[]): number {
  return series.reduce((acc, cur) => acc + (cur.count || 0), 0);
}

interface ChartPoint {
  x: number;
  y: number;
  value: number;
  label: string;
}

function calcPoints(
  items: { date: string; count: number }[],
  minX: number,
  maxX: number,
  minY: number,
  maxY: number
): ChartPoint[] {
  if (!items || items.length === 0) return [];
  const maxVal = Math.max(...items.map((i) => i.count), 1);
  const stepX = items.length > 1 ? (maxX - minX) / (items.length - 1) : 0;

  return items.map((item, index) => {
    const x = minX + index * stepX;
    const y = maxY - (item.count / maxVal) * (maxY - minY);
    return { x, y, value: item.count, label: item.date };
  });
}

function buildLinePoints(
  items: { date: string; count: number }[],
  minX: number,
  maxX: number,
  minY: number,
  maxY: number
): string {
  const points = calcPoints(items, minX, maxX, minY, maxY);
  return points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
}

function buildAreaPoints(
  items: { date: string; count: number }[],
  minX: number,
  maxX: number,
  minY: number,
  maxY: number
): string {
  const points = calcPoints(items, minX, maxX, minY, maxY);
  if (points.length === 0) return '';
  const first = points[0];
  const last = points[points.length - 1];
  const line = points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  return `${first.x.toFixed(1)},${maxY} ${line} ${last.x.toFixed(1)},${maxY}`;
}

onMounted(() => {
  void fetchData();
  startAutoRefresh();
});

onUnmounted(() => {
  if (timer) clearInterval(timer);
});
</script>

<style scoped lang="scss">
.analytics-dashboard {
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

.head-title-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.page-title {
  margin: 0;
  font-size: 1.75rem;
  font-weight: 800;
  color: #1d1633;
}

.live-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.2rem 0.6rem;
  border-radius: 9999px;
  background: #f1ecf8;
  color: #8b8499;
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.05em;

  &.is-active {
    background: rgba(16, 185, 129, 0.15);
    color: #059669;

    .pulse-dot {
      background: #10b981;
      box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7);
      animation: pulse 1.8s infinite;
    }
  }
}

.pulse-dot {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
  background: #a39cb3;
}

@keyframes pulse {
  0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7); }
  70% { transform: scale(1); box-shadow: 0 0 0 6px rgba(16, 185, 129, 0); }
  100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
}

.page-sub {
  margin: 0.2rem 0 0;
  color: #6c647d;
  font-size: 0.9rem;
}

.head-actions {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  flex-wrap: wrap;
}

.filter-pills {
  display: inline-flex;
  background: #e8e2f2;
  padding: 0.2rem;
  border-radius: 0.6rem;
}

.pill-btn {
  border: 0;
  background: transparent;
  color: #5b5470;
  padding: 0.35rem 0.75rem;
  font-size: 0.8rem;
  font-weight: 700;
  border-radius: 0.45rem;
  cursor: pointer;
  transition: all 0.15s;

  &.is-selected {
    background: #fff;
    color: #1d1633;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.08);
  }
}

.auto-toggle-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.45rem 0.8rem;
  border: 1px solid #e0d8ed;
  border-radius: 0.6rem;
  background: #fff;
  color: #5b5470;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;

  &.is-active {
    border-color: #a7f3d0;
    color: #065f46;
    background: #ecfdf5;
  }
}

.refresh-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.45rem 0.9rem;
  border: 1px solid #e0d8ed;
  border-radius: 0.6rem;
  background: #1d1633;
  color: #fff;
  font-size: 0.82rem;
  font-weight: 700;
  cursor: pointer;
  transition: opacity 0.15s;

  &:hover { opacity: 0.9; }
  &:disabled { opacity: 0.5; }

  i.is-spinning {
    animation: spin 1s linear infinite;
  }
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
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

.metric-section-title {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.88rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #7b738e;
  margin-top: 0.5rem;
}

.stats-grid {
  display: grid;
  gap: 1rem;

  &.main-grid {
    grid-template-columns: repeat(auto-fill, minmax(14.5rem, 1fr));
  }
  &.sub-grid {
    grid-template-columns: repeat(auto-fill, minmax(13rem, 1fr));
  }
}

.stat-card {
  position: relative;
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1.25rem 1.15rem;
  border-radius: 1rem;
  background: #fff;
  border: 1px solid #ebe4f5;
  text-decoration: none;
  color: inherit;
  transition: transform 0.15s, box-shadow 0.15s;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 0.5rem 1.25rem rgba(29, 22, 51, 0.08);
  }

  &.is-online {
    background: linear-gradient(135deg, #064e3b 0%, #065f46 100%);
    color: #fff;
    border-color: #047857;

    .stat-icon { background: rgba(255, 255, 255, 0.2); color: #6ee7b7; }
    .stat-value { color: #fff; }
    .stat-label { color: #d1fae5; }
    .stat-subtext { color: #a7f3d0; }
  }

  &.is-green .stat-icon { background: #d1fae5; color: #059669; }
  &.is-purple .stat-icon { background: #f3e8ff; color: #9333ea; }
  &.is-blue .stat-icon { background: #dbeafe; color: #2563eb; }
  &.is-gold .stat-icon { background: #fef3c7; color: #d97706; }
  &.is-teal .stat-icon { background: #ccfbf1; color: #0d9488; }
  &.is-pink .stat-icon { background: #fce7f3; color: #db2777; }
  &.is-red .stat-icon { background: #fee2e2; color: #dc2626; }
}

.stat-icon {
  display: grid;
  place-items: center;
  width: 2.85rem;
  height: 2.85rem;
  border-radius: 0.75rem;
  background: #f1ecf8;
  color: #6a3bb5;
  font-size: 1.45rem;
  flex-shrink: 0;
}

.stat-body {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.stat-value {
  font-size: 1.65rem;
  font-weight: 800;
  line-height: 1.1;
  color: #1d1633;
}

.stat-label {
  margin-top: 0.15rem;
  font-size: 0.84rem;
  font-weight: 700;
  color: #554d66;
}

.stat-subtext {
  margin-top: 0.15rem;
  font-size: 0.72rem;
  color: #8b8499;
}

.stat-arrow {
  margin-left: auto;
  font-size: 1.25rem;
  color: #b5accc;
}

/* ---- Charts Row ---- */
.charts-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(22rem, 1fr));
  gap: 1.25rem;
  margin-top: 0.5rem;
}

.chart-card {
  display: flex;
  flex-direction: column;
  padding: 1.4rem;
  border-radius: 1rem;
  background: #fff;
  border: 1px solid #ebe4f5;
  box-shadow: 0 4px 12px rgba(29, 22, 51, 0.04);
}

.chart-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1rem;
}

.chart-title {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 800;
  color: #1d1633;
}

.chart-sub {
  display: block;
  font-size: 0.78rem;
  color: #8b8499;
  margin-top: 0.15rem;
}

.chart-badge {
  padding: 0.25rem 0.65rem;
  border-radius: 9999px;
  font-size: 0.76rem;
  font-weight: 800;

  &.is-purple { background: #f3e8ff; color: #7e22ce; }
  &.is-gold { background: #fef3c7; color: #b45309; }
}

.chart-container {
  position: relative;
  width: 100%;
  height: 12rem;
}

.trend-svg {
  width: 100%;
  height: 100%;
  overflow: visible;
}

.chart-empty {
  display: grid;
  place-items: center;
  height: 100%;
  color: #8b8499;
  font-size: 0.85rem;
}

.chart-footer {
  display: flex;
  justify-content: space-between;
  margin-top: 0.5rem;
  font-size: 0.74rem;
  color: #a39cb3;
  font-weight: 600;
}
</style>
