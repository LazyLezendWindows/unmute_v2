<template>
  <div class="d-flex flex-column gap-3">
    <router-link to="/referral" class="menu-refer">
      <i class="ri-gift-2-fill" aria-hidden="true"></i>
      <span class="menu-text"><span class="menu-title">Refer &amp; earn</span><span class="menu-sub">Invite friends, you both get 2 weeks free</span></span>
      <span class="refer-pill">2 weeks free</span>
    </router-link>
    <nav class="menu-list" aria-label="Settings">
      <router-link to="/upgrade" class="menu-row"><i class="ri-vip-crown-line" aria-hidden="true"></i><span class="menu-text"><span class="menu-title">Membership &amp; upgrade</span><span class="menu-sub">View your trial and plans</span></span><i class="ri-arrow-right-s-line menu-chevron" aria-hidden="true"></i></router-link>
      <router-link to="/settings/account" class="menu-row">
        <i class="ri-user-3-line" aria-hidden="true"></i>
        <span class="menu-text"><span class="menu-title">Account</span><span class="menu-sub text-truncate">{{ authStore.user?.email || authStore.user?.phone }}</span></span>
        <i class="ri-arrow-right-s-line menu-chevron" aria-hidden="true"></i>
      </router-link>
      <router-link to="/settings/appearance" class="menu-row">
        <i class="ri-palette-line" aria-hidden="true"></i>
        <span class="menu-text"><span class="menu-title">Appearance &amp; Theme</span></span>
        <span class="menu-value">{{ modeLabel }}</span>
        <i class="ri-arrow-right-s-line menu-chevron" aria-hidden="true"></i>
      </router-link>
      <router-link to="/safety" class="menu-row" exact-active-class="" :class="{ 'is-current': isSafety && !onBlocked }">
        <i class="ri-shield-check-line" aria-hidden="true"></i>
        <span class="menu-text"><span class="menu-title">Privacy &amp; Safety</span></span>
        <i class="ri-arrow-right-s-line menu-chevron" aria-hidden="true"></i>
      </router-link>
      <router-link :to="{ path: '/safety', hash: '#blocked' }" class="menu-row" exact-active-class="" :class="{ 'is-current': isSafety && onBlocked }">
        <i class="ri-user-forbid-line" aria-hidden="true"></i>
        <span class="menu-text"><span class="menu-title">Blocked users</span></span>
        <i class="ri-arrow-right-s-line menu-chevron" aria-hidden="true"></i>
      </router-link>
      <router-link to="/terms" class="menu-row">
        <i class="ri-file-text-line" aria-hidden="true"></i>
        <span class="menu-text"><span class="menu-title">Terms of Service</span></span>
        <i class="ri-arrow-right-s-line menu-chevron" aria-hidden="true"></i>
      </router-link>
      <router-link to="/privacy" class="menu-row">
        <i class="ri-lock-2-line" aria-hidden="true"></i>
        <span class="menu-text"><span class="menu-title">Privacy Policy</span></span>
        <i class="ri-arrow-right-s-line menu-chevron" aria-hidden="true"></i>
      </router-link>
    </nav>

    <div class="menu-list">
      <button type="button" class="menu-row is-danger" @click="deleteOpen = true">
        <i class="ri-delete-bin-6-line" aria-hidden="true"></i>
        <span class="menu-text"><span class="menu-title">Delete account</span><span class="menu-sub">Permanently remove your profile and data</span></span>
      </button>
    </div>

    <UModal :is-open="deleteOpen" title="Delete your account?" max-width="sm" @close="closeDelete">
      <form id="delete-account-form" class="d-flex flex-column gap-3" @submit.prevent="confirmDelete">
        <p class="small mb-0 u-text-secondary">
          This permanently deletes your profile, photos, likes, matches and chats. People you've matched with will no longer see you. It can't be undone, and any remaining plan time is lost.
        </p>
        <template v-if="authStore.user?.hasPassword">
          <UInput v-model="deletePassword" type="password" required placeholder="Your password" icon="ri-lock-line" autocomplete="current-password" aria-label="Your password" />
        </template>
        <template v-else>
          <label class="small mb-0 u-text-secondary" for="delete-confirm">Type <strong>DELETE</strong> to confirm.</label>
          <UInput id="delete-confirm" v-model="deleteWord" required placeholder="DELETE" icon="ri-error-warning-line" autocomplete="off" />
        </template>
        <p v-if="deleteError" class="small text-danger mb-0" role="alert">{{ deleteError }}</p>
      </form>
      <template #footer>
        <UButton variant="secondary" size="md" :disabled="deleting" @click="closeDelete">Cancel</UButton>
        <UButton type="submit" form="delete-account-form" variant="danger" size="md" :loading="deleting" :disabled="!canDelete">Delete account</UButton>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useThemeStore } from '../../stores/theme';
import { useAuthStore } from '../../stores/auth';
import { useToastStore } from '../../stores/toast';
import UModal from '../ui/UModal.vue';
import UInput from '../ui/UInput.vue';
import UButton from '../ui/UButton.vue';

const router = useRouter();
const route = useRoute();

// Both rows open /safety; the router's highlight ignores the #hash, so these two compare it themselves.
const isSafety = computed(() => route.path === '/safety');
const onBlocked = computed(() => route.hash === '#blocked');
const themeStore = useThemeStore();
const authStore = useAuthStore();

const modeLabel = computed(() => ({ light: 'Light', dark: 'Dark', system: 'System' })[themeStore.mode]);

const deleteOpen = ref(false);
const deletePassword = ref('');
const deleteWord = ref('');
const deleting = ref(false);
const deleteError = ref<string | null>(null);
const canDelete = computed(() => (authStore.user?.hasPassword ? deletePassword.value.length > 0 : deleteWord.value.trim() === 'DELETE'));

function closeDelete() {
  if (deleting.value) return;
  deleteOpen.value = false;
  deletePassword.value = '';
  deleteWord.value = '';
  deleteError.value = null;
}

async function confirmDelete() {
  if (!canDelete.value) return;
  deleting.value = true;
  deleteError.value = null;
  try {
    await authStore.deleteAccount(authStore.user?.hasPassword ? { password: deletePassword.value } : { confirm: deleteWord.value.trim() });
    deleting.value = false;
    closeDelete();
    useToastStore().success('Your account has been deleted.');
    router.push('/welcome');
  } catch (err: any) {
    deleteError.value = err.message || 'Could not delete your account. Please try again.';
  } finally {
    deleting.value = false;
  }
}
</script>

<style scoped lang="scss">
.menu-refer {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.9rem 1rem;
  border-radius: var(--unmute-radius-lg, 1.25rem);
  background: linear-gradient(110deg, #ff7a6e 0%, #f21872 45%, #c00078 100%);
  color: #fff;
  text-decoration: none;
  box-shadow: 0 14px 28px -18px rgba(192, 0, 120, 0.75);

  > i { font-size: 1.4rem; }
  .menu-text { display: flex; flex-direction: column; flex: 1; min-width: 0; }
  .menu-title { font-weight: 800; color: #fff; }
  .menu-sub { font-size: 0.8rem; color: rgba(255, 255, 255, 0.9); }
}

.refer-pill {
  flex-shrink: 0;
  padding: 0.2rem 0.6rem;
  border-radius: 9999px;
  background: var(--unmute-card);
  color: var(--unmute-accent-text);
  font-size: 0.72rem;
  font-weight: 800;
}
</style>
