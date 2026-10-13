<template>
  <Transition name="fade-slide">
    <div v-if="visible" class="notif-prompt" role="region" aria-label="Enable notifications">
      <div class="notif-content">
        <div class="notif-icon-wrap" aria-hidden="true">
          <i class="ri-notification-3-line"></i>
        </div>
        <div class="notif-text">
          <strong class="notif-title">Turn on notifications</strong>
          <span class="notif-desc">Don't miss when someone likes you, matches with you, or messages you.</span>
        </div>
        <div class="notif-actions">
          <button type="button" class="btn-enable" :disabled="busy" @click="requestNotificationPermission">
            {{ busy ? 'Enabling…' : 'Turn on' }}
          </button>
          <button type="button" class="btn-dismiss" aria-label="Not now" @click="dismiss">
            Not now
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { enablePush, pushState } from '../../services/push';
import { useToastStore } from '../../stores/toast';

const visible = ref(false);
const busy = ref(false);
const DISMISS_KEY = 'unmute.notif_prompt_dismissed_until';

onMounted(() => {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  // If permission is already granted or explicitly denied, don't show the prompt
  if (Notification.permission !== 'default') return;

  const dismissedUntil = localStorage.getItem(DISMISS_KEY);
  if (dismissedUntil && Number(dismissedUntil) > Date.now()) return;

  // Show prompt after a short delay so the user is settled on the page
  setTimeout(() => {
    if (Notification.permission === 'default') {
      visible.value = true;
    }
  }, 2500);
});

async function requestNotificationPermission() {
  busy.value = true;
  try {
    const granted = await enablePush();
    if (granted || pushState.value === 'granted') {
      visible.value = false;
      useToastStore().success('Notifications turned on! You will be alerted for matches and messages.');
    } else {
      visible.value = false;
    }
  } catch {
    visible.value = false;
  } finally {
    busy.value = false;
  }
}

function dismiss() {
  visible.value = false;
  // Remind again after 3 days if dismissed
  localStorage.setItem(DISMISS_KEY, String(Date.now() + 3 * 24 * 3600 * 1000));
}
</script>

<style scoped lang="scss">
.notif-prompt {
  margin-bottom: 0.9rem;
  padding: 0.85rem 1.1rem;
  border-radius: 1.15rem;
  background: var(--unmute-surface);
  border: 1px solid var(--unmute-glass-border);
  box-shadow: 0 8px 24px -10px rgba(242, 24, 114, 0.25);
  backdrop-filter: blur(12px);
}

.notif-content {
  display: flex;
  align-items: center;
  gap: 0.85rem;
  flex-wrap: wrap;
}

.notif-icon-wrap {
  display: grid;
  place-items: center;
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 50%;
  background: linear-gradient(135deg, rgba(255, 122, 110, 0.2), rgba(242, 24, 114, 0.2));
  color: var(--unmute-primary, #f21872);
  font-size: 1.3rem;
  flex-shrink: 0;
}

.notif-text {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 12rem;
}

.notif-title {
  color: var(--unmute-text-heading);
  font-size: 0.95rem;
  font-weight: 700;
}

.notif-desc {
  color: var(--unmute-text-muted);
  font-size: 0.82rem;
  line-height: 1.35;
}

.notif-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-left: auto;
}

.btn-enable {
  padding: 0.45rem 1rem;
  border: 0;
  border-radius: 999px;
  background: linear-gradient(135deg, #ff7a6e 0%, #f21872 100%);
  color: #fff;
  font-size: 0.85rem;
  font-weight: 700;
  cursor: pointer;
  transition: opacity 150ms ease, transform 150ms ease;
  white-space: nowrap;

  &:hover {
    opacity: 0.92;
    transform: translateY(-1px);
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
}

.btn-dismiss {
  padding: 0.45rem 0.75rem;
  border: 0;
  background: transparent;
  color: var(--unmute-text-muted);
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;

  &:hover {
    color: var(--unmute-text-heading);
  }
}

.fade-slide-enter-active,
.fade-slide-leave-active {
  transition: opacity 250ms ease, transform 250ms ease;
}

.fade-slide-enter-from,
.fade-slide-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>

