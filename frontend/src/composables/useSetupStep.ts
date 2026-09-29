import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { ONBOARDING_STEPS, nextOnboardingPath, previousOnboardingPath } from '../onboarding';

/** The new-account setup step this screen is showing (from `?setup=`), or null outside setup. */
export function useSetupStep() {
  const route = useRoute();
  const step = computed(() => {
    const n = Number(route.query.setup);
    return Number.isInteger(n) && n >= 1 && n <= ONBOARDING_STEPS.length ? n : null;
  });
  const next = computed(() => (step.value ? nextOnboardingPath(step.value) : '/profile'));
  const previous = computed(() => (step.value ? previousOnboardingPath(step.value) : null));
  return { step, total: ONBOARDING_STEPS.length, next, previous };
}
