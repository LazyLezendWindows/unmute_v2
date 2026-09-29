/**
 * New accounts take a short setup before Discover: verify, interests, photos, then area. Each step
 * is a normal screen opened with `?setup=<step>`, which adds progress, Skip and Continue.
 */
export const ONBOARDING_STEPS = ['/verify', '/profile/interests', '/profile/photos', '/profile/location'] as const;

export const ONBOARDING_START = `${ONBOARDING_STEPS[0]}?setup=1`;

/** Where Continue / Skip goes from the given step (1-based); Discover after the last one. */
export function nextOnboardingPath(step: number): string {
  return step < ONBOARDING_STEPS.length ? `${ONBOARDING_STEPS[step]}?setup=${step + 1}` : '/discover';
}

/** Where Back goes from the given step (1-based); null on the first one. */
export function previousOnboardingPath(step: number): string | null {
  return step > 1 ? `${ONBOARDING_STEPS[step - 2]}?setup=${step - 1}` : null;
}

/** Stepper labels, one per setup step. */
export const SETUP_LABELS = ['Verify', 'Interests', 'Photos', 'Location'] as const;
