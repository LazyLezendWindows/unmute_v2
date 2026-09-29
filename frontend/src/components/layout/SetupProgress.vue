<template>
  <div class="setup-progress" :class="{ 'is-compact': compact }">
    <div v-if="skipTo" class="d-flex justify-content-end mb-2">
      <router-link :to="skipTo" class="pill-skip">Skip</router-link>
    </div>
    <ol class="setup-steps" :aria-label="`Step ${current + 1} of ${SETUP_LABELS.length}`">
      <li
        v-for="(label, index) in SETUP_LABELS"
        :key="label"
        :class="{ 'is-done': index < current, 'is-current': index === current }"
        :aria-current="index === current ? 'step' : undefined"
      >
        <span class="step-dot">
          <template v-if="!compact">
            <i v-if="index < current" class="ri-check-line" aria-hidden="true"></i>
            <template v-else>{{ index + 1 }}</template>
          </template>
        </span>
        <span :class="compact ? 'visually-hidden' : 'step-label'">{{ label }}</span>
      </li>
    </ol>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { SETUP_LABELS } from '../../onboarding';

/**
 * The new-account stepper. `step` is the setup step being shown (1-based, as in `?setup=`); the
 * sign-up form passes 0 and shows the first step as next. `compact` draws dots on a line without
 * numbers or labels (the sign-up screen).
 */
const props = defineProps<{ step: number; skipTo?: string; compact?: boolean }>();
const current = computed(() => Math.max(0, props.step - 1));
</script>

<style scoped lang="scss">
.setup-progress {
  margin-bottom: 1.5rem;
}

.setup-steps {
  display: flex;
  margin: 0;
  padding: 0;
  list-style: none;

  li {
    position: relative;
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.35rem;

    // The line joining this step to the one before it.
    & + li::before {
      content: '';
      position: absolute;
      top: 1rem;
      right: calc(50% + 1.1rem);
      left: calc(-50% + 1.1rem);
      height: 3px;
      border-radius: 3px;
      background: var(--unmute-surface-active);
    }

    &.is-done + li::before {
      background: var(--unmute-primary-gradient);
    }
  }
}

.step-dot {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  border-radius: 50%;
  border: 2px solid var(--unmute-surface-active);
  background: var(--unmute-surface);
  color: var(--unmute-text-muted);
  font-size: 0.85rem;
  font-weight: 700;

  .is-done &,
  .is-current & {
    border-color: transparent;
    background: var(--unmute-primary-gradient);
    color: #fff;
    box-shadow: var(--unmute-glow-primary);
  }
}

.step-label {
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--unmute-text-muted);

  .is-current & {
    color: var(--unmute-accent-text);
  }
}

// Compact: small dots on one line; the current step's dot is solid brand pink.
.is-compact {
  max-width: 14rem;
  margin-inline: auto;

  .step-dot {
    width: 1rem;
    height: 1rem;
    border-width: 0;
    background: var(--unmute-surface-active);
  }

  .is-done .step-dot,
  .is-current .step-dot {
    background: var(--unmute-cta);
  }

  .setup-steps li + li::before {
    top: calc(0.5rem - 1.5px);
    right: calc(50% + 0.5rem);
    left: calc(-50% + 0.5rem);
  }

  // The line out of the current step starts filling, as in the mockup.
  .setup-steps li.is-current + li::before {
    background: linear-gradient(90deg, var(--unmute-cta) 0%, var(--unmute-surface-active) 60%);
  }
}

</style>
