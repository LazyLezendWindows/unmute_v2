<template>
  <!-- The web side panel beside the profile sub-pages (Interests, Location) -->
  <div class="profile-summary d-flex flex-column gap-3 w-100">
    <section class="identity">
      <router-link to="/profile/edit" class="identity-avatar" aria-label="Change profile photo">
        <UAvatar :src="profile?.avatarUrl" :name="profile?.displayName || 'You'" size="xl" />
      </router-link>
      <p class="identity-name mb-0">
        {{ profile?.displayName || 'You' }}<span v-if="profile?.age">, {{ profile.age }}</span>
        <i v-if="profile?.isVerified" class="ri-verified-badge-fill verified-badge" aria-label="Verified"></i>
      </p>
      <p v-if="profile?.approximateLocation" class="identity-line mb-0">
        <i class="ri-map-pin-line" aria-hidden="true"></i> {{ profile.approximateLocation }}
      </p>
    </section>

    <router-link v-if="strength.next" :to="strength.next.to" class="strength">
      <span class="strength-title">Complete your profile · <strong>{{ strength.percent }}%</strong></span>
      <span class="strength-bar" role="progressbar" :aria-valuenow="strength.percent" aria-valuemin="0" aria-valuemax="100" aria-label="Profile completeness">
        <span :style="{ width: `${strength.percent}%` }"></span>
      </span>
      <span class="strength-next">Next: {{ strength.next.label }}</span>
    </router-link>

    <nav class="menu-list" aria-label="Profile">
      <router-link to="/profile/edit" class="menu-row">
        <i class="ri-edit-2-line" aria-hidden="true"></i>
        <span class="menu-text"><span class="menu-title">Edit profile</span><span class="menu-sub">Photos, bio and details</span></span>
        <i class="ri-arrow-right-s-line menu-chevron" aria-hidden="true"></i>
      </router-link>
      <router-link to="/profile/interests" class="menu-row">
        <i class="ri-heart-3-line" aria-hidden="true"></i>
        <span class="menu-text"><span class="menu-title">Interests</span><span class="menu-sub">{{ interestSummary }}</span></span>
        <i class="ri-arrow-right-s-line menu-chevron" aria-hidden="true"></i>
      </router-link>
      <router-link to="/profile/location" class="menu-row">
        <i class="ri-map-pin-line" aria-hidden="true"></i>
        <span class="menu-text"><span class="menu-title">Location</span><span class="menu-sub">{{ profile?.location?.label || 'Not set' }}</span></span>
        <i class="ri-arrow-right-s-line menu-chevron" aria-hidden="true"></i>
      </router-link>
    </nav>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import UAvatar from '../ui/UAvatar.vue';
import { useAuthStore } from '../../stores/auth';
import { useProfileStrength } from '../../composables/useProfileStrength';

const authStore = useAuthStore();
const profile = computed(() => authStore.profile);
const strength = useProfileStrength();

const interestSummary = computed(() => {
  const names = (profile.value?.interests || []).map((i) => i.name);
  if (!names.length) return 'None yet';
  return names.length > 3 ? `${names.slice(0, 3).join(', ')} +${names.length - 3}` : names.join(', ');
});
</script>

<style scoped lang="scss">
.identity {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.3rem;
  text-align: center;
}

.identity-avatar {
  margin-bottom: 0.4rem;
  padding: 3px;
  border-radius: 50%;
  background: var(--unmute-primary-gradient);
}

.identity-name {
  font-size: 1.2rem;
  font-weight: 800;
  color: var(--unmute-text-heading);
}

.identity-line {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.85rem;
  color: var(--unmute-text-muted);
}

.strength {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  padding: 0.9rem 1rem;
  border-radius: var(--unmute-radius-lg);
  background: var(--unmute-surface);
  box-shadow: var(--unmute-shadow-sm);
  color: var(--unmute-text-primary);
  text-decoration: none;
  font-size: 0.88rem;
}

.strength-bar {
  display: block;
  height: 0.4rem;
  border-radius: 9999px;
  background: var(--unmute-surface-overlay);
  overflow: hidden;

  span {
    display: block;
    height: 100%;
    background: var(--unmute-primary-gradient);
  }
}

.strength-next {
  font-size: 0.75rem;
  color: var(--unmute-text-muted);
}
</style>
