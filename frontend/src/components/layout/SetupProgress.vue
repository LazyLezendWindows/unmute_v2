<template>
  <div class="setup-progress">
    <div v-if="skipTo" class="d-flex justify-content-end mb-2">
      <router-link :to="skipTo" class="setup-skip">Skip</router-link>
    </div>
    <ol class="setup-steps" :aria-label="`Step ${step + 1} of ${SETUP_LABELS.length}`">
      <li
        v-for="(label, index) in SETUP_LABELS"
        :key="label"
        :class="{ 'is-done': index < step, 'is-current': index === step }"
        :aria-current="index === step ? 'step' : undefined"
      >
        <span class="step-dot">
          <i v-if="index < step" class="ri-check-line" aria-hidden="true"></i>
          <template v-else>{{ index + 1 }}</template>
        </span>
        <span class="step-label">{{ label }}</span>
      </li>
    </ol>
  </div>
</template>

<script setup lang="ts">
import { SETUP_LABELS } from '../../onboarding';

/**
 * The new-account stepper. `step` is the setup step being shown (1-based, as in `?setup=`);
 * 0 is the sign-up form itself, which comes before those steps.
 */
defineProps<{ step: number; skipTo?: string }>();
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

.setup-skip {
  padding: 0.4rem 1.1rem;
  border-radius: var(--unmute-radius-pill);
  background: var(--unmute-primary-surface);
  color: var(--unmute-accent-text);
  font-size: 0.85rem;
  font-weight: 700;
  text-decoration: none;
}
</style>
