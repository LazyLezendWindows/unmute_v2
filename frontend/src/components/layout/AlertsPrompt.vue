<template>
  <!-- Offers call and message alerts for when Unmute is closed, until they're on or dismissed. -->
  <div v-if="visible" class="alerts-prompt" role="region" aria-label="Call alerts">
    <span class="alerts-icon" aria-hidden="true"><i class="ri-notification-badge-fill"></i></span>
    <span class="alerts-text">
      <strong>Never miss a call</strong>
      <span>Get call and message alerts even when Unmute is closed.</span>
    </span>
    <button type="button" class="alerts-on" :disabled="busy" @click="turnOn">Turn on</button>
    <button type="button" class="alerts-close" aria-label="Not now" @click="dismiss"><i class="ri-close-line" aria-hidden="true"></i></button>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { enablePush, pushState } from '../../services/push';
import { useToastStore } from '../../stores/toast';

const KEY = 'unmute.alertsPrompt.dismissed';
const dismissed = ref(read());
const busy = ref(false);

function read() {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

const visible = computed(() => pushState.value === 'default' && !dismissed.value);

async function turnOn() {
  busy.value = true;
  const on = await enablePush();
  busy.value = false;
  if (on) useToastStore().success('Alerts are on.');
  else if (pushState.value === 'denied') useToastStore().show('Alerts are blocked. You can allow them in your browser settings.');
}

function dismiss() {
  dismissed.value = true;
  try {
    localStorage.setItem(KEY, '1');
  } catch {
    // Hidden for this visit.
  }
}
</script>

<style scoped lang="scss">
.alerts-prompt {
  display: flex;
  align-items: center;
  gap: 0.7rem;
  margin-bottom: 1rem;
  padding: 0.75rem 0.6rem 0.75rem 0.8rem;
  border-radius: 1.2rem;
  background: #fbe9f5;
}

.alerts-icon {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 50%;
  background: #fff;
  color: var(--unmute-cta);
  font-size: 1.3rem;
}

.alerts-text {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  color: var(--unmute-text-secondary);
  font-size: 0.78rem;
  line-height: 1.3;

  strong {
    color: var(--unmute-text-heading);
    font-size: 0.92rem;
  }
}

.alerts-on {
  flex-shrink: 0;
  padding: 0.45rem 0.9rem;
  border: 0;
  border-radius: var(--unmute-radius-pill);
  background: var(--unmute-cta);
  color: #fff;
  font-size: 0.82rem;
  font-weight: 700;
}

.alerts-close {
  flex-shrink: 0;
  border: 0;
  background: transparent;
  color: var(--unmute-text-muted);
  font-size: 1.1rem;
}
</style>
