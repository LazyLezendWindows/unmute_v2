<template>
  <!-- Reminds the member, on every screen, when the trial or plan ends within 3 days -->
  <router-link v-if="text" to="/upgrade" class="plan-banner" role="status">
    <i class="ri-time-line" aria-hidden="true"></i>
    <span>{{ text }}</span>
    <strong>{{ sub.access?.state === 'trial' ? 'Choose plan' : 'Renew' }}</strong>
  </router-link>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { useSubscriptionStore } from '../../stores/subscription';

const sub = useSubscriptionStore();
const route = useRoute();
const now = ref(Date.now());
let clock: ReturnType<typeof setInterval> | undefined;
let refresh: ReturnType<typeof setInterval> | undefined;

const text = computed(() => {
  const a = sub.access;
  // A plan already bought (and waiting for the trial to end) needs no reminder.
  if (!a?.active || !a.expiresAt || a.planStartsAt || route.name === 'upgrade') return '';
  const hours = (Date.parse(a.expiresAt) - now.value) / 3600_000;
  if (hours > 72 || hours <= 0) return '';
  const what = a.state === 'trial' ? 'Your free trial' : 'Your plan';
  if (hours < 1) return `${what} ends in less than an hour.`;
  if (hours < 24) return `${what} ends in ${Math.round(hours)} hours.`;
  const days = Math.round(hours / 24);
  return `${what} ends in ${days} day${days === 1 ? '' : 's'}.`;
});

onMounted(() => {
  sub.fetchStatus().catch(() => undefined);
  clock = setInterval(() => (now.value = Date.now()), 60_000);
  // Re-checked regularly, so a renewal elsewhere (or expiry) shows up without reloading.
  refresh = setInterval(() => sub.fetchStatus().catch(() => undefined), 10 * 60_000);
});
onBeforeUnmount(() => {
  clearInterval(clock);
  clearInterval(refresh);
});
</script>

<style scoped>
.plan-banner {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  margin-bottom: 0.8rem;
  padding: 0.65rem 0.9rem;
  border-radius: 1rem;
  background: var(--unmute-warn-surface);
  color: var(--unmute-warn-text);
  font-size: 0.88rem;
  text-decoration: none;
}

.plan-banner i {
  font-size: 1.2rem;
}

.plan-banner strong {
  margin-left: auto;
  padding: 0.3rem 0.8rem;
  border-radius: 9999px;
  background: linear-gradient(135deg, #ffd66b, #f5a524);
  color: #fff;
  white-space: nowrap;
}
</style>
