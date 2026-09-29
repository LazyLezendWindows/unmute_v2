<template>
  <!-- The member's plan: an icon badge next to their name, or with `label` a pill like "Gold · 6 months" -->
  <span
    class="premium-badge"
    :class="{ 'is-label': label }"
    :style="{ background: tier.gradient }"
    role="img"
    :aria-label="`${tier.name} member`"
    :title="tier.length ? `${tier.name} plan (${tier.length})` : 'Premium member'"
  >
    <i :class="tier.icon" aria-hidden="true"></i><template v-if="label">{{ tier.name }}<small v-if="tier.length"> · {{ tier.length }}</small></template>
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { planTier } from '../../utils/plans';

const props = defineProps<{ plan?: string | null; label?: boolean }>();
const tier = computed(() => planTier(props.plan));
</script>

<style scoped>
.premium-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.25rem;
  width: 1.25em;
  height: 1.25em;
  margin-left: 0.25em;
  border-radius: 50%;
  color: #fff;
  font-size: 0.8em;
  vertical-align: 0.1em;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.18);
}

.premium-badge i {
  font-size: 0.8em;
  line-height: 1;
}

.premium-badge.is-label {
  width: auto;
  height: auto;
  margin-left: 0;
  padding: 0.3em 0.75em;
  border-radius: 9999px;
  font-size: 0.8rem;
  font-weight: 700;
  vertical-align: middle;
}

.premium-badge.is-label i {
  font-size: 1em;
}

.premium-badge small {
  font-weight: 500;
  opacity: 0.9;
}
</style>
