/**
 * New accounts take a short setup (interests, then area) before Discover. Each step is a normal
 * profile screen opened with `?setup=<step>`, which adds progress, Skip and Continue.
 */
export const ONBOARDING_STEPS = ['/profile/interests', '/profile/location'] as const;

export const ONBOARDING_START = `${ONBOARDING_STEPS[0]}?setup=1`;

/** Where Continue / Skip goes from the given step (1-based); Discover after the last one. */
export function nextOnboardingPath(step: number): string {
  return step < ONBOARDING_STEPS.length ? `${ONBOARDING_STEPS[step]}?setup=${step + 1}` : '/discover';
}

/** Stepper labels: the sign-up form, then each setup step. */
export const SETUP_LABELS = ['Account', 'Interests', 'Location'] as const;
