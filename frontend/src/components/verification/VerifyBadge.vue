<template>
  <!-- The state of a photo or ID check, as a small pill on its row -->
  <span v-if="status === 'verified' || status === 'approved'" class="vbadge is-ok"><i class="ri-checkbox-circle-fill" aria-hidden="true"></i>Verified</span>
  <span v-else-if="status === 'pending'" class="vbadge is-wait"><i class="ri-time-line" aria-hidden="true"></i>In review</span>
  <span v-else-if="status === 'rejected'" class="vbadge is-retry">Try again</span>
  <span v-else class="vbadge is-todo">Verify</span>
</template>

<script setup lang="ts">
defineProps<{ status?: string }>();
</script>

<style scoped lang="scss">
.vbadge {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  gap: 0.3rem;
  padding: 0.3rem 0.65rem;
  border-radius: var(--unmute-radius-pill);
  font-size: 0.76rem;
  font-weight: 600;
  white-space: nowrap;
}

.is-ok { background: #e3f8ea; color: #137a3a; }
.is-wait { background: #fff4dc; color: #9a6200; }
.is-retry { background: #fde7e9; color: #c62839; }
.is-todo { background: #fbe4f2; color: var(--unmute-cta); }
</style>
