import { adminSession } from '../services/adminApi';
import { ApiError } from '../services/api';
import { useSubscriptionStore } from '../stores/subscription';
import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import { begin } from '../services/activity';

const router = createRouter({
  history: createWebHistory(),
  // Hash links (e.g. Settings → Blocked users) land on their section; other pages start at the top.
  scrollBehavior: (to, _from, saved) => saved || (to.hash ? { el: to.hash, top: 80 } : { top: 0 }),
  routes: [
    {
      path: '/',
      // Unauthenticated visitors are sent on to /welcome by the guard below.
      redirect: '/discover',
    },
    {
      path: '/welcome',
      name: 'welcome',
      component: () => import('../pages/WelcomePage.vue'),
      meta: { guestOnly: true },
    },
    {
      path: '/login',
      name: 'login',
      component: () => import('../pages/LoginPage.vue'),
      meta: { guestOnly: true },
    },
    {
      path: '/register',
      name: 'register',
      component: () => import('../pages/RegisterPage.vue'),
      meta: { guestOnly: true },
    },
    {
      path: '/discover',
      name: 'discover',
      component: () => import('../pages/DiscoverPage.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/discover/swipe',
      name: 'discover-swipe',
      component: () => import('../pages/SwipePage.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/matches',
      name: 'matches',
      component: () => import('../pages/MatchesPage.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/chat/:id?',
      name: 'chat',
      component: () => import('../pages/ChatPage.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/chat/:id/call',
      name: 'call',
      component: () => import('../pages/CallPage.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/discover/filters',
      name: 'discover-filters',
      component: () => import('../pages/FiltersPage.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/people/:id',
      name: 'person',
      component: () => import('../pages/PersonPage.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/notifications',
      name: 'notifications',
      component: () => import('../pages/NotificationsPage.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/profile',
      name: 'profile',
      component: () => import('../pages/ProfilePage.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/profile/edit',
      name: 'profile-edit',
      component: () => import('../pages/EditProfilePage.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/profile/interests',
      name: 'profile-interests',
      component: () => import('../pages/InterestsPage.vue'),
      meta: { requiresAuth: true },
    },
    // Admin panel: its own sign-in and layout, separate from member accounts.
    { path: '/admin/login', name: 'admin-login', component: () => import('../pages/admin/AdminLoginPage.vue'), meta: { admin: true, adminPublic: true } },
    { path: '/admin', name: 'admin-dashboard', component: () => import('../pages/admin/AdminDashboardPage.vue'), meta: { admin: true } },
    { path: '/admin/users', name: 'admin-users', component: () => import('../pages/admin/AdminUsersPage.vue'), meta: { admin: true } },
    { path: '/admin/users/:id', name: 'admin-user', component: () => import('../pages/admin/AdminUserPage.vue'), meta: { admin: true } },
    { path: '/admin/admins', name: 'admin-admins', component: () => import('../pages/admin/AdminAdminsPage.vue'), meta: { admin: true } },
    { path: '/admin/verifications', name: 'admin-verifications', component: () => import('../pages/admin/AdminVerificationsPage.vue'), meta: { admin: true } },
    {
      path: '/verify',
      name: 'verify',
      component: () => import('../pages/VerifyPage.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/profile/photos',
      name: 'profile-photos',
      component: () => import('../pages/PhotosPage.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/profile/location',
      name: 'profile-location',
      component: () => import('../pages/LocationPage.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/safety',
      name: 'safety',
      component: () => import('../pages/SafetyPage.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/settings',
      name: 'settings',
      component: () => import('../pages/SettingsPage.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/settings/appearance',
      name: 'settings-appearance',
      component: () => import('../pages/AppearancePage.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/upgrade',
      name: 'upgrade',
      component: () => import('../pages/UpgradePage.vue'),
      meta: { requiresAuth: true },
    },
  ],
});

// Navigation guard: wait for the backend's session answer before rendering any route (no auth flicker).
// Page changes (lazy-loaded page code, the session check) show the global loader too.
let endNavigation: (() => void) | null = null;
router.beforeEach(() => {
  endNavigation?.();
  endNavigation = begin();
});
router.afterEach(() => {
  endNavigation?.();
  endNavigation = null;
});
router.onError(() => {
  endNavigation?.();
  endNavigation = null;
});

router.beforeEach(async (to) => {
  // Admin panel: its own session, none of the member checks.
  if (to.meta.admin) {
    const admin = await adminSession();
    if (to.meta.adminPublic) return admin ? '/admin' : true;
    return admin ? true : { path: '/admin/login', query: to.fullPath !== '/admin' ? { redirect: to.fullPath } : {} };
  }

  const authStore = useAuthStore();
  await authStore.ensureSession();
  // Offline before we could check: stay on this screen (the offline screen covers it) and let
  // the app reload once the connection is back, rather than guessing the member is signed out.
  if (authStore.status === 'UNKNOWN') return true;

  if (to.meta.requiresAuth && !authStore.isAuthenticated) {
    // Opening the app lands on the welcome screen; a deep link asks to sign in and comes back.
    if (to.fullPath === '/discover') return '/welcome';
    return { path: '/login', query: { redirect: to.fullPath } };
  }
  if (to.meta.guestOnly && authStore.isAuthenticated) {
    return '/discover';
  }
  const SUBSCRIPTION_FREE = ['upgrade', 'safety', 'settings', 'settings-appearance', 'profile', 'profile-edit', 'profile-interests', 'profile-photos', 'profile-location', 'notifications', 'verify'];
  if (to.meta.requiresAuth && !SUBSCRIPTION_FREE.includes(String(to.name))) {
    try { if (!(await useSubscriptionStore().fetchStatus()).active) return '/upgrade'; }
    // Only a real "no access" answer sends them to Upgrade; a connection failure doesn't.
    catch (err) { if (err instanceof ApiError && err.status !== undefined) return '/upgrade'; }
  }
  return true;
});

export default router;

