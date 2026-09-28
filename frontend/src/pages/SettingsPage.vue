<template>
  <SectionShell>
    <template #aside>
      <SettingsMenu />
    </template>

    <PageHeader title="Settings" back="/profile" />

    <!-- Phones: the menu is the page -->
    <SettingsMenu class="d-lg-none" />

    <!-- Web: the menu is beside this, so show the account at a glance -->
    <section class="account-card d-none d-lg-flex">
      <UAvatar :src="authStore.profile?.avatarUrl" :name="authStore.profile?.displayName || 'You'" size="lg" />
      <div class="min-w-0 flex-grow-1">
        <p class="account-name mb-0">{{ authStore.profile?.displayName || 'You' }}</p>
        <p class="account-email mb-0 text-truncate">{{ authStore.user?.email || authStore.user?.phone }}</p>
      </div>
      <router-link to="/profile/edit" class="auth-link small">Edit profile</router-link>
    </section>

    <p class="text-center small mt-4 mb-0 u-text-dim">Unmute v1.0.0 · Real people, real conversations</p>
  </SectionShell>
</template>

<script setup lang="ts">
import SectionShell from '../components/layout/SectionShell.vue';
import PageHeader from '../components/layout/PageHeader.vue';
import SettingsMenu from '../components/settings/SettingsMenu.vue';
import UAvatar from '../components/ui/UAvatar.vue';
import { useAuthStore } from '../stores/auth';

const authStore = useAuthStore();
</script>

<style scoped>
.account-card {
  align-items: center;
  gap: 1rem;
  padding: 1.25rem;
  border-radius: var(--unmute-radius-lg);
  background: var(--unmute-surface);
  border: 1px solid var(--unmute-glass-border);
  box-shadow: var(--unmute-shadow-sm);
}

.account-name {
  font-weight: 700;
}

.account-email {
  font-size: 0.85rem;
  color: var(--unmute-text-muted);
}
</style>
