import { computed } from 'vue';
import { useAuthStore } from '../stores/auth';

/** What a complete profile has: the percentage done and the next thing to add (null when complete). */
export function useProfileStrength() {
  const authStore = useAuthStore();
  return computed(() => {
    const p = authStore.profile;
    const checks: [boolean, string, string][] = [
      [Boolean(p?.avatarUrl), 'add a profile photo', '/profile/edit'],
      [(p?.bio || '').trim().length >= 20, 'write a short bio', '/profile/edit'],
      [(p?.interests?.length ?? 0) >= 3, 'pick at least 3 interests', '/profile/interests'],
      [(p?.interactionPreferences?.length ?? 0) > 0, 'say what you are looking for', '/profile/edit'],
      [Boolean(p?.location), 'set your area', '/profile/location'],
      [Boolean(p?.education || p?.educationLevel), 'add your education', '/profile/edit'],
    ];
    const done = checks.filter(([ok]) => ok).length;
    const missing = checks.find(([ok]) => !ok);
    return {
      percent: Math.round((done / checks.length) * 100),
      next: missing ? { label: missing[1], to: missing[2] } : null,
    };
  });
}
