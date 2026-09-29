<template>
  <div class="admin-shell">
    <aside class="admin-nav" aria-label="Admin navigation">
      <router-link to="/admin" class="admin-brand" aria-label="Admin dashboard">
        <BrandLogo size="1.8rem" class="brand-full" />
        <BrandLogo layout="mark" size="1.8rem" class="brand-mark" />
        <span class="admin-tag">Admin</span>
      </router-link>

      <nav class="admin-links">
        <router-link
          v-for="item in NAV"
          :key="item.to"
          :to="item.to"
          class="admin-link"
          :class="{ 'is-active': item.exact ? route.name === item.name : String(route.name).startsWith(item.name) }"
        >
          <i :class="item.icon" aria-hidden="true"></i>
          <span>{{ item.label }}</span>
        </router-link>
      </nav>

      <div class="admin-me">
        <div class="admin-me-avatar" aria-hidden="true">{{ initials }}</div>
        <div class="admin-me-info">
          <span class="admin-me-name">{{ admin?.name }}</span>
          <span class="admin-me-email">{{ admin?.email }}</span>
        </div>
        <button type="button" class="admin-signout" title="Sign out" @click="signOut">
          <i class="ri-logout-box-r-line" aria-hidden="true"></i><span>Sign out</span>
        </button>
      </div>
    </aside>

    <main class="admin-main">
      <slot />
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import BrandLogo from '../components/layout/BrandLogo.vue';
import { adminApi, adminSession, AdminUser, onAdminSignedOut } from '../services/adminApi';

const NAV = [
  { to: '/admin',              name: 'admin-dashboard',     label: 'Dashboard',      icon: 'ri-dashboard-3-line',  exact: true },
  { to: '/admin/users',        name: 'admin-user',          label: 'Users',          icon: 'ri-group-line',        exact: false },
  { to: '/admin/verifications',name: 'admin-verifications', label: 'Verifications',  icon: 'ri-shield-check-line', exact: true },
  { to: '/admin/admins',       name: 'admin-admins',        label: 'Admins',         icon: 'ri-shield-user-line',  exact: true },
];

const route = useRoute();
const router = useRouter();
const admin = ref<AdminUser | null>(null);
const initials = computed(() => (admin.value?.name ?? '?').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase());

onMounted(async () => {
  admin.value = await adminSession();
  onAdminSignedOut(() => router.replace({ path: '/admin/login', query: { redirect: route.fullPath } }));
});

async function signOut() {
  await adminApi.post('/logout').catch(() => undefined);
  router.replace('/admin/login');
}
</script>

<style scoped lang="scss">
.admin-shell {
  display: flex;
  min-height: 100vh;
  background: #f4f2f9;
  color: #1d1633;
  font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
}

/* ---- Sidebar ---- */
.admin-nav {
  position: fixed;
  top: 0;
  left: 0;
  display: flex;
  flex-direction: column;
  width: 15rem;
  height: 100vh;
  padding: 1.5rem 1rem 1.25rem;
  background: #1d1633;
  gap: 0.25rem;
  flex-shrink: 0;
  z-index: 100;
  overflow-y: auto;

  // Phones: row 1 is the logo and your account (with Sign out), row 2 the tabs across the full width.
  @media (max-width: 767.98px) {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    width: 100%;
    height: auto;
    flex-direction: row;
    flex-wrap: wrap;
    align-items: center;
    padding: calc(0.55rem + env(safe-area-inset-top, 0px)) 0.75rem 0.4rem;
    gap: 0.4rem 0;
    overflow: visible;
  }
}

// The logo's dark "Un" is made white on the dark bar.
.admin-brand :deep(.word-un) {
  color: #fff;
}

.admin-brand {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  margin-bottom: 1.5rem;
  text-decoration: none;

  @media (max-width: 767.98px) { margin-bottom: 0; }
}

.brand-mark { display: none !important; }

@media (max-width: 767.98px) {
  .brand-full { display: none !important; }
  .brand-mark { display: inline-flex !important; }
}

.admin-tag {
  padding: 0.2rem 0.55rem;
  border-radius: 9999px;
  background: rgba(255,255,255,0.15);
  color: #fff;
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.admin-links {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  flex: 1;

  @media (max-width: 767.98px) {
    order: 3;
    flex: 1 1 100%;
    flex-direction: row;
    gap: 0.25rem;
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-width: none;
    &::-webkit-scrollbar { display: none; }
  }
}

.admin-link {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.65rem 0.9rem;
  border-radius: 0.75rem;
  color: rgba(255,255,255,0.6);
  font-size: 0.92rem;
  font-weight: 600;
  text-decoration: none;
  transition: background 0.15s, color 0.15s;

  i { font-size: 1.2rem; flex-shrink: 0; }

  &:hover { background: rgba(255,255,255,0.08); color: #fff; }
  &.is-active { background: rgba(255,255,255,0.12); color: #fff; }

  // Phones: equal tabs, icon above a small label.
  @media (max-width: 767.98px) {
    flex: 1 1 0;
    flex-direction: column;
    gap: 0.15rem;
    min-width: 4.2rem;
    padding: 0.4rem 0.25rem;
    font-size: 0.7rem;
    white-space: nowrap;

    i { font-size: 1.25rem; }
  }
}

/* ---- Bottom user strip ---- */
.admin-me {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  margin-top: auto;
  padding-top: 1rem;
  border-top: 1px solid rgba(255,255,255,0.1);

  @media (max-width: 767.98px) {
    margin: 0 0 0 auto;
    padding: 0;
    border: 0;
    flex-shrink: 0;
  }
}

.admin-me-avatar {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 2.2rem;
  height: 2.2rem;
  border-radius: 50%;
  background: linear-gradient(135deg, #c00078, #7c3aed);
  color: #fff;
  font-size: 0.75rem;
  font-weight: 800;
}

.admin-me-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;

  @media (max-width: 767.98px) { display: none; }
}

.admin-me-name { font-size: 0.82rem; font-weight: 700; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.admin-me-email { font-size: 0.72rem; color: rgba(255,255,255,0.5); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.admin-signout {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.3rem;
  flex-shrink: 0;
  height: 2rem;
  padding: 0 0.6rem;
  border: 0;
  border-radius: 9999px;
  font-size: 0.8rem;
  font-weight: 600;

  i { font-size: 1.05rem; }

  // Desktop sidebar: icon only, the name and email sit beside it.
  @media (min-width: 768px) {
    width: 2rem;
    padding: 0;

    span { display: none; }
  }
  background: rgba(255,255,255,0.08);
  color: rgba(255,255,255,0.75);
  transition: background 0.15s, color 0.15s;

  &:hover { background: rgba(255,255,255,0.15); color: #fff; }
}

/* ---- Main content ---- */
.admin-main {
  flex: 1;
  min-width: 0;
  margin-left: 15rem;
  padding: 2rem clamp(1rem, 3vw, 2.5rem) 3rem;

  @media (max-width: 767.98px) {
    margin-left: 0;
    // Clears the two-row bar.
    padding-top: calc(8.25rem + env(safe-area-inset-top, 0px));
  }
}
</style>
